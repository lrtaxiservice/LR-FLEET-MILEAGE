import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useUser } from '../user.js';
import { addDays, dmy, nf, todayIST } from '../format.js';
import { Badge, Banner, Button, Card, ErrorText, PageHead, Plate, TableWrap, useToast } from '../ui.jsx';

/** A big file picker that also takes a dropped file. */
export function FilePick({ file, onFile }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center ${over ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-600'}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
    >
      <span className="text-base font-semibold">{file ? file.name : 'Choose or drop the Excel file'}</span>
      <span className="text-sm text-slate-500">{file ? 'Tap to choose a different file' : '.xlsx, .xls or .csv'}</span>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files[0]) onFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

/** Lets the user check and change which column holds what. */
export function MappingCard({ fields, headers, mapping, onChange, onApply, note }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Columns in the file</h3>
        <Button size="sm" onClick={onApply}>Re-check with these columns</Button>
      </div>
      {note && <Banner tone="amber">{note}</Banner>}
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="label">
            {f.label}
            {f.required ? ' *' : ''}
            <select className="input" value={mapping?.[f.key] ?? -1} onChange={(e) => onChange({ ...mapping, [f.key]: Number(e.target.value) })}>
              <option value={-1}>— not in file —</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || `Column ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Card>
  );
}

export default function KmUpload() {
  const { user } = useUser();
  const toast = useToast();
  const admin = user.role === 'ADMIN';
  const y = addDays(todayIST(), -1);
  const [range, setRange] = useState({ from: y, to: y });
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [p, setP] = useState(null);
  const [replace, setReplace] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const form = (f, map, extra = {}) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('from', range.from);
    fd.append('to', range.to);
    if (map) fd.append('mapping', JSON.stringify(map));
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return fd;
  };
  const check = async (f = file, map = mapping) => {
    if (!f) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await api('/km/preview', { method: 'POST', form: form(f, map) });
      setP(r);
      setMapping(r.mapping);
      setReplace(new Set());
    } catch (e) {
      setError(e.message);
      setP(null);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('/km/commit', { method: 'POST', form: form(file, mapping, { replace: JSON.stringify([...replace]) }) });
      setResult(r);
      setP(null);
      setFile(null);
      toast('GPS KM saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const key = (d) => `${d.vehicleId}|${d.date}`;
  const toggle = (d) => {
    const s = new Set(replace);
    s.has(key(d)) ? s.delete(key(d)) : s.add(key(d));
    setReplace(s);
  };
  const c = p?.counts;

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="GPS KM upload" sub="Download the distance report from the GPS portal and upload it here. Each row's date comes from Start Time. Trips of the same vehicle on one day are added together." />
      <Card className="flex flex-col gap-3">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="label">From<input className="input" type="date" max={todayIST()} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value, to: e.target.value > range.to ? e.target.value : range.to })} /></label>
          <label className="label">To<input className="input" type="date" max={todayIST()} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </div>
        <FilePick file={file} onFile={(f) => { setFile(f); setMapping(null); check(f, null); }} />
        {file && <div><Button size="sm" onClick={() => check()}>Re-check with these dates</Button></div>}
      </Card>
      <ErrorText error={error} />
      {busy && <p className="text-sm text-slate-500">Working…</p>}

      {result && (
        <Banner tone="green">
          Upload #{result.uploadId} saved: <b>{result.saved}</b> new vehicle-days
          {result.replaced ? <>, <b>{result.replaced}</b> replaced</> : null}
          {result.requested ? <>, <b>{result.requested}</b> replacements sent to the Admin</> : null}
          {result.skipped ? <>, <b>{result.skipped}</b> skipped</> : null}. <Link className="font-semibold underline" to="/km/uploads">Upload history</Link>
        </Banner>
      )}

      {p && <MappingCard fields={p.fields} headers={p.headers} mapping={mapping} onChange={setMapping} onApply={() => check(file, mapping)} note={p.needMapping} />}

      {c && (
        <>
          <Card className="flex flex-col gap-3">
            <h3 className="font-bold">Check before saving</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="blue">{c.vehicleDays} vehicle-days in the file</Badge>
              <Badge tone="green">{c.newDays} new</Badge>
              {c.same > 0 && <Badge>{c.same} already saved with the same KM</Badge>}
              {c.duplicates > 0 && <Badge tone="amber">{c.duplicates} already have different KM</Badge>}
              {c.outside > 0 && <Badge>{c.outside} rows outside the dates (skipped)</Badge>}
              {c.noDate > 0 && <Badge tone="amber">{c.noDate} rows without a date (skipped)</Badge>}
              {c.noKm > 0 && <Badge>{c.noKm} rows without KM (skipped)</Badge>}
            </div>
            {p.titleDate && <p className="text-sm text-slate-600">Date in the report title: {dmy(p.titleDate)} (used for rows without a Start Time).</p>}
            {p.missingDays.length > 0 && (
              <Banner tone="amber">
                <b>No data for {p.missingDays.length} day{p.missingDays.length === 1 ? '' : 's'}:</b> {p.missingDays.map(dmy).join(', ')}
              </Banner>
            )}
            {p.dropped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-red-700">
                  {c.dropped} rows dropped: {p.dropped.length} device name{p.dropped.length === 1 ? ' is' : 's are'} not in the Vehicle Master
                </summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-3">
                  {p.dropped.map((d) => <li key={d.device}><span className="font-mono">{d.device}</span> <span className="text-slate-500">({d.rows} row{d.rows === 1 ? '' : 's'})</span></li>)}
                </ul>
              </details>
            )}
          </Card>

          {p.duplicates.length > 0 && (
            <Card>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">Days that already have KM</h3>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setReplace(new Set())}>Skip all</Button>
                  <Button size="sm" onClick={() => setReplace(new Set(p.duplicates.map(key)))}>Replace all</Button>
                </div>
              </div>
              {!admin && <p className="mb-2 text-sm text-slate-600">Replace sends a request to the Admin. The saved KM stays until the Admin approves.</p>}
              <TableWrap>
                <table className="w-full">
                  <thead><tr><th className="th">Vehicle</th><th className="th">Date</th><th className="th num">Saved KM</th><th className="th num">File KM</th><th className="th">Action</th></tr></thead>
                  <tbody>
                    {p.duplicates.map((d) => (
                      <tr key={key(d)}>
                        <td className="td"><Plate n={d.number} /></td>
                        <td className="td">{dmy(d.date)}</td>
                        <td className="td num">{nf(d.existingKm, 1)}</td>
                        <td className="td num font-semibold">{nf(d.km, 1)}</td>
                        <td className="td">
                          <Button size="sm" variant={replace.has(key(d)) ? 'primary' : 'default'} onClick={() => toggle(d)}>
                            {replace.has(key(d)) ? (admin ? 'Replace' : 'Ask to replace') : 'Skip'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          )}

          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Show the {p.days.length} vehicle-days that were read</summary>
            <div className="mt-2">
              <TableWrap>
                <table className="w-full">
                  <thead><tr><th className="th">Date</th><th className="th">Vehicle</th><th className="th num">KM</th></tr></thead>
                  <tbody>{p.days.slice(0, 500).map((d) => <tr key={key(d)}><td className="td">{dmy(d.date)}</td><td className="td"><Plate n={d.number} /></td><td className="td num">{nf(d.km, 1)}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            </div>
          </details>

          <div>
            <Button variant="primary" onClick={save} disabled={busy || !p.days.length}>
              Save upload
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
