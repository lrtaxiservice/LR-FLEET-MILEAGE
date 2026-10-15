// A fake fleet for practice. Every name and phone number here is made up.

const FIRST = ['Ramesh', 'Suresh', 'Mahesh', 'Rajesh', 'Dinesh', 'Mukesh', 'Rakesh', 'Naresh', 'Umesh', 'Ganesh', 'Sanjay', 'Vijay', 'Ajay', 'Manoj', 'Anil', 'Sunil', 'Pawan', 'Deepak', 'Amit', 'Rohit'];
const LAST = ['Kumar', 'Singh', 'Sharma', 'Yadav', 'Verma', 'Gupta', 'Chauhan', 'Rawat', 'Negi', 'Bisht'];

const MODELS = [
  { make: 'Dzire', fuel: 'CNG/Petrol', std: 19 },
  { make: 'Ertiga', fuel: 'CNG/Petrol', std: 16 },
  { make: 'Innova Crysta', fuel: 'Diesel', std: 11 },
  { make: 'Ciaz', fuel: 'Petrol', std: 15 },
  { make: 'Nexon EV', fuel: 'Electric', std: 1.6 }, // ₹ per km
  { make: 'WagonR', fuel: 'CNG', std: 24 },
];

/** 30 vehicles: 20 with drivers, 2 govt drivers, 2 idle, 2 workshop, 4 vendor / officer / personal. */
export function demoFleet() {
  const out = [];
  const role = (i) => {
    if (i < 20) return 'DRIVER';
    if (i < 22) return 'GOVT DRIVER';
    if (i === 22) return 'FREE LR';
    if (i === 23) return 'FREE JN';
    if (i === 24) return 'WORKSHOP CH';
    if (i === 25) return 'ACCIDENTAL';
    if (i < 28) return 'VENDOR';
    if (i === 28) return 'OFFICER';
    return 'PERSONAL';
  };
  for (let i = 0; i < 30; i++) {
    const m = MODELS[i % 5 === 4 && i < 22 ? 4 : i % 6 === 5 ? 5 : i % 4];
    const vd = role(i);
    const person = `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
    const isDriver = vd.includes('DRIVER');
    const isHolder = ['VENDOR', 'OFFICER', 'PERSONAL'].includes(vd);
    out.push({
      sno: i + 1,
      number: `DL 1Z ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 7) % 26))} ${String(1001 + i * 37).padStart(4, '0')}`,
      make: m.make,
      fuel: m.fuel,
      std: m.std,
      year: 2019 + (i % 7),
      vendorDriver: vd,
      name: isDriver ? person : isHolder ? (vd === 'VENDOR' ? `Demo Travels ${i - 25}` : person) : '',
      contact: isDriver || isHolder ? `90000${String(10000 + i).slice(-5)}` : '',
      department: ['Operations', 'Ministry Desk', 'Airport', 'Corporate'][i % 4],
      category: i % 9 === 8 ? 'Private' : 'Commercial',
    });
  }
  return out;
}

export const DEMO_USERS = [
  { username: 'kmuser', name: 'Demo KM User', role: 'KM_USER' },
  { username: 'fuel1', name: 'Demo Fuel One', role: 'FUEL_USER' },
  { username: 'fuel2', name: 'Demo Fuel Two', role: 'FUEL_USER' },
  { username: 'docs', name: 'Demo Documents', role: 'DOCS_USER' },
  { username: 'viewer', name: 'Demo Viewer', role: 'VIEWER' },
];

/** A small repeatable random number generator, so demo data is the same every time. */
export function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
