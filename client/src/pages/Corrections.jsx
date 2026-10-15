import { useState } from 'react';
import { api, qs } from '../api.js';
import { useUser } from '../user.js';
import { dmy, dmyTime, inr, nf } from '../format.js';
import { Badge, Button, Card, Empty, ErrorText, Loading, PageHead, Plate, Tabs, useLoad, useToast } from '../ui.jsx';

const TYPE = { FUEL_EDIT: 'Change fuel entry', FUEL_DELETE: 'Delete fuel entry', KM_EDIT: 'Change KM', KM_DELETE: 'Delete KM', KM_REPLACE: 'Replace KM from GPS upload' };
const STATE_TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };
const STATE_LABEL = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected' };
const FIELD = { from: 'From', to: 'To', petrolL: 'Petrol L', dieselL: 'Diesel L', cngKg: 'CNG kg', amount: 'Amount ₹', billNo: 'Bill no.', station: 'Station', remarks: 'Remarks' };

function What({ r }) {
  const p = r.payload || {};
  if (r.type.startsWith('KM')) {
    return (
      <span>
        {dmy(p.date)}: {nf(p.oldKm, 1)} km {r.type !== 'KM_DELETE' && <>→ <b>{nf(p.newKm, 1)} km</b></>}
      </span>
    );
  }
  const cur = p.current || {};
  return (
    <span>
      {dmy(p.from)}
      {p.to !== p.from ? ` – ${dmy(p.to)}` : ''} · {[cur.cngKg && `${cur.cngKg} kg`, cur.petrolL && `${cur.petrolL} L`, cur.dieselL && `${cur.dieselL} L`].filter(Boolean).join(' + ')} · {inr(cur.amount, 2)}
      {p.changes && (
        <span className="block">
          {Object.entries(p.changes).map(([k, v]) => (
            <span key={k} className="mr-3">
              {FIELD[k] || k}: <b>{k === 'from' || k === 'to' ? dmy(v) : v ?? '—'}</b>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export default function Corrections() {
  const { user } = useUser();
  const toast = useToast();
  const admin = user.role === 'ADMIN';
  const [state, setState] = useState('PENDING');
  const [d, error, reload] = useLoad(() => api('/corrections' + qs({ state })), [state]);
  const [notes, setNotes] = useState({});

  const decide = async (id, action) => {
    try {
      await api(`/corrections/${id}/${action}`, { method: 'POST', body: { note: notes[id] || '' } });
      toast(action === 'approve' ? 'Approved and applied.' : 'Rejected.');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div>
      <PageHead
        title={admin ? 'Correction requests' : 'My requests'}
        sub={admin ? 'Changes asked for by other users. Approving applies the change and logs it.' : 'Changes you asked the Admin for. Send a new request from My entries.'}
      />
      <Tabs
        value={state}
        onChange={setState}
        tabs={[
          { value: 'PENDING', label: 'Waiting' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: '', label: 'All' },
        ]}
      />
      {error && <ErrorText error={error} />}
      {!d && !error && <Loading />}
      {d && d.requests.length === 0 && <Empty>Nothing here.</Empty>}
      <div className="flex flex-col gap-3">
        {d?.requests.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <b>{TYPE[r.type]}</b> {r.payload?.number && <Plate n={r.payload.number} />}
              </span>
              <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge>
            </div>
            <div className="text-sm"><What r={r} /></div>
            <div className="text-sm text-slate-600">
              “{r.reason}” — {r.requestedBy}, {dmyTime(r.createdAt)}
            </div>
            {r.decidedAt && (
              <div className="text-xs text-slate-500">
                {STATE_LABEL[r.state]} by {r.decidedBy} on {dmyTime(r.decidedAt)}
                {r.decisionNote ? ` · ${r.decisionNote}` : ''}
              </div>
            )}
            {admin && r.state === 'PENDING' && (
              <div className="flex flex-wrap items-center gap-2">
                <input className="input max-w-xs" placeholder="Note (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button variant="primary" onClick={() => decide(r.id, 'approve')}>Approve</Button>
                <Button onClick={() => decide(r.id, 'reject')}>Reject</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
