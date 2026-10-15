// Mileage (average) by vehicle, by driver and for Vendor / Others.
//
// Every fuel entry is spread over the Active days of its From–To range in proportion to the KM run
// on each day (evenly when no KM was recorded). KM and fuel are then added up for the period.
import { eachDay, toDb, fromDb } from '../lib/dates.js';
import { num } from '../lib/db.js';
import { getSettings } from '../lib/settings.js';
import { loadTimelines, fuelEligible, driverOn, statusOn } from './timeline.js';

export const UNIT = { PETROL: 'km/L', DIESEL: 'km/L', CNG: 'km/kg', CNG_PETROL: 'km/(kg+L)', ELECTRIC: '₹/km' };

/** The quantity an average is based on. Electric has none: it is compared on ₹ per km. */
export function fuelQty(fuelType, f) {
  switch (fuelType) {
    case 'PETROL': return f.petrol;
    case 'DIESEL': return f.diesel;
    case 'CNG': return f.cng;
    case 'CNG_PETROL': return f.cng + f.petrol;
    default: return null;
  }
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/**
 * KM and fuel per vehicle per day for [from, to].
 * Returns the vehicles, their timelines and a Map "vehicleId|date" → day row.
 */
export async function buildDays(db, from, to) {
  const vehicles = await db.vehicle.findMany({ include: { vendor: true }, orderBy: { number: 'asc' } });
  const tl = await loadTimelines(db);
  const entries = await db.fuelEntry.findMany({ where: { fromDate: { lte: toDb(to) }, toDate: { gte: toDb(from) } } });

  let kmFrom = from;
  let kmTo = to;
  for (const e of entries) {
    if (fromDb(e.fromDate) < kmFrom) kmFrom = fromDb(e.fromDate);
    if (fromDb(e.toDate) > kmTo) kmTo = fromDb(e.toDate);
  }
  const kmRows = await db.dailyKm.findMany({ where: { date: { gte: toDb(kmFrom), lte: toDb(kmTo) } }, select: { vehicleId: true, date: true, km: true } });
  const km = new Map(kmRows.map((r) => [`${r.vehicleId}|${fromDb(r.date)}`, num(r.km)]));
  const byId = new Map(vehicles.map((v) => [v.id, v]));

  const days = new Map();
  const row = (v, d) => {
    const k = `${v.id}|${d}`;
    let r = days.get(k);
    if (!r) {
      const t = tl.get(v.id);
      r = { vehicleId: v.id, date: d, km: km.get(k) || 0, eligible: fuelEligible(v, t, d), driver: driverOn(t, d), petrol: 0, diesel: 0, cng: 0, amount: 0, multiDay: false, fills: 0 };
      days.set(k, r);
    }
    return r;
  };
  for (const [k] of km) {
    const [id, d] = k.split('|');
    if (d >= from && d <= to && byId.has(+id)) row(byId.get(+id), d);
  }

  for (const e of entries) {
    const v = byId.get(e.vehicleId);
    if (!v) continue;
    const t = tl.get(v.id);
    const all = [...eachDay(fromDb(e.fromDate), fromDb(e.toDate))];
    let spread = all.filter((d) => fuelEligible(v, t, d));
    if (!spread.length) spread = all; // the status changed after the entry was made; keep the fuel
    const weights = spread.map((d) => km.get(`${v.id}|${d}`) || 0);
    let total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      weights.fill(1);
      total = spread.length;
    }
    const multi = all.length > 1;
    spread.forEach((d, i) => {
      if (d < from || d > to) return;
      const f = weights[i] / total;
      const r = row(v, d);
      r.petrol += (num(e.petrolL) || 0) * f;
      r.diesel += (num(e.dieselL) || 0) * f;
      r.cng += (num(e.cngKg) || 0) * f;
      r.amount += num(e.amount) * f;
      r.fills += f;
      if (multi) r.multiDay = true;
    });
  }
  return { vehicles, tl, days };
}

function statusLabel(s) {
  return {
    OK: 'OK',
    ATTENTION: 'Needs Attention',
    NOT_ENOUGH: 'Not enough data to compare',
    NO_FUEL: 'No fuel entry',
    NO_KM: 'No KM',
    MULTI_DAY: 'Fill covers several days',
  }[s];
}

