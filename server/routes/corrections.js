import { Router } from 'express';
import { z } from 'zod';
import { prisma, num } from '../lib/db.js';
import { h, parse, bad, notFound, forbidden } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { logActivity } from '../lib/audit.js';
import { fromDb } from '../lib/dates.js';
import { applyRequest } from '../services/corrections.js';
import { fuelEditSchema } from './fuel.js';

const r = Router();

r.get(
  '/',
  h(async (req, res) => {
    const where = {};
    if (req.user.role !== 'ADMIN') where.requestedBy = req.user.id;
    if (['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.state)) where.state = req.query.state;
    const list = await prisma.correctionRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: { requester: true, decider: true } });
    res.json({
      requests: list.map((c) => ({
        id: c.id,
        type: c.type,
        state: c.state,
        targetId: c.targetId,
        payload: c.payload,
        reason: c.reason,
        requestedBy: c.requester.name,
        requestedById: c.requestedBy,
        createdAt: c.createdAt,
        decidedBy: c.decider?.name || null,
        decidedAt: c.decidedAt,
        decisionNote: c.decisionNote,
      })),
    });
  }),
);

/** A non-Admin asks for a fuel entry or KM row they entered to be changed or deleted. */
r.post(
  '/',
  h(async (req, res) => {
    const body = parse(
      z.object({
        type: z.enum(['FUEL_EDIT', 'FUEL_DELETE', 'KM_EDIT', 'KM_DELETE']),
        targetId: z.number().int().positive(),
        changes: z.any().optional(),
        newKm: z.number().min(0).max(5000).optional(),
        reason: z.string().trim().min(3, 'say why the change is needed').max(300),
      }),
      req.body,
    );
    let payload;
    if (body.type.startsWith('FUEL')) {
      const e = await prisma.fuelEntry.findUnique({ where: { id: body.targetId }, include: { vehicle: true } });
      if (!e) throw notFound('Fuel entry not found.');
      if (req.user.role !== 'ADMIN' && e.enteredById !== req.user.id) throw forbidden('You can only ask to correct entries you made.');
      payload = { number: e.vehicle.number, from: fromDb(e.fromDate), to: fromDb(e.toDate), current: { petrolL: num(e.petrolL), dieselL: num(e.dieselL), cngKg: num(e.cngKg), amount: num(e.amount), billNo: e.billNo } };
      if (body.type === 'FUEL_EDIT') {
        payload.changes = parse(fuelEditSchema, body.changes || {});
        if (!Object.keys(payload.changes).length) throw bad('Enter the corrected values.');
      }
    } else {
      const k = await prisma.dailyKm.findUnique({ where: { id: body.targetId }, include: { vehicle: true } });
      if (!k) throw notFound('KM row not found.');
      if (req.user.role !== 'ADMIN' && k.enteredById !== req.user.id) throw forbidden('You can only ask to correct KM you entered.');
      payload = { number: k.vehicle.number, date: fromDb(k.date), oldKm: num(k.km) };
      if (body.type === 'KM_EDIT') {
        if (body.newKm == null) throw bad('Enter the corrected KM.');
        payload.newKm = body.newKm;
      }
    }
    const dup = await prisma.correctionRequest.findFirst({ where: { state: 'PENDING', targetId: body.targetId, type: body.type } });
    if (dup) throw bad('A request for this is already waiting for the Admin.');
    const c = await prisma.correctionRequest.create({ data: { type: body.type, targetId: body.targetId, payload, reason: body.reason, requestedBy: req.user.id } });
    await logActivity(req, { action: 'REQUEST_CREATE', entity: 'correction_request', entityId: c.id, newValue: { type: c.type, ...payload, reason: c.reason } });
    res.json({ id: c.id });
  }),
);

r.post(
  '/:id/approve',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const note = String(req.body?.note || '').slice(0, 300) || null;
    await prisma.$transaction(async (tx) => {
      const c = await tx.correctionRequest.findUnique({ where: { id } });
      if (!c) throw notFound('Request not found.');
      if (c.state !== 'PENDING') throw bad('This request was already decided.');
      await applyRequest(tx, req, c);
      await tx.correctionRequest.update({ where: { id }, data: { state: 'APPROVED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note } });
      await logActivity(req, { action: 'REQUEST_APPROVE', entity: 'correction_request', entityId: id, newValue: { note } }, tx);
    });
    res.json({ ok: true });
  }),
);

r.post(
  '/:id/reject',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const note = String(req.body?.note || '').slice(0, 300) || null;
    const c = await prisma.correctionRequest.findUnique({ where: { id } });
    if (!c) throw notFound('Request not found.');
    if (c.state !== 'PENDING') throw bad('This request was already decided.');
    await prisma.$transaction(async (tx) => {
      await tx.correctionRequest.update({ where: { id }, data: { state: 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note } });
      await logActivity(req, { action: 'REQUEST_REJECT', entity: 'correction_request', entityId: id, newValue: { note } }, tx);
    });
    res.json({ ok: true });
  }),
);

export default r;
