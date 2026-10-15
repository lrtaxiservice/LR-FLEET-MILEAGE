import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api.js';
import { FUEL_LABEL, dmy, inr, todayIST } from '../format.js';
import { Badge, Banner, Button, Card, Empty, ErrorText, Loading, PageHead, Plate, useToast } from '../ui.jsx';

const QTY = { petrolL: 'Petrol L', dieselL: 'Diesel L', cngKg: 'CNG kg' };
const blank = (r) => !r || ['petrolL', 'dieselL', 'cngKg', 'amount', 'billNo', 'station', 'remarks'].every((k) => !String(r[k] ?? '').trim());

export default function FuelEntry() {
  const toast = useToast();
  const [range, setRange] = useState({ from: todayIST(), to: todayIST() });
  const [vehicles, setVehicles] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [rows, setRows] = useState({});
  const [q, setQ] = useState('');
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!range.from || !range.to) return;
    let live = true;
    setVehicles(null);
    setLoadErr('');
    api('/fuel/vehicles' + qs(range))
      .then((r) => live && setVehicles(r.vehicles))
      .catch((e) => live && setLoadErr(e.message));
    return () => {
      live = false;
    };
  }, [range.from, range.to]);

  const filled = Object.entries(rows).filter(([, r]) => !blank(r));
  const total = filled.reduce((a, [, r]) => a + (Number(r.amount) || 0), 0);
  const shown = useMemo(() => {
    const t = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (vehicles || []).filter((v) => (!t || v.number.includes(t) || v.drivers.join(' ').toUpperCase().includes(q.toUpperCase())) && (!onlyFilled || !blank(rows[v.id])));
  }, [vehicles, q, onlyFilled, rows]);

  const set = (id, k, val) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: val } }));
  const single = range.from === range.to;

  const save = async () => {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const body = {
        from: range.from,
        to: range.to,
        rows: filled.map(([id, r]) => ({
          vehicleId: Number(id),
          petrolL: r.petrolL || null,
          dieselL: r.dieselL || null,
          cngKg: r.cngKg || null,
          amount: r.amount || null,
          billNo: r.billNo || null,
          station: r.station || null,
          remarks: r.remarks || null,
        })),
      };
      const res = await api('/fuel/entries', { method: 'POST', body });
      toast(`${res.saved} fuel entr${res.saved === 1 ? 'y' : 'ies'} saved.`);
      setRows({});
      setOnlyFilled(false);
      setVehicles((vs) => vs.map((v) => (filled.some(([id]) => Number(id) === v.id) ? { ...v, existingEntries: v.existingEntries + 1 } : v)));
    } catch (e) {
      setError(e.message);
      if (e.details) setErrors(Object.fromEntries(e.details.map((d) => [d.vehicleId, d.error])));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <PageHead title="Fuel entry" sub="Pick the dates the bill covers (the same date for one day). Fill in only the vehicles that took fuel; empty rows are ignored." />
      <Card className="flex flex-wrap items-end gap-3">
        <label className="label">From<input className="input" type="date" max={todayIST()} value={range.from} onChange={(e) => setRange({ from: e.target.value, to: e.target.value > range.to ? e.target.value : range.to })} /></label>
        <label className="label">To<input className="input" type="date" max={todayIST()} min={range.from} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <input className="input max-w-xs" type="search" placeholder="Find vehicle or driver" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} /> Only filled</label>
      </Card>
      {!single && <Banner tone="blue">One bill covering {dmy(range.from)} – {dmy(range.to)}. It is spread over the vehicle's Active days by the KM run on each day.</Banner>}
      <ErrorText error={loadErr} />
      {!vehicles && !loadErr && <Loading />}
      {vehicles && vehicles.length === 0 && <Empty>No Company vehicles were Active on these dates.</Empty>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((v) => {
          const r = rows[v.id] || {};
          const err = errors[v.id];
          return (
            <Card key={v.id} className={`flex flex-col gap-2 ${err ? 'border-red-400 ring-2 ring-red-100' : !blank(r) ? 'border-brand-600' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Plate n={v.number} /> <span className="text-sm text-slate-600">{v.make}</span></span>
                <Badge tone="blue">{FUEL_LABEL[v.fuelType]}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>{v.drivers.join(', ') || 'No driver'}</span>
                {v.activeDays < v.totalDays && <span className="text-amber-700">Active {v.activeDays} of {v.totalDays} days</span>}
                {v.existingEntries > 0 && <span className="text-amber-700">{v.existingEntries} entr{v.existingEntries === 1 ? 'y' : 'ies'} already on these dates</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {v.fields.map((k) => (
                  <label key={k} className="label">
                    {QTY[k]}
                    <input className="input-sm" type="number" inputMode="decimal" min="0" step="0.01" value={r[k] ?? ''} onChange={(e) => set(v.id, k, e.target.value)} />
                  </label>
                ))}
                <label className="label">
                  Amount ₹
                  <input className="input-sm" type="number" inputMode="decimal" min="0" step="0.01" value={r.amount ?? ''} onChange={(e) => set(v.id, 'amount', e.target.value)} />
                </label>
                <label className="label">
                  Bill / slip no.
                  <input className="input-sm" maxLength={60} value={r.billNo ?? ''} onChange={(e) => set(v.id, 'billNo', e.target.value)} />
                </label>
                <label className="label">
                  Station / card
                  <input className="input-sm" maxLength={60} list="stations" value={r.station ?? ''} onChange={(e) => set(v.id, 'station', e.target.value)} />
                </label>
              </div>
              <input className="input-sm" maxLength={300} placeholder="Remarks" value={r.remarks ?? ''} onChange={(e) => set(v.id, 'remarks', e.target.value)} />
              {err && <p className="text-sm font-semibold text-red-700">{err}</p>}
            </Card>
          );
        })}
      </div>
      <datalist id="stations">
        {['IGL', 'Indian Oil', 'HP', 'Bharat Petroleum', 'Garuda'].map((s) => <option key={s} value={s} />)}
      </datalist>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-[220px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            <b>{filled.length}</b> vehicle{filled.length === 1 ? '' : 's'} filled · total <b>{inr(total)}</b>
          </span>
          <div className="flex items-center gap-3">
            {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
            <Button variant="primary" onClick={save} disabled={busy || !filled.length}>
              {busy ? 'Saving…' : 'Save fuel entries'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
