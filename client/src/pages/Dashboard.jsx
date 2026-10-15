import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useUser } from '../user.js';
import { can, dmy, nf, inr } from '../format.js';
import { Banner, Card, Loading, PageHead, Plate, Tile, ErrorText, useLoad, Button } from '../ui.jsx';

export default function Dashboard() {
  const { user } = useUser();
  const [d, error] = useLoad(() => api('/dashboard'), []);
  if (error) return <ErrorText error={error} />;
  if (!d) return <Loading />;
  const v = d.vehicles;
  const noVehicles = v.active + v.workshop + v.idle + v.sold + v.others === 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHead title={`Hello, ${user.name}`} sub={`Today is ${dmy(d.today)}.`} />

      {noVehicles && (
        <Banner tone="blue">
          No vehicles yet.{' '}
          {user.role === 'ADMIN' ? (
            <>
              Start with the <Link className="font-semibold underline" to="/master">Vehicle Master upload</Link>.
            </>
          ) : (
            'The Admin needs to upload the Vehicle Master first.'
          )}
        </Banner>
      )}

      {d.pendingRequests > 0 && (
        <Banner tone="amber">
          <b>{d.pendingRequests}</b> correction request{d.pendingRequests === 1 ? ' is' : 's are'} waiting{user.role === 'ADMIN' ? ' for you' : ' for the Admin'}.{' '}
          <Link className="font-semibold underline" to="/corrections">Open</Link>
        </Banner>
      )}

      {!noVehicles && d.missingGpsDays.length > 0 && (
        <Banner tone="amber">
          <b>GPS KM missing for {d.missingGpsDays.length} day{d.missingGpsDays.length === 1 ? '' : 's'}</b> this month: {d.missingGpsDays.map(dmy).join(', ')}.{' '}
          {can(user, 'km') && <Link className="font-semibold underline" to="/km/upload">Upload now</Link>}
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Active" value={v.active} sub="Driver & Govt driver" />
        <Tile label="Workshop" value={v.workshop} />
        <Tile label="Idle" value={v.idle} sub="Lodhi Road, Jangpura" />
        <Tile label="Vendor / Others" value={v.others} />
        <Tile label="Last GPS day" value={d.lastGpsDate ? dmy(d.lastGpsDate) : '—'} />
      </div>

      {d.month && (
        <>
          <h2 className="text-lg font-bold">This month so far</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="KM (active days)" value={nf(d.month.km)} sub={`${d.month.vehicles} company vehicles`} />
            <Tile label="Fuel spend" value={inr(d.month.amount)} />
            <Tile label="Cost per km" value={d.month.costPerKm != null ? inr(d.month.costPerKm, 2) : '—'} />
            <Tile label="Needs Attention" value={d.month.attention} alert={d.month.attention > 0} sub={`${d.month.noFuel} with no fuel entry · ${d.month.noKm} with no KM`} />
          </div>
          {d.attention.length > 0 && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">Worst averages this month</h3>
                <Link to="/mileage"><Button size="sm" variant="ghost">Full report →</Button></Link>
              </div>
              <ul className="divide-y divide-slate-100">
                {d.attention.map((a) => (
                  <li key={a.vehicleId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Link to={`/vehicles/${a.vehicleId}`}><Plate n={a.number} /></Link>
                      <span className="text-slate-600">{a.make}{a.drivers.length ? ` · ${a.drivers.join(', ')}` : ''}</span>
                    </span>
                    <span>
                      <b>{nf(a.average, 2)}</b> {a.unit} vs {nf(a.benchmark, 2)} · <span className="font-semibold text-red-700">{nf(a.worseByPercent, 1)}% worse</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {can(user, 'fuel') && d.fuelToday != null && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            Fuel entries saved today: <b>{d.fuelToday}</b> (yours: <b>{d.myFuelToday}</b>)
          </div>
          <Link to="/fuel"><Button variant="primary">Enter fuel</Button></Link>
        </Card>
      )}
    </div>
  );
}
