import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { can, ROLE_LABEL } from './format.js';
import { Loading } from './ui.jsx';
import { UserCtx } from './user.js';
import Login, { ChangePassword } from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Vehicles from './pages/Vehicles.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import MasterUpload from './pages/MasterUpload.jsx';
import KmUpload from './pages/KmUpload.jsx';
import ManualKm from './pages/ManualKm.jsx';
import UploadHistory from './pages/UploadHistory.jsx';
import FuelEntry from './pages/FuelEntry.jsx';
import MyEntries from './pages/MyEntries.jsx';
import Mileage from './pages/Mileage.jsx';
import Corrections from './pages/Corrections.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';


/** Menu items, shown by role. */
function menu(user) {
  const admin = user.role === 'ADMIN';
  return [
    { to: '/', label: 'Dashboard', show: true },
    { to: '/mileage', label: 'Mileage', show: can(user, 'reports') },
    { to: '/fuel', label: 'Fuel entry', show: can(user, 'fuel') },
    { to: '/km/upload', label: 'KM upload', show: can(user, 'km') },
    { to: '/km/manual', label: 'Manual KM', show: can(user, 'km') },
    { to: '/km/uploads', label: 'Upload history', show: can(user, 'km') },
    { to: '/my-entries', label: 'My entries', show: can(user, 'km') || can(user, 'fuel') },
    { to: '/vehicles', label: 'Vehicles', show: can(user, 'vehicles') },
    { to: '/master', label: 'Vehicle Master', show: admin },
    { to: '/corrections', label: admin ? 'Correction requests' : 'My requests', show: true },
    { to: '/users', label: 'Users', show: admin },
    { to: '/activity', label: 'Activity log', show: admin },
    { to: '/settings', label: 'Settings', show: admin },
  ].filter((x) => x.show);
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null));
    const out = () => setUser(null);
    window.addEventListener('lr:logged-out', out);
    return () => window.removeEventListener('lr:logged-out', out);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);

  if (user === undefined) return <div className="p-6"><Loading /></div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChangePassword) return <ChangePassword user={user} onDone={setUser} forced />;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };
  const items = menu(user);
  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}>
          {i.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <UserCtx.Provider value={{ user, setUser }}>
      <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button type="button" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
            ☰ Menu
          </button>
          <span className="font-bold text-brand-700">LR Fleet</span>
          <button type="button" className="text-sm text-slate-600" onClick={logout}>
            Log out
          </button>
        </header>
        {open && <div className="border-b border-slate-200 bg-white lg:hidden">{nav}</div>}
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">LR Taxi Services</div>
            <div className="text-xl font-bold text-brand-700">Fleet App</div>
          </div>
          <div className="flex-1 overflow-y-auto">{nav}</div>
          <div className="border-t border-slate-200 p-4 text-sm">
            <div className="font-semibold">{user.name}</div>
            <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
            <div className="mt-2 flex gap-3">
              <NavLink to="/password" className="text-brand-600 hover:underline">Password</NavLink>
              <button type="button" className="text-brand-600 hover:underline" onClick={logout}>Log out</button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/password" element={<ChangePassword user={user} onDone={setUser} />} />
            {can(user, 'reports') && <Route path="/mileage" element={<Mileage />} />}
            {can(user, 'fuel') && <Route path="/fuel" element={<FuelEntry />} />}
            {can(user, 'km') && <Route path="/km/upload" element={<KmUpload />} />}
            {can(user, 'km') && <Route path="/km/manual" element={<ManualKm />} />}
            {can(user, 'km') && <Route path="/km/uploads" element={<UploadHistory />} />}
            <Route path="/my-entries" element={<MyEntries />} />
            {can(user, 'vehicles') && <Route path="/vehicles" element={<Vehicles />} />}
            {can(user, 'vehicles') && <Route path="/vehicles/:id" element={<VehicleDetail />} />}
            {user.role === 'ADMIN' && <Route path="/master" element={<MasterUpload />} />}
            <Route path="/corrections" element={<Corrections />} />
            {user.role === 'ADMIN' && <Route path="/users" element={<Users />} />}
            {user.role === 'ADMIN' && <Route path="/activity" element={<ActivityLog />} />}
            {user.role === 'ADMIN' && <Route path="/settings" element={<Settings />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UserCtx.Provider>
  );
}
