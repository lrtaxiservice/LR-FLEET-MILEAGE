import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h, parse, bad, notFound } from '../lib/http.js';
import { requireAdmin, requireCan } from '../lib/auth.js';
import { logActivity } from '../lib/audit.js';
import { todayIST, toDb, isYmd, addDays } from '../lib/dates.js';
import { eligibleVehicles, checkFuelRange, checkFuelRow, isBlankRow, fuelRowSchema, fuelOut } from '../services/fuel.js';
import { applyFuelEdit, applyFuelDelete } from '../services/corrections.js';

const r = Router();
const ymd = z.string().refine(isYmd, 'is not a valid date');

/** Vehicles that can take fuel in the range. */
r.get(
  '/vehicles',
  requireCan('fuel'),
  h(async (req, res) => {
    const { from, to } = req.query;
    checkFuelRange(from, to, todayIST());
    res.json({ vehicles: await eligibleVehicles(prisma, from, to) });
  }),
);

/** Saves the filled rows of the fuel form. Empty rows are ignored. */
r.post(
  '/entries',
  requireCan('fuel'),
  h(async (req, res) => {
    const body = parse(z.object({ from: ymd, to: ymd, rows: z.array(z.any()).max(500) }), req.body);
    checkFuelRange(body.from, body.to, todayIST());
    const eligible = new Map((await eligibleVehicles(prisma, body.from, body.to)).map((v) => [v.id, v]));
    const errors = [];
    const rows = [];
    body.rows.forEach((raw, i) => {
      const p = fuelRowSchema.safeParse(raw);
      if (!p.success) return errors.push({ index: i, vehicleId: raw?.vehicleId, error: p.error.issues[0].path.join('.') + ' ' + p.error.issues[0].message });
      if (isBlankRow(p.data)) return;
      const v = eligible.get(p.data.vehicleId);
      if (!v) return errors.push({ index: i, vehicleId: p.data.vehicleId, error: 'This vehicle was not Active (Company) on any day in these dates' });
      const err = checkFuelRow(p.data, v);
      if (err) return errors.push({ index: i, vehicleId: v.id, number: v.number, error: err });
      rows.push(p.data);
    });
    if (errors.length) throw bad(`${errors.length} row${errors.length === 1 ? ' needs' : 's need'} fixing. Nothing was saved.`, errors);
    if (!rows.length) throw bad('Fill in at least one vehicle.');
    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const d of rows) {
        const e = await tx.fuelEntry.create({ data: { ...d, fromDate: toDb(body.from), toDate: toDb(body.to), enteredById: req.user.id } });
        await logActivity(req, { action: 'FUEL_CREATE', entity: 'fuel_entry', entityId: e.id, newValue: e }, tx);
        out.push(e.id);
      }
      return out;
    });
    res.json({ saved: created.length, ids: created });
  }),
);

/** Fuel entries: the user's own ("mine=1") or all, filtered by dates and vehicle. */
r.get(
  '/entries',
  requireCan('reports'),
  h(async (req, res) => {
    const to = isYmd(req.query.to) ? req.query.to : todayIST();
    const from = isYmd(req.query.from) ? req.query.from : addDays(to, -30);
    const where = { fromDate: { lte: toDb(to) }, toDate: { gte: toDb(from) } };
    if (req.query.mine) where.enteredById = req.user.id;
    if (req.query.vehicleId) where.vehicleId = Number(req.query.vehicleId);
    const list = await prisma.fuelEntry.findMany({ where, orderBy: [{ fromDate: 'desc' }, { id: 'desc' }], take: 1000, include: { vehicle: true, enteredBy: true } });
    res.json({ entries: list.map(fuelOut) });
  }),
);

const editSchema = z.object({
  from: ymd.optional(),
  to: ymd.optional(),
  petrolL: z.number().min(0).nullable().optional(),
  dieselL: z.number().min(0).nullable().optional(),
  cngKg: z.number().min(0).nullable().optional(),
  amount: z.number().min(0).optional(),
  billNo: z.string().trim().max(60).nullable().optional(),
  station: z.string().trim().max(60).nullable().optional(),
  remarks: z.string().trim().max(300).nullable().optional(),
});
export { editSchema as fuelEditSchema };

r.patch(
  '/entries/:id',
  requireAdmin,
  h(async (req, res) => {
    const changes = parse(editSchema, req.body);
    await prisma.$transaction((tx) => applyFuelEdit(tx, req, Number(req.params.id), changes));
    res.json({ ok: true });
  }),
);

r.delete(
  '/entries/:id',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await prisma.fuelEntry.findUnique({ where: { id } }))) throw notFound('Fuel entry not found.');
    await prisma.$transaction((tx) => applyFuelDelete(tx, req, id));
    res.json({ ok: true });
  }),
);

export default r;
