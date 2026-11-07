# CLAUDE.md — UHID National Hospital Management System

Context for anyone (human or Claude) working in this repo. Read this before writing code.

## What this is

A **Database Management System course project** — a nationwide hospital management and
health-record system. Every patient gets one **UHID** on first contact with any hospital,
and their record follows them to every other connected hospital in the country.

Author: Nobo Ishraque, Dept. of ICT, Bangladesh University of Professionals.
Submission date: **8 November 2026** — the real date, confirmed by the author 6 Nov 2026 (the
original 25 October passed; 7 November was the team's own target). Frontend must be presentable
**immediately** — it is being shown to the course teacher.

**This is a DBMS course, not a web development course.** The database carries the marks.
The frontend exists to demonstrate the database. Do not let UI polish crowd out schema work.

## Stack — do not change these

| Layer | Technology |
|---|---|
| Database | MySQL 8 — **8.4 LTS** on the author's laptop |
| Backend | Node.js + Express + `mysql2` (not yet built) |
| Frontend | **Vanilla HTML, CSS, JavaScript** |

**No frameworks.** No React, no Vue, no Tailwind, no build step, no bundler, no TypeScript.
The course requires plain HTML/CSS/JS and the author is learning these. Adding a framework
would be actively harmful. Libraries in general need a real justification.

### The author's laptop

Set up 11 Oct 2026. Check here before concluding something is missing — the 27 Sep session
looked only on `PATH`, missed XAMPP, and logged "no database" for two weeks.

- **MySQL 8.4.9** (winget `Oracle.MySQL`), Windows service **`MySQL84`**, automatic start.
  Binaries `C:\Program Files\MySQL\MySQL Server 8.4\bin` (on the user `PATH`); config and data
  under `C:\ProgramData\MySQL\MySQL Server 8.4\`. Listens on **127.0.0.1:3306 only**.
  Server defaults: `utf8mb4` / `utf8mb4_0900_ai_ci`, strict `sql_mode`.
- **The root password is not in this repo and must never be.** The author holds it. Code
  reads credentials from `.env` (ignored by git); ask the author if you need them.
- **XAMPP** is also installed at `C:\xampp`, with **MariaDB 10.4**. It wants port 3306 too,
  so its MySQL must stay stopped while `MySQL84` runs. Do not test this project against it:
  `schema.sql` uses MySQL-8-only syntax (`utf8mb4_0900_ai_ci`, `REGEXP_LIKE`) and fails there.
- **Node.js 24.20.0 LTS** (winget `OpenJS.NodeJS.LTS`) at `C:\Program Files\nodejs`, with
  npm 11. `mysql2` 3.x connects to the MySQL above with its default `caching_sha2_password`
  login — tested 11 Oct 2026, so no `mysql_native_password` workaround is needed.
- **PowerShell execution policy: the author's `RemoteSigned` setting was lost by 1 Nov 2026**
  (CurrentUser shows `Undefined`, so the machine default `Restricted` blocks `npm.ps1` and `npm`
  fails with "running scripts is disabled"). The fix is the author's to run, since it is a
  security setting: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Until then `npm.cmd`
  works regardless. Give full paths in instructions (`cd E:\hospital-management-system\server`):
  an administrator PowerShell starts in `C:\Windows\system32`.
- **Two checkouts of this repo exist (found 6 Nov 2026):** `E:\hospital-management-system` (the
  original, with `server\.env` and `node_modules`) and `D:\hospital-management-system` (a later
  clone; the 6 Nov session worked there after copying `.env` across and running `npm.cmd ci`).
  Both share one MySQL database. Before working in either, `git pull` in it — the other may be
  behind.

## Architecture — the decision that shapes everything

**Static HTML pages that call a REST API with `fetch()`, served as static files by Express.**
Not EJS, not server-side rendering.

Why: the frontend had to be built *before* the backend existed, so the pages first ran on
JavaScript constants. **Since 31 Oct 2026 they run on the API**, in two modes chosen by
`js/api.js` at page load:

- **Served by Express** (`npm start` → http://localhost:3000): `API.ready` resolves `true`.
  `HOSPITALS`, `DOCTORS` and `DEPARTMENTS` are replaced *in place* (array splice) with what
  `/api/hospitals` etc. return; the shell asks `GET /api/me` for the session (401 → login);
  every write goes to an endpoint. **There is no patient list in the browser** (since 6 Nov
  2026): `store.all()` returns `API.patients`, which holds only the patients this page found
  with `API.searchPatients()` (`POST /api/patients/search`, masked, at most 20, each match
  logged). The selected patient's UHID and name ride in `sessionStorage` (`uhid.current.v1`)
  to label screens. Opening a record is `API.readRecord()` → `POST /api/patients/:uhid/read`,
  a logged read — a POST so a cross-site link cannot trigger it.
- **Opened from disk** (`file://`) or with no API behind it: `API.ready` resolves `false`, and
  the pages use `js/data.js`, `js/seed.js` and localStorage exactly as the prototype did. This
  is what lets the frontend be shown without MySQL running. Keep it working.

`shell.js` start-up is therefore asynchronous: `SHELL_READY` is a promise, and `boot(render)`
waits for it. Every screen renders inside `boot`, never at the top level of its script.

**The consequence that matters:** the API returns exactly the shapes `js/data.js` and
`js/seed.js` use (plus extra fields such as `encounterCount`, `labs[]`, `accessLog[]`), so the
same rendering code serves both modes. A new field is additive; renaming one breaks the
offline mode silently. `mock/` is empty and nothing reads it.

### The site has two halves

| Page | What it is |
|---|---|
| `public/index.html` | **The public landing page — the front door.** No account needed: hospitals, doctors, services, how a UHID works, FAQ. |
| `public/login.html` | Sign-in. The four demo accounts. |
| `public/privacy.html` | What the prototype stores, what leaves the browser, what the real system will do. Static, loads no JavaScript. |
| `public/pages/*.html` | **The clinical console.** Needs a session; a signed-out browser is sent to `login.html` by `js/shell.js`. |

`index.html` was the login screen until September 2026. It is now the public site, and login
moved to `login.html`. **`LOGIN_HREF` in `js/util.js` is the single place that knows where the
sign-in page lives** — it works out the `../` for itself from `document.body.dataset.page`.
If you add a page, give its `<body>` a `data-page`, and add root-level pages to `AT_ROOT`.

## Repository layout

What exists today. Anything marked *planned* is an empty folder or a file not yet written.

```
docs/         er-design.md (the ER model), er-diagram-guide.md (how to draw it),
              er-diagrams/uhid-er-chen-boxed.drawio (Chen, the one to hand in),
              er-diagrams/uhid-er-chen.drawio (Chen, ellipse styling),
              er-diagrams/uhid-er.drawio (crow's foot, logical — no longer maintained since 1 Nov 2026)
              use-cases.md (28 use cases, each mapped to its procedure/trigger/view),
              data-dictionary.md (all 41 tables, generated from schema.sql, then appended to),
              normalization.md (1NF → BCNF worked examples, and every deliberate redundancy)
              guides/nobo.md, abir.md, noria.md — the team's learning guides (see Team below)
              api.md (every endpoint → its procedure), demo-script.md (the viva, click by click)
              operations.md (a real installation: install, secrets, backups, health, start-up, hosting)
database/     schema.sql (41 tables) → triggers.sql → procedures.sql → views.sql → reference.sql
              → seed.sql, loaded in that order. reference.sql = what every installation needs
              (geography, roles, permissions, catalogues); seed.sql = the DEMO only
              (db:install leaves it out)
              → grants.sql (uhid_app: EXECUTE on procedures, SELECT on views and lookups only)
              queries.sql — 20 demonstration queries (joins, ROLLUP, window functions, CTEs,
              INTERSECT), each tied to a design decision; run as root, not uhid_app
              tests.sql — 309 tests of constraints, triggers and procedures (npm run db:test)
server/       Express app — serves public/ AND the JSON API under /api (docs/api.md)
  app.js        wiring only: request log, session, routes, static files, 404, error handler,
                clean shutdown; refuses a production start with root's password in .env
  auth.js       sessions, requireLogin, requirePermission (asks has_permission() in MySQL)
  security.js   CSP and headers, refusal of cross-site writes, the login rate limit
  lib/passwords.js  the password rule (10+ characters) and one-time passwords; bcrypt runs here
  lib/request-log.js  one line per request to logs/ (UHIDs masked, no bodies or query strings)
  db/           pool.js (connects as uhid_app), errors.js (MYSQL_ERRNO → HTTP, id/list checks), run-sql.js,
                reset.js (demo), install.js (real: no demo, first sysadmin), backup.js, restore.js,
                mysql-tools.js (mysqldump/mysql with root's password in a temp option file),
                app-password.js, session-store.js (sessions in MySQL)
  routes/       health, auth, reference, patients, appointments, wards, clinical, audit, accounts, setup
  lib/format.js turns rows into the shapes public/ renders
  scripts/      api-test.js (npm run api:test, 145 checks), race-booking.js (npm run race:
                double booking AND double admission to one bed, 5 rounds each),
                first-day-test.js (empty install → booked patient through the API, then restores),
                restart-test.js, shutdown-test.js, windows-tasks.ps1 (start-up + nightly backup;
                the author runs it as administrator)
  practice/<name>/ — each teammate's practice files, created by them (guides Part 0.8)
public/       Frontend, served as static files (also works opened straight from disk)
  index.html    public landing page
  login.html    sign-in
  privacy.html  data-handling statement
  404.html      sent by Express for any unknown address; uses /-rooted paths for that reason
  favicon.svg   brand mark
  css/          tokens, base, components, shell, site, per-screen (clinical.css: the five screens
                added 1 Nov 2026), responsive
  js/           data, seed, store, api (the fetch wrapper + online/offline switch), util, shell, auth, home
  pages/        the clinical console — one .html + one .js per screen: register, search, record,
                book, wards (the prototype's five); encounter, referrals, lab, audit, merge (added
                1 Nov 2026, server-only — opened from disk they show needsServerHtml());
                account (change your own password, every role) and accounts (admins: staff
                accounts) — added 7 Nov 2026, server-only too; appointments (the appointment
                list: a patient's own, a doctor's own, a hospital's) and setup (hospital setup:
                doctors, fees, sessions, leave, wards, beds, hospitals) — 7 Nov 2026, server-only
backups/      npm run db:backup output — git-ignored (patient data)
logs/         request log — git-ignored
mock/         empty — the pages read js/data.js and js/seed.js instead (see Architecture)
prototype/    uhid-prototype.html — single-file working prototype (see below)
```

## The prototype is the reference implementation

`prototype/uhid-prototype.html` is a complete, working, single-file build. **Read it before
writing any frontend code.** It already contains:

- A design system (CSS custom properties, light + dark themes)
- Login with username/password and four demo accounts
- Patient registration with live duplicate detection
- Patient search across all hospitals
- Patient record with encounter timeline, prescriptions, access log
- Doctor directory with filters, availability slot grid, booking flow
- Ward bed board with admission and discharge
- localStorage persistence for registered patients

Work in `public/` splits this into proper files. **Match its conventions exactly** — do not
invent a second visual language or a second way of rendering.

**What the prototype does not contain.** The public landing page, `privacy.html`, the site
nav bar with its services dropdown, the hero figure, and the ambient light layer are all
newer work with no prototype counterpart. They live in `css/site.css` and `js/home.js` and
they use the same tokens and the same rendering rules — the prototype is still the authority
on *how* to build, it is just no longer a complete inventory of *what* exists.

### Design tokens (from the prototype's `:root`)

Light theme; dark theme redefines the same names. Always use the token, never a raw hex.

```
--ground #EEF2F4   --surface #FFFFFF   --surface-2 #F5F8F9   --surface-3 #E7EDF0
--rail   #0C2B3A   (dark sidebar)      --rail-ink #A9C2CE
--ink    #0E1B22   --ink-2 #47606D     --ink-3 #78909D
--line   #D3DEE3   --line-2 #BACAD1
--brand  #0E6E8C   --brand-ink #0A5570 --brand-soft #DDEDF3  --on-brand #FFFFFF
--ok     #17753F   --warn #96550A      --crit #A81F2D        --info #4A3E9E
                   (each has a matching --*-soft background)
--r 5px  (border radius)
```

Fonts: **IBM Plex Sans** (UI), **IBM Plex Mono** (UHIDs, times, IDs, any aligned digits),
**IBM Plex Serif** (brand mark only). Loaded from Google Fonts.

Semantic colour is separate from brand colour: `--ok` / `--warn` / `--crit` mean bed status,
allergy severity, appointment state. Never use `--brand` to mean "good".

### Code conventions

- **Template literals** for HTML generation, never string concatenation with `+`.
- **Always `esc()`** any data value before putting it in HTML. A patient named `<script>`
  must not break the page.
- Render from data. No hardcoded table rows or list items anywhere.
- Every screen needs **loading, empty, and error states**. A blank timeline must say why
  it is blank, not render nothing.
- `localStorage` reads and writes are always wrapped in `try/catch` — private browsing
  makes them throw.
- Plain functions and a small `S` state object. No classes, no state library.
- **`Number()` anything that goes into a `style` attribute.** `esc()` protects HTML; a style
  attribute is a second injection surface and needs its own guard.
- **Printing is in the `@media print` block at the end of `css/responsive.css`.** It hides the
  console chrome and prints the open tab; `tokens.css` limits the dark theme to `screen`, so
  paper is always the light theme. `.print-only` elements (the record's "printed by" footer)
  appear only on paper.
- **`privacy.html` must stay true.** It states what the system stores and sends. When that
  changes (a new cookie, a new external request), change the page in the same commit.
- **All media queries live in `css/responsive.css`, which is linked last on every page.**
  They win on source order alone. Link it anywhere but last and the layout breaks.
- **No controllers/ or services/ layer, on purpose.** The stored procedures are the service
  layer; a route validates input, calls one procedure (or a few, in one transaction), and shapes
  the result. Business rules go in `database/`, never in a route.
- **A new procedure the server calls needs its own GRANT** in `database/grants.sql`
  (`GRANT EXECUTE ON PROCEDURE uhid.<name> TO 'uhid_app'@'localhost';`). Since 7 Nov 2026 the
  server may run only the procedures it calls, by name, not `uhid.*` — without the line the
  route fails with error 1370 "execute command denied". Helpers called only from inside other
  procedures need no grant.
- **"May this clinician be seeing this patient?" is one function, `care_basis()`**, used by
  `start_encounter()`, `admit_patient()` and `log_unsaved_encounter()`. Change the rule there, once.
- **No stored procedure, function or trigger ever builds SQL from text** — no `PREPARE`, no
  `CONCAT` into a statement; every value is a typed parameter. Procedures run with root's rights
  (that is how `uhid_app` reaches tables it cannot touch), so one injectable procedure would be
  injection as root. This is accepted risk D2 in `er-design.md` §8.4, and this rule is what makes
  it acceptable. (`PREPARE` in `grants.sql` and in `tests.sql`'s helpers is root-only setup.)
- **Run `npm run api:test` before committing any change in `server/`.**
- **Passwords never reach SQL.** Node makes one-time passwords and bcrypt hashes
  (`server/lib/passwords.js`); account procedures accept only a bcrypt-shaped string
  (`require_hash()`). A one-time password is returned once in the API answer and never again.
- **`DEMO_MODE=1` in `server/.env`** makes the sign-in page list the demo accounts and their
  shared password (`GET /api/config`). A real installation leaves it out.
- **Reference data goes in `reference.sql`, demo data in `seed.sql`.** A new lookup row every
  installation needs (a permission, a department, a catalogue entry) belongs in reference.sql, or
  `db:install` builds a database without it. A new permission also needs its `role_permission`
  rows there.
- **Root's login is for the database scripts only.** They read `server/.env.admin` first, then
  `.env`; the running site never reads `DB_PASSWORD`, and with `NODE_ENV=production` refuses to
  start while it is in `.env`.
- **The request log must never hold patient data.** It masks UHIDs and never writes bodies or
  query strings; who read which record belongs in `access_log` only.
- **Before committing a change to `db/install.js`, `backup.js` or `restore.js`, run
  `npm run first-day:test`** — it installs, backs up and restores, and puts the demo back.
- **Run `npm run db:test` (in `server/`) before committing any change in `database/`.** It
  rebuilds, runs `database/tests.sql`, and rebuilds again; it exits non-zero if any test fails.
  A new rule in a trigger or procedure gets a test that proves it refuses what it should, with the
  exact error number. On 31 Oct 2026 the suite caught a real bug: `transfer_patient()` violated
  `ck_occupancy_dates` when called in the same second as the admission.
- **Cardinality lives in two places and they must agree:** `docs/er-design.md` §4 and
  `docs/er-diagrams/uhid-er-chen-boxed.drawio` (the one handed in); keep
  `uhid-er-chen.drawio` (the ellipse version) in step too. **The crow's-foot file
  `uhid-er.drawio` is no longer maintained** — the author's decision on 1 Nov 2026 — so it lacks
  the six changes in er-design.md §8.2; do not update it unless asked. Never edit page 1 of the
  Chen files (the author's own styling) without asking.
- **localStorage keys carry a version suffix** (`uhid.patients.v2`). When cached data becomes
  wrong — a changed shape, or corrected seed values — bump the suffix in `js/store.js` so every
  browser starts again from the seed. Do not write a migration for prototype data. The
  patients and wards keys went to v2 in October 2026 when the seed UHIDs were corrected.
- **Site content arrays live in `js/home.js`, not `js/data.js`.** `data.js` holds what becomes
  MySQL lookup tables once the API exists — hospitals, doctors, departments. Nav links, service copy,
  FAQ text and hero steps are page chrome and must not be mixed in with it.
- **Animate `transform` and `opacity` only.** Both are composited; animating anything else
  makes the browser re-lay-out the page every frame.
- **Every animation degrades under `prefers-reduced-motion: reduce`** — to no movement, never
  to no content. There is one block at the bottom of `site.css` that turns them all off.
- **Every page carries the same furniture:** a favicon, a `theme-color`, a `.skip-link` as the
  first thing in `<body>`, and an `id="main"` for it to skip to.
- Raw hex is banned everywhere except two files that cannot read CSS custom properties:
  `favicon.svg` and the `theme-color` meta tag. Both hold `#0E6E8C`, which is `--brand`.
  If the brand colour ever changes, those two change by hand. `docs/er-diagrams/uhid-er.drawio`
  and the two `uhid-er-chen*.drawio` files are three more for the same reason — draw.io cannot
  read CSS custom properties.

### What the public page must not become

It says plainly, in the strip above the nav, that it is a course project and not a live
government service. **Do not dress it up as an official government portal** — no ministry
seals, no borrowed logos, no invented endorsements. Honest disclosure reads as more
professional than fake officialdom, and it keeps the project clear of implying an approval
it does not have. Invented testimonials and fabricated notices are out for the same reason.

## Data shapes — these are the API contract

Defined in the prototype's mock data. Keep them stable; the MySQL schema and the Express
endpoints must match.

- `hospital` — id, name, div, dist, tier
- `doctor` — id, name, dept, qual, hospitalId, fee, bmdc
- `patient` — uhid, name, dob, sex, blood, phone, nid, district, address, kin,
  registeredAt, registeredHospitalId, identityVerified, allergies[], encounters[]
- `encounter` — date, hospitalId, type (OPD/Emergency/Inpatient), doctor, dept, dx, notes, rx[]

UHID format: `BD-<year>-<5-digit serial>-<check digit>`, e.g. `BD-2026-13052-1`.
The check digit is the serial's digits summed mod 10 — `1+3+0+5+2 = 11`, so `1`.

The rule is written down in exactly two places, and they must agree: `uhidCheckDigit()` in
`js/util.js` (the prototype has its own copy) and `ck_patient_uhid_check_digit` in
`database/schema.sql`. Never build a UHID by hand or with a different formula — the seed data
once did, and every seeded UHID failed the database's own CHECK. The five seed UHIDs are
`BD-2019-04821-5`, `BD-2021-11904-5`, `BD-2018-00723-2`, `BD-2023-38104-6`, `BD-2020-27615-1`.

## The seven design decisions that carry this project

Do not quietly undo any of these — they are the reason the project scores.

1. **UHID is anchored to a national ID.** Registration duplicate-checks on NID, name + date
   of birth, and mobile before issuing. A patient with two UHIDs is the failure the whole
   system exists to prevent.
2. **Access is granted, not assumed.** Role-based permissions, patient consent grants with
   expiry, and an `access_log` row written on every clinical read. MySQL has no `SELECT`
   trigger, so the write happens inside the stored procedure that performs the read, and the
   app's database user may only `EXECUTE` that procedure — never "a trigger does it", which
   will not survive a viva follow-up (`er-design.md` §4.5). Emergency break-glass access is
   allowed but flagged.
3. **Doctor availability is computed, never stored** — from recurring schedule, minus leave
   exceptions, minus existing bookings.
4. **Booking is transactional.** `UNIQUE(doctor_id, slot_start)` plus a stored procedure
   using `SELECT … FOR UPDATE`. Two patients cannot take one slot.
5. **`encounter` is the clinical hub.** Diagnoses, prescriptions, lab orders and vitals all
   hang off it. Diagnoses/medicines/tests reference catalogue tables, never free text.
6. **Referrals are what make it national.** Hospital A refers to Hospital B; B sees the full
   history on arrival.
7. **Bed state changes via trigger**, on admission / transfer / discharge — not in app code.

## Roles

Patient · Receptionist · Doctor · Hospital Admin · System Admin · Lab Technician.
**Receptionist admits** to a bed; **Doctor discharges.** There is no separate ward-staff role.

## Status

*Keep this table honest — it is the first thing a new session reads.*

| | |
|---|---|
| Frontend prototype | Built (single file) |
| Console split into `public/` | Done — 5 screens, shared shell. Wired to the API 31 Oct 2026 (25-step browser test passed, no JS errors); still runs on sample data when opened from disk |
| Screens for every role | Done 1 Nov 2026 — record encounter, refer (on the record), referral inbox, lab worklist, break-glass review, merge records, bed transfer (on the bed board). Every role's `ROLES` blurb in `js/data.js` now matches what its screens do. Browser-tested end to end as doctor, lab technician, hospital admin, receptionist and system admin, plus offline mode |
| Public landing page | Done — nav, dropdown, hero, services, hospitals, doctors, FAQ, footer |
| Privacy / data-handling page | Done |
| Repo + GitHub | Done |
| Use cases | Done — `docs/use-cases.md` |
| ER diagrams | Three draw.io files, 6 pages each. `uhid-er-chen-boxed.drawio` is the one to hand in — author's own styling, page 1 his, 2–6 matched to it. Both Chen files updated 1 Nov 2026 with the six changes in er-design.md §8.2 (pages 2–5; page 1 untouched). The crow's-foot file is no longer maintained |
| **ER model** | **Agreed — `docs/er-design.md`. The 5 open questions were decided 27 Sep 2026; §8 records them** |
| **`database/`** | **schema (41 tables, phase 1 + 2 + web_session), triggers (21), procedures (76 + 8 functions), views (9), reference, seed, grants, 20 demonstration queries, 309 tests — all built and loaded together. `npm run db:test` passes 309/309 (7 Nov 2026, after checklist section I) (6 Nov 2026: before then the 38 `t_value` checks silently recorded nothing — see the comment on `t_value` in tests.sql — so "74/74" was 74 of 101)** |
| MySQL 8 and Node.js on the laptop | Both installed 11 Oct 2026 and tested together — see "The author's laptop" under Stack |
| Express API | Done 31 Oct 2026 — 60 endpoints since checklist section I (7 Nov 2026), `docs/api.md`; `npm run api:test` passes 145/145; `npm run first-day:test` 17/17, `restart:test` and `shutdown:test` pass; `npm run race` shows 5/5 single bookings and 5/5 single admissions to one bed |
| Stress test, 7 Nov 2026 | Done the same day — three agents (database, server, frontend + docs) found 7 fix-before-viva, 14 should-fix and a batch of low items; **all fixed** and tested (`CHECKLIST.md` §H, `er-design.md` §8.6), browser-checked online and offline |
| Security review, group 1 (fix before the viva) | Done 6 Nov 2026 — A1–A6, L1, W1, I2 (`er-design.md` §8.3). Each DB rule has a `tests.sql` §9 test with its errno; browser-tested as receptionist, doctor and hospital admin, plus offline mode |
| Security review, groups 2–4 | Done 6 Nov 2026 — accepted risks written down (§8.4); S1, S3 (behind `COOKIE_SECURE=1`), S5, S6, W2, W3, W4, I3, A7, A9, D5 built and tested (`server/security.js`; §8.5). Left on purpose, with reasons in §8.5: S2, S4, D3, L2, A8, L5, L3 |
| Data dictionary, normalization write-up | Done — `docs/data-dictionary.md`, `docs/normalization.md` |
| Demo script, README | Done 1 Nov 2026 — `docs/demo-script.md`; README rewritten for the running system |
| Print stylesheet, 404 page | Done 1 Nov 2026 |
| Shipment-ready, checklist I3–I13 | Done 7 Nov 2026 — discharge form; edit details and verify identity; *Hospital setup*; sessions in MySQL; `db:install` (no demo), `db:backup`/`db:restore`; health, request log, clean shutdown, start-up tasks; root's password out of the site's reach; review verdicts, who cancelled, referral agreement, access-log paging, lab collection. Only I14, hosting, is left (`docs/operations.md` §5) |
| Appointment lists (checklist I2) | Done 7 Nov 2026 — one screen, three lists decided by `list_appointments()`; cancel before the slot, *Did not come* after it (`mark_no_show()`) |
| Real accounts (checklist I1) | Done 7 Nov 2026 — own passwords, admin account screens, patient portal logins, one-time passwords with a forced change, demo list only with `DEMO_MODE=1` |

## Open items — do not lose these

- **Read `handover.md` first.** Written 1 Nov 2026; items 1 (ER docs) and 2 (screens) done the
  same day. Still open there: the team's guides, and the laptop is short of memory. Update or
  delete it when those are dealt with.
- **Security review, 1 Nov 2026** (33 items: https://claude.ai/artifact/5DUs8QRcx7Ztc31xjqNZE5 ).
  Group 1, "fix before the viva", is **done** (6 Nov 2026; `er-design.md` §8.3 lists each rule).
  Groups 2–4 are **done or decided** too (6 Nov 2026): §8.4 the accepted risks, §8.5 what was
  built and what was left on purpose. **Before the site is ever put on a public address:** give
  every account its own password and take the list off the login page (S2), serve it over HTTPS
  with `COOKIE_SECURE=1`, and keep root's password off that machine (D3). Not needed for the viva.
- **The Content-Security-Policy (`server/security.js`) forbids inline scripts.** Never add a
  `<script>` block or an `onclick=` attribute to a page — put the code in a `.js` file. A new
  external resource (another font host, a CDN) must be added to the policy, or the browser
  blocks it. `style="…"` attributes are allowed.
- **Scope rules the procedures now enforce — keep them when changing a procedure:** an action
  checks the caller's hospital (wards, cancel, merge), an encounter is written only by its own
  doctor (or the admitting department for an inpatient), `start_encounter()` needs a basis or a
  reviewed reason, and `treating` means the reader's own encounter or department.
- **`CHECKLIST.md`**: sections A–H done and verified; section I (shipment-ready) done on 7 Nov 2026
  except **I14, hosting**, which needs a real server and domain (`docs/operations.md` §5).
  New work: add it there first, then tick it when it is run and checked.
- **The Chen ER diagrams lag the schema by one entity:** they do not show `web_session`
  (user_account 1 : N web_session) or the columns added 7 Nov 2026 (`er-design.md` §8.8 lists
  them). Pages 2–6 need them drawn; page 1 is the author's — ask before touching it.
- **The Claude Docs were refreshed for checklist section I on 7 Nov 2026** (links in
  `handover.md`): the explainer, demo guide (new Part 12) and how-to-change guide describe the
  new screens and scripts; the frontend report has 13 new live screenshots (§4.12–4.14 and the
  discharge, lab, review and edit-details additions) and current line counts. The report's §6
  shows each file's opening comment block, not the whole file, so it needs refreshing only when
  a header comment changes or a file is added. The video script needed no change. When a screen
  changes, update these docs in the same piece of work.
- **Team: Nobo, Abir and Noria.** Each has a learning guide in `docs/guides/` that rebuilds a
  small version of one slice of the database and backend: Nobo the hardest (transactions,
  locking, recursive CTEs, derived-state triggers, the logged read, the backend core), Abir the
  middle (constraints, triggers, a procedure, harder queries, an API that maps errors), Noria the
  foundations (inserts, CHECKs, queries, a view, a read-only API). Every code block in the guides
  was run against the real database on 31 Oct 2026 and its output copied in. **If you change a
  procedure, view or seed row the guides use, re-check the guide's expected output.** Practice
  objects are prefixed `nb_` / `ab_` / `nr_` and live in `server/practice/<name>/`; `db:reset`
  wipes them, which is intended. **The guides are for learning, not delivery:** the author put
  Claude in charge of finishing the whole project (1 Nov 2026), so never wait on a teammate's
  guide work before building something. Their pushes go only in `server/practice/` — `git pull`
  before starting.
- **The seed's demo bookings are on "the coming Sunday"** (`@sun` in `seed.sql`), which on a
  Sunday is 7 days away. Any availability window must therefore be 8 days (today + a full
  week) to be sure of showing them; `book.js` and `api-test.js` both ask for `?days=8`.
- **MySQL 8.4 was reinstalled on 31 Oct 2026: 8.4.13**, service on 127.0.0.1:3306. The root
  password is in `server/.env` (git-ignored) on the laptop — or `server/.env.admin` on a real
  server; code reads it from there and never prints it.
- **The API must connect as `uhid_app`, never root.** `APP_DB_USER` / `APP_DB_PASSWORD` in
  `server/.env`; `db:reset` generates the password on first run and appends it. uhid_app has no
  table rights except SELECT on views and lookup tables, so a route that needs data a view does
  not give must get it from a procedure. Verified 31 Oct 2026: SELECT on patient, UPDATE on bed,
  DELETE/TRUNCATE on access_log all refused.
- **Rebuild the demo database with `npm run db:reset` in `server/`** (a real installation uses
  `npm run db:install` instead). It runs `database/*.sql` in
  order through `server/db/run-sql.js`, which does the mysql client's `DELIMITER` handling
  itself — mysql2 sends one statement per query and knows nothing about delimiters.


## Working rules

- The author is **comfortable with SQL, new to Node.js.** Explain Node/Express concepts;
  do not over-explain SQL.
- Prefer showing *why* a decision was made over just making it. He has to defend this work
  in a viva and cannot defend code he has not understood.

## Git — commit and push without being asked

The author's laptop is the only copy of anything not yet pushed, and losing work to a dead
machine would be fatal to this project. **So commit and push on your own initiative. Do not
wait to be asked, and do not ask permission each time.**

### When to commit and push

After **each piece of work that is finished and verified** — a page that renders, a query
that returns the right rows, a bug that is fixed, a file that is split out.

**The rule that matters: never end a turn with finished work sitting unpushed.** If you have
completed something and checked that it works, it is committed and pushed before you reply.
Not "later", not "at the end of the session" — a session can end without warning, and
anything still only on the laptop is gone. `git push` follows every `git commit`; a commit
that has not been pushed has not protected anything.

This also means a new session can always start from GitHub and be certain it has everything.
Along with the work itself, keep this file current (see below), so the next session inherits
the reasoning and not just the code.

Do **not** commit after every individual file edit *within* one piece of work — a commit is
a checkpoint, not a keystroke log. But once the piece is done and verified, push it.

### Keep CLAUDE.md current

This file is the memory between sessions. When a change makes it wrong, fix it **in the same
commit as the change**, not in a tidy-up afterwards. In particular:

- **Status table** — when something moves from not started to done.
- **Repository layout** — when a file or folder is added.
- **Open items** — when a defect is found and not immediately fixed, write it down with
  enough detail to act on cold. When it is fixed, delete the entry.
- **Code conventions** — when a new rule is established, or an old one turns out to be wrong.
- **Data shapes and the design decisions** — if either genuinely changes, which should be
  rare and deliberate.

A stale CLAUDE.md is worse than no CLAUDE.md, because the next session will trust it.

### How

```
git add .
git commit -m "<what changed, in plain words>"
git push
```

Write messages that describe the change: `"Split prototype CSS into public/css/app.css"`,
`"Add patient search page with live filtering"`, `"Fix duplicate check missing saved
patients"`. Never `"update"`, `"changes"`, `"wip"`, or `"fix"` alone.

Do not add Claude attribution, co-author trailers, or emoji to commit messages. This is
coursework submitted under the author's name and the history should read as his.

### Before committing

- **Never commit code you have not verified works.** If a page was changed, open it and
  check it renders. A broken commit is worse than no commit.
- Run `git status` first and look at what is actually staged. If something unexpected
  appears — a large file, anything that looks like a credential, a stray database dump —
  stop and tell the author instead of committing it.
- `node_modules/` and `.env` are covered by `.gitignore`. If either ever shows up in
  `git status`, something is wrong with the ignore file — say so, do not commit it.

### Hard limits

- Work on `main`. This is a solo student project; do not create branches unless asked.
- **Never** `git push --force`, `git reset --hard`, `git rebase`, or anything else that
  rewrites or discards history. If a push is rejected, stop and explain the situation.
- If a push fails on authentication, say so plainly and let the author sign in. Do not
  retry in a loop and do not attempt to reconfigure credentials.
- Never commit secrets. If real database credentials appear anywhere but `.env`, flag it.
