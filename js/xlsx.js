/**
 * Minimal .xlsx reader and writer: just enough of Office Open XML for NEXUS templates and imports.
 * Uses the platform's CompressionStream/DecompressionStream and DOMParser, so there are no dependencies.
 */

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const MAX_VALIDATED_ROW = 10_000;

/* ───────────── zip ───────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, transform) {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(transform).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const canDeflate = () => typeof CompressionStream === 'function';

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export async function zip(files, { now = new Date() } = {}) {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    let method = 0;
    let body = raw;
    if (canDeflate() && raw.length > 64) {
      try {
        body = await pipe(raw, new CompressionStream('deflate-raw'));
        method = 8;
      } catch {
        body = raw;
      }
    }
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    locals.push(new Uint8Array(local.buffer), name, body);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, method, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, body.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export async function unzip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip file');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('damaged zip file');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    files.set(name.replace(/^\//, ''), { method, data: bytes.subarray(dataStart, dataStart + size) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return {
    has: (name) => files.has(name),
    async text(name) {
      const entry = files.get(name);
      if (!entry) return null;
      if (entry.method === 0) return decoder.decode(entry.data);
      if (entry.method !== 8) throw new Error('unsupported compression');
      return decoder.decode(await pipe(entry.data, new DecompressionStream('deflate-raw')));
    },
  };
}

/* ───────────── values ───────────── */

export function columnName(index) {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref.replace(/\d+$/, '')) n = n * 26 + (char.charCodeAt(0) - 64);
  return n - 1;
}

/** Local wall-clock time as an Excel serial number (what Excel shows is what the user typed). */
export function toSerial(date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
  return (utc - EXCEL_EPOCH) / DAY_MS;
}

