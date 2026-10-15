// Vehicle Master import: map the Excel columns, preview every row, then save.
import { readWorkbook, biggestSheet, findHeaderRow, cellText, guessColumn } from '../lib/excel.js';
import { normPlate, normPhone, tidyName } from '../lib/plate.js';
import { todayIST } from '../lib/dates.js';
import { logActivity } from '../lib/audit.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { setStatus, setDriver, loadTimelines, current } from './timeline.js';
import { bad } from '../lib/http.js';

export const MASTER_FIELDS = [
  { key: 'number', label: 'Vehicle No.', required: true },
  { key: 'make', label: 'Make / Model', required: true },
  { key: 'fuelType', label: 'Fuel Type', required: true },
  { key: 'modelYear', label: 'Model Year' },
  { key: 'vendorDriver', label: 'Vendor / Driver', required: true },
  { key: 'holderName', label: 'Driver or vendor name' },
  { key: 'holderContact', label: 'Driver or vendor contact' },
  { key: 'department', label: 'Department / Client' },
  { key: 'category', label: 'Category (Commercial / Private)' },
];

const KEYWORDS = /register|reg|vehicle|fuel|type|model|vendor|driver|name|contact|phone|department|category|s\.?\s*no/i;

const GUESS = [
  ['number', [/register\s*no|reg(istration)?\.?\s*no|vehicle\s*(no|number)|registration/i]],
  ['fuelType', [/fuel/i]],
  ['holderContact', [/contact|phone|mobile/i]],
  ['holderName', [/name/i]],
  ['vendorDriver', [/vendor|driver/i]],
  ['make', [/vehicle\s*type|make|^type$/i]],
  ['modelYear', [/vehicle\s*model|model\s*year|^model$|year/i]],
  ['department', [/department|dept|client/i]],
  ['category', [/category|commercial|private/i]],
];

export function guessMapping(headers) {
  const map = {};
  const taken = [];
  for (const [key, patterns] of GUESS) {
    const j = guessColumn(headers, patterns, taken);
    map[key] = j;
    if (j >= 0) taken.push(j);
  }
  return map;
}

const FUEL = [
  [/^(hybrid\s*)?petrol$/i, 'PETROL'],
  [/^diesel$/i, 'DIESEL'],
  [/^(cng\s*[/+&-]?\s*petrol|petrol\s*[/+&-]?\s*cng)$/i, 'CNG_PETROL'],
  [/^cng$/i, 'CNG'],
  [/^(electric|ev|e\.v\.)$/i, 'ELECTRIC'],
];
export function normFuel(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  for (const [re, v] of FUEL) if (re.test(s)) return v;
  return null;
}

/** The "Vendor / Driver" column decides ownership, status and place. */
export function readVendorDriver(raw) {
  const s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (s === 'DRIVER') return { ownership: 'COMPANY', status: 'ACTIVE', driver: true, govt: false };
  if (s === 'GOVT DRIVER' || s === 'GOVT. DRIVER' || s === 'GOVERNMENT DRIVER') return { ownership: 'COMPANY', status: 'ACTIVE', driver: true, govt: true };
  if (s === 'FREE LR') return { ownership: 'COMPANY', status: 'IDLE', place: 'Lodhi Road' };
  if (s === 'FREE JN') return { ownership: 'COMPANY', status: 'IDLE', place: 'Jangpura' };
  if (s === 'ACCIDENTAL') return { ownership: 'COMPANY', status: 'WORKSHOP', place: 'Accidental' };
  if (s === 'ARUN-CNG' || s === 'ARUN CNG') return { ownership: 'COMPANY', status: 'WORKSHOP', place: 'Arun-CNG' };
  const ws = s.match(/^WORKSHOP\s*-?\s*(.*)$/);
  if (ws) return { ownership: 'COMPANY', status: 'WORKSHOP', place: ws[1] ? `Workshop ${ws[1]}` : 'Workshop' };
  if (s === 'VENDOR') return { ownership: 'VENDOR', status: 'ACTIVE', holder: true };
  if (s === 'OFFICER') return { ownership: 'OFFICER', status: 'ACTIVE', holder: true };
  if (s === 'PERSONAL') return { ownership: 'PERSONAL', status: 'ACTIVE', holder: true };
  if (s === 'SOLD') return { ownership: 'COMPANY', status: 'SOLD' };
  return null;
}

function readCategory(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('comm')) return 'COMMERCIAL';
  if (s.startsWith('priv')) return 'PRIVATE';
  return 'BAD';
}

