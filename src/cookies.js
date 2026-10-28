// Cookie の読み書き。確認用サイト（ブラウザ内で動く版）では、ブラウザが Cookie ヘッダーを
// 扱わせてくれないので、代わりに x-cookie / x-set-cookie を使う。
const demo = typeof process === 'undefined' || process.env.DEMO === '1';
const IN = demo ? 'x-cookie' : 'cookie';
const OUT = demo ? 'x-set-cookie' : 'Set-Cookie';

export function getCookie(c, name) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(c.req.header(IN) ?? '')?.[1];
}

export function setCookie(c, value) {
  c.header(OUT, value, { append: true });
}
