import { useMemo, useState } from 'react';
import { api, qs } from '../api.js';
import { useUser } from '../user.js';
import { can, dmy, inr, nf, todayIST, addDays, showPlate } from '../format.js';
import { Button, Empty, ErrorText, Loading, Modal, PageHead, Plate, TableWrap, Tabs, useLoad, useToast } from '../ui.jsx';
import { fuelText } from './VehicleDetail.jsx';

/** Type a vehicle number and pick it from the list. */
export function VehiclePicker({ vehicles, value, onChange }) {
  const current = vehicles.find((v) => v.id === value);
  const [text, setText] = useState(current ? showPlate(current.number) : '');
  const options = useMemo(() => vehicles.filter((v) => v.tab !== 'sold'), [vehicles]);
  return (
    <label className="label">
      Vehicle
      <input
        className="input"
        list="vehicle-options"
        placeholder="Type the number, e.g. DL1CAB1234"
        autoCapitalize="characters"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const v = options.find((x) => x.number === n);
          onChange(v ? v.id : null);
        }}
      />
      <datalist id="vehicle-options">
        {options.map((v) => <option key={v.id} value={showPlate(v.number)}>{v.make}</option>)}
      </datalist>
      {current && <span className="font-normal text-slate-500">{current.make} · {current.driver?.name || current.vendor?.name || ''}</span>}
    </label>
  );
}

