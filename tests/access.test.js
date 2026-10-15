import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, resetDb, loginAs, makeUser, getApp, importMaster, xlsx } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('logins and roles', () => {
  beforeEach(resetDb);

  it('refuses wrong passwords and requires login', async () => {
    const u = await makeUser('VIEWER');
    const r = await request(getApp()).post('/api/auth/login').send({ username: u.username, password: 'nope' });
    expect(r.status).toBe(401);
    expect((await request(getApp()).get('/api/vehicles')).status).toBe(401);
  });

  it('makes a new user change the temporary password first', async () => {
    const admin = await loginAs('ADMIN');
    const c = await admin.post('/api/users').send({ username: 'fuel9', name: 'Fuel Nine', role: 'FUEL_USER' });
    expect(c.status).toBe(200);
    const agent = request.agent(getApp());
    await agent.post('/api/auth/login').send({ username: 'fuel9', password: c.body.tempPassword }).expect(200);
    expect((await agent.get('/api/vehicles')).status).toBe(403);
    await agent.post('/api/auth/change-password').send({ current: c.body.tempPassword, next: 'a-new-password' }).expect(200);
    expect((await agent.get('/api/vehicles')).status).toBe(200);
  });

  it('there is only one Admin', async () => {
    const admin = await loginAs('ADMIN');
    expect((await admin.post('/api/users').send({ username: 'boss2', name: 'Boss', role: 'ADMIN' })).status).toBe(400);
  });

  it('blocks screens by role', async () => {
    const viewer = await loginAs('VIEWER');
    const fuelUser = await loginAs('FUEL_USER');
    const kmUser = await loginAs('KM_USER');
    const file = await xlsx([['Device', 'Date', 'KM'], ['DL1CAB1234', '10-10-2026', 5]]);
    expect((await viewer.post('/api/km/preview').field('from', '2026-10-10').field('to', '2026-10-10').attach('file', file, 'g.xlsx')).status).toBe(403);
    expect((await fuelUser.post('/api/km/preview').field('from', '2026-10-10').field('to', '2026-10-10').attach('file', file, 'g.xlsx')).status).toBe(403);
    expect((await kmUser.get('/api/fuel/vehicles?from=2026-10-10&to=2026-10-10')).status).toBe(403);
    expect((await kmUser.post('/api/master/preview').attach('file', file, 'm.xlsx')).status).toBe(403);
    expect((await viewer.get('/api/users')).status).toBe(403);
    expect((await viewer.get('/api/activity')).status).toBe(403);
    expect((await viewer.get('/api/mileage?mode=monthly&month=2026-10')).status).toBe(200);
  });

  it('refuses requests that are not JSON or a file upload', async () => {
    const admin = await loginAs('ADMIN');
    const r = await admin.post('/api/users').set('Content-Type', 'text/plain').send('username=x');
    expect(r.status).toBe(415);
  });
});

describe('correction requests and the activity log', () => {
  beforeEach(resetDb);

  it('applies a fuel correction only when the Admin approves it', async () => {
    const admin = await loginAs('ADMIN');
    const fuel = await loginAs('FUEL_USER');
    const other = await loginAs('FUEL_USER');
    await importMaster(admin, [['DL1CAB1234', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Ramesh Kumar', '9810012345']]);
    const v = await prisma.vehicle.findFirst();
    const saved = await fuel.post('/api/fuel/entries').send({ from: '2026-10-10', to: '2026-10-10', rows: [{ vehicleId: v.id, cngKg: 10, amount: 760 }] });
    const id = saved.body.ids[0];

    expect((await other.post('/api/corrections').send({ type: 'FUEL_DELETE', targetId: id, reason: 'not mine' })).status).toBe(403);
    const req = await fuel.post('/api/corrections').send({ type: 'FUEL_EDIT', targetId: id, changes: { cngKg: 12, amount: 912 }, reason: 'typed 10 instead of 12' });
    expect(req.status).toBe(200);
    expect(Number((await prisma.fuelEntry.findUnique({ where: { id } })).cngKg)).toBe(10);

    expect((await fuel.post(`/api/corrections/${req.body.id}/approve`)).status).toBe(403);
    await admin.post(`/api/corrections/${req.body.id}/approve`).send({ note: 'ok' }).expect(200);
    const after = await prisma.fuelEntry.findUnique({ where: { id } });
    expect([Number(after.cngKg), Number(after.amount)]).toEqual([12, 912]);

    const log = await admin.get('/api/activity?entity=fuel_entry');
    const edit = log.body.rows.find((x) => x.action === 'FUEL_EDIT');
    expect(edit.oldValue.cngKg).toBe('10');
    expect(edit.newValue.cngKg).toBe('12');
    expect(edit.ip).toBeTruthy();
  });

  it('the database blocks changes to the activity log', async () => {
    await prisma.activityLog.create({ data: { action: 'TEST' } });
    await expect(prisma.activityLog.updateMany({ data: { action: 'HACKED' } })).rejects.toThrow(/append-only/);
    await expect(prisma.activityLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE "activity_log"')).rejects.toThrow(/append-only/);
  });
});
