# LR Fleet App — Final Plan (Phase 1)

Status: **Phase 2 built** (logins, Vehicle Master, KM upload, fuel entry, mileage reports, corrections, activity log) · Updated: 15-10-2026

## 1. Vehicle Master import

| Excel column | App field | Rule |
|---|---|---|
| S.no | — | ignored |
| Register No. | Vehicle No. | uppercase, remove spaces / dots / hyphens; must be unique |
| Vehicle Type | Make / Model | trim spaces, tidy capitals ("Dzire " = "Dzire") |
| Fuel Type | Fuel Type | see section 2 |
| Vehicle Model | Model Year | 2019–2026 |
| Vendor / Driver | Ownership + Status (+ place) | see table below |
| Vendor / Driver Name | Driver name, or Vendor/holder name | |
| Vendor / Driver Contact | Driver phone (driver ID), or vendor contact | |
| Department | Department / Client | filter in reports |
| Category *(owner will add)* | Commercial / Private | blank = row flagged |

The upload screen guesses this mapping from the headers; the Admin can change it. The last mapping is remembered.

### Vendor / Driver values

| Value | Ownership | Status / place | Fuel & average | Service | Documents |
|---|---|---|---|---|---|
| DRIVER | Company – Driver | Active | yes | yes | yes |
| GOVT DRIVER | Company – Govt Driver | Active | yes | yes | yes |
| FREE LR | Company | Idle – Lodhi Road | not while idle | yes | yes |
| FREE JN | Company | Idle – Jangpura | not while idle | yes | yes |
| WORKSHOP CH / WORKSHOP MU / ACCIDENTAL / ARUN-CNG | Company | Workshop – (name) | not while in workshop | yes | yes |
| VENDOR | Vendor | Active | no (KM only) | no | yes |
| OFFICER | Officer | Active | no (KM only) | no | yes |
| PERSONAL | Personal | Active | no (KM only) | no | yes |

Vendor, Officer and Personal vehicles appear together in the **Vendor / Others** tab.
Sold vehicles: hidden behind a toggle, **no document alerts**.

## 2. Fuel types and averages

| Fuel type | Fuel form columns | Average shown |
|---|---|---|
| Petrol (incl. HYBRID PETROL) | Petrol L | km/L |
| Diesel | Diesel L | km/L |
| CNG/Petrol | CNG kg + Petrol L | km per (kg+L), both added together |
| CNG only (5 vehicles) | CNG kg | km/kg |
| Electric | **Amount ₹ only** (no kWh) | **₹ per km** (cost per km) |

Every row also has Amount ₹, Bill/slip no., Station/card (IGL, Garuda…), Remarks.

- **Cost per km** = total ₹ ÷ total KM, for all vehicles.
- **Standard (benchmark)** is calculated by the app, not typed in: the **median** average of all vehicles of the same model + fuel type in the same period. Electric vehicles are compared on ₹/km (higher = worse).
- **Needs Attention**: more than 10% worse than the benchmark (the 10% can be changed in Settings). Fewer than 3 comparable vehicles → "Not enough data to compare".
- Fuel 0 → "No fuel entry". KM 0 → "No KM". Never Infinity or NaN.

## 3. Date ranges

- **GPS upload:** choose From → To (1 day … 1 month). Each row's date comes from "Start Time" (fallback: the title line, then the chosen date). Rows outside the range are skipped. Days with no data are listed. Vehicle-days that already have KM → Skip, or Replace (goes to the Admin). Undo removes the whole upload.
- **GPS rows dropped:** device names not in the master (including number-only devices such as 14936), listed in the summary. A " (1)" ending is ignored.
- **Fuel entry:** one form with From → To (same date = one day). Lists Company vehicles (Driver / Govt Driver) that were Active on at least one day in the range. If a fill spans a driver change, a month end or workshop days, it is split by the KM run on each eligible day. Daily averages are shown only for single-day entries.

## 4. Drivers, vendors and phones

- Driver phone = driver ID. One driver on several vehicles is allowed.
- Same phone with two different driver names → warning on import, for the Admin to fix.
- Vendors are stored separately; one vendor may hold several vehicles and share a number.

## 5. Database tables

users · sessions · drivers · vendors · vehicles · vehicle_status_history (from/to, status, place) ·
vehicle_driver_history (from/to) · km_uploads · daily_km · fuel_entries (from/to) · correction_requests ·
activity_log (append-only trigger) · settings · required_documents (category → doc types) · documents ·
models (service interval) · service_records

## 6. Screens

Login · Change password · Dashboard (per role) · Users · Vehicles (Driver | Vendor/Others | Workshop/Idle | Sold) ·
Vehicle detail · Vehicle Master upload (map → preview → save) · KM upload (range) · Manual KM · Upload history/undo ·
Fuel entry (range, mobile) · My entries + Request correction · Mileage (Daily | Monthly | Custom, Vendor tab, export) ·
Driver report · Documents dashboard · Add/Renew document (mobile camera) · Document bulk import + template ·
Expiring this month · Correction requests · Activity log · Settings · Service records · Service due

## 7. Build order

1. Phase 2 — Logins & roles → Vehicle Master → KM upload → Fuel entry → Mileage reports
2. Phase 3 — Documents
3. Phase 4 — Service & Maintenance, Dashboard

Tests, demo data (fake names and phones) and browser steps at the end of each phase.
Real Excel files and phone numbers never go into GitHub.
