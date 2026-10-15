// Calendar dates are handled as "YYYY-MM-DD" text. The business day follows Asia/Kolkata.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && validYmd(s);

function validYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n) => String(n).padStart(2, '0');
const ymdUtc = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

/** Today's date in India. */
export function todayIST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return ymdUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Number of days from a to b, both included. */
export function daySpan(a, b) {
  return Math.round((toDb(b) - toDb(a)) / 86400000) + 1;
}

export function* eachDay(from, to) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export const monthStart = (s) => s.slice(0, 7) + '-01';
export function monthEnd(s) {
  const [y, m] = s.split('-').map(Number);
  return ymdUtc(new Date(Date.UTC(y, m, 0)));
}

/** "YYYY-MM-DD" → Date for a Prisma @db.Date column. */
export const toDb = (s) => new Date(s + 'T00:00:00Z');
/** Date from a Prisma @db.Date column → "YYYY-MM-DD". */
export const fromDb = (d) => (d ? d.toISOString().slice(0, 10) : null);

export function dmy(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

function build(y, m, d) {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100) return null;
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return isYmd(s) ? s : null;
}

/**
 * Reads a date from an Excel or CSV cell. Text dates are read day first (DD-MM-YYYY), as in India.
 * Returns "YYYY-MM-DD" or null.
 */
export function parseDateCell(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    return build(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (v < 30000 || v > 80000) return null; // Excel serial day numbers for 1982–2119
    return ymdUtc(new Date(Math.round((Math.floor(v) - 25569) * 86400000)));
  }
  const s = String(v).trim();
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return build(+m[3], +m[2], +m[1]);
  m = s.match(/(\d{1,2})[\s-]*([A-Za-z]{3,9})[\s,-]*(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[1]);
  }
  return null;
}

/** All dates written in a line of text, e.g. a report title "Distance report 12-10-2026 to 13-10-2026". */
export function datesInText(s) {
  const out = [];
  const re = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})|(\d{1,2}[\s-]*[A-Za-z]{3,9}[\s,-]*\d{4})/g;
  for (const m of String(s).matchAll(re)) {
    const d = parseDateCell(m[0]);
    if (d) out.push(d);
  }
  return out;
}