/** Compares each value with the median of its group (same model + fuel type). */
function applyBenchmarks(rows, settings) {
  const groups = new Map();
  for (const r of rows) {
    if (r.value == null) continue;
    const k = `${r.make.toLowerCase()}|${r.fuelType}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(r.value);
  }
  const t = settings.attentionPercent / 100;
  for (const r of rows) {
    if (r.status) continue;
    const vals = groups.get(`${r.make.toLowerCase()}|${r.fuelType}`) || [];
    r.comparable = vals.length;
    if (vals.length < settings.minComparable) {
      r.status = 'NOT_ENOUGH';
      continue;
    }
    const b = median(vals);
    r.benchmark = round(b);
    // For km per L/kg lower is worse; for Electric ₹ per km higher is worse.
    const worse = r.fuelType === 'ELECTRIC' ? (r.value - b) / b : (b - r.value) / b;
    r.worseByPercent = round(worse * 100, 1);
    r.status = worse > t ? 'ATTENTION' : 'OK';
  }
  for (const r of rows) r.statusLabel = statusLabel(r.status);
}

function finish(r, fuelType) {
  r.km = round(r.km);
  r.amount = round(r.amount);
  r.petrol = round(r.petrol);
  r.diesel = round(r.diesel);
  r.cng = round(r.cng);
  r.qty = round(fuelQty(fuelType, r));
  r.costPerKm = r.km > 0 && r.amount > 0 ? round(r.amount / r.km) : null;
  r.unit = UNIT[fuelType];
  if (fuelType === 'ELECTRIC') r.value = r.costPerKm;
  else r.value = r.km > 0 && r.qty > 0 ? round(r.km / r.qty) : null;
  r.average = r.value;
}

/**
 * The mileage report for Company vehicles, plus Vendor / Others KM.
 * mode "daily" shows an average only for single-day fuel entries.
 */
export async function mileageReport(db, from, to, { mode = 'custom' } = {}) {
  const settings = await getSettings(db);
  const { vehicles, tl, days } = await buildDays(db, from, to);
  const perVehicle = new Map();
  for (const r of days.values()) (perVehicle.get(r.vehicleId) || perVehicle.set(r.vehicleId, []).get(r.vehicleId)).push(r);

  const rows = [];
  const others = [];
  for (const v of vehicles) {
    const t = tl.get(v.id);
    const list = perVehicle.get(v.id) || [];
    if (v.ownership !== 'COMPANY') {
      const kmTotal = list.reduce((a, r) => a + r.km, 0);
      if (kmTotal <= 0 && statusOn(t, to)?.status === 'SOLD') continue;
      others.push({
        vehicleId: v.id,
        number: v.number,
        make: v.make,
        ownership: v.ownership,
        holder: v.vendor?.name || null,
        holderContact: v.vendor?.contact || null,
        department: v.department,
        km: round(kmTotal),
        daysWithKm: list.filter((r) => r.km > 0).length,
      });
      continue;
    }
    const activeDays = [...eachDay(from, to)].filter((d) => fuelEligible(v, t, d)).length;
    const elig = list.filter((r) => r.eligible || r.fills > 0);
    const r = { vehicleId: v.id, number: v.number, make: v.make, fuelType: v.fuelType, department: v.department, activeDays, km: 0, petrol: 0, diesel: 0, cng: 0, amount: 0, fills: 0, multiDay: false };
    for (const d of elig) {
      if (d.eligible) r.km += d.km;
      r.petrol += d.petrol;
      r.diesel += d.diesel;
      r.cng += d.cng;
      r.amount += d.amount;
      r.fills += d.fills;
      r.multiDay ||= d.multiDay;
    }
    if (!activeDays && r.km <= 0 && r.fills <= 0) continue;
    const names = [...new Set(elig.filter((d) => d.eligible && d.driver).map((d) => d.driver.name))];
    r.drivers = names.length ? names : [driverOn(t, to)?.name].filter(Boolean);
    finish(r, v.fuelType);
    const hasFuel = r.fills > 0;
    if (r.km <= 0) r.status = 'NO_KM';
    else if (!hasFuel) r.status = 'NO_FUEL';
    else if (mode === 'daily' && r.multiDay) r.status = 'MULTI_DAY';
    if (r.status) r.value = null;
    r.average = r.value;
    rows.push(r);
  }
  applyBenchmarks(rows, settings);

  const kmAll = rows.reduce((a, r) => a + (r.km || 0), 0);
  const amountAll = rows.reduce((a, r) => a + (r.amount || 0), 0);
  return {
    from,
    to,
    mode,
    settings,
    totals: {
      vehicles: rows.length,
      km: round(kmAll),
      amount: round(amountAll),
      costPerKm: kmAll > 0 && amountAll > 0 ? round(amountAll / kmAll) : null,
      attention: rows.filter((r) => r.status === 'ATTENTION').length,
      noFuel: rows.filter((r) => r.status === 'NO_FUEL').length,
      noKm: rows.filter((r) => r.status === 'NO_KM').length,
    },
    rows,
    others,
  };
}

/** KM and fuel by driver, from the days each driver had each vehicle. */
export async function driverReport(db, from, to) {
  const settings = await getSettings(db);
  const { vehicles, days } = await buildDays(db, from, to);
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const pairs = new Map();
  for (const d of days.values()) {
    const v = byId.get(d.vehicleId);
    if (v.ownership !== 'COMPANY' || (!d.eligible && !d.fills)) continue;
    const key = `${d.driver?.driverId || 0}|${v.id}`;
    let p = pairs.get(key);
    if (!p) {
      p = { driverId: d.driver?.driverId || null, driver: d.driver?.name || 'No driver', phone: d.driver?.phone || null, govt: !!d.driver?.govt, vehicleId: v.id, number: v.number, make: v.make, fuelType: v.fuelType, km: 0, petrol: 0, diesel: 0, cng: 0, amount: 0, fills: 0, days: 0 };
      pairs.set(key, p);
    }
    if (d.eligible) {
      p.km += d.km;
      if (d.km > 0) p.days++;
    }
    p.petrol += d.petrol;
    p.diesel += d.diesel;
    p.cng += d.cng;
    p.amount += d.amount;
    p.fills += d.fills;
  }
  const rows = [...pairs.values()];
  for (const r of rows) {
    finish(r, r.fuelType);
    if (r.km <= 0) r.status = 'NO_KM';
    else if (r.fills <= 0) r.status = 'NO_FUEL';
    if (r.status) r.value = null;
    r.average = r.value;
  }
  applyBenchmarks(rows, settings);
  rows.sort((a, b) => a.driver.localeCompare(b.driver) || a.number.localeCompare(b.number));
  return { from, to, rows };
}

/** Days in the range with no GPS KM saved at all. */
export async function missingGpsDays(db, from, to) {
  const rows = await db.dailyKm.groupBy({ by: ['date'], where: { date: { gte: toDb(from), lte: toDb(to) } } });
  const have = new Set(rows.map((r) => fromDb(r.date)));
  return [...eachDay(from, to)].filter((d) => !have.has(d));
}

