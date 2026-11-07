// Google スプレッドシート版（gas/）を、スプレッドシートの代わりの簡単な作り物の上で動かして確かめる（データはすべて架空）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// vm の中で作った配列は、外の配列と見た目が同じでも別物として比べられるので、比べる前に作り直す
const plain = (x) => JSON.parse(JSON.stringify(x));

// ── スプレッドシートの作り物：シートごとに2次元配列を持つだけ
function fakeSheet(name, rows) {
  const sh = {
    rows, name,
    getName: () => name,
    getLastRow: () => sh.rows.length,
    getLastColumn: () => Math.max(0, ...sh.rows.map((r) => r.length)),
    getMaxRows: () => 1000,
    getDataRange: () => ({ getValues: () => sh.rows.map((r) => [...r]) }),
    getRange: (row, col, n = 1, m = 1) => ({
      getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => sh.rows[row - 1 + i]?.[col - 1 + j] ?? '')),
      setValues: (v) => { v.forEach((r, i) => { sh.rows[row - 1 + i] ??= []; r.forEach((x, j) => { sh.rows[row - 1 + i][col - 1 + j] = x; }); }); return { setFontWeight() {} }; },
      clearContent: () => { for (let i = 0; i < n; i++) sh.rows[row - 1 + i] = sh.rows[row - 1 + i].map((x, j) => (j >= col - 1 && j < col - 1 + m ? '' : x)); sh.rows = sh.rows.filter((r) => r.some((x) => x !== '')); },
      setDataValidation() {},
    }),
    appendRow: (r) => sh.rows.push(r),
    setFrozenRows() {},
  };
  return sh;
}

async function load(sheets) {
  const book = sheets.map(([n, r]) => fakeSheet(n, r));
  const alerts = [];
  const rule = { requireValueInList: () => rule, setAllowInvalid: () => rule, build: () => ({}) };
  const ctx = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => book.find((s) => s.getName() === n) ?? null,
        getSheets: () => book,
        insertSheet: (n) => { const s = fakeSheet(n, []); book.push(s); return s; },
      }),
      getUi: () => ({ alert: (...a) => alerts.push(a.join('\n')), ButtonSet: {} }),
      newDataValidation: () => rule,
    },
    Session: { getActiveUser: () => ({ getEmail: () => 'staff@example.jp' }) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '20261108-1000' },
  });
  for (const f of ['Logic.gs', 'Code.gs']) vm.runInContext(await readFile(new URL(`../gas/${f}`, import.meta.url), 'utf8'), ctx);
  return { ctx, book, alerts, sheet: (n) => book.find((s) => s.getName() === n) };
}

const H = ['氏名', '企業・団体名', '部署', '役職', 'メールアドレス', '団体所在地', '企業分類1', '企業分類2', '興味分類', '役職区分', '送ってよい根拠', '入手経路', 'メモ'];
const CUSTOMERS = [H,
  ['見本 一郎', '株式会社サンプル物産', '経営企画部', '代表取締役', 'Ichiro@Example.jp', '広島県広島市中区', '中堅企業', '卸売', '新規事業,DX', '', '名刺'],
  ['見本 二郎', '株式会社サンプル物産', 'なし', '課長', 'jiro@example.jp', '広島県福山市', '中堅企業', '卸売', 'リベラルアーツ、新規事業', '', '同意'],
  ['見本 三子', 'サンプル大学', '学部', '准教授', 'mitsuko@example.jp', '岡山県岡山市', '教育機関', '教育', 'リベラルアーツ', '', '名刺'],
  ['見本 四郎', '株式会社サンプル食品', '総務部', '部長', 'shiro@example.jp', '広島県三原市', '大企業', '食品', '新規事業', '', ''],     // 根拠が空欄 → 送らない
  ['見本 五郎', '株式会社サンプル食品', '総務部', '主任', 'goro@example.jp', '広島県三原市', '大企業', '食品', '新規事業', '', '名刺'],  // 配信停止
  ['見本 六子', '株式会社サンプル食品', '', '', 'jiro@example.jp', '', '', '', '', '', '名刺'],                                         // 重複
  ['', '株式会社サンプル食品', '', '', 'bad-address', '', '零細', '', '', '', '名刺'],                                                   // 形が正しくない
];
const EVENT = [['メールアドレス', '氏名', '参加状況'], ['ichiro@example.jp', '', '参加'], ['jiro@example.jp', '', '申込'], ['mitsuko@example.jp', '', '見学'], ['nobody@example.jp', '', '']];
const SUPPRESS = [['メールアドレス', '理由', '日付', 'メモ'], ['GORO@example.jp', '本人が配信停止', '', '']];

test('役職区分・興味分類・都道府県の読み取り', async () => {
  const { ctx } = await load([]);
  assert.equal(ctx.classifyJobTitle('代表取締役'), '経営層');
  assert.equal(ctx.classifyJobTitle('シニアマネージャー'), '課長級');
  assert.equal(ctx.classifyJobTitle('なし'), '未記入');
  assert.deepEqual(plain(ctx.splitInterests('新規事業,リベラルアーツ、 新規事業')), ['新規事業', 'リベラルアーツ']);
  assert.equal(ctx.prefectureOf('広島県広島市中区'), '広島県');
  assert.equal(ctx.prefectureOf('東京都千代田区'), '東京都');
  assert.equal(ctx.prefectureOf('和歌山県和歌山市'), '和歌山県');
});

