// SDC配信（Google スプレッドシート版）：メニューと、シートの読み書き。
// 名簿はこのスプレッドシートのシートで持ち、配信のときは「送信」シートを作る。
// メールを送るのは Power Automate のフロー「SDC配信の送信」（「送信」シートを1行ずつ読み、social-design-center@ から送る）。

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SDC配信')
    .addItem('配信を作る', 'openSidebar')
    .addItem('名簿を点検する', 'checkData')
    .addItem('役職区分を付け直す', 'refreshJobLevels')
    .addSeparator()
    .addItem('初期設定（シートを用意する）', 'setup')
    .addToUi();
}

// 顧客のシートで役職を書き換えたら、役職区分をその場で付ける
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEETS.customers || e.range.getRow() === 1) return;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var tCol = header.indexOf('役職') + 1, lCol = header.indexOf('役職区分') + 1;
  if (!tCol || !lCol || e.range.getColumn() > tCol || e.range.getLastColumn() < tCol) return;
  var titles = sheet.getRange(e.range.getRow(), tCol, e.range.getNumRows(), 1).getValues();
  sheet.getRange(e.range.getRow(), lCol, titles.length, 1).setValues(titles.map(function (t) { return [String(t[0]).trim() ? classifyJobTitle(t[0]) : '']; }));
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheet_(name, headers) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 足りないシートを作り、見出しと「送ってよい根拠」の選択肢を入れる。何度実行してもよい
function setup() {
  var c = ensureSheet_(SHEETS.customers, CUSTOMER_HEADERS);
  ensureSheet_(SHEETS.suppress, SUPPRESS_HEADERS);
  ensureSheet_(SHEETS.send, SEND_HEADERS);
  ensureSheet_(SHEETS.history, HISTORY_HEADERS);
  var header = c.getRange(1, 1, 1, c.getLastColumn()).getValues()[0];
  var consentCol = header.indexOf('送ってよい根拠') + 1;
  if (consentCol) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(CONSENT_CHOICES, true).setAllowInvalid(false).build();
    c.getRange(2, consentCol, c.getMaxRows() - 1, 1).setDataValidation(rule);
  }
  var sizeCol = header.indexOf('企業分類1') + 1;
  if (sizeCol) {
    var rule2 = SpreadsheetApp.newDataValidation().requireValueInList(SIZE_CLASSES, true).setAllowInvalid(true).build();
    c.getRange(2, sizeCol, c.getMaxRows() - 1, 1).setDataValidation(rule2);
  }
  refreshJobLevels(true);
  SpreadsheetApp.getUi().alert('シートを用意しました。\n\n・顧客：連絡先の一覧（1人1行。メールアドレスで見分けます）\n・イベントごとのシート：シート名をイベント名にし、「メールアドレス」と「参加状況」（申込・参加・欠席・キャンセル）の列を置く\n・配信停止：配信を止めた人のメールアドレス\n・送信：Power Automate が読むシート（手で編集しない）\n・配信履歴：配信の記録');
}

function readTables_() {
  var values = function (name) { var sh = ss_().getSheetByName(name); return sh && sh.getLastRow() ? sh.getDataRange().getValues() : [[]]; };
  var events = ss_().getSheets().filter(function (sh) { return RESERVED.indexOf(sh.getName()) < 0 && sh.getLastRow(); })
    .map(function (sh) { return { name: sh.getName(), rows: sh.getDataRange().getValues() }; });
  return { customers: values(SHEETS.customers), events: events, suppress: values(SHEETS.suppress) };
}

function refreshJobLevels(silent) {
  var sh = ss_().getSheetByName(SHEETS.customers);
  if (!sh || sh.getLastRow() < 2) return;
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var tCol = header.indexOf('役職') + 1, lCol = header.indexOf('役職区分') + 1;
  if (!tCol || !lCol) return;
  var titles = sh.getRange(2, tCol, sh.getLastRow() - 1, 1).getValues();
  sh.getRange(2, lCol, titles.length, 1).setValues(titles.map(function (t) { return [String(t[0]).trim() ? classifyJobTitle(t[0]) : '']; }));
  if (silent !== true) SpreadsheetApp.getUi().alert('役職区分を付け直しました（' + titles.length + '行）。');
}