export default function MyEntries() {
  const { user } = useUser();
  const admin = user.role === 'ADMIN';
  const [tab, setTab] = useState(can(user, 'fuel') && user.role !== 'KM_USER' ? 'fuel' : 'km');
  const [range, setRange] = useState({ from: addDays(todayIST(), -30), to: todayIST() });
  const [fuel, fErr, reloadF] = useLoad(() => (tab === 'fuel' ? api('/fuel/entries' + qs({ ...range, mine: admin ? '' : 1 })) : Promise.resolve(null)), [tab, range.from, range.to]);
  const [km, kErr, reloadK] = useLoad(() => (tab === 'km' ? api('/km/daily' + qs({ ...range, mine: admin ? '' : 1, source: 'MANUAL' })) : Promise.resolve(null)), [tab, range.from, range.to]);
  const [edit, setEdit] = useState(null);

  const tabs = [];
  if (can(user, 'fuel')) tabs.push({ value: 'fuel', label: 'Fuel entries' });
  if (can(user, 'km')) tabs.push({ value: 'km', label: 'Manual KM' });

  return (
    <div>
      <PageHead
        title={admin ? 'Entries' : 'My entries'}
        sub={admin ? 'Fuel entries and manual KM. As Admin you can change or delete them directly; every change is logged.' : 'What you entered. To fix a mistake, send a correction request to the Admin.'}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="label">From<input className="input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="label">To<input className="input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>
      {tab === 'fuel' && (fErr ? <ErrorText error={fErr} /> : !fuel ? <Loading /> : fuel.entries.length === 0 ? <Empty>No fuel entries in these dates.</Empty> : (
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className="th">Dates</th><th className="th">Vehicle</th><th className="th num">Fuel</th><th className="th num">Amount</th><th className="th">Bill / station</th>{admin && <th className="th">By</th>}<th className="th"></th></tr></thead>
            <tbody>
              {fuel.entries.map((e) => (
                <tr key={e.id}>
                  <td className="td">{dmy(e.from)}{e.to !== e.from ? ` – ${dmy(e.to)}` : ''}</td>
                  <td className="td"><Plate n={e.number} /></td>
                  <td className="td num">{fuelText(e)}</td>
                  <td className="td num">{inr(e.amount, 2)}</td>
                  <td className="td text-xs text-slate-600">{[e.billNo, e.station].filter(Boolean).join(' · ') || '—'}</td>
                  {admin && <td className="td text-xs">{e.enteredBy}</td>}
                  <td className="td"><Button size="sm" onClick={() => setEdit({ kind: 'fuel', row: e })}>{admin ? 'Edit' : 'Request correction'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ))}
      {tab === 'km' && (kErr ? <ErrorText error={kErr} /> : !km ? <Loading /> : km.rows.length === 0 ? <Empty>No manual KM in these dates.</Empty> : (
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className="th">Date</th><th className="th">Vehicle</th><th className="th num">KM</th>{admin && <th className="th">By</th>}<th className="th"></th></tr></thead>
            <tbody>
              {km.rows.map((k) => (
                <tr key={k.id}>
                  <td className="td">{dmy(k.date)}</td>
                  <td className="td"><Plate n={k.number} /></td>
                  <td className="td num">{nf(k.km, 1)}</td>
                  {admin && <td className="td text-xs">{k.enteredBy}</td>}
                  <td className="td"><Button size="sm" onClick={() => setEdit({ kind: 'km', row: k })}>{admin ? 'Edit' : 'Request correction'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ))}
      {edit && <CorrectionModal edit={edit} admin={admin} onClose={() => setEdit(null)} onDone={() => { setEdit(null); edit.kind === 'fuel' ? reloadF() : reloadK(); }} />}
    </div>
  );
}

/** Admin: edit or delete directly. Others: send a correction request with a reason. */
function CorrectionModal({ edit, admin, onClose, onDone }) {
  const toast = useToast();
  const r = edit.row;
  const isFuel = edit.kind === 'fuel';
  const [del, setDel] = useState(false);
  const [f, setF] = useState(isFuel ? { from: r.from, to: r.to, petrolL: r.petrolL ?? '', dieselL: r.dieselL ?? '', cngKg: r.cngKg ?? '', amount: r.amount ?? '', billNo: r.billNo ?? '' } : { km: r.km });
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const changes = () => {
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const c = {};
    if (f.from !== r.from) c.from = f.from;
    if (f.to !== r.to) c.to = f.to;
    for (const k of ['petrolL', 'dieselL', 'cngKg']) if (n(f[k]) !== (r[k] ?? null)) c[k] = n(f[k]);
    if (n(f.amount) !== r.amount) c.amount = n(f.amount);
    if ((f.billNo || null) !== (r.billNo || null)) c.billNo = f.billNo || null;
    return c;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (admin) {
        const base = isFuel ? `/fuel/entries/${r.id}` : `/km/daily/${r.id}`;
        if (del) await api(base, { method: 'DELETE' });
        else await api(base, { method: 'PATCH', body: isFuel ? changes() : { km: Number(f.km) } });
        toast(del ? 'Deleted.' : 'Saved.');
      } else {
        const body = isFuel
          ? { type: del ? 'FUEL_DELETE' : 'FUEL_EDIT', targetId: r.id, changes: del ? undefined : changes(), reason }
          : { type: del ? 'KM_DELETE' : 'KM_EDIT', targetId: r.id, newKm: del ? undefined : Number(f.km), reason };
        await api('/corrections', { method: 'POST', body });
        toast('Request sent to the Admin.');
      }
      onDone();
    } catch (x) {
      setError(x.message);
    }
  };

  const num = (k, label) => (
    <label className="label">
      {label}
      <input className="input" type="number" inputMode="decimal" min="0" step="0.01" value={f[k]} disabled={del} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );

  return (
    <Modal title={`${admin ? 'Edit' : 'Correct'} ${isFuel ? 'fuel entry' : 'KM'} · ${showPlate(r.number)}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} /> {admin ? 'Delete this entry' : 'Ask to delete this entry'}
        </label>
        {isFuel ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">From<input className="input" type="date" value={f.from} disabled={del} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
              <label className="label">To<input className="input" type="date" value={f.to} disabled={del} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
              {(r.fuelType === 'PETROL' || r.fuelType === 'CNG_PETROL') && num('petrolL', 'Petrol L')}
              {r.fuelType === 'DIESEL' && num('dieselL', 'Diesel L')}
              {(r.fuelType === 'CNG' || r.fuelType === 'CNG_PETROL') && num('cngKg', 'CNG kg')}
              {num('amount', 'Amount ₹')}
            </div>
            <label className="label">Bill / slip no.<input className="input" value={f.billNo} disabled={del} onChange={(e) => setF({ ...f, billNo: e.target.value })} /></label>
          </>
        ) : (
          num('km', `KM on ${dmy(r.date)}`)
        )}
        {!admin && (
          <label className="label">
            Why? (the Admin sees this)
            <input className="input" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. typed 10 instead of 12" />
          </label>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={del ? 'danger' : 'primary'}>{admin ? (del ? 'Delete' : 'Save') : 'Send request'}</Button>
        </div>
      </form>
    </Modal>
  );
}
