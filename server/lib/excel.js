import * as XLSX from 'xlsx';

/** Reads every sheet of an .xlsx, .xls or .csv file into rows of cells. */
export function readWorkbook(buffer, fileName = '') {
  const csv = /\.csv$/i.test(fileName);
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: csv, dense: true });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true }),
  }));
}

/** The sheet with the most filled rows. */
export function biggestSheet(sheets) {
  let best = sheets[0];
  for (const s of sheets) if (filled(s.rows) > filled(best.rows)) best = s;
  return best;
}
const filled = (rows) => rows.filter((r) => r.some((c) => c !== '' && c != null)).length;

/**
 * Finds the header line: among the first 25 rows, the one with the most text cells
 * that look like column names.
 */
export function findHeaderRow(rows, keywords) {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = rows[i] || [];
    let texts = 0;
    let hits = 0;
    let cells = 0;
    for (const c of r) {
      if (c === '' || c == null) continue;
      cells++;
      if (typeof c === 'string' && isNaN(Number(c))) {
        texts++;
        if (keywords.test(c)) hits++;
      }
    }
    if (cells < 2) continue;
    const score = texts + hits * 3;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export const cellText = (v) => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v).trim());

/** Reads a number from a cell: "1,234.5 km" → 1234.5. Times such as "02:15" are not numbers. */
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!s || /\d:\d/.test(s)) return null;
  const m = s.match(/^-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Picks the column whose header best matches the patterns, returns its index or -1. */
export function guessColumn(headers, patterns, taken = []) {
  for (const re of patterns) {
    const j = headers.findIndex((h, i) => !taken.includes(i) && re.test(String(h ?? '').trim()));
    if (j >= 0) return j;
  }
  return -1;
}
