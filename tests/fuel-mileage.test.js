import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, resetDb, loginAs, importMaster, vehicleId } from './helpers.js';
import { eachDay } from '../server/lib/dates.js';

afterAll(() => prisma.$disconnect());

let admin, fuel, kmUserId;
const ids = {};

async function addKm(number, from, to, km) {
  const id = ids[number];
  await prisma.dailyKm.createMany({ data: [...eachDay(from, to)].map((d) => ({ vehicleId: id, date: new Date(d + 'T00:00:00Z'), km, source: 'MANUAL', enteredById: kmUserId })) });
}
async function addFuel(from, to, rows) {
  const r = await fuel.post('/api/fuel/entries').send({ from, to, rows });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return r.body;
}

beforeAll(async () => {
  await resetDb();
  admin = await loginAs('ADMIN');
  fuel = await loginAs('FUEL_USER');
  kmUserId = admin.user.id;
  await importMaster(admin, [
    ['DL1CAA0001', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Ramesh Kumar', '9810000001'],
    ['DL1CAA0002', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Driver Two', '9810000002'],
    ['DL1CAA0003', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Driver Three', '9810000003'],
    ['DL1CAA0004', 'Dzire', 'CNG/Petrol', 'GOVT DRIVER', 'Driver Four', '9810000004'],
    ['DL1CAA0005', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Driver Five', '9810000005'],
    ['DL1CBB0001', 'Innova Crysta', 'Diesel', 'DRIVER', 'Driver Six', '9810000006'],
    ['DL1CBB0002', 'Innova Crysta', 'Diesel', 'DRIVER', 'Driver Seven', '9810000007'],
    ['DL1CEE0001', 'Nexon EV', 'Electric', 'DRIVER', 'Driver Eight', '9810000008'],
    ['DL1CVV0001', 'Ertiga', 'CNG/Petrol', 'VENDOR', 'Demo Travels', '9000000001'],
    ['DL1CFF0001', 'Ciaz', 'Petrol', 'FREE LR'],
  ]);
  for (const v of await prisma.vehicle.findMany()) ids[v.number] = v.id;

  // DL1CAA0005 is in the workshop on 4–5 Oct.
  await admin.post(`/api/vehicles/${ids.DL1CAA0005}/status`).send({ status: 'WORKSHOP', place: 'Workshop CH', from: '2026-10-04' }).expect(200);
  await admin.post(`/api/vehicles/${ids.DL1CAA0005}/status`).send({ status: 'ACTIVE', from: '2026-10-06' }).expect(200);
  // DL1CAA0001 changes driver on 6 Oct.
  await admin.post(`/api/vehicles/${ids.DL1CAA0001}/driver`).send({ name: 'Suresh Singh', phone: '9810000099', from: '2026-10-06' }).expect(200);

  for (const n of ['DL1CAA0001', 'DL1CAA0002', 'DL1CAA0003', 'DL1CAA0004', 'DL1CBB0001', 'DL1CBB0002', 'DL1CEE0001', 'DL1CVV0001']) await addKm(n, '2026-10-01', '2026-10-10', 100);
  await addKm('DL1CAA0005', '2026-10-01', '2026-10-03', 100);
  await addKm('DL1CAA0005', '2026-10-04', '2026-10-05', 50); // workshop days: not counted

  await addFuel('2026-10-05', '2026-10-05', [{ vehicleId: ids.DL1CAA0001, cngKg: 25, amount: 1900 }]);
  await addFuel('2026-10-10', '2026-10-10', [
    { vehicleId: ids.DL1CAA0001, cngKg: 25, amount: 1900 },
    { vehicleId: ids.DL1CAA0002, cngKg: 50, amount: 3800 },
    { vehicleId: ids.DL1CAA0003, cngKg: 40, petrolL: 10, amount: 3990 },
    { vehicleId: ids.DL1CAA0004, cngKg: 70, amount: 5320 },
    { vehicleId: ids.DL1CBB0001, dieselL: 90, amount: 7884 },
    { vehicleId: ids.DL1CEE0001, amount: 1500 },
    { vehicleId: ids.DL1CBB0002 }, // empty row: ignored
  ]);
  await addFuel('2026-10-01', '2026-10-06', [{ vehicleId: ids.DL1CAA0005, cngKg: 60, amount: 4560 }]);
});

describe('fuel entry', () => {
  it('lists only Company vehicles that were Active in the range', async () => {
    const r = await fuel.get('/api/fuel/vehicles?from=2026-10-04&to=2026-10-05');
    const numbers = r.body.vehicles.map((v) => v.number);
    expect(numbers).toContain('DL1CAA0001');
    expect(numbers).not.toContain('DL1CAA0005'); // in the workshop on both days
    expect(numbers).not.toContain('DL1CVV0001'); // vendor
    expect(numbers).not.toContain('DL1CFF0001'); // idle
    expect(r.body.vehicles.find((v) => v.number === 'DL1CEE0001').fields).toEqual([]);
  });

  it('refuses wrong rows and saves nothing', async () => {
    const r = await fuel.post('/api/fuel/entries').send({
      from: '2026-10-09',
      to: '2026-10-09',
      rows: [
        { vehicleId: ids.DL1CAA0002, cngKg: 10, amount: 760 },
        { vehicleId: ids.DL1CBB0001, petrolL: 10, amount: 900 },
        { vehicleId: ids.DL1CVV0001, cngKg: 10, amount: 760 },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.body.details).toHaveLength(2);
    expect(await prisma.fuelEntry.count({ where: { fromDate: new Date('2026-10-09T00:00:00Z') } })).toBe(0);
  });

  it('a fuel user cannot edit or delete, only ask', async () => {
    const e = await prisma.fuelEntry.findFirst({ where: { vehicleId: ids.DL1CAA0002 } });
    expect((await fuel.delete(`/api/fuel/entries/${e.id}`)).status).toBe(403);
    expect((await fuel.patch(`/api/fuel/entries/${e.id}`).send({ amount: 1 })).status).toBe(403);
  });
});

describe('mileage report', () => {
  let rep;
  const row = (n) => rep.rows.find((r) => r.number === n);
  beforeAll(async () => {
    const r = await admin.get('/api/mileage?mode=custom&from=2026-10-01&to=2026-10-10');
    expect(r.status).toBe(200);
    rep = r.body;
  });

  it('works out averages, the median benchmark and Needs Attention', () => {
    expect(row('DL1CAA0002')).toMatchObject({ km: 1000, qty: 50, average: 20, unit: 'km/(kg+L)', status: 'OK' });
    expect(row('DL1CAA0003')).toMatchObject({ qty: 50, average: 20 }); // CNG kg + Petrol L added together
    // Dzire averages: 20, 20, 20, 14.29 and 5 (DL1CAA0005) → median 20
    expect(row('DL1CAA0004')).toMatchObject({ average: 14.29, benchmark: 20, status: 'ATTENTION' });
    expect(row('DL1CAA0004').worseByPercent).toBeCloseTo(28.6, 1);
    expect(row('DL1CAA0001')).toMatchObject({ km: 1000, qty: 50, average: 20, status: 'OK' });
  });

  it('spreads a multi-day fill over Active days by KM and leaves workshop days out', () => {
    // 60 kg over 1–6 Oct; 4–5 Oct are workshop days and 6 Oct has no KM, so all 60 kg go to 1–3 Oct.
    expect(row('DL1CAA0005')).toMatchObject({ km: 300, cng: 60, average: 5, status: 'ATTENTION' });
  });

  it('needs at least 3 vehicles to compare, and handles missing fuel and Electric', () => {
    expect(row('DL1CBB0001')).toMatchObject({ average: 11.11, status: 'NOT_ENOUGH' });
    expect(row('DL1CBB0002')).toMatchObject({ km: 1000, average: null, status: 'NO_FUEL', statusLabel: 'No fuel entry' });
    expect(row('DL1CEE0001')).toMatchObject({ average: 1.5, unit: '₹/km', costPerKm: 1.5, status: 'NOT_ENOUGH' });
  });

  it('keeps vendor vehicles in their own list and never returns Infinity or NaN', () => {
    expect(row('DL1CVV0001')).toBeUndefined();
    expect(rep.others).toEqual([expect.objectContaining({ number: 'DL1CVV0001', km: 1000, holder: 'Demo Travels' })]);
    const text = JSON.stringify(rep);
    expect(text).not.toMatch(/Infinity|NaN/);
    expect(rep.totals.costPerKm).toBeGreaterThan(0);
  });

  it('daily view shows an average only for single-day fills', async () => {
    const r = await admin.get('/api/mileage?mode=daily&date=2026-10-02');
    const v = r.body.rows.find((x) => x.number === 'DL1CAA0005');
    expect(v).toMatchObject({ status: 'MULTI_DAY', average: null });
  });

  it('splits KM and fuel between drivers by the days they had the vehicle', async () => {
    const r = await admin.get('/api/mileage/drivers?mode=custom&from=2026-10-01&to=2026-10-10');
    const a = r.body.rows.filter((x) => x.number === 'DL1CAA0001');
    expect(a.map((x) => [x.driver, x.km, x.cng, x.average])).toEqual([
      ['Ramesh Kumar', 500, 25, 20],
      ['Suresh Singh', 500, 25, 20],
    ]);
  });

  it('exports to Excel', async () => {
    const r = await admin.get('/api/mileage/export.xlsx?mode=custom&from=2026-10-01&to=2026-10-10').buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/spreadsheetml/);
    expect(r.body.slice(0, 2).toString()).toBe('PK');
  });
});
