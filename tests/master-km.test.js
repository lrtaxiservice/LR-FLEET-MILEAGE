import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, loginAs, xlsx, importMaster, vehicleId, MASTER_HEADERS } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('Vehicle Master import', () => {
  let admin;
  beforeEach(async () => {
    await resetDb();
    admin = await loginAs('ADMIN');
  });

  it('previews rows with errors and warnings', async () => {
    const file = await xlsx([
      ['LR Taxi Services vehicle list'],
      MASTER_HEADERS,
      [1, 'DL 1C-AB 1234', 'Dzire ', 'CNG/Petrol', 2022, 'DRIVER', 'Ramesh Kumar', '9810012345', 'Ops', 'Commercial'],
      [2, 'DL1CAB1234', 'Dzire', 'CNG/Petrol', 2022, 'DRIVER', 'Someone', '9810099999', 'Ops', 'Commercial'],
      [3, 'HR26XY0001', 'Ciaz', 'Rocket fuel', 2022, 'DRIVER', 'Suresh', '9810011111', 'Ops', ''],
      [4, 'HR26XY0002', 'Ciaz', 'Petrol', 2022, 'DRIVER', 'Mahesh', '9810012345', 'Ops', 'Commercial'],
    ]);
    const r = await admin.post('/api/master/preview').attach('file', file, 'master.xlsx');
    expect(r.status).toBe(200);
    expect(r.body.counts).toMatchObject({ total: 4, errors: 2 });
    const [a, dup, badFuel, samePhone] = r.body.rows;
    expect(a).toMatchObject({ number: 'DL1CAB1234', make: 'Dzire', fuelType: 'CNG_PETROL', change: 'new' });
    expect(dup.errors[0]).toMatch(/Same vehicle number/);
    expect(badFuel.errors[0]).toMatch(/Unknown fuel type/);
    expect(badFuel.warnings).toContain('Category is empty');
    expect(samePhone.warnings[0]).toMatch(/also used by Ramesh Kumar/);
  });

  it('saves vehicles, then records status and driver changes from the chosen date', async () => {
    await importMaster(admin, [
      ['DL1CAB1234', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Ramesh Kumar', '9810012345'],
      ['DL1CAB5555', 'Ertiga', 'CNG/Petrol', 'VENDOR', 'Demo Travels', '9000000001'],
    ]);
    const id = await vehicleId('DL1CAB1234');
    let st = await prisma.vehicleStatusHistory.findMany({ where: { vehicleId: id } });
    expect(st).toHaveLength(1);
    expect(st[0].status).toBe('ACTIVE');

    const r = await importMaster(admin, [
      ['DL1CAB1234', 'Dzire', 'CNG/Petrol', 'WORKSHOP CH', '', ''],
      ['DL1CAB5555', 'Ertiga', 'CNG/Petrol', 'VENDOR', 'Demo Travels', '9000000001'],
    ], '2026-10-05');
    expect(r).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    st = await prisma.vehicleStatusHistory.findMany({ where: { vehicleId: id }, orderBy: { fromDate: 'asc' } });
    expect(st.map((s) => [s.status, s.fromDate.toISOString().slice(0, 10), s.toDate?.toISOString().slice(0, 10) ?? null])).toEqual([
      ['ACTIVE', '2026-09-01', '2026-10-04'],
      ['WORKSHOP', '2026-10-05', null],
    ]);
    const dr = await prisma.vehicleDriverHistory.findMany({ where: { vehicleId: id } });
    expect(dr[0].toDate.toISOString().slice(0, 10)).toBe('2026-10-04');
    const v = await prisma.vehicle.findUnique({ where: { number: 'DL1CAB5555' }, include: { vendor: true } });
    expect(v.ownership).toBe('VENDOR');
    expect(v.vendor.name).toBe('Demo Travels');
  });
});

describe('GPS KM upload', () => {
  let admin, kmuser;
  const GPS_HEAD = ['Sr No', 'Vehicle Name', 'Start Time', 'End Time', 'Start Odometer', 'Distance (KM)'];
  beforeEach(async () => {
    await resetDb();
    admin = await loginAs('ADMIN');
    kmuser = await loginAs('KM_USER');
    await importMaster(admin, [
      ['DL1CAB1234', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Ramesh Kumar', '9810012345'],
      ['DL1CAB5678', 'Dzire', 'CNG/Petrol', 'DRIVER', 'Suresh Singh', '9810012346'],
    ]);
  });

  const gpsFile = () =>
    xlsx([
      ['Distance Report 10-10-2026 to 11-10-2026'],
      GPS_HEAD,
      [1, 'DL 1C AB 1234', '10-10-2026 08:00:00', '10-10-2026 12:00:00', 1000, 50],
      [2, 'DL 1C AB 1234', '10-10-2026 14:00:00', '10-10-2026 18:00:00', 1050, 30.5],
      [3, 'DL1CAB5678 (1)', '10-10-2026 08:00:00', '', 2000, 120],
      [4, '14936', '10-10-2026 08:00:00', '', 0, 80],
      [5, 'DL1CAB1234', '11-10-2026 09:00:00', '', 1080, 90],
      [6, 'DL1CAB1234', '09-10-2026 09:00:00', '', 900, 70],
      ['', 'Total', '', '', '', 370.5],
    ]);

  it('previews: adds trips, ignores (1), drops unknown devices and rows outside the range', async () => {
    const r = await kmuser.post('/api/km/preview').field('from', '2026-10-10').field('to', '2026-10-12').attach('file', await gpsFile(), 'gps.xlsx');
    expect(r.status).toBe(200);
    expect(r.body.mapping).toEqual({ vehicle: 1, km: 5, date: 2 });
    expect(r.body.days.map((d) => [d.number, d.date, d.km])).toEqual([
      ['DL1CAB1234', '2026-10-10', 80.5],
      ['DL1CAB5678', '2026-10-10', 120],
      ['DL1CAB1234', '2026-10-11', 90],
    ]);
    expect(r.body.dropped).toEqual([{ device: '14936', rows: 1 }]);
    expect(r.body.counts.outside).toBe(1);
    expect(r.body.missingDays).toEqual(['2026-10-12']);
  });

  it('skips or replaces days that already have KM, and Undo restores them', async () => {
    const up1 = await kmuser.post('/api/km/commit').field('from', '2026-10-10').field('to', '2026-10-11').attach('file', await gpsFile(), 'gps.xlsx');
    expect(up1.body).toMatchObject({ saved: 3 });

    const second = await xlsx([GPS_HEAD, [1, 'DL1CAB1234', '10-10-2026 08:00', '', 0, 99], [2, 'DL1CAB5678', '10-10-2026 08:00', '', 0, 120]]);
    const pv = await kmuser.post('/api/km/preview').field('from', '2026-10-10').field('to', '2026-10-10').attach('file', second, 'gps2.xlsx');
    expect(pv.body.counts).toMatchObject({ duplicates: 1, same: 1, newDays: 0 });
    const key = `${pv.body.duplicates[0].vehicleId}|2026-10-10`;

    // The KM user's Replace goes to the Admin as a request.
    const byUser = await kmuser.post('/api/km/commit').field('from', '2026-10-10').field('to', '2026-10-10').field('replace', JSON.stringify([key])).attach('file', second, 'gps2.xlsx');
    expect(byUser.body).toMatchObject({ saved: 0, replaced: 0, requested: 1 });
    const id = await vehicleId('DL1CAB1234');
    const row = () => prisma.dailyKm.findUnique({ where: { vehicleId_date: { vehicleId: id, date: new Date('2026-10-10T00:00:00Z') } } });
    expect(Number((await row()).km)).toBe(80.5);

    // The Admin's Replace is applied at once; Undo puts the old value back.
    const byAdmin = await admin.post('/api/km/commit').field('from', '2026-10-10').field('to', '2026-10-10').field('replace', JSON.stringify([key])).attach('file', second, 'gps3.xlsx');
    expect(byAdmin.body).toMatchObject({ replaced: 1 });
    expect(Number((await row()).km)).toBe(99);
    const undo = await admin.post(`/api/km/uploads/${byAdmin.body.uploadId}/undo`);
    expect(undo.body).toEqual({ removed: 0, restored: 1 });
    expect(Number((await row()).km)).toBe(80.5);

    // Undo of the first upload removes its rows.
    expect((await kmuser.post(`/api/km/uploads/${up1.body.uploadId}/undo`)).status).toBe(403);
    const undo1 = await admin.post(`/api/km/uploads/${up1.body.uploadId}/undo`);
    expect(undo1.body).toEqual({ removed: 3, restored: 0 });
    expect(await prisma.dailyKm.count()).toBe(0);
  });

  it('uses the title date when there is no date column, and refuses ranges over 2 months', async () => {
    const file = await xlsx([['Daily distance report for 10-10-2026'], ['Device', 'KMs Travelled'], ['DL1CAB1234', 44]]);
    const r = await kmuser.post('/api/km/preview').field('from', '2026-10-01').field('to', '2026-10-12').attach('file', file, 'gps.xlsx');
    expect(r.body.days).toEqual([expect.objectContaining({ date: '2026-10-10', km: 44 })]);
    const long = await kmuser.post('/api/km/preview').field('from', '2026-06-01').field('to', '2026-10-12').attach('file', file, 'gps.xlsx');
    expect(long.status).toBe(400);
  });
});
