import { Router } from 'express';
import { z } from 'zod';
import { prisma, num } from '../lib/db.js';
import { h, parse, bad, notFound } from '../lib/http.js';
import { requireAdmin, requireCan } from '../lib/auth.js';
import { excelUpload, needFile, jsonField } from '../lib/upload.js';
import { logActivity } from '../lib/audit.js';
import { todayIST, toDb, fromDb, isYmd, addDays } from '../lib/dates.js';
import { openKmFile, previewKm, commitKm, undoUpload, checkRange, KM_FIELDS } from '../services/kmImport.js';
import { applyKmEdit, applyKmDelete } from '../services/corrections.js';

const r = Router();
const ymd = z.string().refine(isYmd, 'is not a valid date');
const kmValue = z.number().min(0).max(5000);

async function readUpload(req) {
  const file = needFile(req);
  const { from, to } = req.body;
  checkRange(from, to, todayIST());
  const opened = await openKmFile(file.buffer, file.originalname, jsonField(req, 'mapping'));
  return { file, opened, from, to };
}

r.post(
  '/preview',
  requireCan('km'),
  excelUpload,
  h(async (req, res) => {
    const { opened, from, to } = await readUpload(req);
    try {
      res.json({ fields: KM_FIELDS, ...(await previewKm(prisma, opened, from, to)) });
    } catch (e) {
      if (e.status !== 400) throw e;
      res.json({ fields: KM_FIELDS, headers: opened.headers, mapping: opened.mapping, needMapping: e.message });
    }
  }),
);

r.post(
  '/commit',
  requireCan('km'),
  excelUpload,
  h(async (req, res) => {
    const { file, opened, from, to } = await readUpload(req);
    const preview = await previewKm(prisma, opened, from, to);
    if (!preview.days.length) throw bad('There are no KM rows to save for these dates.');
    const replace = jsonField(req, 'replace', []);
    if (!Array.isArray(replace)) throw bad('replace is not valid.');
    res.json(await commitKm(prisma, req, preview, file.originalname, replace.map(String)));
  }),
);

r.get(
  '/uploads',
  requireCan('reports'),
  h(async (req, res) => {
    const where = req.user.role === 'ADMIN' || req.query.all ? {} : { userId: req.user.id };
    const ups = await prisma.kmUpload.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { user: true, undoneBy: true } });
    res.json({
      uploads: ups.map((u) => ({
        id: u.id,
        fileName: u.fileName,
        from: fromDb(u.fromDate),
        to: fromDb(u.toDate),
        by: u.user.name,
        createdAt: u.createdAt,
        rowsSaved: u.rowsSaved,
        rowsSkipped: u.rowsSkipped,
        summary: u.summary,
        undoneAt: u.undoneAt,
        undoneBy: u.undoneBy?.name || null,
      })),
    });
  }),
);

r.post(
  '/uploads/:id/undo',
  requireAdmin,
  h(async (req, res) => res.json(await undoUpload(prisma, req, Number(req.params.id)))),
);

/** Manual KM for one vehicle-day. If KM already exists, the Admin replaces it; others send a request. */
r.post(
  '/manual',
  requireCan('km'),
  h(async (req, res) => {
    const body = parse(z.object({ vehicleId: z.number().int().positive(), date: ymd, km: kmValue, reason: z.string().trim().max(300).optional() }), req.body);
    if (body.date > todayIST()) throw bad('The date cannot be in the future.');
    const v = await prisma.vehicle.findUnique({ where: { id: body.vehicleId } });
    if (!v) throw notFound('Vehicle not found.');
    const existing = await prisma.dailyKm.findUnique({ where: { vehicleId_date: { vehicleId: v.id, date: toDb(body.date) } } });
    if (!existing) {
      const row = await prisma.$transaction(async (tx) => {
        const row = await tx.dailyKm.create({ data: { vehicleId: v.id, date: toDb(body.date), km: body.km, source: 'MANUAL', enteredById: req.user.id } });
        await logActivity(req, { action: 'KM_MANUAL', entity: 'daily_km', entityId: row.id, newValue: { vehicle: v.number, date: body.date, km: body.km } }, tx);
        return row;
      });
      return res.json({ saved: true, id: row.id });
    }
    if (req.user.role === 'ADMIN') {
      await prisma.$transaction((tx) => applyKmEdit(tx, req, existing.id, body.km));
      return res.json({ saved: true, replaced: true });
    }
    const cr = await prisma.correctionRequest.create({
      data: {
        type: 'KM_EDIT',
        targetId: existing.id,
        payload: { vehicleId: v.id, number: v.number, date: body.date, oldKm: num(existing.km), newKm: body.km },
        reason: body.reason || 'Manual KM entry',
        requestedBy: req.user.id,
      },
    });
    await logActivity(req, { action: 'REQUEST_CREATE', entity: 'correction_request', entityId: cr.id, newValue: cr.payload });
    res.json({ saved: false, requested: true, existingKm: num(existing.km) });
  }),
);

/** KM rows for a vehicle or a date range. */
r.get(
  '/daily',
  requireCan('reports'),
  h(async (req, res) => {
    const to = isYmd(req.query.to) ? req.query.to : todayIST();
    const from = isYmd(req.query.from) ? req.query.from : addDays(to, -30);
    const where = { date: { gte: toDb(from), lte: toDb(to) } };
    if (req.query.vehicleId) where.vehicleId = Number(req.query.vehicleId);
    if (req.query.mine) where.enteredById = req.user.id;
    if (req.query.source) where.source = req.query.source === 'MANUAL' ? 'MANUAL' : 'UPLOAD';
    const rows = await prisma.dailyKm.findMany({ where, orderBy: [{ date: 'desc' }], take: 2000, include: { vehicle: true, enteredBy: true } });
    res.json({
      rows: rows.map((k) => ({ id: k.id, vehicleId: k.vehicleId, number: k.vehicle.number, date: fromDb(k.date), km: num(k.km), source: k.source, uploadId: k.uploadId, enteredBy: k.enteredBy.name, enteredById: k.enteredById })),
    });
  }),
);

r.patch(
  '/daily/:id',
  requireAdmin,
  h(async (req, res) => {
    const { km } = parse(z.object({ km: kmValue }), req.body);
    await prisma.$transaction((tx) => applyKmEdit(tx, req, Number(req.params.id), km));
    res.json({ ok: true });
  }),
);

r.delete(
  '/daily/:id',
  requireAdmin,
  h(async (req, res) => {
    await prisma.$transaction((tx) => applyKmDelete(tx, req, Number(req.params.id)));
    res.json({ ok: true });
  }),
);

export default r;
