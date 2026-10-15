import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, Card, ErrorText, Loading, PageHead, useLoad, useToast } from '../ui.jsx';

export default function Settings() {
  const toast = useToast();
  const [d, error] = useLoad(() => api('/settings'), []);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (d) setF(d.settings);
  }, [d]);
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api('/settings', { method: 'PUT', body: { attentionPercent: Number(f.attentionPercent), minComparable: Number(f.minComparable) } });
      setF(r.settings);
      toast('Settings saved.');
    } catch (x) {
      setErr(x.message);
    }
  };
  if (error) return <ErrorText error={error} />;
  if (!f) return <Loading />;
  return (
    <div className="max-w-lg">
      <PageHead title="Settings" />
      <Card>
        <form className="flex flex-col gap-4" onSubmit={save}>
          <label className="label">
            Needs Attention when worse than the benchmark by more than (%)
            <input className="input" type="number" min="1" max="50" step="0.5" value={f.attentionPercent} onChange={(e) => setF({ ...f, attentionPercent: e.target.value })} />
          </label>
          <label className="label">
            Fewest vehicles of the same model and fuel needed to compare
            <input className="input" type="number" min="2" max="20" value={f.minComparable} onChange={(e) => setF({ ...f, minComparable: e.target.value })} />
          </label>
          <ErrorText error={err} />
          <Button type="submit" variant="primary">Save</Button>
        </form>
      </Card>
    </div>
  );
}
