import { describe, it, expect } from 'vitest';
import { normPlate, normPhone, tidyName, isNumberOnly } from '../server/lib/plate.js';
import { parseDateCell, datesInText, addDays, daySpan, monthEnd } from '../server/lib/dates.js';
import { parseNumber } from '../server/lib/excel.js';
import { normFuel, readVendorDriver, guessMapping } from '../server/services/vehicleMaster.js';
import { guessKmMapping } from '../server/services/kmImport.js';
import { median, fuelQty } from '../server/services/mileage.js';
import { checkFuelRow } from '../server/services/fuel.js';

describe('vehicle numbers', () => {
  it('matches the same vehicle written different ways', () => {
    expect(normPlate('DL 1C-AB 1234')).toBe('DL1CAB1234');
    expect(normPlate('dl.1c.ab.1234')).toBe('DL1CAB1234');
    expect(normPlate('DL1CAB1234 (1)')).toBe('DL1CAB1234');
  });
  it('spots device IDs that are only digits', () => {
    expect(isNumberOnly('14936')).toBe(true);
    expect(isNumberOnly('DL1CAB1234')).toBe(false);
  });
  it('keeps the last 10 digits of a phone', () => {
    expect(normPhone('+91 98100-12345')).toBe('9810012345');
    expect(normPhone('')).toBe(null);
  });
  it('tidies model names', () => {
    expect(tidyName('Dzire ')).toBe('Dzire');
    expect(tidyName('DZIRE')).toBe('Dzire');
    expect(tidyName('innova  crysta')).toBe('Innova Crysta');
  });
});

describe('dates', () => {
  it('reads Indian day-first dates and Excel dates', () => {
    expect(parseDateCell('05-10-2026 08:15:00')).toBe('2026-10-05');
    expect(parseDateCell('05/10/26')).toBe('2026-10-05');
    expect(parseDateCell('2026-10-05')).toBe('2026-10-05');
    expect(parseDateCell('5 Oct 2026')).toBe('2026-10-05');
    expect(parseDateCell(46300)).toBe('2026-10-05');
    expect(parseDateCell('31-02-2026')).toBe(null);
    expect(parseDateCell('hello')).toBe(null);
  });
  it('finds dates in a title line', () => {
    expect(datesInText('Distance Report from 12-10-2026 to 13-10-2026')).toEqual(['2026-10-12', '2026-10-13']);
  });
  it('does date arithmetic', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daySpan('2026-10-01', '2026-10-31')).toBe(31);
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
  });
});

describe('cells', () => {
  it('reads numbers but not times', () => {
    expect(parseNumber('1,234.5 km')).toBe(1234.5);
    expect(parseNumber(12)).toBe(12);
    expect(parseNumber('02:15')).toBe(null);
    expect(parseNumber('')).toBe(null);
  });
});

describe('Vehicle Master values', () => {
  it('reads fuel types', () => {
    expect(normFuel('HYBRID PETROL')).toBe('PETROL');
    expect(normFuel('CNG/Petrol')).toBe('CNG_PETROL');
    expect(normFuel('cng')).toBe('CNG');
    expect(normFuel('Electric')).toBe('ELECTRIC');
    expect(normFuel('Hydrogen')).toBe(null);
  });
  it('reads the Vendor / Driver column', () => {
    expect(readVendorDriver('DRIVER')).toMatchObject({ ownership: 'COMPANY', status: 'ACTIVE', driver: true, govt: false });
    expect(readVendorDriver('Govt Driver')).toMatchObject({ govt: true });
    expect(readVendorDriver('FREE LR')).toMatchObject({ status: 'IDLE', place: 'Lodhi Road' });
    expect(readVendorDriver('FREE JN')).toMatchObject({ status: 'IDLE', place: 'Jangpura' });
    expect(readVendorDriver('WORKSHOP MU')).toMatchObject({ status: 'WORKSHOP', place: 'Workshop MU' });
    expect(readVendorDriver('ARUN-CNG')).toMatchObject({ status: 'WORKSHOP' });
    expect(readVendorDriver('ACCIDENTAL')).toMatchObject({ status: 'WORKSHOP' });
    expect(readVendorDriver('VENDOR')).toMatchObject({ ownership: 'VENDOR' });
    expect(readVendorDriver('OFFICER')).toMatchObject({ ownership: 'OFFICER' });
    expect(readVendorDriver('PERSONAL')).toMatchObject({ ownership: 'PERSONAL' });
    expect(readVendorDriver('???')).toBe(null);
  });
  it('guesses the column mapping from the headers', () => {
    const m = guessMapping(['S.no', 'Register No.', 'Vehicle Type', 'Fuel Type', 'Vehicle Model', 'Vendor / Driver', 'Vendor / Driver Name', 'Vendor / Driver Contact', 'Department', 'Category']);
    expect(m).toEqual({ number: 1, fuelType: 3, holderContact: 7, holderName: 6, vendorDriver: 5, make: 2, modelYear: 4, department: 8, category: 9 });
  });
});

describe('GPS columns', () => {
  it('picks distance, not odometer', () => {
    expect(guessKmMapping(['Sr No', 'Vehicle Name', 'Start Time', 'End Time', 'Start Odometer', 'Distance (KM)'])).toEqual({ vehicle: 1, km: 5, date: 2 });
    expect(guessKmMapping(['Device', 'Date', 'KMs Travelled'])).toEqual({ vehicle: 0, km: 2, date: 1 });
  });
});

describe('averages', () => {
  it('takes the median', () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBe(null);
  });
  it('adds CNG kg and Petrol L for CNG/Petrol', () => {
    expect(fuelQty('CNG_PETROL', { cng: 10, petrol: 2, diesel: 0 })).toBe(12);
    expect(fuelQty('ELECTRIC', { cng: 0, petrol: 0, diesel: 0 })).toBe(null);
  });
  it('checks fuel rows against the fuel type', () => {
    expect(checkFuelRow({ dieselL: 20, amount: 1700 }, { fuelType: 'PETROL' })).toMatch(/not used/);
    expect(checkFuelRow({ petrolL: 20, amount: 0 }, { fuelType: 'PETROL' })).toMatch(/amount/);
    expect(checkFuelRow({ cngKg: 5, amount: 400 }, { fuelType: 'CNG_PETROL' })).toBe(null);
    expect(checkFuelRow({ amount: 500 }, { fuelType: 'ELECTRIC' })).toBe(null);
    expect(checkFuelRow({ petrolL: 3, amount: 500 }, { fuelType: 'ELECTRIC' })).toMatch(/amount only/);
  });
});
