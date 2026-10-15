// A vehicle's status (Active / Workshop / Idle / Sold) and driver over time, with from–to dates.
import { addDays, fromDb, toDb } from '../lib/dates.js';
import { bad } from '../lib/http.js';

/** Loads status and driver history for the given vehicles (all when ids is omitted). */
export async function loadTimelines(db, ids) {
  const where = ids ? { vehicleId: { in: ids } } : {};
  const [statuses, drivers] = await Promise.all([
    db.vehicleStatusHistory.findMany({ where, orderBy: [{ vehicleId: 'asc' }, { fromDate: 'asc' }] }),
    db.vehicleDriverHistory.findMany({ where, orderBy: [{ vehicleId: 'asc' }, { fromDate: 'asc' }], include: { driver: true } }),
  ]);
  const tl = new Map();
  const get = (id) => tl.get(id) || tl.set(id, { statuses: [], drivers: [] }).get(id);
  for (const s of statuses) get(s.vehicleId).statuses.push({ status: s.status, place: s.place, from: fromDb(s.fromDate), to: fromDb(s.toDate) });
  for (const d of drivers) {
    get(d.vehicleId).drivers.push({ driverId: d.driverId, name: d.driver.name, phone: d.driver.phone, govt: d.govt, from: fromDb(d.fromDate), to: fromDb(d.toDate) });
  }
  return tl;
}

function at(list, day, fallbackToFirst) {
  for (const r of list) if (r.from <= day && (!r.to || day <= r.to)) return r;
  // Days before the first record (e.g. GPS uploaded for days before the master was imported) use the first record.
  if (fallbackToFirst && list.length && day < list[0].from) return list[0];
  return null;
}

export const statusOn = (t, day) => (t ? at(t.statuses, day, true) : null);
export const driverOn = (t, day) => (t ? at(t.drivers, day, true) : null);

/** Fuel and averages count only for Company vehicles on Active days. */
export function fuelEligible(vehicle, t, day) {
  return vehicle.ownership === 'COMPANY' && statusOn(t, day)?.status === 'ACTIVE';
}

export const current = (list) => list.find((r) => !r.to) || null;

/**
 * Starts a new status from `from`. The open status is closed the day before.
 * Returns true when something changed.
 */
export async function setStatus(db, vehicleId, status, place, from) {
  place = place || null;
  const open = await db.vehicleStatusHistory.findFirst({ where: { vehicleId, toDate: null }, orderBy: { fromDate: 'desc' } });
  if (open && open.status === status && (open.place || null) === place) return false;
  const last = await db.vehicleStatusHistory.findFirst({ where: { vehicleId }, orderBy: { fromDate: 'desc' } });
  if (last && fromDb(last.fromDate) > from) {
    throw bad(`The new status must start on or after ${fromDb(last.fromDate)}, when the current status began.`);
  }
  if (last && fromDb(last.fromDate) === from) {
    await db.vehicleStatusHistory.update({ where: { id: last.id }, data: { status, place, toDate: null } });
    return true;
  }
  if (open) await db.vehicleStatusHistory.update({ where: { id: open.id }, data: { toDate: toDb(addDays(from, -1)) } });
  await db.vehicleStatusHistory.create({ data: { vehicleId, status, place, fromDate: toDb(from) } });
  return true;
}

/** Assigns a driver (or none, when driverId is null) from `from`. Returns true when something changed. */
export async function setDriver(db, vehicleId, driverId, govt, from) {
  const open = await db.vehicleDriverHistory.findFirst({ where: { vehicleId, toDate: null }, orderBy: { fromDate: 'desc' } });
  if (!open && !driverId) return false;
  if (open && open.driverId === driverId && open.govt === !!govt) return false;
  if (open && fromDb(open.fromDate) > from) {
    throw bad(`The new driver must start on or after ${fromDb(open.fromDate)}, when the current driver began.`);
  }
  if (open && fromDb(open.fromDate) === from) {
    if (driverId) await db.vehicleDriverHistory.update({ where: { id: open.id }, data: { driverId, govt: !!govt } });
    else await db.vehicleDriverHistory.delete({ where: { id: open.id } });
    return true;
  }
  if (open) await db.vehicleDriverHistory.update({ where: { id: open.id }, data: { toDate: toDb(addDays(from, -1)) } });
  if (driverId) await db.vehicleDriverHistory.create({ data: { vehicleId, driverId, govt: !!govt, fromDate: toDb(from) } });
  return true;
}
