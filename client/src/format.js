// Dates are shown as DD-MM-YYYY and money in ₹, on the India calendar.

export const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function dmy(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

export function dmyTime(iso) {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t)?.value;
  return `${g('day')}-${g('month')}-${g('year')} ${g('hour')}:${g('minute')}`;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export const nf = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const inr = (n, d = 0) => (n == null ? '—' : '₹' + nf(n, d));

export const FUEL_LABEL = { PETROL: 'Petrol', DIESEL: 'Diesel', CNG_PETROL: 'CNG/Petrol', CNG: 'CNG', ELECTRIC: 'Electric' };
export const OWNERSHIP_LABEL = { COMPANY: 'Company', VENDOR: 'Vendor', OFFICER: 'Officer', PERSONAL: 'Personal' };
export const STATUS_LABEL = { ACTIVE: 'Active', WORKSHOP: 'Workshop', IDLE: 'Idle', SOLD: 'Sold' };
export const ROLE_LABEL = { ADMIN: 'Admin', KM_USER: 'KM user', FUEL_USER: 'Fuel user', DOCS_USER: 'Documents user', VIEWER: 'Viewer' };

/** "DL1CAB1234" → "DL 1C AB 1234" for display. */
export function showPlate(n) {
  const m = String(n || '').match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{3,4})$/);
  if (m) return [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ');
  const b = String(n || '').match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  return b ? `${b[1]} ${b[2]} ${b[3]} ${b[4]}` : n;
}

/** What a role may do; mirrors the server's rules. */
export function can(user, what) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const rules = { km: ['KM_USER'], fuel: ['FUEL_USER'], reports: ['KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER'], vehicles: ['KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER'] };
  return (rules[what] || []).includes(user.role);
}
