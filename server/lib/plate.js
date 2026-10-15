// Vehicle numbers: "DL 1C-AB 1234", "dl1cab1234" and "DL1CAB1234 (1)" are all the same vehicle.

export function normPlate(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/\s*\(\d+\)\s*$/, '') // GPS portals add " (1)" to a second device
    .replace(/[^A-Z0-9]/g, '');
}

/** True for names that are only digits, such as GPS device IDs ("14936"). */
export const isNumberOnly = (s) => /^\d+$/.test(normPlate(s));

/** Phone numbers are kept as the last 10 digits. */
export function normPhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.length > 10 ? d.slice(-10) : d;
}

/** "  dzire " and "DZIRE" are the same model: tidy spaces, title case. */
export function tidyName(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => (/\d/.test(w) || w.length <= 3 && w === w.toUpperCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}
