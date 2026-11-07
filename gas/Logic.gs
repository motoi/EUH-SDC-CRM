// SDC配信（Google スプレッドシート版）：シートの読み書きをしない計算部分。
// Node 版（src/）と同じ考え方で、役職区分・絞り込み・差し込み・本文の HTML 化を行う。
// Apps Script ではファイルをまたいで関数を共有するので、ここの関数は Code.gs から呼ばれる。手元のテスト（test/gas.test.js）からも読み込む。

var SHEETS = { customers: '顧客', suppress: '配信停止', send: '送信', history: '配信履歴' };
var RESERVED = [SHEETS.customers, SHEETS.suppress, SHEETS.send, SHEETS.history, '使い方'];

var CUSTOMER_HEADERS = ['氏名', '企業・団体名', '部署', '役職', 'メールアドレス', '団体所在地', '企業分類1', '企業分類2', '興味分類',
  '役職区分', '送ってよい根拠', '入手経路', 'メモ'];
var SUPPRESS_HEADERS = ['メールアドレス', '理由', '日付', 'メモ'];
var SEND_HEADERS = ['宛先', '件名', '本文', '状態', '番号'];
var HISTORY_HEADERS = ['日時', '担当者', '配信名', '件名', '人数', '条件', '本文'];

// 「送ってよい根拠」：名刺（名刺交換など書面で受け取った）・同意（フォーム等で案内の受信に同意）だけが送る対象。空欄と「不明」は送らない
var CONSENT_OK = ['名刺', '同意'];
var CONSENT_CHOICES = ['名刺', '同意', '不明'];
var SIZE_CLASSES = ['大企業', '中堅企業', '中小企業', '小規模事業者', '教育機関', 'その他'];
var PART_STATUS = ['申込', '参加', '欠席', 'キャンセル'];
var JOB_LEVELS = ['経営層', '部長級', '課長級', '一般・担当', '教員・研究者', '学生', 'その他', '未記入'];

// 上から順に調べ、最初に当てはまった区分にする（Node 版 src/job-level.js と同じ表）
var JOB_LEVEL_RULES = [
  ['未記入', /^(なし|無し|-|－|ー|特になし)?$/],
  ['学生', /学生|院生|履修生|単科生|研究生|聴講生/],
  ['教員・研究者', /教授|講師|助教|研究員|教員|教諭|ポスドク|フェロー/],
  ['経営層', /代表|社長|取締役|役員|会長|理事|頭取|学長|CEO|COO|CFO|CTO|オーナー|経営者/i],
  ['一般・担当', /アシスタント|見習|補助/],
  ['部長級', /部長|局長|支店長|支社長|所長|室長|センター長|工場長|次長|ゼネラルマネージャ|ディレクター|本部長/],
  ['課長級', /課長|マネージャ|リーダー|主幹|グループ長|チーム長|班長/],
  ['一般・担当', /主任|主査|係長|担当|社員|一般|職員|スタッフ|記者|推進役|コンサルタント|エンジニア|デザイナー|研究者|専門職/],
];

var FOOTER_LINES = [
  '************************************************',
  '広島県公立大学法人　叡啓大学',
  '価値創造ブランド推進課（社会連携係）',
  '〒730-0016　広島市中区幟町1-5',
  'TEL：082-225-6312',
  'Mail：social-design-center@eikei.ac.jp',
  '************************************************',
  '今後このようなご案内が不要な場合は、このメールに「配信停止」とご返信ください。',
];
var MERGE_FIELDS = { '{{氏名}}': 'name', '{{企業・団体名}}': 'org', '{{部署}}': 'department', '{{役職}}': 'title' };