test('名簿を読み、問題のある行を知らせる', async () => {
  const { ctx } = await load([]);
  const m = ctx.buildModel({ customers: CUSTOMERS, events: [{ name: 'DXセミナー', rows: EVENT }], suppress: SUPPRESS });
  assert.equal(m.contacts.length, 5);
  const texts = m.problems.map((p) => `${p.sheet}:${p.line}:${p.text}`).join('\n');
  assert.match(texts, /顧客:7:同じメールアドレスが 3 行目にも/);
  assert.match(texts, /顧客:8:メールアドレスの形が正しくない/);
  assert.match(texts, /DXセミナー:4:参加状況「見学」/);
  assert.match(texts, /DXセミナー:5:nobody@example.jp が顧客のシートにいない/);
  assert.equal(m.contacts[1].department, '');   // 「なし」は空欄扱い
});

test('条件で絞り込み、配信停止と根拠のない人を外す', async () => {
  const { ctx } = await load([]);
  const m = ctx.buildModel({ customers: CUSTOMERS, events: [{ name: 'DXセミナー', rows: EVENT }], suppress: SUPPRESS });
  const pick = (def) => { const r = ctx.selectRecipients(m, def); return plain([r.list.map((c) => c.email), r.excluded]); };
  assert.deepEqual(pick({}), [['ichiro@example.jp', 'jiro@example.jp', 'mitsuko@example.jp'], { suppressed: 1, noConsent: 1 }]);
  assert.deepEqual(pick({ interests: ['新規事業'], sizes: ['大企業', '中堅企業'] })[0], ['ichiro@example.jp', 'jiro@example.jp']);
  assert.deepEqual(pick({ events: ['DXセミナー'] })[0], ['ichiro@example.jp']);                                  // 参加状況は「参加」が既定
  assert.deepEqual(pick({ events: ['DXセミナー'], eventStatus: ['申込', '参加'] })[0], ['ichiro@example.jp', 'jiro@example.jp']);
  assert.deepEqual(pick({ excludeEvents: ['DXセミナー'] })[0], ['mitsuko@example.jp']);
  assert.deepEqual(pick({ levels: ['経営層'], prefectures: ['広島県'] })[0], ['ichiro@example.jp']);
  assert.equal(ctx.describe({ interests: ['新規事業'], excludeEvents: ['DXセミナー'] }), '興味分類：新規事業 ／ 除外：「DXセミナー」の申込・参加者');
});

test('本文は差し込み・エスケープ・改行の <br> 化をし、署名と配信停止の案内を付ける', async () => {
  const { ctx } = await load([]);
  const m = ctx.compose('{{氏名}}様へ', '{{氏名}} 様\n<b>&</b>', { name: '見本 一郎' });
  assert.equal(m.subject, '見本 一郎様へ');
  assert.match(m.html, /^<div lang="ja">見本 一郎 様<br>\n&lt;b&gt;&amp;&lt;\/b&gt;<br>\n<br>\n\*+<br>\n広島県公立大学法人　叡啓大学<br>/);
  assert.match(m.html, /「配信停止」とご返信ください。<\/div>$/);
});

test('送信シートを作る：人数の確認、作り直しの確認、配信履歴', async () => {
  const t = await load([['顧客', CUSTOMERS.map((r) => [...r])], ['DXセミナー', EVENT], ['配信停止', SUPPRESS]]);
  t.ctx.setup();
  assert.deepEqual(t.sheet('送信').rows[0], ['宛先', '件名', '本文', '状態', '番号']);
  assert.equal(t.sheet('顧客').rows[1][9], '経営層');   // 初期設定で役職区分が付く
  assert.deepEqual(t.ctx.countRecipients({}).n, 3);

  assert.throws(() => t.ctx.writeSendSheet({}, '案内', '件名', '本文', 4, false), /実際の人数（3人）/);
  let r = t.ctx.writeSendSheet({}, '案内', '{{氏名}}様へ', '{{氏名}} 様', 3, false);
  assert.deepEqual({ ...r }, { ok: true, n: 3 });
  const send = t.sheet('送信').rows;
  assert.deepEqual(send.slice(1).map((x) => [x[0], x[1], x[3], x[4]]), [
    ['ichiro@example.jp', '見本 一郎様へ', '', '20261108-1000-1'],
    ['jiro@example.jp', '見本 二郎様へ', '', '20261108-1000-2'],
    ['mitsuko@example.jp', '見本 三子様へ', '', '20261108-1000-3'],
  ]);
  assert.equal(t.sheet('配信履歴').rows.length, 2);

  // まだ送っていない行が残っているときは、確認してから作り直す
  r = t.ctx.writeTestSheet({}, '件名', '本文', 'staff@example.jp', false);
  assert.equal(r.needConfirm.unsent, 3);
  r = t.ctx.writeTestSheet({}, '件名', '本文', 'staff@example.jp', true);
  assert.equal(r.ok, true);
  assert.deepEqual(t.sheet('送信').rows.slice(1).map((x) => [x[0], x[1], x[4]]), [['staff@example.jp', '[テスト] 件名', 'テスト']]);

  // 送り終えた行（送信済み）だけなら、確認なしで作り直せる
  t.sheet('送信').rows[1][3] = '送信済み';
  assert.equal(t.ctx.writeTestSheet({}, '件名', '本文', 'staff@example.jp', false).ok, true);
});
