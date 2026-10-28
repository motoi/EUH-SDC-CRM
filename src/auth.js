// ログイン。ローカル確認用の 'dev' モードでは、登録済みの利用者を選ぶだけでログインできる。
// 本番は M365（Entra ID）でのログインに置き換える（アプリ登録が済んでから実装）。
import { html, raw } from 'hono/html';
import { q, one } from './db.js';
import { config } from './config.js';
import { getCookie, setCookie } from './cookies.js';

// Node とブラウザの両方にある Web Crypto で署名する
const enc = new TextEncoder();
// 確認用サイトはブラウザ内だけで完結するので固定値で十分（再読み込みでログインが切れないように）
const secretText = (typeof process !== 'undefined' && process.env.SESSION_SECRET)
  || (config.demo ? 'demo-only' : null)
  || Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
const keyP = crypto.subtle.importKey('raw', enc.encode(secretText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));

async function sign(v) {
  return `${v}.${b64(await crypto.subtle.sign('HMAC', await keyP, enc.encode(String(v))))}`;
}
async function verify(token) {
  const i = token?.lastIndexOf('.') ?? -1;
  if (i < 0) return null;
  const v = token.slice(0, i);
  try {
    return await crypto.subtle.verify('HMAC', await keyP, unb64(token.slice(i + 1)), enc.encode(v)) ? v : null;
  } catch { return null; }
}

export async function requireUser(c, next) {
  const id = await verify(getCookie(c, 'sid'));
  const user = id && await one(`select * from staff_users where id = $1 and active`, [id]);
  if (!user) return c.redirect('/login');
  c.set('user', user);
  await next();
}

export async function requireAdmin(c, next) {
  if (c.get('user')?.role !== 'admin') return c.text('この画面は管理者だけが使えます。', 403);
  await next();
}

export function mount(app) {
  app.get('/login', async (c) => {
    if (config.authMode !== 'dev') return c.text('M365 でのログインは未設定です。', 501);
    const users = await q(`select id, name, role from staff_users where active order by id`);
    return c.html(html`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン | SDC配信</title>
<style>${raw(LOGIN_CSS)}</style></head><body>
<div class="wrap">
<div class="box login"><h1>SDC配信 にログイン</h1>
<p class="muted">確認用の画面です。本番では大学の M365 アカウントでログインします。${config.demo ? html`データはすべて架空で、メールは送信されません。` : ''}</p>
${users.map((u) => html`<form method="post" action="/login"><input type="hidden" name="id" value="${u.id}"><button>${u.name}（${u.role === 'admin' ? '管理者' : '担当者'}）</button></form>`)}
${config.demo ? html`<p class="muted small">事務スタッフAとBは、どちらも「担当者」でできることは同じです。2人分あるのは、別々の人が操作したときの見え方（操作の記録など）を試すためです。</p>` : ''}
</div>

<div class="box guide">
<h2>このシステムでできること</h2>
<p>叡啓大学 社会連携係が、名刺交換した方やイベント参加者に、案内メールを送るためのシステムです。送信元は social-design-center@eikei.ac.jp です。</p>
<dl>
  <dt>連絡先</dt><dd>名刺やイベント申込の情報を管理します。項目は事務局の Excel と同じ（氏名・企業・団体名・部署・役職・メールアドレス・団体所在地・企業分類1・企業分類2・興味分類）です。イベント参加の記録と「どこで知り合ったか」も残せます。</dd>
  <dt>配信先リスト</dt><dd>「新規事業に関心のある大企業・中堅企業の方」「DXセミナーの参加者」のように、興味分類・企業分類・団体所在地・イベント参加から条件を選んで送り先を決めます。人数はその場で表示されます。</dd>
  <dt>配信</dt><dd>件名と本文を書いて送ります。「{{氏名}}」と書くと、一人ひとりの名前に置き換わります。</dd>
  <dt>イベント・興味</dt><dd>イベントを登録します。興味分類の一覧も見られます（興味分類は連絡先にカンマ区切りで書くと自動で増えます）。</dd>
</dl>

<h2>配信の流れ</h2>
<ol>
  <li><b>配信先リストを作る</b>：条件を選び、人数を確かめて保存します。</li>
  <li><b>本文を書く</b>：「配信」から新しい配信を作り、送り先にリストを選びます。</li>
  <li><b>テスト送信する</b>：まず自分あてに送り、届いたメールの見た目を確認します。</li>
  <li><b>人数を入力して予約する</b>：確認のため、送る人数を入力します。日時を指定しなければすぐ始まります。</li>
  <li><b>送信</b>：1分に10通ずつ、少しずつ送ります。途中でも「残りの送信を取り消す」で止められます。</li>
</ol>

<h2>誤送信を防ぐ仕組み</h2>
<ul>
  <li>テスト送信をしないと予約できません。本文を直したら、テスト送信をやり直します。</li>
  <li>予約のときに人数を入力し、実際の人数と合わないと先に進めません。</li>
  <li>配信停止した人、宛先不明の人、メールを送ってよい根拠がない人は、自動で送り先から外れます。</li>
  <li>メールの末尾には、送信者の情報と配信停止のリンクが自動で付きます。</li>
  <li>同じ配信で同じアドレスに二度送ることはありません。</li>
</ul>

<h2>担当者と管理者の違い</h2>
<table>
  <thead><tr><th>できること</th><th>担当者</th><th>管理者</th></tr></thead>
  <tbody>
    <tr><td>連絡先の追加・編集、配信停止</td><td>○</td><td>○</td></tr>
    <tr><td>配信先リストの作成</td><td>○</td><td>○</td></tr>
    <tr><td>配信の作成・テスト送信・予約・取り消し</td><td>○</td><td>○</td></tr>
    <tr><td>イベント・興味の追加</td><td>○</td><td>○</td></tr>
    <tr><td>利用者の追加、権限の変更、ログインの停止</td><td>—</td><td>○</td></tr>
    <tr><td>配信停止の解除（本人から再開の希望があったとき）</td><td>—</td><td>○</td></tr>
    <tr><td>操作の記録（誰がいつ何をしたか）を見る</td><td>—</td><td>○</td></tr>
  </tbody>
</table>
<p class="muted small">管理者の画面は、ログイン後の上部メニュー「管理」から開きます。</p>
</div>
</div></body></html>`);
  });

  app.post('/login', async (c) => {
    if (config.authMode !== 'dev') return c.text('Not available', 404);
    const { id } = await c.req.parseBody();
    const u = await one(`select id from staff_users where id = $1 and active`, [id]);
    if (!u) return c.redirect('/login');
    await q(`update staff_users set last_login_at = now() where id = $1`, [u.id]);
    setCookie(c, `sid=${await sign(u.id)}; Path=/; HttpOnly; SameSite=Lax`);
    return c.redirect('/contacts');
  });

  app.post('/logout', (c) => {
    setCookie(c, 'sid=; Path=/; Max-Age=0');
    return c.redirect('/login');
  });
}

