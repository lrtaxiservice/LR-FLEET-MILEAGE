import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { FUEL_LABEL, OWNERSHIP_LABEL, addDays, dmy, inr, monthLabel, nf, todayIST } from '../format.js';
import { Badge, Banner, Button, Empty, ErrorText, Loading, PageHead, Plate, TableWrap, Tabs, Tile, useLoad } from '../ui.jsx';

const STATUS_TONE = { OK: 'green', ATTENTION: 'red', NOT_ENOUGH: 'gray', NO_FUEL: 'amber', NO_KM: 'amber', MULTI_DAY: 'gray' };

function periodParams(p) {
  if (p.mode === 'daily') return { mode: 'daily', date: p.date };
  if (p.mode === 'monthly') return { mode: 'monthly', month: p.month };
  return { mode: 'custom', from: p.from, to: p.to };
}

export default function Mileage() {
  const t = todayIST();
  const [p, setP] = useState({ mode: 'monthly', month: t.slice(0, 7), date: addDays(t, -1), from: t.slice(0, 8) + '01', to: t });
  const [view, setView] = useState('vehicles');
  const params = periodParams(p);
  const key = JSON.stringify(params);
  const [rep, error] = useLoad(() => api('/mileage' + qs(params)), [key]);
  const [drv, dErr] = useLoad(() => (view === 'drivers' ? api('/mileage/drivers' + qs(params)) : Promise.resolve(null)), [key, view]);

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Mileage" sub="Average = KM ÷ fuel on Active days. CNG/Petrol adds CNG kg and Petrol L together. Electric is compared on ₹ per km. The benchmark is the median of the same model and fuel type in the same period.">
        <a href={'/api/mileage/export.xlsx' + qs(params)}>
          <Button>Download Excel</Button>
        </a>
      </PageHead>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {['daily', 'monthly', 'custom'].map((m) => (
            <button key={m} type="button" onClick={() => setP({ ...p, mode: m })} className={`rounded px-3 py-1.5 text-sm font-semibold ${p.mode === m ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
              {m === 'daily' ? 'Daily' : m === 'monthly' ? 'Monthly' : 'Custom'}
            </button>
          ))}
        </div>
        {p.mode === 'daily' && <label className="label">Date<input className="input" type="date" max={t} value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></label>}
        {p.mode === 'monthly' && <label className="label">Month<input className="input" type="month" max={t.slice(0, 7)} value={p.month} onChange={(e) => setP({ ...p, month: e.target.value })} /></label>}
        {p.mode === 'custom' && (
          <>
            <label className="label">From<input className="input" type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></label>
            <label className="label">To<input className="input" type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></label>
          </>
        )}
      </div>

      {error && <ErrorText error={error} />}
      {!rep && !error && <Loading />}
      {rep && (
        <>
          <h2 className="text-lg font-bold">{p.mode === 'monthly' ? monthLabel(p.month) : p.mode === 'daily' ? dmy(rep.from) : `${dmy(rep.from)} – ${dmy(rep.to)}`}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="KM (active days)" value={nf(rep.totals.km)} sub={`${rep.totals.vehicles} company vehicles`} />
            <Tile label="Fuel spend" value={inr(rep.totals.amount)} />
            <Tile label="Cost per km" value={rep.totals.costPerKm != null ? inr(rep.totals.costPerKm, 2) : '—'} sub="Total ₹ ÷ total KM" />
            <Tile label="Needs Attention" value={rep.totals.attention} alert={rep.totals.attention > 0} sub={`More than ${rep.settings.attentionPercent}% worse than the benchmark`} />
          </div>
          {rep.missingGpsDays.length > 0 && (
            <Banner tone="amber">
              <b>GPS KM missing for {rep.missingGpsDays.length} day{rep.missingGpsDays.length === 1 ? '' : 's'}</b>
              {rep.missingGpsDays.length <= 10 ? `: ${rep.missingGpsDays.map(dmy).join(', ')}` : ''}. Averages read low until those days are uploaded.
            </Banner>
          )}
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { value: 'vehicles', label: 'By vehicle', count: rep.rows.length },
              { value: 'drivers', label: 'By driver' },
              { value: 'others', label: 'Vendor / Others', count: rep.others.length },
            ]}
          />
          {view === 'vehicles' && <VehicleTable rows={rep.rows} />}
          {view === 'drivers' && (dErr ? <ErrorText error={dErr} /> : !drv ? <Loading /> : <DriverTable rows={drv.rows} />)}
          {view === 'others' && <OthersTable rows={rep.others} />}
        </>
      )}
    </div>
  );
}

const fuelCell = (r) => {
  if (r.fuelType === 'ELECTRIC') return '—';
  const parts = [];
  if (r.cng) parts.push(`${nf(r.cng, 1)} kg`);
  if (r.petrol) parts.push(`${nf(r.petrol, 1)} L`);
  if (r.diesel) parts.push(`${nf(r.diesel, 1)} L`);
  return parts.join(' + ') || '—';
};

function useSort(rows, initial) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const out = [...rows];
    const f = sort.f;
    out.sort((a, b) => {
      const x = f(a);
      const y = f(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return out;
  }, [rows, sort]);
  const th = (label, f, cls = '') => (
    <th className={`th ${cls}`}>
      <button type="button" className="uppercase" onClick={() => setSort({ label, f, dir: sort.label === label ? -sort.dir : 1 })}>
        {label}
        {sort.label === label ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
  return [sorted, th];
}

const STATUS_ORDER = { ATTENTION: 0, NO_KM: 1, NO_FUEL: 2, NOT_ENOUGH: 3, MULTI_DAY: 4, OK: 5 };

function VehicleTable({ rows }) {
  const [filter, setFilter] = useState('all');
  const list = rows.filter((r) => filter === 'all' || r.status === filter);
  const [sorted, th] = useSort(list, { label: 'Status', f: (r) => STATUS_ORDER[r.status] * 1000 - (r.worseByPercent || 0), dir: 1 });
  const count = (s) => rows.filter((r) => r.status === s).length;
  if (!rows.length) return <Empty>No company vehicles with KM or fuel in this period.</Empty>;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {[
          ['all', 'All', rows.length],
          ['ATTENTION', 'Needs Attention', count('ATTENTION')],
          ['NO_FUEL', 'No fuel entry', count('NO_FUEL')],
          ['NO_KM', 'No KM', count('NO_KM')],
          ['NOT_ENOUGH', 'Not enough data', count('NOT_ENOUGH')],
        ].map(([v, l, n]) => (
          <button key={v} type="button" onClick={() => setFilter(v)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${filter === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>
            {l} <span className="opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <TableWrap>
        <table className="w-full">
          <thead>
            <tr>
              {th('Vehicle', (r) => r.number)}
              {th('Model', (r) => r.make + r.fuelType)}
              <th className="th">Driver</th>
              {th('KM', (r) => r.km, 'num')}
              <th className="th num">Fuel</th>
              {th('Amount', (r) => r.amount, 'num')}
              {th('Average', (r) => r.average ?? -1, 'num')}
              <th className="th num">Benchmark</th>
              {th('Status', (r) => STATUS_ORDER[r.status] * 1000 - (r.worseByPercent || 0))}
              {th('₹/km', (r) => r.costPerKm ?? -1, 'num')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.vehicleId} className={r.status === 'ATTENTION' ? 'bg-red-50/60' : ''}>
                <td className="td"><Link to={`/vehicles/${r.vehicleId}`}><Plate n={r.number} /></Link></td>
                <td className="td">{r.make}<div className="text-xs text-slate-500">{FUEL_LABEL[r.fuelType]}</div></td>
                <td className="td max-w-[12rem] truncate" title={r.drivers.join(', ')}>{r.drivers.join(', ') || '—'}</td>
                <td className="td num">{nf(r.km)}<div className="text-xs text-slate-500">{r.activeDays} active day{r.activeDays === 1 ? '' : 's'}</div></td>
                <td className="td num">{fuelCell(r)}</td>
                <td className="td num">{r.amount ? inr(r.amount) : '—'}</td>
                <td className="td num font-semibold">{r.average != null ? <>{nf(r.average, 2)} <span className="text-xs font-normal text-slate-500">{r.unit}</span></> : '—'}</td>
                <td className="td num">{r.benchmark != null ? nf(r.benchmark, 2) : '—'}</td>
                <td className="td">
                  <Badge tone={STATUS_TONE[r.status]}>{r.statusLabel}</Badge>
                  {r.status === 'ATTENTION' && <div className="text-xs font-semibold text-red-700">{nf(r.worseByPercent, 1)}% worse</div>}
                  {r.status === 'NOT_ENOUGH' && <div className="text-xs text-slate-500">{r.comparable} comparable</div>}
                </td>
                <td className="td num">{r.costPerKm != null ? inr(r.costPerKm, 2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}

function DriverTable({ rows }) {
  const [sorted, th] = useSort(rows, { label: 'Driver', f: (r) => r.driver, dir: 1 });
  if (!rows.length) return <Empty>No driver KM or fuel in this period.</Empty>;
  return (
    <TableWrap>
      <table className="w-full">
        <thead>
          <tr>
            {th('Driver', (r) => r.driver)}
            {th('Vehicle', (r) => r.number)}
            {th('KM', (r) => r.km, 'num')}
            <th className="th num">Fuel</th>
            {th('Amount', (r) => r.amount, 'num')}
            {th('Average', (r) => r.average ?? -1, 'num')}
            <th className="th num">Benchmark</th>
            {th('Status', (r) => STATUS_ORDER[r.status] * 1000 - (r.worseByPercent || 0))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={`${r.driverId}|${r.vehicleId}`}>
              <td className="td">{r.driver}{r.govt && <> <Badge tone="blue">Govt</Badge></>}<div className="text-xs text-slate-500">{r.phone}</div></td>
              <td className="td"><Plate n={r.number} /><div className="text-xs text-slate-500">{r.make}</div></td>
              <td className="td num">{nf(r.km)}<div className="text-xs text-slate-500">{r.days} day{r.days === 1 ? '' : 's'} with KM</div></td>
              <td className="td num">{fuelCell(r)}</td>
              <td className="td num">{r.amount ? inr(r.amount) : '—'}</td>
              <td className="td num font-semibold">{r.average != null ? <>{nf(r.average, 2)} <span className="text-xs font-normal text-slate-500">{r.unit}</span></> : '—'}</td>
              <td className="td num">{r.benchmark != null ? nf(r.benchmark, 2) : '—'}</td>
              <td className="td"><Badge tone={STATUS_TONE[r.status]}>{r.statusLabel}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function OthersTable({ rows }) {
  const [sorted, th] = useSort(rows, { label: 'KM', f: (r) => r.km, dir: -1 });
  if (!rows.length) return <Empty>No vendor, officer or personal vehicles.</Empty>;
  return (
    <TableWrap>
      <table className="w-full">
        <thead>
          <tr>
            {th('Vehicle', (r) => r.number)}
            <th className="th">Model</th>
            {th('Type', (r) => r.ownership)}
            {th('Vendor / holder', (r) => r.holder || '')}
            <th className="th">Department</th>
            {th('KM', (r) => r.km, 'num')}
            <th className="th num">Days with KM</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.vehicleId}>
              <td className="td"><Link to={`/vehicles/${r.vehicleId}`}><Plate n={r.number} /></Link></td>
              <td className="td">{r.make}</td>
              <td className="td">{OWNERSHIP_LABEL[r.ownership]}</td>
              <td className="td">{r.holder || '—'}<div className="text-xs text-slate-500">{r.holderContact}</div></td>
              <td className="td">{r.department || '—'}</td>
              <td className="td num font-semibold">{nf(r.km)}</td>
              <td className="td num">{r.daysWithKm}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
