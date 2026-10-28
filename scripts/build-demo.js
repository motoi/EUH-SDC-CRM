// 確認用サイトを site/ に組み立てる（GitHub Pages などの静的ホスティングにそのまま置ける）
import { build } from 'esbuild';
import { rm, mkdir, cp, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = 'site';
const pg = 'node_modules/@electric-sql/pglite/dist';

await rm(out, { recursive: true, force: true });
await mkdir(`${out}/pglite/contrib`, { recursive: true });

await build({
  entryPoints: ['demo/main.js'],
  outfile: `${out}/app.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  loader: { '.sql': 'text' },
  // ブラウザでは使わない Node 用の部品と、別ファイルで置く PGlite は含めない
  external: ['./pglite/*', 'pg', 'node:*', '@electric-sql/pglite', '@electric-sql/pglite/*', '@hono/node-server'],
});

// PGlite は postgres.wasm などを自分の置き場所からの相対パスで読むので、構成を保ったまま置く
for (const f of await readdir(pg)) {
  if (/^(index\.js|chunk-.*\.js|postgres\.(wasm|data)|citext\.tar\.gz)$/.test(f)) await cp(`${pg}/${f}`, `${out}/pglite/${f}`);
}
await cp(`${pg}/contrib/citext.js`, `${out}/pglite/contrib/citext.js`);
await cp(`${pg}/fs`, `${out}/pglite/fs`, { recursive: true }).catch(() => {});
// GitHub Pages はブラウザに10分間ファイルを使い回させるので、中身が変わるたびに app.js の名前を変える
const appJs = await readFile(`${out}/app.js`);
const hash = createHash('sha256').update(appJs).digest('hex').slice(0, 10);
await rename(`${out}/app.js`, `${out}/app.${hash}.js`);
const index = await readFile('demo/index.html', 'utf8');
await writeFile(`${out}/index.html`, index.replace('./app.js', `./app.${hash}.js`));
await writeFile(`${out}/.nojekyll`, '');
console.log('site/ を作成しました');
