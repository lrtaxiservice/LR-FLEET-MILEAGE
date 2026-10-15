import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { FUEL_LABEL, OWNERSHIP_LABEL, STATUS_LABEL, dmy } from '../format.js';
import { Badge, Empty, ErrorText, Loading, PageHead, Plate, TableWrap, Tabs, useLoad } from '../ui.jsx';

const STATUS_TONE = { ACTIVE: 'green', WORKSHOP: 'amber', IDLE: 'gray', SOLD: 'gray' };

export default function Vehicles() {
  const [data, error] = useLoad(() => api('/vehicles'), []);
  const [tab, setTab] = useState('driver');
  const [q, setQ] = useState('');
  const [showSold, setShowSold] = useState(false);
  const nav = useNavigate();

  const list = data?.vehicles || [];
  const counts = useMemo(() => list.reduce((c, v) => ({ ...c, [v.tab]: (c[v.tab] || 0) + 1 }), {}), [list]);
  const shown = useMemo(() => {
    const t = q.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');
    return list.filter((v) => {
      if (v.tab !== tab) return false;
      if (!t) return true;
      const hay = [v.number, v.make, v.driver?.name, v.driver?.phone, v.vendor?.name, v.department, v.place].join(' ').toUpperCase();
      return t.split(' ').every((w) => hay.includes(w) || v.number.includes(w));
    });
  }, [list, tab, q]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const tabs = [
    { value: 'driver', label: 'Driver', count: counts.driver || 0 },
    { value: 'others', label: 'Vendor / Others', count: counts.others || 0 },
    { value: 'workshop', label: 'Workshop / Idle', count: counts.workshop || 0 },
  ];
  if (showSold) tabs.push({ value: 'sold', label: 'Sold', count: counts.sold || 0 });

  return (
    <div>
      <PageHead title="Vehicles" sub="Every vehicle from the Vehicle Master, with its current status and driver. Tap a vehicle for its history.">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showSold}
            onChange={(e) => {
              setShowSold(e.target.checked);
              if (!e.target.checked && tab === 'sold') setTab('driver');
            }}
          />
          Show sold
        </label>
      </PageHead>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <input className="input mb-3 max-w-sm" type="search" placeholder="Search number, driver, model, department" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? (
        <Empty>No vehicles here.</Empty>
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Vehicle</th>
                <th className="th">Make / model</th>
                <th className="th">Fuel</th>
                <th className="th">{tab === 'others' ? 'Vendor / holder' : 'Driver'}</th>
                <th className="th">Status</th>
                <th className="th">Department</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/vehicles/${v.id}`)}>
                  <td className="td">
                    <Link to={`/vehicles/${v.id}`} onClick={(e) => e.stopPropagation()}><Plate n={v.number} /></Link>
                    {v.category === 'PRIVATE' && <span className="ml-2 text-xs text-slate-500">Private</span>}
                    {!v.category && <span className="ml-2 text-xs text-amber-700">No category</span>}
                  </td>
                  <td className="td">{v.make}{v.modelYear ? <span className="text-slate-500"> · {v.modelYear}</span> : null}</td>
                  <td className="td">{FUEL_LABEL[v.fuelType]}</td>
                  <td className="td">
                    {tab === 'others' ? (
                      <>
                        <Badge>{OWNERSHIP_LABEL[v.ownership]}</Badge> {v.vendor?.name || <span className="text-slate-400">—</span>}
                      </>
                    ) : v.driver ? (
                      <>
                        {v.driver.name}
                        {v.driver.govt && <Badge tone="blue">Govt</Badge>}
                        <div className="text-xs text-slate-500">{v.driver.phone}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status] || 'No status'}</Badge>
                    {v.place && <span className="ml-1 text-xs text-slate-600">{v.place}</span>}
                    {v.statusFrom && <div className="text-xs text-slate-500">since {dmy(v.statusFrom)}</div>}
                  </td>
                  <td className="td">{v.department || <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
