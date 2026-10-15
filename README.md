# LR Fleet App

The fleet app for LR Taxi Services. It covers GPS KM uploads, fuel entry, mileage (average) by vehicle and driver, vehicle status and driver history, correction requests and a full activity log. Documents arrive in Phase 3; Service and the full Dashboard arrive in Phase 4.

- **Built with:** Node.js 24 · Express · PostgreSQL (Prisma) · React + Vite + Tailwind. It runs as one service.
- **Calendar:** Asia/Kolkata. Dates are shown as DD-MM-YYYY and money in ₹.

> **Never put real data in GitHub.** `.env`, the local database, backups and every `.xlsx / .xls / .csv` file are blocked by `.gitignore`. The only exceptions are the fake practice files in `samples/demo/`.

---

## 1. Run the app on your PC

You need this once: **Node.js** (the LTS version) and **Git**. Both are already installed on this PC.

1. Open the project folder `Desktop\LR-Fleet-App` in a terminal. In Windows Explorer: right-click the folder → **Open in Terminal**.
2. First time only: install the building blocks.
   ```bash
   npm install
   ```
3. First time only: create your settings file. Copy `.env.example` to `.env`, then open `.env` in Notepad and change `SESSION_SECRET`, `ADMIN_PASSWORD` and `DEMO_PASSWORD`. *(On this PC, `.env` already exists and is filled in.)*
4. **Start the database.** Keep this window open while you use the app.
   ```bash
   npm run db:start
   ```
5. Open a **second** terminal window in the same folder. First time only, set up the tables and the Admin:
   ```bash
   npm run migrate
   ```
   ```bash
   npm run seed
   ```
6. Optional: add **demo data** (30 fake vehicles, KM, fuel and 5 demo users). This only works on an empty local database.
   ```bash
   npm run demo
   ```
7. Build the screens and start the app:
   ```bash
   npm run build
   ```
   ```bash
   npm start
   ```
8. Open **http://localhost:3000** in your browser and log in:
   - **Admin:** the `ADMIN_USERNAME` / `ADMIN_PASSWORD` values in `.env`.
   - **Demo users:** `kmuser`, `fuel1`, `fuel2`, `docs`, `viewer`. Their password is `DEMO_PASSWORD` in `.env`.

Next time, you only need step 4 (`npm run db:start`) and then `npm start` in the second window.

### Practice files
`samples/demo/` has a fake Vehicle Master and a fake GPS report (1–3 October 2026) to try the upload screens. Make them again with `node scripts/make-samples.js`.

### Run the automated tests
```bash
npm test
```
The tests start their own temporary database, so your data is never touched.

---

## 2. Put the code on GitHub

1. Go to **github.com**, sign in, then click **+** (top right) → **New repository**.
2. Name: `lr-fleet-app`. Choose **Private**. Leave every box unticked. Click **Create repository**.
3. In the terminal, in the project folder, run these one at a time. Replace `YOUR-NAME` with your GitHub user name.
   ```bash
   git add .
   ```
   ```bash
   git commit -m "LR Fleet App"
   ```
   ```bash
   git remote add origin https://github.com/YOUR-NAME/lr-fleet-app.git
   ```
   ```bash
   git push -u origin main
   ```
   The first time, Git opens a browser window so you can sign in to GitHub.
4. Check on github.com that `.env`, `.pgdata` and your real Excel files are **not** listed.

If Git asks "Please tell me who you are", run these once (with your own name and email):
```bash
git config --global user.name "LR Taxi Services"
```
```bash
git config --global user.email "you@example.com"
```

---

## 3. Create the Supabase database (Singapore)

1. Go to **supabase.com** → **Start your project** → sign in.
2. Click **New project**:
   - Name: `lr-fleet`
   - **Database password:** click *Generate*, then copy it somewhere safe (your password manager).
   - **Region:** *Southeast Asia (Singapore)*
   - Click **Create new project** and wait about 2 minutes.
3. Click **Connect** (top of the project page) → **Connection string** → choose **Session pooler**. Copy the string. It looks like
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with the database password from step 2. You'll paste this into Railway as both `DATABASE_URL` and `DIRECT_URL`.
4. **Storage bucket (needed in Phase 3, for document scans):** left menu **Storage** → **New bucket**. Name: `vehicle-documents`. Leave **Public bucket OFF** so it stays private. Click **Save**.
5. **Service key (Phase 3):** **Project Settings** → **API Keys** → copy the `service_role` secret. It is a password: never share it and never put it in GitHub.

