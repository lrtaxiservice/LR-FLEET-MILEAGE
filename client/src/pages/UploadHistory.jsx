import { useState } from 'react';
import { api } from '../api.js';
import { useUser } from '../user.js';
import { dmy, dmyTime } from '../format.js';
import { Badge, Button, Empty, ErrorText, Loading, Modal, PageHead, TableWrap, useLoad, useToast } from '../ui.jsx';

export default function UploadHistory() {
  const { user } = useUser();
  const toast = useToast();
  const admin = user.role === 'ADMIN';
  const [d, error, reload] = useLoad(() => api('/km/uploads'), []);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const undo = async () => {
    setBusy(true);
    try {
      const r = await api(`/km/uploads/${confirm.id}/undo`, { method: 'POST' });
      toast(`Undone: ${r.removed} rows removed, ${r.restored} restored.`);
      setConfirm(null);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorText error={error} />;
  if (!d) return <Loading />;
  return (
    <div>
      <PageHead title="Upload history" sub={admin ? 'Every GPS upload. Undo removes everything an upload saved and puts back any KM it replaced.' : 'Your GPS uploads. Ask the Admin if an upload needs to be undone.'} />
      {d.uploads.length === 0 ? (
        <Empty>No uploads yet.</Empty>
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Uploaded</th>
                <th className="th">File</th>
                <th className="th">Dates</th>
                <th className="th num">Saved</th>
                <th className="th num">Skipped</th>
                <th className="th">Dropped / missing</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {d.uploads.map((u) => (
                <tr key={u.id} className={u.undoneAt ? 'text-slate-400' : ''}>
                  <td className="td">{u.id}</td>
                  <td className="td">{dmyTime(u.createdAt)}<div className="text-xs text-slate-500">{u.by}</div></td>
                  <td className="td max-w-[14rem] truncate" title={u.fileName}>{u.fileName}</td>
                  <td className="td">{dmy(u.from)}{u.to !== u.from ? ` – ${dmy(u.to)}` : ''}</td>
                  <td className="td num">{u.rowsSaved}</td>
                  <td className="td num">{u.rowsSkipped}</td>
                  <td className="td text-xs">
                    {u.summary?.dropped?.length ? <span title={u.summary.dropped.map((x) => x.device).join(', ')}>{u.summary.dropped.length} devices dropped</span> : '—'}
                    {u.summary?.missingDays?.length ? <div className="text-amber-700">No data: {u.summary.missingDays.map(dmy).join(', ')}</div> : null}
                  </td>
                  <td className="td">
                    {u.undoneAt ? (
                      <Badge>Undone {dmy(u.undoneAt.slice(0, 10))}</Badge>
                    ) : admin ? (
                      <Button size="sm" onClick={() => setConfirm(u)}>Undo</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {confirm && (
        <Modal title={`Undo upload #${confirm.id}?`} onClose={() => setConfirm(null)}>
          <p className="text-sm">
            This removes the {confirm.rowsSaved} vehicle-days saved by <b>{confirm.fileName}</b> ({dmy(confirm.from)} – {dmy(confirm.to)}). KM it replaced is put back. This is written to the activity log.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={undo} disabled={busy}>Undo upload</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
