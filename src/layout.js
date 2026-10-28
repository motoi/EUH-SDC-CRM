import { html, raw } from 'hono/html';
import { config } from './config.js';
import { getCookie, setCookie } from './cookies.js';

const NAV = [
  ['/contacts', '連絡先'],
  ['/segments', '配信先リスト'],
  ['/campaigns', '配信'],
  ['/masters', 'イベント・興味'],
  ...(config.mailer === 'outbox' ? [['/outbox', '送信箱（確認用）']] : []),
];

export function page(c, { title, active, body, flash }) {
  const user = c.get('user');
  return c.html(html`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | SDC配信</title>
<style>${raw(CSS)}</style>
</head>
<body>
${config.demo ? html`<div class="demo">確認用の画面です。データはすべて架空で、メールは送信されません。操作はこのブラウザの中だけに保存されます。
  <button type="button" class="link" id="demo-reset">最初の状態に戻す</button></div>` : ''}
<header class="top">
  <div class="brand">SDC配信</div>
  <nav>${[...NAV, ...(user?.role === 'admin' ? [['/admin', '管理']] : [])].map(([href, label]) => html`<a href="${href}" class="${active === href ? 'on' : ''}">${label}</a>`)}</nav>
  <div class="who">${user ? html`${user.name}さん（${user.role === 'admin' ? '管理者' : '担当者'}） <form method="post" action="/logout" class="inline"><button class="link">ログアウト</button></form>` : ''}</div>
</header>
<main>
  ${flash ? html`<div class="flash ${flash.kind ?? 'ok'}">${flash.text}</div>` : ''}
  ${body}
</main>
</body>
</html>`);
}

// リダイレクト先で一度だけ表示するメッセージ
export function setFlash(c, text, kind = 'ok') {
  setCookie(c, `flash=${encodeURIComponent(JSON.stringify({ text, kind }))}; Path=/; HttpOnly; SameSite=Lax`);
}
export function takeFlash(c) {
  const v = getCookie(c, 'flash');
  if (!v) return null;
  setCookie(c, 'flash=; Path=/; Max-Age=0');
  try { return JSON.parse(decodeURIComponent(v)); } catch { return null; }
}

export const fmtDate = (d) => d ? new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDay = (d) => d ? new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';

const CSS = `
:root{--bg:#f4f6f8;--surface:#fff;--ink:#1b2530;--muted:#5e6b78;--line:#d8dfe6;--accent:#1d6b73;--accent-ink:#fff;--accent-soft:#e0eef0;
--ok:#2f7d4f;--ok-soft:#e3f2e8;--warn:#94660a;--warn-soft:#faf0d6;--bad:#a83a32;--bad-soft:#f8e3e1}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "BIZ UDPGothic","Hiragino Sans","Yu Gothic","Meiryo",sans-serif}
.top{display:flex;align-items:center;gap:24px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{font-weight:700;color:var(--accent);padding:14px 0}
.top nav{display:flex;gap:4px;flex-wrap:wrap}
.top nav a{padding:14px 14px;color:var(--ink);text-decoration:none;border-bottom:3px solid transparent}
.top nav a.on{border-bottom-color:var(--accent);font-weight:700}
.top nav a:hover{background:var(--bg)}
.who{margin-left:auto;font-size:14px;color:var(--muted)}
main{max-width:1100px;margin:0 auto;padding:28px 24px 80px;display:grid;gap:22px}
h1{font-size:24px;margin:0}
h2{font-size:18px;margin:0 0 8px}
.lead{color:var(--muted);margin:-12px 0 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:20px 22px;display:grid;gap:14px;min-width:0}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.spread{justify-content:space-between}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
label{display:grid;gap:4px;font-weight:700;font-size:14px}
label .hint{font-weight:400;color:var(--muted);font-size:13px}
input[type=text],input[type=email],input[type=number],input[type=date],input[type=datetime-local],input[type=search],select,textarea{
 font:inherit;font-weight:400;padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);width:100%}
textarea{min-height:260px;line-height:1.7}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button,.btn{font:inherit;font-weight:700;padding:9px 18px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);cursor:pointer;text-decoration:none;display:inline-block}
button.sub,.btn.sub{background:var(--surface);color:var(--accent)}
button.danger{background:var(--bad);border-color:var(--bad)}
button.link{border:0;background:none;color:var(--muted);padding:0;font-weight:400;text-decoration:underline}
button:disabled{opacity:.45;cursor:not-allowed}
form.inline{display:inline}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:13px;color:var(--muted);font-weight:700}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr:hover td{background:#fafbfc}
.scroll{overflow-x:auto}
a{color:var(--accent)}
.muted{color:var(--muted)}
.small{font-size:13px}
.pill{display:inline-block;font-size:12.5px;font-weight:700;padding:1px 10px;border-radius:99px;background:var(--bg);color:var(--muted);white-space:nowrap}
.pill.ok{background:var(--ok-soft);color:var(--ok)} .pill.warn{background:var(--warn-soft);color:var(--warn)} .pill.bad{background:var(--bad-soft);color:var(--bad)} .pill.info{background:var(--accent-soft);color:var(--accent)}
.flash{padding:12px 16px;border-radius:8px;background:var(--ok-soft);color:var(--ok);font-weight:700}
.flash.bad{background:var(--bad-soft);color:var(--bad)} .flash.warn{background:var(--warn-soft);color:var(--warn)}
.big{font-size:40px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.checks{display:flex;flex-wrap:wrap;gap:6px 18px}
.checks label{display:flex;gap:6px;align-items:center;font-weight:400;font-size:15px}
fieldset{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:0;display:grid;gap:10px;min-width:0}
legend{font-weight:700;padding:0 6px}
.steps{display:flex;gap:8px;flex-wrap:wrap;list-style:none;padding:0;margin:0}
.steps li{padding:6px 14px;border-radius:99px;background:var(--bg);color:var(--muted);font-size:14px}
.steps li.done{background:var(--ok-soft);color:var(--ok)} .steps li.now{background:var(--accent);color:var(--accent-ink);font-weight:700}
pre.mail{white-space:pre-wrap;background:var(--bg);padding:16px;border-radius:8px;font:15px/1.7 inherit;margin:0;border:1px solid var(--line)}
.pager{display:flex;gap:10px;align-items:center}
.demo{background:var(--warn-soft);color:var(--warn);font-size:14px;padding:8px 24px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.demo button.link{color:var(--warn)}
`;
