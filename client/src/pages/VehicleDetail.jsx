import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useUser } from '../user.js';
import { FUEL_LABEL, OWNERSHIP_LABEL, STATUS_LABEL, dmy, nf, inr, todayIST } from '../format.js';
import { Badge, Button, Card, ErrorText, Loading, PageHead, Plate, TableWrap, useLoad, useToast, Empty } from '../ui.jsx';

export default function VehicleDetail() {
  const { id } = useParams();
  const { user } = useUser();
  const admin = user.role === 'ADMIN';
  const [d, error, reload] = useLoad(() => api(`/vehicles/${id}`), [id]);
  if (error) return <ErrorText error={error} />;
  if (!d) return <Loading />;
  const v = d.vehicle;
  const st = d.statuses[0];
  const dr = d.drivers.find((x) => !x.to);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm"><Link to="/vehicles" className="text-brand-600 hover:underline">← Vehicles</Link></div>
      <PageHead title={<Plate n={v.number} />} sub={`${v.make}${v.modelYear ? ` · ${v.modelYear}` : ''} · ${FUEL_LABEL[v.fuelType]} · ${OWNERSHIP_LABEL[v.ownership]}`} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs font-semibold uppercase text-slate-500">Status</div>
          <div className="mt-1 text-lg font-bold">{STATUS_LABEL[st?.status] || '—'} {st?.place && <span className="text-base font-medium text-slate-600">· {st.place}</span>}</div>
          {st && <div className="text-xs text-slate-500">since {dmy(st.from)}</div>}
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase text-slate-500">{v.ownership === 'COMPANY' ? 'Driver' : 'Vendor / holder'}</div>
          {v.ownership === 'COMPANY' ? (
            <div className="mt-1 text-lg font-bold">{dr ? dr.name : '—'} {dr?.govt && <Badge tone="blue">Govt</Badge>}<div className="text-sm font-normal text-slate-500">{dr?.phone}</div></div>
          ) : (
            <div className="mt-1 text-lg font-bold">{v.vendor?.name || '—'}<div className="text-sm font-normal text-slate-500">{v.vendor?.contact}</div></div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase text-slate-500">Details</div>
          <div className="mt-1 text-sm">Department: <b>{v.department || '—'}</b></div>
          <div className="text-sm">Category: <b>{v.category ? (v.category === 'COMMERCIAL' ? 'Commercial' : 'Private') : <span className="text-amber-700">not set</span>}</b></div>
        </Card>
      </div>

      {admin && <AdminForms v={v} onDone={reload} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <History title="Status history" rows={d.statuses} cols={[['Status', (x) => <>{STATUS_LABEL[x.status]}{x.place ? ` · ${x.place}` : ''}</>]]} />
        <History title="Driver history" rows={d.drivers} cols={[['Driver', (x) => <>{x.name} {x.govt && <Badge tone="blue">Govt</Badge>}<span className="ml-1 text-xs text-slate-500">{x.phone}</span></>]]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-bold">KM, last 60 days</h2>
          {d.km.length === 0 ? <Empty>No KM saved.</Empty> : (
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className="th">Date</th><th className="th num">KM</th><th className="th">Source</th></tr></thead>
                <tbody>{d.km.map((k) => <tr key={k.id}><td className="td">{dmy(k.date)}</td><td className="td num">{nf(k.km, 1)}</td><td className="td text-xs text-slate-500">{k.source === 'UPLOAD' ? `GPS upload #${k.uploadId ?? ''}` : 'Manual'}</td></tr>)}</tbody>
              </table>
            </TableWrap>
          )}
        </div>
        <div>
          <h2 className="mb-2 font-bold">Recent fuel entries</h2>
          {d.fuel.length === 0 ? <Empty>No fuel entries.</Empty> : (
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className="th">Dates</th><th className="th num">Fuel</th><th className="th num">Amount</th><th className="th">By</th></tr></thead>
                <tbody>{d.fuel.map((f) => <tr key={f.id}><td className="td">{dmy(f.from)}{f.to !== f.from ? ` – ${dmy(f.to)}` : ''}</td><td className="td num">{fuelText(f)}</td><td className="td num">{inr(f.amount)}</td><td className="td text-xs text-slate-500">{f.enteredBy}</td></tr>)}</tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </div>
    </div>
  );
}

export function fuelText(f) {
  const p = [];
  if (f.cngKg) p.push(`${nf(f.cngKg, 2)} kg CNG`);
  if (f.petrolL) p.push(`${nf(f.petrolL, 2)} L petrol`);
  if (f.dieselL) p.push(`${nf(f.dieselL, 2)} L diesel`);
  return p.join(' + ') || '—';
}

function History({ title, rows, cols }) {
  return (
    <div>
      <h2 className="mb-2 font-bold">{title}</h2>
      {rows.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <TableWrap>
          <table className="w-full">
            <thead><tr>{cols.map((c) => <th key={c[0]} className="th">{c[0]}</th>)}<th className="th">From</th><th className="th">To</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c[0]} className="td">{c[1](r)}</td>)}<td className="td">{dmy(r.from)}</td><td className="td">{r.to ? dmy(r.to) : <Badge tone="green">now</Badge>}</td></tr>)}</tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

function AdminForms({ v, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState({ status: 'ACTIVE', place: '', from: todayIST() });
  const [driver, setDriver] = useState({ name: '', phone: '', govt: false, from: todayIST() });
  const [edit, setEdit] = useState({ make: v.make, fuelType: v.fuelType, modelYear: v.modelYear || '', category: v.category || '', department: v.department || '', ownership: v.ownership });
  const [err, setErr] = useState({});
  const run = (key, fn) => async (e) => {
    e.preventDefault();
    setErr({});
    try {
      await fn();
      toast('Saved.');
      onDone();
    } catch (x) {
      setErr({ [key]: x.message });
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <h3 className="mb-3 font-bold">Change status</h3>
        <form className="flex flex-col gap-2" onSubmit={run('status', () => api(`/vehicles/${v.id}/status`, { method: 'POST', body: { ...status, place: status.place || null } }))}>
          <select className="input" value={status.status} onChange={(e) => setStatus({ ...status, status: e.target.value })}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="input" placeholder="Place, e.g. Workshop CH or Lodhi Road" value={status.place} onChange={(e) => setStatus({ ...status, place: e.target.value })} />
          <label className="label">From<input className="input" type="date" value={status.from} onChange={(e) => setStatus({ ...status, from: e.target.value })} /></label>
          <ErrorText error={err.status} />
          <Button type="submit" variant="primary">Save status</Button>
        </form>
      </Card>
      {v.ownership === 'COMPANY' && (
        <Card>
          <h3 className="mb-3 font-bold">Change driver</h3>
          <form className="flex flex-col gap-2" onSubmit={run('driver', () => api(`/vehicles/${v.id}/driver`, { method: 'POST', body: driver.name ? driver : { driverId: null, from: driver.from } }))}>
            <input className="input" placeholder="Driver name (leave empty for no driver)" value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} />
            <input className="input" placeholder="Phone (driver ID)" inputMode="tel" value={driver.phone} onChange={(e) => setDriver({ ...driver, phone: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={driver.govt} onChange={(e) => setDriver({ ...driver, govt: e.target.checked })} /> Govt driver</label>
            <label className="label">From<input className="input" type="date" value={driver.from} onChange={(e) => setDriver({ ...driver, from: e.target.value })} /></label>
            <ErrorText error={err.driver} />
            <Button type="submit" variant="primary">Save driver</Button>
          </form>
        </Card>
      )}
      <Card>
        <h3 className="mb-3 font-bold">Edit details</h3>
        <form
          className="flex flex-col gap-2"
          onSubmit={run('edit', () => api(`/vehicles/${v.id}`, { method: 'PATCH', body: { ...edit, modelYear: edit.modelYear ? Number(edit.modelYear) : null, category: edit.category || null, department: edit.department || null } }))}
        >
          <input className="input" value={edit.make} onChange={(e) => setEdit({ ...edit, make: e.target.value })} aria-label="Make / model" />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={edit.fuelType} onChange={(e) => setEdit({ ...edit, fuelType: e.target.value })} aria-label="Fuel">
              {Object.entries(FUEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input className="input" type="number" placeholder="Year" value={edit.modelYear} onChange={(e) => setEdit({ ...edit, modelYear: e.target.value })} aria-label="Model year" />
            <select className="input" value={edit.ownership} onChange={(e) => setEdit({ ...edit, ownership: e.target.value })} aria-label="Ownership">
              {Object.entries(OWNERSHIP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} aria-label="Category">
              <option value="">Category…</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>
          <input className="input" placeholder="Department / client" value={edit.department} onChange={(e) => setEdit({ ...edit, department: e.target.value })} />
          <ErrorText error={err.edit} />
          <Button type="submit">Save details</Button>
        </form>
      </Card>
    </div>
  );
}