---

## 4. Deploy on Railway

1. Go to **railway.com** → sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → pick `lr-fleet-app`. Allow Railway to read the repository if it asks.
3. Click the new service, then the **Variables** tab → **Raw Editor**, and paste the block below with your own values filled in:
   ```
   NODE_ENV=production
   TZ=Asia/Kolkata
   DATABASE_URL=<Supabase Session pooler string>
   DIRECT_URL=<the same Session pooler string>
   SESSION_SECRET=<a long random text, at least 32 characters>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<a strong password for the Admin>
   ```
   Click **Update variables**.
4. Open the **Settings** tab:
   - **Region:** *Southeast Asia (Singapore)*.
   - **Build command:** `npm run build`
   - **Start command:** `npm run start:prod`. This updates the tables (migrations), creates the Admin the first time, then starts the app.
   - **Healthcheck path:** `/api/health`
5. **Settings** → **Networking** → **Generate Domain**. Railway gives you an address like `lr-fleet-app-production.up.railway.app`.
   - **Your own domain:** click **Custom Domain**, type e.g. `fleet.lrtaxi.in`, then add the **CNAME** record Railway shows you at your domain provider.
6. Railway deploys on its own. Open **Deployments** → **View logs** and wait for `LR Fleet App running`.
7. Open your domain, log in as the Admin, and create the other users under **Users**.

From now on, every `git push` to GitHub redeploys the app automatically.

> After the first login, you can remove `ADMIN_PASSWORD` from Railway. The Admin already exists, and you can change the password from the app.

---

## 5. Back up the database

**Supabase:** the paid (Pro) plan keeps daily backups for 7 days (**Database → Backups**). On the free plan, make your own backups as below. Do this at least once a week, and before big changes.

1. First time only: install the free PostgreSQL command-line tools:
   - Go to **enterprisedb.com/downloads/postgres-postgresql-downloads** → Windows → **PostgreSQL 17**.
   - Run the installer. On the "Select Components" page, tick **only "Command Line Tools"**. Accept the rest.
2. Make a backup. Paste your Supabase Session pooler string between the quotes:
   ```bash
   npm run backup -- "postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
   ```
   The file is saved in the `backups\` folder, e.g. `backups\lrfleet-2026-10-12-18-30.dump`.
3. Copy the backup file to a safe place, such as Google Drive or an external disk. **Never put it in GitHub** (`.gitignore` blocks it).

**Restoring** overwrites the database, so ask for help first. The command is:
```bash
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --clean --no-owner -d "<connection string>" backups\<file>.dump
```

---

## 6. How the app works (rules in plain words)

| Topic | Rule |
|---|---|
| **Vehicle types** | **Driver** and **Govt Driver** vehicles get fuel entry and averages. **Vendor**, **Officer** and **Personal** vehicles get KM (and documents in Phase 3) only. |
| **Status** | Active / Workshop / Idle / Sold, each with a from–to date. Workshop, Idle and Sold days are left out of averages. |
| **GPS upload** | Pick From–To dates (1 day up to 2 months). Each row's date comes from the file. Vehicles not in the master are dropped and listed. `DL 1C-AB 1234` matches `DL1CAB1234`, and `(1)` endings are ignored. |
| **Same date twice** | The user can **Skip**, or **Replace**, which goes to the Admin as a request. The Admin can **Undo** a whole upload. |
| **Fuel entry** | Pick From–To dates (the same date for one day). One fill covering several days is split over the active days by the KM run, so driver changes and month ends are handled. |
| **Average** | KM ÷ fuel. **CNG/Petrol:** CNG kg + Petrol L are added together. **Electric:** ₹ per km, because only the amount is entered. |
| **Standard** | The middle value (median) of the same model and fuel type in the same period, worked out automatically. "Needs Attention" = more than 10% worse (you can change this in Settings). |
| **Corrections** | Non-Admins cannot edit or delete. They send a request; when the Admin approves it, the change is applied and logged. |
| **Activity log** | Every action, with old and new values and the IP address. The database blocks edits and deletes. |

---

## 7. Project layout (for a developer)

```
server/        Express API (routes/, services/ for import + mileage logic, lib/)
client/        React screens (pages/, components/)
prisma/        schema.prisma, migrations/, seed.js (Admin), demo-data.js
tests/         Vitest + Supertest (must-pass tests from the brief)
scripts/       local-db.js (PostgreSQL for this PC), backup.js
samples/demo/  fake practice Excel files only
```
