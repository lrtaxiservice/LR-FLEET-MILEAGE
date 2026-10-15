import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { h } from '../lib/http.js';
import { can } from '../lib/auth.js';
import { todayIST, addDays, monthStart, toDb, fromDb } from '../lib/dates.js';
import { loadTimelines, current } from '../services/timeline.js';
import { mileageReport, missingGpsDays } from '../services/mileage.js';

const r = Router();

/** The numbers each role needs on its home page. */
r.get(
  '/',
  h(async (req, res) => {
    const today = todayIST();
    const yesterday = addDays(today, -1);
    const out = { today };

    const vehicles = await prisma.vehicle.findMany({ select: { id: true, ownership: true } });
    const tl = await loadTimelines(prisma);
    const counts = { active: 0, workshop: 0, idle: 0, sold: 0, others: 0 };
    for (const v of vehicles) {
      const st = current(tl.get(v.id)?.statuses || [])?.status;
      if (st === 'SOLD') counts.sold++;
      else if (v.ownership !== 'COMPANY') counts.others++;
      else if (st === 'ACTIVE') counts.active++;
      else if (st === 'WORKSHOP') counts.workshop++;
      else counts.idle++;
    }
    out.vehicles = counts;

    const last = await prisma.dailyKm.findFirst({ orderBy: { date: 'desc' }, select: { date: true } });
    out.lastGpsDate = last ? fromDb(last.date) : null;
    const ms = monthStart(yesterday);
    out.missingGpsDays = vehicles.length ? await missingGpsDays(prisma, ms, yesterday) : [];

    if (can(req.user, 'fuel')) {
      out.fuelToday = await prisma.fuelEntry.count({ where: { createdAt: { gte: new Date(toDb(today).getTime() - 5.5 * 3600000) } } });
      out.myFuelToday = await prisma.fuelEntry.count({ where: { enteredById: req.user.id, createdAt: { gte: new Date(toDb(today).getTime() - 5.5 * 3600000) } } });
    }
    if (can(req.user, 'reports')) {
      const rep = await mileageReport(prisma, ms, yesterday < ms ? ms : yesterday, { mode: 'monthly' });
      out.month = { from: ms, to: yesterday, ...rep.totals };
      out.attention = rep.rows.filter((x) => x.status === 'ATTENTION').sort((a, b) => b.worseByPercent - a.worseByPercent).slice(0, 8)
        .map((x) => ({ vehicleId: x.vehicleId, number: x.number, make: x.make, average: x.average, unit: x.unit, benchmark: x.benchmark, worseByPercent: x.worseByPercent, drivers: x.drivers }));
    }
    const pendingWhere = req.user.role === 'ADMIN' ? { state: 'PENDING' } : { state: 'PENDING', requestedBy: req.user.id };
    out.pendingRequests = await prisma.correctionRequest.count({ where: pendingWhere });
    res.json(out);
  }),
);

export default r;
