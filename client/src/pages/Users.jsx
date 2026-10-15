import { useState } from 'react';
import { api } from '../api.js';
import { ROLE_LABEL, dmy } from '../format.js';
import { Badge, Banner, Button, Card, ErrorText, Loading, Modal, PageHead, TableWrap, useLoad, useToast } from '../ui.jsx';

const ROLES = ['KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER'];

export default function Users() {
  const toast = useToast();
  const [d, error, reload] = useLoad(() => api('/users'), []);
  const [f, setF] = useState({ username: '', name: '', role: 'FUEL_USER' });
  const [formErr, setFormErr] = useState('');
  const [temp, setTemp] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setFormErr('');
    try {
      const r = await api('/users', { method: 'POST', body: f });
      setTemp({ username: r.user.username, password: r.tempPassword });
      setF({ username: '', name: '', role: f.role });
      reload();
    } catch (x) {
      setFormErr(x.message);
    }
  };
  const patch = async (u, body) => {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      toast('Saved.');
      reload();
    } catch (x) {
      toast(x.message, 'error');
    }
  };
  const reset = async (u) => {
    try {
      const r = await api(`/users/${u.id}/reset-password`, { method: 'POST' });
      setTemp({ username: u.username, password: r.tempPassword });
    } catch (x) {
      toast(x.message, 'error');
    }
  };

  if (error) return <ErrorText error={error} />;
  if (!d) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Users" sub="New users get a temporary password and must choose their own at first login. Switch a user off to block their login; their history is kept." />
      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={add}>
          <label className="label">User name<input className="input" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="e.g. fuel3" required /></label>
          <label className="label">Full name<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
          <label className="label">Role
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <Button type="submit" variant="primary">Add user</Button>
        </form>
        <ErrorText error={formErr} />
      </Card>
      <TableWrap>
        <table className="w-full">
          <thead><tr><th className="th">User</th><th className="th">Role</th><th className="th">Since</th><th className="th">Status</th><th className="th"></th></tr></thead>
          <tbody>
            {d.users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'text-slate-400'}>
                <td className="td"><b>{u.username}</b><div className="text-xs">{u.name}</div></td>
                <td className="td">
                  {u.role === 'ADMIN' ? <Badge tone="blue">Admin</Badge> : (
                    <select className="input-sm max-w-[10rem]" value={u.role} onChange={(e) => patch(u, { role: e.target.value })} aria-label={`Role of ${u.username}`}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                </td>
                <td className="td">{dmy(u.createdAt?.slice(0, 10))}</td>
                <td className="td">{u.active ? (u.mustChangePassword ? <Badge tone="amber">Must change password</Badge> : <Badge tone="green">Active</Badge>) : <Badge>Switched off</Badge>}</td>
                <td className="td">
                  {u.role !== 'ADMIN' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reset(u)}>Reset password</Button>
                      <Button size="sm" onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Switch off' : 'Switch on'}</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {temp && (
        <Modal title="Temporary password" onClose={() => setTemp(null)}>
          <Banner tone="amber">Give this to <b>{temp.username}</b> privately. It is shown only once. They must change it at first login.</Banner>
          <p className="mt-3 select-all rounded bg-slate-100 p-3 text-center font-mono text-xl">{temp.password}</p>
          <div className="mt-4 flex justify-end"><Button onClick={() => setTemp(null)}>Done</Button></div>
        </Modal>
      )}
    </div>
  );
}
