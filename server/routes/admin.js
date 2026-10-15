import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h, parse } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { logActivity } from '../lib/audit.js';
import { getSettings, setSetting } from '../lib/settings.js';

const r = Router();

r.get(
  '/activity',
  requireAdmin,
  h(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = 50;
    const where = {};
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.entity) where.entity = String(req.query.entity);
    if (req.query.user) where.username = String(req.query.user);
    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * size, take: size }),
    ]);
    res.json({ total, page, size, rows: rows.map((x) => ({ ...x, id: Number(x.id) })) });
  }),
);

r.get(
  '/settings',
  h(async (_req, res) => res.json({ settings: await getSettings() })),
);

r.put(
  '/settings',
  requireAdmin,
  h(async (req, res) => {
    const body = parse(z.object({ attentionPercent: z.number().min(1).max(50), minComparable: z.number().int().min(2).max(20) }), req.body);
    const before = await getSettings();
    for (const [k, v] of Object.entries(body)) await setSetting(k, v);
    await logActivity(req, { action: 'SETTINGS_UPDATE', entity: 'settings', oldValue: before, newValue: body });
    res.json({ settings: await getSettings() });
  }),
);

export default r;
