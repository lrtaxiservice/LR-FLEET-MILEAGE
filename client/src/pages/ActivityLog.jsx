import { Fragment, useState } from 'react';
import { api, qs } from '../api.js';
import { dmyTime } from '../format.js';
import { Button, Empty, ErrorText, Loading, PageHead, TableWrap, useLoad } from '../ui.jsx';

const ENTITIES = ['', 'user', 'vehicle', 'vehicle_master', 'driver', 'km_upload', 'daily_km', 'fuel_entry', 'correction_request', 'settings'];

function Json({ v }) {
  if (v == null) return <span className="text-slate-400">—</span>;
  const text = JSON.stringify(v, null, 1);
  return <pre className="max-h-48 max-w-md overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[11px] leading-snug">{text}</pre>;
}

export default function ActivityLog() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [user, setUser] = useState('');
  const [d, error] = useLoad(() => api('/activity' + qs({ page, entity, user })), [page, entity, user]);
  const [open, setOpen] = useState(null);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.size)) : 1;

  return (
    <div>
      <PageHead title="Activity log" sub="Every action, with the old and new values and the IP address. The database does not allow these lines to be changed or deleted." />
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="label">
          What
          <select className="input" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            {ENTITIES.map((x) => <option key={x} value={x}>{x ? x.replace(/_/g, ' ') : 'Everything'}</option>)}
          </select>
        </label>
        <label className="label">
          User name
          <input className="input" value={user} onChange={(e) => { setUser(e.target.value.trim().toLowerCase()); setPage(1); }} placeholder="e.g. fuel1" />
        </label>
      </div>
      {error && <ErrorText error={error} />}
      {!d && !error && <Loading />}
      {d && d.rows.length === 0 && <Empty>Nothing logged.</Empty>}
      {d && d.rows.length > 0 && (
        <>
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">On</th><th className="th">IP</th><th className="th"></th></tr></thead>
              <tbody>
                {d.rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="td">{dmyTime(r.at)}</td>
                      <td className="td">{r.username || 'system'}</td>
                      <td className="td font-mono text-xs">{r.action}</td>
                      <td className="td text-xs">{r.entity ? `${r.entity.replace(/_/g, ' ')} ${r.entityId ? '#' + r.entityId : ''}` : '—'}</td>
                      <td className="td text-xs text-slate-500">{r.ip || '—'}</td>
                      <td className="td">{(r.oldValue || r.newValue) && <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</Button>}</td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={6} className="border-b border-slate-100 px-3 py-2">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div><div className="mb-1 text-xs font-semibold text-slate-500">Before</div><Json v={r.oldValue} /></div>
                            <div><div className="mb-1 text-xs font-semibold text-slate-500">After</div><Json v={r.newValue} /></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</Button>
            <span>Page {page} of {pages} · {d.total} lines</span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older →</Button>
          </div>
        </>
      )}
    </div>
  );
}
