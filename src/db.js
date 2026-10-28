// DATABASE_URL があれば PostgreSQL に、なければ組み込みの PGlite に接続する。
//   Node：.data/pglite に保存。確認用サイト：ブラウザの IndexedDB に保存
// どちらも query(text, params) -> { rows } の形で使う。
let client;
let options = {};

// 確認用サイトから、スキーマの文字列と PGlite の読み込み元を渡す
export function configure(opts) { options = opts; }

const env = typeof process === 'undefined' ? {} : process.env;

export async function connect() {
  if (client) return client;
  if (env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    client = new pg.Pool({ connectionString: env.DATABASE_URL });
  } else {
    const { PGlite } = options.pglite ?? await import('@electric-sql/pglite');
    const { citext } = options.citext ?? await import('@electric-sql/pglite/contrib/citext');
    const dir = options.dataDir ?? env.PGLITE_DIR ?? '.data/pglite';
    if (dir.startsWith('.') || dir.startsWith('/')) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(dir, { recursive: true });
    }
    client = new PGlite(dir, { extensions: { citext } });
  }
  await migrate();
  return client;
}

async function schemaText() {
  if (options.schema) return options.schema;
  const { readFile } = await import('node:fs/promises');
  return readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
}

async function migrate() {
  const { rows } = await client.query(`select to_regclass('public.contacts') as t`);
  if (rows[0].t) return;
  const sql = await schemaText();
  if (client.exec) await client.exec(sql);
  else await client.query(sql);
}

export async function q(text, params = []) {
  const c = await connect();
  const res = await c.query(text, params);
  return res.rows;
}

export async function one(text, params = []) {
  return (await q(text, params))[0];
}

// PGlite は単一接続なので、そのまま transaction() を使う。pg は専用の接続を借りる。
export async function tx(fn) {
  const c = await connect();
  if (c.connect && c.totalCount !== undefined) {
    const conn = await c.connect();
    try {
      await conn.query('begin');
      const out = await fn((t, p = []) => conn.query(t, p).then(r => r.rows));
      await conn.query('commit');
      return out;
    } catch (e) {
      await conn.query('rollback');
      throw e;
    } finally {
      conn.release();
    }
  }
  return c.transaction(async (t) => fn((text, p = []) => t.query(text, p).then(r => r.rows)));
}