function checkData() {
  var model = buildModel(readTables_());
  var ui = SpreadsheetApp.getUi();
  var noConsent = model.contacts.filter(function (c) { return CONSENT_OK.indexOf(c.consent) < 0; }).length;
  var lines = model.problems.slice(0, 40).map(function (p) { return '・' + p.sheet + ' ' + p.line + '行目：' + p.text; });
  if (model.problems.length > 40) lines.push('…ほか ' + (model.problems.length - 40) + ' 件');
  ui.alert('名簿の点検',
    '連絡先 ' + model.contacts.length + '人／イベント ' + model.events.length + '件／配信停止 ' + Object.keys(model.suppressed).length + '人\n' +
    (noConsent ? '「送ってよい根拠」が名刺・同意以外（空欄を含む）で、配信の対象にならない人：' + noConsent + '人\n' : '') +
    '\n' + (lines.length ? '直した方がよいところ：\n' + lines.join('\n') : '問題は見つかりませんでした。'), ui.ButtonSet.OK);
}

function openSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('配信を作る');
  SpreadsheetApp.getUi().showSidebar(html);
}

// ───────── 配信パネル（Sidebar.html）から呼ぶ関数

function getChoices() {
  var model = buildModel(readTables_());
  return { choices: choicesOf(model), me: Session.getActiveUser().getEmail(), problems: model.problems.length };
}

function countRecipients(def) {
  var r = selectRecipients(buildModel(readTables_()), def);
  return { n: r.list.length, excluded: r.excluded, text: describe(def) };
}

function previewMail(def, subject, body) {
  var r = selectRecipients(buildModel(readTables_()), def);
  var sample = r.list[0] || { name: 'サンプル 太郎', org: '株式会社サンプル', department: '新規事業部', title: '部長' };
  var m = compose(subject, body, sample);
  return { subject: m.subject, html: m.html, to: sample.name };
}

// 今の「送信」シートの様子（作り直す前に知らせるため）
function sendSheetState_() {
  var sh = ss_().getSheetByName(SHEETS.send);
  if (!sh || sh.getLastRow() < 2) return { rows: 0, unsent: 0 };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, SEND_HEADERS.length).getValues();
  return { rows: v.length, unsent: v.filter(function (r) { return r[0] && String(r[3]).trim() !== '送信済み'; }).length };
}

function writeSendRows_(rows) {
  var sh = ensureSheet_(SHEETS.send, SEND_HEADERS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, SEND_HEADERS.length).setValues(rows);
}

// 自分あて1行だけの「送信」シートを作る（任意のテスト）
function writeTestSheet(def, subject, body, to, overwrite) {
  to = normEmail(to);
  if (!isEmail(to)) throw new Error('テストの送り先のメールアドレスを確認してください。');
  var lock = LockService.getDocumentLock(); lock.waitLock(20000);
  try {
    var st = sendSheetState_();
    if (st.unsent && !overwrite) return { needConfirm: st };
    var r = selectRecipients(buildModel(readTables_()), def);
    var m = compose(subject, body, r.list[0] || { name: 'サンプル 太郎' });
    writeSendRows_([[to, '[テスト] ' + m.subject, m.html, '', 'テスト']]);
    return { ok: true, n: 1 };
  } finally { lock.releaseLock(); }
}

// 本番の「送信」シートを作る。人数の確認が合わなければ作らない。配信履歴に残す
function writeSendSheet(def, name, subject, body, confirmCount, overwrite) {
  if (!String(name || '').trim() || !String(subject || '').trim() || !String(body || '').trim()) throw new Error('配信名・件名・本文を入れてください。');
  var lock = LockService.getDocumentLock(); lock.waitLock(20000);
  try {
    var r = selectRecipients(buildModel(readTables_()), def);
    if (Number(confirmCount) !== r.list.length) throw new Error('入力された人数（' + confirmCount + '）が実際の人数（' + r.list.length + '人）と違います。条件を確かめてください。');
    var st = sendSheetState_();
    if (st.unsent && !overwrite) return { needConfirm: st };
    var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmm');
    writeSendRows_(r.list.map(function (c, i) {
      var m = compose(subject, body, c);
      return [c.email, m.subject, m.html, '', stamp + '-' + (i + 1)];
    }));
    ensureSheet_(SHEETS.history, HISTORY_HEADERS).appendRow([new Date(), Session.getActiveUser().getEmail(), name, subject, r.list.length, describe(def), body]);
    return { ok: true, n: r.list.length };
  } finally { lock.releaseLock(); }
}