/** Reads the file and guesses the mapping. A saved mapping is reused when its columns are all present. */
export async function openMasterFile(buffer, fileName, mapping) {
  const sheet = biggestSheet(readWorkbook(buffer, fileName));
  const hr = findHeaderRow(sheet.rows, KEYWORDS);
  const headers = (sheet.rows[hr] || []).map(cellText);
  let map = mapping;
  if (!map) {
    const saved = await getSetting('masterMapping');
    if (saved && Object.values(saved).every((name) => !name || headers.includes(name))) {
      map = Object.fromEntries(Object.entries(saved).map(([k, name]) => [k, name ? headers.indexOf(name) : -1]));
    } else map = guessMapping(headers);
  }
  return { sheet, headerRow: hr, headers, mapping: map };
}

/** Turns the mapped rows into checked vehicle rows, compared with what is already saved. */
export async function previewMaster(db, { sheet, headerRow, headers, mapping }) {
  for (const f of MASTER_FIELDS) {
    if (f.required && !(mapping[f.key] >= 0)) throw bad(`Choose the column for "${f.label}".`);
  }
  const cell = (r, key) => (mapping[key] >= 0 ? r[mapping[key]] : '');
  const thisYear = Number(todayIST().slice(0, 4));
  const rows = [];
  const seen = new Map();
  const phoneNames = new Map();

  sheet.rows.slice(headerRow + 1).forEach((r, i) => {
    if (!r.some((c) => c !== '' && c != null)) return;
    const line = headerRow + i + 2;
    const errors = [];
    const warnings = [];
    const rawNo = cellText(cell(r, 'number'));
    const number = normPlate(rawNo);
    if (!number) return; // blank or footer line
    if (!/^[A-Z0-9]{6,12}$/.test(number) || !/[A-Z]/.test(number)) errors.push(`"${rawNo}" is not a vehicle number`);
    if (seen.has(number)) errors.push(`Same vehicle number as line ${seen.get(number)}`);
    else seen.set(number, line);

    const make = tidyName(cell(r, 'make'));
    if (!make) errors.push('Make / Model is empty');
    const fuelType = normFuel(cell(r, 'fuelType'));
    if (!fuelType) errors.push(`Unknown fuel type "${cellText(cell(r, 'fuelType'))}"`);

    let modelYear = null;
    const yRaw = cellText(cell(r, 'modelYear'));
    if (yRaw) {
      const y = Number(yRaw.match(/\d{4}/)?.[0]);
      if (y >= 2000 && y <= thisYear + 1) {
        modelYear = y;
        if (y < 2019) warnings.push(`Model year ${y} is older than 2019`);
      } else warnings.push(`Model year "${yRaw}" was not understood`);
    }

    const vdRaw = cellText(cell(r, 'vendorDriver'));
    const vd = readVendorDriver(vdRaw);
    if (!vd) errors.push(`Unknown Vendor / Driver value "${vdRaw}"`);
    const name = tidyName(cell(r, 'holderName'));
    const phone = normPhone(cell(r, 'holderContact'));
    let driver = null;
    let vendor = null;
    if (vd?.driver) {
      if (!name) warnings.push('Driver name is empty, so no driver is assigned');
      else {
        if (!phone) warnings.push('Driver phone is empty');
        driver = { name, phone, govt: vd.govt };
        if (phone) {
          const other = phoneNames.get(phone);
          if (other && other.name.toLowerCase() !== name.toLowerCase()) {
            warnings.push(`Phone ${phone} is also used by ${other.name} (line ${other.line})`);
          } else if (!other) phoneNames.set(phone, { name, line });
        }
      }
    }
    if (vd?.holder) {
      if (name) vendor = { name, contact: phone };
      else warnings.push('Vendor / holder name is empty');
    }

    const cat = readCategory(cell(r, 'category'));
    if (cat === 'BAD') warnings.push(`Category "${cellText(cell(r, 'category'))}" should be Commercial or Private`);
    else if (!cat) warnings.push('Category is empty');

    rows.push({
      line,
      number,
      make,
      fuelType,
      modelYear,
      ownership: vd?.ownership,
      status: vd?.status,
      place: vd?.place || null,
      driver,
      vendor,
      department: cellText(cell(r, 'department')) || null,
      category: cat === 'BAD' ? null : cat,
      errors,
      warnings,
    });
  });

  // Compare with saved vehicles and drivers.
  const existing = await db.vehicle.findMany({ where: { number: { in: rows.map((r) => r.number) } }, include: { vendor: true } });
  const byNo = new Map(existing.map((v) => [v.number, v]));
  const tl = await loadTimelines(db, existing.map((v) => v.id));
  const phones = rows.map((r) => r.driver?.phone).filter(Boolean);
  const drivers = await db.driver.findMany({ where: { phone: { in: phones } } });
  const driverByPhone = new Map(drivers.map((d) => [d.phone, d]));

  for (const r of rows) {
    const known = r.driver?.phone && driverByPhone.get(r.driver.phone);
    if (known && known.name.toLowerCase() !== r.driver.name.toLowerCase()) {
      r.warnings.push(`Phone ${r.driver.phone} is saved for ${known.name}. The saved name is kept; the Admin can fix it.`);
    }
    const v = byNo.get(r.number);
    if (!v) {
      r.change = 'new';
      continue;
    }
    const t = tl.get(v.id) || { statuses: [], drivers: [] };
    const st = current(t.statuses);
    const dr = current(t.drivers);
    const diffs = [];
    if (v.make !== r.make) diffs.push('Make');
    if (v.fuelType !== r.fuelType) diffs.push('Fuel');
    if ((v.modelYear || null) !== r.modelYear) diffs.push('Year');
    if (v.ownership !== r.ownership) diffs.push('Ownership');
    if ((v.department || null) !== r.department) diffs.push('Department');
    if ((v.category || null) !== r.category) diffs.push('Category');
    if (st?.status !== r.status || (st?.place || null) !== r.place) diffs.push('Status');
    if ((dr?.phone || dr?.name || null) !== (r.driver ? r.driver.phone || r.driver.name : null) || (r.driver && dr?.govt !== r.driver.govt)) diffs.push('Driver');
    if ((v.vendor?.name || null) !== (r.vendor?.name || null) || (v.vendor?.contact || null) !== (r.vendor?.contact || null)) diffs.push('Vendor');
    r.change = diffs.length ? 'changed' : 'same';
    r.diffs = diffs;
  }

  const inFile = new Set(rows.map((r) => r.number));
  const notInFile = (await db.vehicle.findMany({ select: { number: true } })).map((v) => v.number).filter((n) => !inFile.has(n));

  return {
    headers,
    mapping,
    rows,
    counts: {
      total: rows.length,
      errors: rows.filter((r) => r.errors.length).length,
      warnings: rows.filter((r) => r.warnings.length).length,
      new: rows.filter((r) => !r.errors.length && r.change === 'new').length,
      changed: rows.filter((r) => !r.errors.length && r.change === 'changed').length,
      same: rows.filter((r) => !r.errors.length && r.change === 'same').length,
    },
    notInFile,
  };
}

