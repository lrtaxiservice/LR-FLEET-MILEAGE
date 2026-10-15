import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { showPlate } from './format.js';

export function Button({ variant = 'default', size = 'md', className = '', ...p }) {
  const v = {
    default: 'border border-slate-300 bg-white text-slate-800 hover:border-slate-400',
    primary: 'border border-brand-600 bg-brand-600 text-white hover:bg-brand-700',
    danger: 'border border-red-600 bg-red-600 text-white hover:bg-red-700',
    ghost: 'border border-transparent text-brand-600 hover:bg-brand-50',
  }[variant];
  const s = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  return <button type="button" className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${s} ${className}`} {...p} />;
}

export const Card = ({ className = '', ...p }) => <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`} {...p} />;

export function PageHead({ title, sub, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-slate-600">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export const Plate = ({ n }) => (
  <span className="inline-block whitespace-nowrap rounded border-[1.5px] border-black bg-plate px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-black">{showPlate(n)}</span>
);

const TONES = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-brand-100 text-brand-700',
  gray: 'bg-slate-200 text-slate-700',
};
export const Badge = ({ tone = 'gray', children, title }) => (
  <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
    {children}
  </span>
);

export function Banner({ tone = 'gray', children }) {
  const t = { gray: 'bg-slate-200/70', amber: 'bg-amber-100', red: 'bg-red-100', green: 'bg-green-100', blue: 'bg-brand-100' }[tone];
  return <div className={`rounded-md px-3.5 py-2.5 text-sm ${t}`}>{children}</div>;
}

export const Tile = ({ label, value, sub, alert }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-bold ${alert ? 'text-red-700' : ''}`}>{value}</div>
    {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
  </div>
);

export const TableWrap = ({ children }) => <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">{children}</div>;

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-300">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`-mb-px whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-semibold ${value === t.value ? 'border-brand-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl" role="dialog" aria-modal="true">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const ErrorText = ({ error }) => (error ? <p className="text-sm font-medium text-red-700">{error}</p> : null);
export const Loading = () => <p className="py-6 text-sm text-slate-500">Loading…</p>;
export const Empty = ({ children }) => <p className="py-6 text-center text-sm text-slate-500">{children}</p>;

/* Toast messages */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((text, tone = 'ok') => {
    setMsg({ text, tone, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className={`fixed bottom-4 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${msg.tone === 'error' ? 'bg-red-700' : 'bg-slate-900'}`}>
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Loads data from the API; returns [data, error, reload]. */
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, error: null }));
    fn()
      .then((data) => live && setState({ data, error: null }))
      .catch((e) => live && setState({ data: null, error: e.message }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [state.data, state.error, () => setN((x) => x + 1)];
}
