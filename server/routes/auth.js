import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h, parse, HttpError, bad } from '../lib/http.js';
import { checkPassword, hashPassword, publicUser } from '../lib/auth.js';
import { logActivity } from '../lib/audit.js';

const r = Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

r.post(
  '/login',
  loginLimit,
  h(async (req, res) => {
    const { username, password } = parse(z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) }), req.body);
    const u = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const ok = u && u.active && (await checkPassword(password, u.passwordHash));
    if (!ok) {
      await logActivity(req, { action: 'LOGIN_FAILED', entity: 'user', newValue: { username } });
      throw new HttpError(401, 'Wrong user name or password.');
    }
    await new Promise((res2, rej) => req.session.regenerate((e) => (e ? rej(e) : res2())));
    req.session.userId = u.id;
    req.user = u;
    await logActivity(req, { action: 'LOGIN', entity: 'user', entityId: u.id });
    res.json({ user: publicUser(u) });
  }),
);

r.post(
  '/logout',
  h(async (req, res) => {
    if (req.user) await logActivity(req, { action: 'LOGOUT', entity: 'user', entityId: req.user.id });
    await new Promise((res2) => req.session.destroy(() => res2()));
    res.clearCookie('lrfleet.sid');
    res.json({ ok: true });
  }),
);

r.get('/me', (req, res) => res.json({ user: publicUser(req.user) || null }));

r.post(
  '/change-password',
  h(async (req, res) => {
    if (!req.user) throw new HttpError(401, 'Please log in.');
    const { current, next } = parse(
      z.object({ current: z.string().min(1), next: z.string().min(8, 'must be at least 8 characters').max(200) }),
      req.body,
    );
    if (!(await checkPassword(current, req.user.passwordHash))) throw bad('The current password is wrong.');
    if (current === next) throw bad('Choose a new password that is different from the current one.');
    const u = await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
    await logActivity(req, { action: 'PASSWORD_CHANGE', entity: 'user', entityId: u.id });
    res.json({ user: publicUser(u) });
  }),
);

export default r;
