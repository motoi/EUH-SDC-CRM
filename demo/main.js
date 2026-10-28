// 確認用サイト：管理画面をサーバーなしでブラウザの中だけで動かす。
// データはこのブラウザの IndexedDB に入り、他の人とは共有されない。メールは送らない。
// 画面は通常どおりサーバー側で作る HTML をそのまま使い、リンクとフォームをここで受け取って app に渡す。
import schema from '../db/schema.sql';
import { configure, q, tx } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed-data.js';
import { start as startSender } from '../src/sender.js';

const DB = 'sdc-demo-v1';
const JAR_KEY = 'sdc-demo-cookies';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

// 「最初の状態に戻す」：データベースを開く前に消す
if (store.get('sdc-demo-reset')) {
  store.del('sdc-demo-reset');
  store.del(JAR_KEY);
  await new Promise((ok) => { const r = indexedDB.deleteDatabase(`/pglite/${DB}`); r.onsuccess = r.onerror = r.onblocked = ok; });
}

configure({
  schema,
  pglite: await import('./pglite/index.js'),
  citext: await import('./pglite/contrib/citext.js'),
  dataDir: `idb://${DB}`,
});

try {
  const [{ n }] = await q(`select count(*)::int n from staff_users`);
  if (n === 0) await tx((run) => seed(run));
} catch (e) {
  document.getElementById('boot-err').textContent = `準備に失敗しました：${e.message}`;
  throw e;
}

const app = createApp();
startSender();

// ── Cookie（ログイン状態とお知らせ表示）をこのブラウザに保存する
const jar = new Map(Object.entries(JSON.parse(store.get(JAR_KEY) ?? '{}')));
function applySetCookie(header) {
  if (!header) return;
  for (const part of header.split(/,\s*(?=[A-Za-z0-9_-]+=)/)) {
    const [pair, ...attrs] = part.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
    if (!value || attrs.some((a) => /max-age=0/i.test(a))) jar.delete(name);
    else jar.set(name, value);
  }
  store.set(JAR_KEY, JSON.stringify(Object.fromEntries(jar)));
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(path, init = {}) {
  for (let hop = 0; hop < 5; hop++) {
    const headers = new Headers(init.headers);
    headers.set('x-cookie', cookieHeader());
    const res = await app.request(path, { ...init, headers });
    applySetCookie(res.headers.get('x-set-cookie'));
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      path = res.headers.get('location');
      init = {};
      continue;
    }
    return { path, res };
  }
  throw new Error('転送が多すぎます');
}

// 画面のスクリプト（例：人数の自動更新）が使う fetch('/…') も app に渡す
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/')) return (await call(url, init)).res;
  return realFetch(input, init);
};

// ── 画面の切り替え。アドレスは #/contacts のように持つ（再読み込みしても同じ画面に戻る）
let current = null;
async function go(path, init, { push = true } = {}) {
  const { path: finalPath, res } = await call(path, init);
  const type = res.headers.get('content-type') ?? '';
  const body = await res.text();
  const doc = type.includes('html') ? new DOMParser().parseFromString(body, 'text/html') : null;
  if (doc) {
    document.title = doc.title;
    document.head.querySelectorAll('style').forEach((s) => s.remove());
    doc.head.querySelectorAll('style').forEach((s) => document.head.append(s));
    document.body.replaceChildren(...doc.body.childNodes);
    for (const old of document.body.querySelectorAll('script')) {
      const s = document.createElement('script');
      s.textContent = `{${old.textContent}}`;   // 同じ画面を何度開いても変数がぶつからないように
      old.replaceWith(s);
    }
  } else {
    const pre = document.createElement('pre');
    pre.style.cssText = 'padding:24px;white-space:pre-wrap';
    pre.textContent = body;
    document.body.replaceChildren(pre);
  }
  current = finalPath;
  if (push && location.hash !== `#${finalPath}`) history.pushState(null, '', `#${finalPath}`);
  else if (!push) history.replaceState(null, '', `#${finalPath}`);
  if (!init) window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#demo-reset')) {
    store.set('sdc-demo-reset', '1');
    location.hash = '';
    location.reload();
    return;
  }
  const a = e.target.closest('a[href]');
  const href = a?.getAttribute('href');
  if (!href || !(href.startsWith('/') || href.startsWith('?')) || a.target || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  go(href.startsWith('?') ? `${current.split('?')[0]}${href}` : href);
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  const action = form.getAttribute('action') || current.split('?')[0];
  const data = new URLSearchParams(new FormData(form));
  if ((form.getAttribute('method') ?? 'get').toLowerCase() === 'post') go(action, { method: 'POST', body: data });
  else go(`${action}?${data}`);
});

window.addEventListener('popstate', () => {
  const path = location.hash.slice(1) || '/';
  if (path !== current) go(path, undefined, { push: false });
});

await go(location.hash.slice(1) || '/', undefined, { push: false });