export function fromSerial(serial) {
  const u = new Date(EXCEL_EPOCH + Math.round(serial * 86_400) * 1000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

function xml(value) {
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ───────────── writer ───────────── */

const STYLE = { header: 1, date: 2, datetime: 3, wrap: 4, title: 5, heading: 6, muted: 7, number: 8 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${MAIN_NS}">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF1E1B4B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="FF4F46E5"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cellXml(ref, value, kind, style) {
  if (value == null || value === '') return '';
  const s = style ? ` s="${style}"` : '';
  if (kind === 'date' || kind === 'datetime') {
    const date = asDate(value);
    if (date) return `<c r="${ref}" s="${kind === 'date' ? STYLE.date : STYLE.datetime}"><v>${toSerial(date)}</v></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"${s}><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function listFormula(list) {
  const joined = list.map((item) => String(item).replace(/"/g, '')).join(',');
  return joined.length <= 250 ? `"${xml(joined)}"` : null;
}

function validationXml(column, letter) {
  const sqref = `${letter}2:${letter}${MAX_VALIDATED_ROW}`;
  const prompt = column.prompt ? ` showInputMessage="1" promptTitle="${xml(column.header.slice(0, 32))}" prompt="${xml(column.prompt.slice(0, 250))}"` : '';
  if (column.list) {
    const formula = listFormula(column.list);
    if (formula) return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" errorTitle="Not in the list" error="Pick one of the listed values, or leave it blank."${prompt} sqref="${sqref}"><formula1>${formula}</formula1></dataValidation>`;
  }
  if (column.listRef) {
    return `<dataValidation type="list" allowBlank="1" showErrorMessage="0"${prompt} sqref="${sqref}"><formula1>${xml(column.listRef)}</formula1></dataValidation>`;
  }
  return prompt ? `<dataValidation allowBlank="1"${prompt} sqref="${sqref}"/>` : '';
}

function tableSheetXml(sheet, selected) {
  const columns = sheet.columns;
  const last = columnName(columns.length - 1);
  const header = `<row r="1" ht="24" customHeight="1">${columns.map((column, index) => cellXml(`${columnName(index)}1`, column.header, 'text', STYLE.header)).join('')}</row>`;
  const body = sheet.rows.map((row, r) => {
    const cells = columns.map((column, index) => {
      const style = column.kind === 'id' ? STYLE.muted : column.kind === 'number' ? STYLE.number : column.wrap ? STYLE.wrap : 0;
      return cellXml(`${columnName(index)}${r + 2}`, row[index], column.kind, style);
    }).join('');
    return `<row r="${r + 2}">${cells}</row>`;
  }).join('');
  const validations = columns.map((column, index) => validationXml(column, columnName(index))).filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">
<sheetPr><tabColor rgb="${sheet.tab || 'FF4F46E5'}"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${last}${sheet.rows.length + 1}"/>
<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width || 16}" customWidth="1"/>`).join('')}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${last}${sheet.rows.length + 1}"/>
${validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : ''}
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function notesSheetXml(sheet, selected) {
  const widths = sheet.widths || [28, 14, 90];
  const body = sheet.rows.map((row, r) => {
    const cells = (Array.isArray(row) ? row : [row]).map((cell, index) => {
      const value = cell && typeof cell === 'object' ? cell.v : cell;
      const style = cell && typeof cell === 'object' ? STYLE[cell.s] ?? 0 : STYLE.wrap;
      return cellXml(`${columnName(index)}${r + 1}`, value, 'text', style);
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">
<sheetPr><tabColor rgb="FF10B981"/><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"${selected ? ' tabSelected="1"' : ''}/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${body}</sheetData>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

/**
 * sheets: [{ name, columns: [{ header, kind, width, list, listRef, prompt, wrap }], rows: [[value, …]] }]
 * or a notes sheet: { name, notes: true, widths, rows: [[cell | { v, s: 'title' | 'heading' | 'muted' | 'header' }]] }
 */
export async function writeXlsx(sheets, { now = new Date() } = {}) {
  const names = sheets.map((sheet) => sheet.name);
  const definedNames = sheets.map((sheet, index) => (sheet.notes ? '' : `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">'${xml(sheet.name)}'!$A$1:$${columnName(sheet.columns.length - 1)}$${sheet.rows.length + 1}</definedName>`)).join('');
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>NEXUS data</dc:title><dc:creator>NEXUS</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now.toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: sheet.notes ? notesSheetXml(sheet, index === 0) : tableSheetXml(sheet, index === 0),
    })),
  ];
  return zip(files, { now });
}

/* ───────────── reader ───────────── */

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormat(code) {
  const stripped = String(code).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('damaged workbook');
  return doc;
}

const all = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));

function textOf(node) {
  return all(node, 't').map((t) => t.textContent).join('');
}

function resolveTarget(target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

/** Returns { sheets: [{ name, rows: [[string | number | boolean | Date | null]] }] }. */
export async function readXlsx(buffer) {
  let archive;
  try {
    archive = await unzip(buffer);
  } catch {
    throw new Error('This file is not an Excel workbook (.xlsx)');
  }
  const workbookXml = await archive.text('xl/workbook.xml');
  if (!workbookXml) throw new Error('This file is not an Excel workbook (.xlsx)');
  const workbook = parseXml(workbookXml);
  const relsXml = await archive.text('xl/_rels/workbook.xml.rels');
  const targets = new Map(relsXml ? all(parseXml(relsXml), 'Relationship').map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]) : []);

  const sharedXml = await archive.text('xl/sharedStrings.xml');
  const shared = sharedXml ? all(parseXml(sharedXml), 'si').map(textOf) : [];

  const dateStyles = new Set();
  const stylesXml = await archive.text('xl/styles.xml');
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map(all(styles, 'numFmt').map((fmt) => [Number(fmt.getAttribute('numFmtId')), fmt.getAttribute('formatCode')]));
    const cellXfs = all(styles, 'cellXfs')[0];
    if (cellXfs) {
      Array.from(cellXfs.children).forEach((xf, index) => {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)))) dateStyles.add(index);
      });
    }
  }

  const sheets = [];
  for (const sheet of all(workbook, 'sheet')) {
    const relId = sheet.getAttributeNS(REL_NS, 'id') || sheet.getAttribute('r:id');
    const target = targets.get(relId);
    const sheetXml = target ? await archive.text(resolveTarget(target)) : null;
    if (!sheetXml) continue;
    const rows = [];
    for (const row of all(parseXml(sheetXml), 'row')) {
      const r = Number(row.getAttribute('r')) || rows.length + 1;
      const values = [];
      let next = 0;
      for (const cell of Array.from(row.children).filter((child) => child.localName === 'c')) {
        const ref = cell.getAttribute('r');
        const index = ref ? columnIndex(ref) : next;
        next = index + 1;
        const type = cell.getAttribute('t') || 'n';
        const v = Array.from(cell.children).find((child) => child.localName === 'v')?.textContent ?? null;
        let value = null;
        if (type === 's') value = v == null ? null : shared[Number(v)] ?? null;
        else if (type === 'inlineStr') value = textOf(cell);
        else if (type === 'str') value = v;
        else if (type === 'b') value = v === '1';
        else if (type === 'e') value = null;
        else if (v != null && v !== '') {
          const number = Number(v);
          value = dateStyles.has(Number(cell.getAttribute('s') || 0)) ? fromSerial(number) : number;
        }
        values[index] = value;
      }
      for (let i = 0; i < values.length; i += 1) if (values[i] === undefined) values[i] = null;
      rows[r - 1] = values;
    }
    for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = [];
    sheets.push({ name: sheet.getAttribute('name'), rows });
  }
  return { sheets };
}
