// 役職（自由記述）から役職区分を自動で決める。役職そのものは書かれたとおりに残す。
// 上から順に調べ、最初に当てはまった区分にする（例：「取締役部長」は経営層、「アシスタントマネージャー」は一般・担当）。
// 区分を変えたいときは、この表の語を足し引きするだけでよい。保存のたびと起動のたびに付け直す。
export const JOB_LEVEL_RULES = [
  ['未記入', /^(なし|無し|-|－|ー|特になし)?$/],
  ['学生', /学生|院生|履修生|単科生|研究生|聴講生/],
  ['教員・研究者', /教授|講師|助教|研究員|教員|教諭|ポスドク|フェロー/],
  ['経営層', /代表|社長|取締役|役員|会長|理事|頭取|学長|CEO|COO|CFO|CTO|オーナー|経営者/i],
  ['一般・担当', /アシスタント|見習|補助/],
  ['部長級', /部長|局長|支店長|支社長|所長|室長|センター長|工場長|次長|ゼネラルマネージャ|ディレクター|本部長/],
  ['課長級', /課長|マネージャ|リーダー|主幹|グループ長|チーム長|班長/],
  ['一般・担当', /主任|主査|係長|担当|社員|一般|職員|スタッフ|記者|推進役|コンサルタント|エンジニア|デザイナー|研究者|専門職/],
];

export const JOB_LEVELS = ['経営層', '部長級', '課長級', '一般・担当', '教員・研究者', '学生', 'その他', '未記入'];

export function classifyJobTitle(title) {
  const t = String(title ?? '').normalize('NFKC').trim();
  for (const [level, re] of JOB_LEVEL_RULES) if (re.test(t)) return level;
  return 'その他';   // どの語にも当てはまらない役職。一覧で目に付くようにして、必要なら表に語を足す
}

// 表を変えたときに、登録済みの全員の区分を付け直す
export async function reclassifyAll(q) {
  const rows = await q(`select id, job_title, job_level from contacts`);
  for (const r of rows) {
    const level = classifyJobTitle(r.job_title);
    if (level !== r.job_level) await q(`update contacts set job_level = $2 where id = $1`, [r.id, level]);
  }
}
