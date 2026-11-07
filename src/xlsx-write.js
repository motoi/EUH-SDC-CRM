// 1枚のシートに「テーブル」を1つ置いた .xlsx を作る小さな書き出し器。Node とブラウザ（確認用サイト）の両方で動く。
// Power Automate の Excel コネクタはテーブル単位でしか行を読めないので、テーブルの定義（xl/tables/table1.xml）を必ず付ける。
// 圧縮はしない（zip の「無圧縮」で格納）。2,000行でも数MBなので十分。

const enc = new TextEncoder();

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = enc.encode(text), nm = enc.encode(name), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);   // 0x0800：名前は UTF-8
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nm.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, nm.length, true); cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nm, data);
    central.push(new Uint8Array(cd.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// XML に入れられない制御文字は消す（改行とタブは残す）
const esc = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

// headers：列名の配列。rows：値の配列の配列。widths：列幅（文字数）
export function writeXlsx({ sheet = 'Sheet1', table = 'Table1', headers, rows, widths = [] }) {
  const last = `${col(headers.length - 1)}${rows.length + 1}`;
  const ref = `A1:${last}`;
  const cell = (v, r, c) => `<c r="${col(c)}${r}" t="inlineStr"${r > 1 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const sheetRows = [headers, ...rows].map((r, i) => `<row r="${i + 1}">${headers.map((_, c) => cell(r[c], i + 1, c)).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const nsR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    ['[Content_Types].xml', `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.worksheet+xml"/>
<Override PartName="/xl/tables/table1.xml" ContentType="${ct}.table+xml"/>
<Override PartName="/xl/styles.xml" ContentType="${ct}.styles+xml"/></Types>`],
    ['_rels/.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${head}<workbook ${ns} ${nsR}><sheets><sheet name="${esc(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `${head}<worksheet ${ns} ${nsR}><dimension ref="${ref}"/>${cols}<sheetData>${sheetRows}</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`],
    ['xl/worksheets/_rels/sheet1.xml.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/table" Target="../tables/table1.xml"/></Relationships>`],
    ['xl/tables/table1.xml', `${head}<table ${ns} id="1" name="${esc(table)}" displayName="${esc(table)}" ref="${ref}"><autoFilter ref="${ref}"/><tableColumns count="${headers.length}">${headers.map((h, i) => `<tableColumn id="${i + 1}" name="${esc(h)}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`],
    // 書式は2つだけ：0＝標準、1＝折り返して上揃え（本文を読みやすくする）
    ['xl/styles.xml', `${head}<styleSheet ${ns}><fonts count="1"><font><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
  ]);
}
