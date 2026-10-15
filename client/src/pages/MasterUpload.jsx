import { useState } from 'react';
import { api } from '../api.js';
import { FUEL_LABEL, OWNERSHIP_LABEL, STATUS_LABEL, todayIST, dmy } from '../format.js';
import { Badge, Banner, Button, Card, ErrorText, PageHead, Plate, TableWrap, Tabs, useToast } from '../ui.jsx';
import { FilePick, MappingCard } from './KmUpload.jsx';

export default function MasterUpload() {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [effective, setEffective] = useState(todayIST());
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const send = async (path, extra = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (mapping) form.append('mapping', JSON.stringify(mapping));
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return api(path, { method: 'POST', form });
  };
  const check = async (f = file, map = mapping) => {
    if (!f) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', f);
      if (map) form.append('mapping', JSON.stringify(map));
      const p = await api('/master/preview', { method: 'POST', form });
      setPreview(p);
      setMapping(p.mapping);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await send('/master/commit', { effectiveDate: effective });
      setResult(r);
      setPreview(null);
      setFile(null);
      setMapping(null);
      toast('Vehicle Master saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = preview?.rows || [];
  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'errors' ? r.errors.length : filter === 'warnings' ? r.warnings.length : !r.errors.length && r.change === filter,
  );
  const c = preview?.counts;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="Vehicle Master upload"
        sub="Upload the vehicle list (Excel or CSV). Check how the columns are read, look at the preview, then save. Vehicles not in the file are kept as they are."
      />
      <Card className="flex flex-col gap-3">
        <FilePick
          file={file}
          onFile={(f) => {
            setFile(f);
            setMapping(null);
            check(f, null);
          }}
        />
        <label className="label max-w-xs">
          Changes of status and driver start from
          <input className="input" type="date" value={effective} max={todayIST()} onChange={(e) => setEffective(e.target.value)} />
        </label>
      </Card>
      <ErrorText error={error} />
      {busy && <p className="text-sm text-slate-500">Working…</p>}

      {result && (
        <Banner tone="green">
          Saved. <b>{result.created}</b> new, <b>{result.updated}</b> updated, <b>{result.unchanged}</b> unchanged
          {result.skipped ? <>, <b>{result.skipped}</b> rows with errors skipped</> : null}.
        </Banner>
      )}

      {preview && (
        <MappingCard
          fields={preview.fields}
          headers={preview.headers}
          mapping={mapping}
          onChange={setMapping}
          onApply={() => check(file, mapping)}
          note={preview.needMapping}
        />
      )}

      {c && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="blue">{c.total} rows</Badge>
            <Badge tone="green">{c.new} new</Badge>
            <Badge tone="amber">{c.changed} changed</Badge>
            <Badge>{c.same} unchanged</Badge>
            {c.errors > 0 && <Badge tone="red">{c.errors} with errors (not saved)</Badge>}
            {c.warnings > 0 && <Badge tone="amber">{c.warnings} with warnings</Badge>}
          </div>
          {preview.notInFile.length > 0 && (
            <Banner>
              {preview.notInFile.length} saved vehicle{preview.notInFile.length === 1 ? ' is' : 's are'} not in this file and will stay as they are: {preview.notInFile.slice(0, 12).join(', ')}
              {preview.notInFile.length > 12 ? '…' : ''}
            </Banner>
          )}
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: 'All', count: c.total },
              { value: 'new', label: 'New', count: c.new },
              { value: 'changed', label: 'Changed', count: c.changed },
              { value: 'errors', label: 'Errors', count: c.errors },
              { value: 'warnings', label: 'Warnings', count: c.warnings },
            ]}
          />
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Line</th>
                  <th className="th">Vehicle</th>
                  <th className="th">Model</th>
                  <th className="th">Fuel</th>
                  <th className="th">Ownership / status</th>
                  <th className="th">Driver / vendor</th>
                  <th className="th">Check</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.line} className={r.errors.length ? 'bg-red-50' : ''}>
                    <td className="td text-slate-500">{r.line}</td>
                    <td className="td">
                      <Plate n={r.number} />{' '}
                      {!r.errors.length && <Badge tone={r.change === 'new' ? 'green' : r.change === 'changed' ? 'amber' : 'gray'}>{r.change === 'new' ? 'New' : r.change === 'changed' ? `Changed: ${r.diffs.join(', ')}` : 'Same'}</Badge>}
                    </td>
                    <td className="td">{r.make}{r.modelYear ? ` · ${r.modelYear}` : ''}</td>
                    <td className="td">{FUEL_LABEL[r.fuelType] || '—'}</td>
                    <td className="td">{r.ownership ? `${OWNERSHIP_LABEL[r.ownership]} · ${STATUS_LABEL[r.status]}${r.place ? ` (${r.place})` : ''}` : '—'}</td>
                    <td className="td">{r.driver ? `${r.driver.name}${r.driver.govt ? ' (Govt)' : ''} ${r.driver.phone || ''}` : r.vendor ? `${r.vendor.name} ${r.vendor.contact || ''}` : '—'}</td>
                    <td className="td whitespace-normal text-xs">
                      {r.errors.map((e) => <div key={e} className="font-semibold text-red-700">{e}</div>)}
                      {r.warnings.map((w) => <div key={w} className="text-amber-800">{w}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={save} disabled={busy || c.new + c.changed === 0}>
              Save {c.new + c.changed} vehicle{c.new + c.changed === 1 ? '' : 's'}
            </Button>
            <span className="text-sm text-slate-600">Status and driver changes start on {dmy(effective)}. Rows with errors are skipped.</span>
          </div>
        </>
      )}
    </div>
  );
}
