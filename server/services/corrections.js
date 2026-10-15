// Non-Admins cannot edit or delete. They send a correction request; the Admin approves or rejects it.
import { toDb, fromDb } from '../lib/dates.js';
import { bad } from '../lib/http.js';
import { num } from '../lib/db.js';
import { logActivity } from '../lib/audit.js';
import { checkFuelRow } from './fuel.js';

/** Applies a change to a fuel entry (Admin edit, or an approved request). Returns [before, after]. */
export async function applyFuelEdit(tx, req, id, changes) {
  const before = await tx.fuelEntry.findUnique({ where: { id }, include: { vehicle: true } });
  if (!before) throw bad('That fuel entry no longer exists.');
  const merged = {
    from: changes.from ?? fromDb(before.fromDate),
    to: changes.to ?? fromDb(before.toDate),
    petrolL: 'petrolL' in changes ? changes.petrolL : num(before.petrolL),
    dieselL: 'dieselL' in changes ? changes.dieselL : num(before.dieselL),
    cngKg: 'cngKg' in changes ? changes.cngKg : num(before.cngKg),
    amount: 'amount' in changes ? changes.amount : num(before.amount),
    billNo: 'billNo' in changes ? changes.billNo : before.billNo,
    station: 'station' in changes ? changes.station : before.station,
    remarks: 'remarks' in changes ? changes.remarks : before.remarks,
  };
  if (merged.from > merged.to) throw bad('From must be on or before To.');
  const err = checkFuelRow(merged, before.vehicle);
  if (err) throw bad(err);
  const after = await tx.fuelEntry.update({
    where: { id },
    data: {
      fromDate: toDb(merged.from),
      toDate: toDb(merged.to),
      petrolL: merged.petrolL,
      dieselL: merged.dieselL,
      cngKg: merged.cngKg,
      amount: merged.amount,
      billNo: merged.billNo,
      station: merged.station,
      remarks: merged.remarks,
    },
  });
  await logActivity(req, { action: 'FUEL_EDIT', entity: 'fuel_entry', entityId: id, oldValue: before, newValue: after }, tx);
  return [before, after];
}

export async function applyFuelDelete(tx, req, id) {
  const before = await tx.fuelEntry.findUnique({ where: { id } });
  if (!before) throw bad('That fuel entry no longer exists.');
  await tx.fuelEntry.delete({ where: { id } });
  await logActivity(req, { action: 'FUEL_DELETE', entity: 'fuel_entry', entityId: id, oldValue: before }, tx);
}

export async function applyKmEdit(tx, req, id, km) {
  const before = await tx.dailyKm.findUnique({ where: { id } });
  if (!before) throw bad('That KM row no longer exists.');
  const after = await tx.dailyKm.update({ where: { id }, data: { km, source: 'MANUAL', enteredById: req.user.id } });
  await logActivity(req, { action: 'KM_EDIT', entity: 'daily_km', entityId: id, oldValue: before, newValue: after }, tx);
}

export async function applyKmDelete(tx, req, id) {
  const before = await tx.dailyKm.findUnique({ where: { id } });
  if (!before) throw bad('That KM row no longer exists.');
  await tx.dailyKm.delete({ where: { id } });
  await logActivity(req, { action: 'KM_DELETE', entity: 'daily_km', entityId: id, oldValue: before }, tx);
}

/** Applies an approved request. `req` is the Admin's request, so the log shows who approved it. */
export async function applyRequest(tx, req, r) {
  const p = r.payload || {};
  switch (r.type) {
    case 'FUEL_EDIT':
      return applyFuelEdit(tx, req, r.targetId, p.changes || {});
    case 'FUEL_DELETE':
      return applyFuelDelete(tx, req, r.targetId);
    case 'KM_EDIT':
      return applyKmEdit(tx, req, r.targetId, p.newKm);
    case 'KM_DELETE':
      return applyKmDelete(tx, req, r.targetId);
    case 'KM_REPLACE': {
      const old = await tx.dailyKm.findUnique({ where: { id: r.targetId } });
      if (old) {
        await tx.dailyKm.update({
          where: { id: old.id },
          data: { km: p.newKm, source: 'UPLOAD', uploadId: p.uploadId ?? null, enteredById: r.requestedBy, prevKm: old.km, prevUploadId: old.uploadId, prevSource: old.source },
        });
      } else {
        await tx.dailyKm.create({ data: { vehicleId: p.vehicleId, date: toDb(p.date), km: p.newKm, source: 'UPLOAD', uploadId: p.uploadId ?? null, enteredById: r.requestedBy } });
      }
      await logActivity(req, { action: 'KM_REPLACE', entity: 'daily_km', entityId: r.targetId, oldValue: old, newValue: { km: p.newKm, request: r.id } }, tx);
      return;
    }
    default:
      throw bad('Unknown request type.');
  }
}
