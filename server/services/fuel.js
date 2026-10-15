// Fuel entry: one form for a From–To range, one row per eligible Company vehicle.
import { z } from 'zod';
import { eachDay, toDb, fromDb, daySpan, isYmd } from '../lib/dates.js';
import { bad } from '../lib/http.js';
import { num } from '../lib/db.js';
import { loadTimelines, fuelEligible, driverOn } from './timeline.js';

export const MAX_FUEL_DAYS = 62;

/** Which quantities each fuel type uses. Electric vehicles get the amount only. */
export const FUEL_FIELDS = {
  PETROL: ['petrolL'],
  DIESEL: ['dieselL'],
  CNG_PETROL: ['cngKg', 'petrolL'],
  CNG: ['cngKg'],
  ELECTRIC: [],
};

const qty = z.union([z.number(), z.string(), z.null()]).optional().transform((v, ctx) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    ctx.addIssue({ code: 'custom', message: 'must be a number' });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});
const text = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const fuelRowSchema = z.object({
  vehicleId: z.number().int().positive(),
  petrolL: qty,
  dieselL: qty,
  cngKg: qty,
  amount: qty,
  billNo: text(60),
  station: text(60),
  remarks: text(300),
});

export function checkFuelRange(from, to, today) {
  if (!isYmd(from) || !isYmd(to)) throw bad('Choose the From and To dates.');
  if (from > to) throw bad('From must be on or before To.');
  if (to > today) throw bad('The To date cannot be in the future.');
  if (daySpan(from, to) > MAX_FUEL_DAYS) throw bad(`Choose at most ${MAX_FUEL_DAYS} days.`);
}

/** True when a row has nothing typed in it (it is then ignored). */
export const isBlankRow = (r) => ['petrolL', 'dieselL', 'cngKg', 'amount'].every((k) => r[k] == null) && !r.billNo && !r.station && !r.remarks;

/** Checks one row against the vehicle's fuel type. Returns an error message or null. */
export function checkFuelRow(row, vehicle) {
  const allowed = FUEL_FIELDS[vehicle.fuelType];
  for (const k of ['petrolL', 'dieselL', 'cngKg']) {
    if (row[k] != null && row[k] > 0 && !allowed.includes(k)) {
      return vehicle.fuelType === 'ELECTRIC' ? 'Electric vehicles take the amount only' : `This is a ${label(vehicle.fuelType)} vehicle; ${fieldLabel[k]} is not used`;
    }
  }
  if (allowed.length && !allowed.some((k) => row[k] > 0)) return `Enter ${allowed.map((k) => fieldLabel[k]).join(' or ')}`;
  if (!(row.amount > 0)) return 'Enter the amount ₹';
  return null;
}
const fieldLabel = { petrolL: 'Petrol L', dieselL: 'Diesel L', cngKg: 'CNG kg' };
const label = (f) => ({ PETROL: 'Petrol', DIESEL: 'Diesel', CNG_PETROL: 'CNG/Petrol', CNG: 'CNG', ELECTRIC: 'Electric' })[f];

/** Company vehicles that were Active on at least one day in the range, with their driver(s). */
export async function eligibleVehicles(db, from, to) {
  const vehicles = await db.vehicle.findMany({ where: { ownership: 'COMPANY' }, orderBy: { number: 'asc' } });
  const tl = await loadTimelines(db, vehicles.map((v) => v.id));
  const entries = await db.fuelEntry.findMany({
    where: { fromDate: { lte: toDb(to) }, toDate: { gte: toDb(from) } },
    select: { vehicleId: true },
  });
  const entryCount = new Map();
  for (const e of entries) entryCount.set(e.vehicleId, (entryCount.get(e.vehicleId) || 0) + 1);
  const out = [];
  for (const v of vehicles) {
    const t = tl.get(v.id);
    const active = [...eachDay(from, to)].filter((d) => fuelEligible(v, t, d));
    if (!active.length) continue;
    const drivers = [...new Set(active.map((d) => driverOn(t, d)?.name).filter(Boolean))];
    out.push({
      id: v.id,
      number: v.number,
      make: v.make,
      fuelType: v.fuelType,
      fields: FUEL_FIELDS[v.fuelType],
      drivers,
      activeDays: active.length,
      totalDays: daySpan(from, to),
      existingEntries: entryCount.get(v.id) || 0,
    });
  }
  return out;
}

export const fuelOut = (e) => ({
  id: e.id,
  vehicleId: e.vehicleId,
  number: e.vehicle?.number,
  fuelType: e.vehicle?.fuelType,
  from: fromDb(e.fromDate),
  to: fromDb(e.toDate),
  petrolL: num(e.petrolL),
  dieselL: num(e.dieselL),
  cngKg: num(e.cngKg),
  amount: num(e.amount),
  billNo: e.billNo,
  station: e.station,
  remarks: e.remarks,
  enteredBy: e.enteredBy ? e.enteredBy.name : undefined,
  enteredById: e.enteredById,
  createdAt: e.createdAt,
});
