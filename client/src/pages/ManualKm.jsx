import { useState } from 'react';
import { api } from '../api.js';
import { addDays, nf, todayIST } from '../format.js';
import { Banner, Button, Card, ErrorText, PageHead, useLoad } from '../ui.jsx';
import { VehiclePicker } from './MyEntries.jsx';

export default function ManualKm() {
  const [vehicles] = useLoad(() => api('/vehicles'), []);
  const [f, setF] = useState({ vehicleId: null, date: addDays(todayIST(), -1), km: '', reason: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg(null);
    if (!f.vehicleId) return setError('Choose a vehicle from the list.');
    try {
      const r = await api('/km/manual', { method: 'POST', body: { vehicleId: f.vehicleId, date: f.date, km: Number(f.km), reason: f.reason || undefined } });
      setMsg(
        r.requested
          ? { tone: 'amber', text: `This day already has ${nf(r.existingKm, 1)} km. Your change was sent to the Admin.` }
          : { tone: 'green', text: r.replaced ? 'KM replaced.' : 'KM saved.' },
      );
      setF({ ...f, km: '', reason: '' });
    } catch (x) {
      setError(x.message);
    }
  };
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <PageHead title="Manual KM" sub="For a day the GPS missed. If the day already has KM, the Admin replaces it, or your change goes to the Admin." />
      <Card>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <VehiclePicker vehicles={vehicles?.vehicles || []} value={f.vehicleId} onChange={(id) => setF({ ...f, vehicleId: id })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="label">Date<input className="input" type="date" max={todayIST()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
            <label className="label">KM<input className="input" type="number" inputMode="decimal" min="0" max="5000" step="0.1" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} required /></label>
          </div>
          <label className="label">Reason (optional)<input className="input" maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. GPS device off" /></label>
          <ErrorText error={error} />
          {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
          <Button type="submit" variant="primary">Save KM</Button>
        </form>
      </Card>
    </div>
  );
}
