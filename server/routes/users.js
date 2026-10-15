import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/db.js';
import { h, parse, bad, notFound } from '../lib/http.js';
import { requireAdmin, hashPassword, publicUser } from '../lib/auth.js';
import { logActivity } from '../lib/audit.js';

const r = Router();
r.use(requireAdmin);

// There is only one Admin, so new users get one of the other roles.
const role = z.enum(['KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER']);
const tempPassword = () => crypto.randomBytes(6).toString('base64url');

r.get(
  '/',
  h(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: [{ active: 'desc' }, { username: 'asc' }] });
    res.json({ users: users.map(publicUser) });
  }),
);

r.post(
  '/',
  h(async (req, res) => {
    const body = parse(
      z.object({
        username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'use 3–30 letters, numbers, dots or dashes'),
        name: z.string().trim().min(1).max(60),
        role,
      }),
      req.body,
    );
    if (await prisma.user.findUnique({ where: { username: body.username } })) throw bad('That user name is already taken.');
    const password = tempPassword();
    const u = await prisma.user.create({ data: { ...body, passwordHash: await hashPassword(password), mustChangePassword: true } });
    await logActivity(req, { action: 'USER_CREATE', entity: 'user', entityId: u.id, newValue: publicUser(u) });
    res.json({ user: publicUser(u), tempPassword: password });
  }),
);

r.patch(
  '/:id',
  h(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound('User not found.');
    const body = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), role: role.optional(), active: z.boolean().optional() }), req.body);
    if (before.role === 'ADMIN' && (body.role || body.active === false)) throw bad('The Admin cannot be changed or switched off here.');
    const u = await prisma.user.update({ where: { id }, data: body });
    if (body.active === false) await prisma.$executeRaw`DELETE FROM "session" WHERE (sess->>'userId')::int = ${id}`;
    await logActivity(req, { action: 'USER_UPDATE', entity: 'user', entityId: id, oldValue: publicUser(before), newValue: publicUser(u) });
    res.json({ user: publicUser(u) });
  }),
);

r.post(
  '/:id/reset-password',
  h(async (req, res) => {
    const id = Number(req.params.id);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound('User not found.');
    if (u.role === 'ADMIN') throw bad('The Admin changes their own password from the account menu.');
    const password = tempPassword();
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
    await prisma.$executeRaw`DELETE FROM "session" WHERE (sess->>'userId')::int = ${id}`;
    await logActivity(req, { action: 'PASSWORD_RESET', entity: 'user', entityId: id });
    res.json({ tempPassword: password });
  }),
);

export default r;