function norm_(v) { return String(v == null ? '' : v).normalize('NFKC').trim(); }
function normEmail(v) { return norm_(v).toLowerCase(); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function blankIfNone_(v) { var s = String(v == null ? '' : v).trim(); return /^(なし|無し|-|－|ー)$/.test(s) ? '' : s; }

function classifyJobTitle(title) {
  var t = norm_(title);
  for (var i = 0; i < JOB_LEVEL_RULES.length; i++) if (JOB_LEVEL_RULES[i][1].test(t)) return JOB_LEVEL_RULES[i][0];
  return 'その他';
}

function splitInterests(text) {
  var seen = {};
  return norm_(text).split(/[,、]/).map(function (s) { return s.trim(); })
    .filter(function (s) { if (!s || seen[s]) return false; seen[s] = true; return true; });
}

// 団体所在地の先頭から都道府県を取り出す（例：広島県広島市中区 → 広島県）
function prefectureOf(location) {
  var m = /^(東京都|北海道|京都府|大阪府|.{2,3}?県)/.exec(norm_(location));
  return m ? m[1] : '';
}

// 見出し行から列の位置を引けるようにする
function index_(header) {
  var ix = {};
  header.forEach(function (h, i) { ix[norm_(h)] = i; });
  return ix;
}
function cell_(row, ix, name) { return ix[name] === undefined ? '' : row[ix[name]]; }

// シートの中身（2次元配列）から、絞り込みに使う形を作る
//   tables = { customers: [[見出し], ...], events: [{ name, rows }], suppress: [[見出し], ...] }
function buildModel(tables) {
  var problems = [];
  var cRows = tables.customers || [[]];
  var cx = index_(cRows[0] || []);
  var contacts = [], byEmail = {};
  for (var r = 1; r < cRows.length; r++) {
    var row = cRows[r];
    if (row.every(function (v) { return String(v).trim() === ''; })) continue;
    var email = normEmail(cell_(row, cx, 'メールアドレス'));
    var line = r + 1;
    if (!email) { problems.push({ sheet: SHEETS.customers, line: line, text: 'メールアドレスが空欄' }); continue; }
    if (!isEmail(email)) { problems.push({ sheet: SHEETS.customers, line: line, text: 'メールアドレスの形が正しくない：' + email }); continue; }
    if (byEmail[email]) { problems.push({ sheet: SHEETS.customers, line: line, text: '同じメールアドレスが ' + byEmail[email].line + ' 行目にもある（上の行を使う）' }); continue; }
    var size = norm_(cell_(row, cx, '企業分類1'));
    if (size && SIZE_CLASSES.indexOf(size) < 0) problems.push({ sheet: SHEETS.customers, line: line, text: '企業分類1「' + size + '」は選択肢にない' });
    var c = {
      line: line, email: email,
      name: norm_(cell_(row, cx, '氏名')), org: norm_(cell_(row, cx, '企業・団体名')),
      department: blankIfNone_(cell_(row, cx, '部署')), title: blankIfNone_(cell_(row, cx, '役職')),
      level: classifyJobTitle(cell_(row, cx, '役職')),
      pref: prefectureOf(cell_(row, cx, '団体所在地')), size: size, industry: norm_(cell_(row, cx, '企業分類2')),
      interests: splitInterests(cell_(row, cx, '興味分類')),
      consent: norm_(cell_(row, cx, '送ってよい根拠')),
      events: {},
    };
    if (!c.name) problems.push({ sheet: SHEETS.customers, line: line, text: '氏名が空欄' });
    contacts.push(c);
    byEmail[email] = c;
  }

  var events = [];
  (tables.events || []).forEach(function (ev) {
    var ex = index_(ev.rows[0] || []);
    if (ex['メールアドレス'] === undefined) return;   // メールアドレスの列がないシートはイベントとして扱わない
    events.push(ev.name);
    for (var r = 1; r < ev.rows.length; r++) {
      var email = normEmail(cell_(ev.rows[r], ex, 'メールアドレス'));
      if (!email) continue;
      var status = norm_(cell_(ev.rows[r], ex, '参加状況')) || '参加';
      if (PART_STATUS.indexOf(status) < 0) { problems.push({ sheet: ev.name, line: r + 1, text: '参加状況「' + status + '」は選択肢にない' }); continue; }
      var c = byEmail[email];
      if (!c) { problems.push({ sheet: ev.name, line: r + 1, text: email + ' が顧客のシートにいない（配信の対象にならない）' }); continue; }
      c.events[ev.name] = status;
    }
  });

  var suppressed = {};
  var sRows = tables.suppress || [[]];
  var sx = index_(sRows[0] || []);
  for (var s = 1; s < sRows.length; s++) {
    var e = normEmail(cell_(sRows[s], sx, 'メールアドレス'));
    if (e) suppressed[e] = true;
  }
  return { contacts: contacts, events: events, suppressed: suppressed, problems: problems };
}

// 絞り込みの選択肢（実際にシートに出てくる値だけ）
function choicesOf(model) {
  var uniq = function (arr) { var s = {}; return arr.filter(function (v) { if (!v || s[v]) return false; s[v] = true; return true; }).sort(); };
  var all = function (f) { return uniq([].concat.apply([], model.contacts.map(f))); };
  return {
    events: model.events, statuses: PART_STATUS,
    interests: all(function (c) { return c.interests; }),
    levels: JOB_LEVELS.filter(function (l) { return model.contacts.some(function (c) { return c.level === l; }); }),
    sizes: SIZE_CLASSES.filter(function (l) { return model.contacts.some(function (c) { return c.size === l; }); }),
    industries: all(function (c) { return [c.industry]; }),
    prefectures: all(function (c) { return [c.pref]; }),
  };
}

// 条件 def = { events:[名前], eventStatus:[申込…], interests, levels, sizes, industries, prefectures, excludeEvents }
// 同じ項目の中はどれか1つに当てはまればよく（または）、項目どうしはすべて満たす（かつ）
function selectRecipients(model, def) {
  def = def || {};
  var has = function (a) { return a && a.length; };
  var statuses = has(def.eventStatus) ? def.eventStatus : ['参加'];
  var excluded = { suppressed: 0, noConsent: 0 };
  var list = model.contacts.filter(function (c) {
    if (has(def.events) && !def.events.some(function (e) { return statuses.indexOf(c.events[e]) >= 0; })) return false;
    if (has(def.interests) && !def.interests.some(function (i) { return c.interests.indexOf(i) >= 0; })) return false;
    if (has(def.levels) && def.levels.indexOf(c.level) < 0) return false;
    if (has(def.sizes) && def.sizes.indexOf(c.size) < 0) return false;
    if (has(def.industries) && def.industries.indexOf(c.industry) < 0) return false;
    if (has(def.prefectures) && def.prefectures.indexOf(c.pref) < 0) return false;
    if (has(def.excludeEvents) && def.excludeEvents.some(function (e) { return ['申込', '参加'].indexOf(c.events[e]) >= 0; })) return false;
    // ここまでで条件に合った人のうち、送ってはいけない人を外して数える
    if (model.suppressed[c.email]) { excluded.suppressed++; return false; }
    if (CONSENT_OK.indexOf(c.consent) < 0) { excluded.noConsent++; return false; }
    return true;
  });
  return { list: list, excluded: excluded };
}

function describe(def) {
  def = def || {};
  var p = [];
  var j = function (a) { return a.join('・'); };
  if (def.events && def.events.length) p.push('イベント「' + def.events.join('」「') + '」に' + j(def.eventStatus && def.eventStatus.length ? def.eventStatus : ['参加']));
  if (def.interests && def.interests.length) p.push('興味分類：' + j(def.interests));
  if (def.levels && def.levels.length) p.push('役職区分：' + j(def.levels));
  if (def.sizes && def.sizes.length) p.push('企業分類1：' + j(def.sizes));
  if (def.industries && def.industries.length) p.push('企業分類2：' + j(def.industries));
  if (def.prefectures && def.prefectures.length) p.push('団体所在地：' + j(def.prefectures));
  if (def.excludeEvents && def.excludeEvents.length) p.push('除外：「' + def.excludeEvents.join('」「') + '」の申込・参加者');
  return p.length ? p.join(' ／ ') : '送ってよい連絡先すべて';
}

function merge(text, contact) {
  var out = String(text || '');
  Object.keys(MERGE_FIELDS).forEach(function (k) { out = out.split(k).join(contact[MERGE_FIELDS[k]] || ''); });
  return out;
}

// Power Automate の「共有メールボックスからメールを送信する (V2)」は本文を HTML として送るので、
// 記号をエスケープし改行を <br> にする。lang="ja" は Gmail が英語と取り違えないようにするため
function toHtml(text) {
  var esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return '<div lang="ja">' + esc.replace(/\r?\n/g, '<br>\n') + '</div>';
}

function compose(subject, body, contact) {
  var text = merge(body, contact) + '\n\n' + FOOTER_LINES.join('\n');
  return { subject: merge(subject, contact), text: text, html: toHtml(text) };
}