const LOGIN_CSS = `
body{font:16px/1.75 "BIZ UDPGothic","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;background:#f4f6f8;color:#1b2530;margin:0}
.wrap{max-width:1040px;margin:0 auto;padding:40px max(16px,env(safe-area-inset-left,0px)) 64px max(16px,env(safe-area-inset-right,0px));
  display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:760px){.wrap{grid-template-columns:1fr}}
.box{background:#fff;border:1px solid #d8dfe6;border-radius:12px;padding:24px 28px;display:grid;gap:12px;min-width:0}
@media (min-width:761px){.login{position:sticky;top:24px}}
h1{font-size:20px;margin:0} h2{font-size:17px;margin:12px 0 0;color:#1d6b73} h2:first-child{margin-top:0}
p{margin:0}.muted{color:#5e6b78;font-size:14px}.small{font-size:13px}
button{font:inherit;font-weight:700;padding:10px;border-radius:6px;border:1px solid #1d6b73;background:#fff;color:#1d6b73;cursor:pointer;width:100%}
button:hover{background:#1d6b73;color:#fff}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 16px} dt{font-weight:700;white-space:nowrap} dd{margin:0}
@media (max-width:520px){dl{grid-template-columns:1fr} dd{margin-bottom:6px}}
ol,ul{margin:0;padding-left:1.4em;display:grid;gap:4px}
table{border-collapse:collapse;width:100%;font-size:15px} th,td{padding:7px 10px;border-bottom:1px solid #d8dfe6;text-align:left}
th{font-size:13px;color:#5e6b78} td:nth-child(n+2),th:nth-child(n+2){text-align:center;width:4.5em}`;

export async function audit(c, action, targetType, targetId, detail) {
  await q(`insert into audit_log (actor_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5)`,
    [c.get('user')?.id ?? null, action, targetType, targetId, detail ? JSON.stringify(detail) : null]);
}
