import { Router } from 'express';
import { z } from 'zod';
import { prisma, num } from '../lib/db.js';
import { h, parse, bad, notFound } from '../lib/http.js';
import { requireAdmin, requireCan } from '../lib/auth.js';
import { logActivity } from '../lib/audit.js';
import { todayIST, addDays, toDb, fromDb, isYmd } from '../lib/dates.js';
import { normPhone, tidyName } from '../lib/plate.js';
import { loadTimelines, current, setStatus, setDriver } from '../services/timeline.js';
import { fuelOut } from '../services/fuel.js';

const r = Router();
const ymd = z.string().refine(isYmd, 'is not a valid date');

/** Which Vehicles tab a vehicle belongs to. */
function tabOf(v, status) {
  if (status?.status === 'SOLD') return 'sold';
  if (v.ownership !== 'COMPANY') return 'others';
  if (status?.status === 'ACTIVE') return 'driver';
  return 'workshop';
}

r.get(
  '/vehicles',
  requireCan('vehicles'),
  h(async (_req, res) => {
    const vehicles = await prisma.vehicle.findMany({ include: { vendor: true }, orderBy: { number: 'asc' } });
    const tl = await loadTimelines(prisma);
    res.json({
      vehicles: vehicles.map((v) => {
        const t = tl.get(v.id) || { statuses: [], drivers: [] };
        const st = current(t.statuses);
        const dr = current(t.drivers);
        return {
          id: v.id,
          number: v.number,
          make: v.make,
          fuelType: v.fuelType,
          modelYear: v.modelYear,
          ownership: v.ownership,
          category: v.category,
          department: v.department,
          status: st?.status || null,
          place: st?.place || null,
          statusFrom: st?.from || null,
          driver: dr ? { id: dr.driverId, name: dr.name, phone: dr.phone, govt: dr.govt } : null,
          vendor: v.vendor ? { name: v.vendor.name, contact: v.vendor.contact } : null,
          tab: tabOf(v, st),
        };
      }),
    });
  }),
);

r.get(
  '/vehicles/:id',
  requireCan('vehicles'),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const v = await prisma.vehicle.findUnique({ where: { id }, include: { vendor: true } });
    if (!v) throw notFound('Vehicle not found.');
    const t = (await loadTimelines(prisma, [id])).get(id) || { statuses: [], drivers: [] };
    const since = addDays(todayIST(), -60);
    const [km, fuel] = await Promise.all([
      prisma.dailyKm.findMany({ where: { vehicleId: id, date: { gte: toDb(since) } }, orderBy: { date: 'desc' } }),
      prisma.fuelEntry.findMany({ where: { vehicleId: id }, orderBy: { fromDate: 'desc' }, take: 30, include: { vehicle: true, enteredBy: true } }),
    ]);
    res.json({
      vehicle: { ...v, createdAt: undefined, updatedAt: undefined },
      statuses: [...t.statuses].reverse(),
      drivers: [...t.drivers].reverse(),
      km: km.map((k) => ({ id: k.id, date: fromDb(k.date), km: num(k.km), source: k.source, uploadId: k.uploadId })),
      fuel: fuel.map(fuelOut),
    });
  }),
);

r.patch(
  '/vehicles/:id',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.vehicle.findUnique({ where: { id } });
    if (!before) throw notFound('Vehicle not found.');
    const body = parse(
      z.object({
        make: z.string().trim().min(1).max(40).transform(tidyName).optional(),
        fuelType: z.enum(['PETROL', 'DIESEL', 'CNG_PETROL', 'CNG', 'ELECTRIC']).optional(),
        modelYear: z.number().int().min(2000).max(2100).nullable().optional(),
        ownership: z.enum(['COMPANY', 'VENDOR', 'OFFICER', 'PERSONAL']).optional(),
        category: z.enum(['COMMERCIAL', 'PRIVATE']).nullable().optional(),
        department: z.string().trim().max(60).nullable().optional(),
      }),
      req.body,
    );
    const v = await prisma.vehicle.update({ where: { id }, data: body });
    await logActivity(req, { action: 'VEHICLE_UPDATE', entity: 'vehicle', entityId: id, oldValue: before, newValue: v });
    res.json({ ok: true });
  }),
);

r.post(
  '/vehicles/:id/status',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const body = parse(z.object({ status: z.enum(['ACTIVE', 'WORKSHOP', 'IDLE', 'SOLD']), place: z.string().trim().max(60).nullable().optional(), from: ymd }), req.body);
    if (!(await prisma.vehicle.findUnique({ where: { id } }))) throw notFound('Vehicle not found.');
    await prisma.$transaction(async (tx) => {
      const changed = await setStatus(tx, id, body.status, body.place || null, body.from);
      if (!changed) throw bad('The vehicle already has this status.');
      await logActivity(req, { action: 'VEHICLE_STATUS', entity: 'vehicle', entityId: id, newValue: body }, tx);
    });
    res.json({ ok: true });
  }),
);

r.post(
  '/vehicles/:id/driver',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const body = parse(
      z.object({ driverId: z.number().int().positive().nullable().optional(), name: z.string().trim().max(60).optional(), phone: z.string().optional(), govt: z.boolean().default(false), from: ymd }),
      req.body,
    );
    if (!(await prisma.vehicle.findUnique({ where: { id } }))) throw notFound('Vehicle not found.');
    await prisma.$transaction(async (tx) => {
      let driverId = body.driverId ?? null;
      if (!driverId && body.name) {
        const phone = normPhone(body.phone);
        const found = phone ? await tx.driver.findUnique({ where: { phone } }) : null;
        driverId = (found || (await tx.driver.create({ data: { name: tidyName(body.name), phone } }))).id;
      }
      const changed = await setDriver(tx, id, driverId, body.govt, body.from);
      if (!changed) throw bad('Nothing changed.');
      await logActivity(req, { action: 'VEHICLE_DRIVER', entity: 'vehicle', entityId: id, newValue: { ...body, driverId } }, tx);
    });
    res.json({ ok: true });
  }),
);

r.get(
  '/drivers',
  requireCan('vehicles'),
  h(async (_req, res) => {
    const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } });
    res.json({ drivers });
  }),
);

r.patch(
  '/drivers/:id',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.driver.findUnique({ where: { id } });
    if (!before) throw notFound('Driver not found.');
    const body = parse(z.object({ name: z.string().trim().min(1).max(60).transform(tidyName).optional(), phone: z.string().nullable().optional() }), req.body);
    const data = { ...body };
    if ('phone' in body) {
      data.phone = normPhone(body.phone);
      if (data.phone) {
        const other = await prisma.driver.findUnique({ where: { phone: data.phone } });
        if (other && other.id !== id) throw bad(`Phone ${data.phone} already belongs to ${other.name}.`);
      }
    }
    const d = await prisma.driver.update({ where: { id }, data });
    await logActivity(req, { action: 'DRIVER_UPDATE', entity: 'driver', entityId: id, oldValue: before, newValue: d });
    res.json({ driver: d });
  }),
);

export default r;