async function findOrCreateDriver(tx, d) {
  if (d.phone) {
    const found = await tx.driver.findUnique({ where: { phone: d.phone } });
    return found || tx.driver.create({ data: { name: d.name, phone: d.phone } });
  }
  const found = await tx.driver.findFirst({ where: { phone: null, name: { equals: d.name, mode: 'insensitive' } } });
  return found || tx.driver.create({ data: { name: d.name } });
}

async function findOrCreateVendor(tx, v) {
  const found = await tx.vendor.findFirst({ where: { name: { equals: v.name, mode: 'insensitive' }, contact: v.contact } });
  return found || tx.vendor.create({ data: { name: v.name, contact: v.contact } });
}

/** Saves every row without errors. Changes of status and driver start on `effectiveDate`. */
export async function commitMaster(db, req, preview, effectiveDate, fileName) {
  const ok = preview.rows.filter((r) => !r.errors.length && r.change !== 'same');
  const result = { created: 0, updated: 0, unchanged: preview.counts.same, skipped: preview.counts.errors };
  await db.$transaction(
    async (tx) => {
      for (const r of ok) {
        const vendorId = r.vendor ? (await findOrCreateVendor(tx, r.vendor)).id : null;
        const data = {
          make: r.make,
          fuelType: r.fuelType,
          modelYear: r.modelYear,
          ownership: r.ownership,
          department: r.department,
          category: r.category,
          vendorId,
        };
        const before = await tx.vehicle.findUnique({ where: { number: r.number } });
        const v = before ? await tx.vehicle.update({ where: { id: before.id }, data }) : await tx.vehicle.create({ data: { number: r.number, ...data } });
        await setStatus(tx, v.id, r.status, r.place, effectiveDate);
        const driver = r.driver ? await findOrCreateDriver(tx, r.driver) : null;
        await setDriver(tx, v.id, driver?.id ?? null, r.driver?.govt, effectiveDate);
        await logActivity(
          req,
          {
            action: before ? 'VEHICLE_UPDATE' : 'VEHICLE_CREATE',
            entity: 'vehicle',
            entityId: v.id,
            oldValue: before,
            newValue: { ...data, number: r.number, status: r.status, place: r.place, driver: r.driver, from: effectiveDate, source: 'Vehicle Master' },
          },
          tx,
        );
        if (before) result.updated++;
        else result.created++;
      }
      await logActivity(req, { action: 'MASTER_IMPORT', entity: 'vehicle_master', newValue: { fileName, effectiveDate, ...result } }, tx);
    },
    { timeout: 120000, maxWait: 10000 },
  );
  // Remember the mapping by column name for next time.
  await setSetting('masterMapping', Object.fromEntries(Object.entries(preview.mapping).map(([k, j]) => [k, j >= 0 ? preview.headers[j] : null])));
  return result;
}
