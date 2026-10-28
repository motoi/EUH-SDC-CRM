// ログイン。ローカル確認用の 'dev' モードでは、登録済みの利用者を選ぶだけでログインできる。
// 本番は M365（Entra ID）でのログインに置き換える（アプリ登録が済んでから実装）。
import { html } from 'hono/html';
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

export function mount(app) {
  app.get('/login', async (c) => {
    if (config.authMode !== 'dev') return c.text('M365 でのログインは未設定です。', 501);
    const users = await q(`select id, name, role from staff_users where active order by id`);
    return c.html(html`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン | SDC配信</title>
<style>body{font:16px/1.7 "BIZ UDPGothic","Hiragino Sans",sans-serif;background:#f4f6f8;color:#1b2530;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.box{background:#fff;border:1px solid #d8dfe6;border-radius:12px;padding:28px 32px;max-width:420px;width:100%;display:grid;gap:14px}
h1{font-size:20px;margin:0}p{margin:0;color:#5e6b78;font-size:14px}
button{font:inherit;font-weight:700;padding:10px;border-radius:6px;border:1px solid #1d6b73;background:#fff;color:#1d6b73;cursor:pointer;width:100%}
button:hover{background:#1d6b73;color:#fff}</style></head><body>
<div class="box"><h1>SDC配信 にログイン</h1>
<p>確認用の画面です。本番では大学の M365 アカウントでログインします。${config.demo ? html`<br>データはすべて架空で、メールは送信されません。` : ''}</p>
${users.map((u) => html`<form method="post" action="/login"><input type="hidden" name="id" value="${u.id}"><button>${u.name}（${u.role === 'admin' ? '管理者' : '担当者'}）</button></form>`)}
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

export async function audit(c, action, targetType, targetId, detail) {
  await q(`insert into audit_log (actor_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5)`,
    [c.get('user')?.id ?? null, action, targetType, targetId, detail ? JSON.stringify(detail) : null]);
}
