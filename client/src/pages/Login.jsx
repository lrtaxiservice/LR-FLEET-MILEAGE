import { useState } from 'react';
import { api } from '../api.js';
import { Button, Card, ErrorText, useToast } from '../ui.jsx';

export default function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/auth/login', { method: 'POST', body: f });
      onLogin(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">LR Taxi Services</div>
          <h1 className="text-2xl font-bold text-brand-700">Fleet App</h1>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="label">
            User name
            <input className="input" autoComplete="username" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
          </label>
          <label className="label">
            Password
            <input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          </label>
          <ErrorText error={error} />
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function ChangePassword({ user, onDone, forced }) {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.next !== f.again) return setError('The two new passwords are not the same.');
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { current: f.current, next: f.next } });
      toast('Password changed.');
      setF({ current: '', next: '', again: '' });
      onDone(r.user);
    } catch (err) {
      setError(err.message);
    }
  };
  const form = (
    <Card className="w-full max-w-sm p-6">
      <h1 className="text-xl font-bold">Change password</h1>
      {forced && <p className="mt-1 text-sm text-slate-600">Hello {user.name}. Please choose your own password before you continue.</p>}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="label">
          {forced ? 'Temporary password' : 'Current password'}
          <input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
        </label>
        <label className="label">
          New password (at least 8 characters)
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
        </label>
        <label className="label">
          New password again
          <input className="input" type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} required />
        </label>
        <ErrorText error={error} />
        <Button variant="primary" type="submit">Save password</Button>
      </form>
    </Card>
  );
  return forced ? <div className="flex min-h-screen items-center justify-center p-4">{form}</div> : form;
}
