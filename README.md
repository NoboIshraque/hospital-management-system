# UHID — National Hospital Management System

A nationwide hospital management and health-record system. Every patient is issued one
**Unified Health ID (UHID)** the first time they present at any connected hospital, and
that identifier follows them for life — so a doctor in Chattogram can see a diagnosis
recorded in Dhaka, an allergy recorded in Sylhet, and a prescription written in Savar.

Database Management System course project · Department of ICT, Bangladesh University of
Professionals · September–November 2026.

---

## The problem it solves

Hospital records in Bangladesh are per-hospital and mostly on paper. A patient treated in
one district arrives at another with no history, no allergy record, and no medication list.
This system puts every connected hospital on one database, behind one patient identity.

Seven design decisions carry the project. Each is enforced by the database itself — by a
constraint, a trigger or a stored procedure — not by application code that could forget:

1. **One UHID per person.** Registration checks NID, name + date of birth, and mobile before
   it issues a UHID, and the UHID's serial comes from a counter row locked with
   `SELECT … FOR UPDATE`. A CHECK constraint verifies the format and check digit.
2. **Access is granted, not assumed.** Role permissions, patient consent grants that expire
   after 24 hours, and an append-only access log. MySQL has no trigger that fires on a read,
   so a clinical record can only be read through a stored procedure that writes the log row
   first — the web server's database account has no other way in. Emergency break-glass
   access is allowed, needs a written reason, and is queued for review.
3. **Availability is computed, never stored** — a recursive CTE over the weekly schedule,
   minus leave, minus bookings.
4. **Booking is transactional.** A unique key on the doctor and slot, plus a procedure that
   locks the doctor's row, so two bookings for one slot can never both succeed.
5. **The encounter is the clinical hub.** Diagnoses (ICD-10), prescriptions, lab results and
   vitals hang off it, coded against catalogues rather than free text.
6. **Referrals make it national.** A referral carries a consent grant to the receiving
   hospital, and is marked arrived when the patient is seen there.
7. **Bed status changes only by trigger**, when a bed stay opens or closes.

---

## Stack

| Layer | Technology |
|---|---|
| Database | MySQL 8 (developed on 8.4 LTS; needs 8.0.31 or later) |
| Backend | Node.js 20+, Express 4, `mysql2`, `bcryptjs`, `express-session` |
| Frontend | HTML, CSS, JavaScript — no framework, no build step |
| Architecture | Static pages calling a JSON API with `fetch`, both served by Express |

In numbers: 40 tables, 21 triggers, 27 stored procedures and 4 functions, 8 views,
20 demonstration queries, 64 database tests, 27 API endpoints with 59 end-to-end checks.

---

## Running it

You need **MySQL 8** and **Node.js 20 or later**. It will not run on MariaDB (for example the
one bundled with XAMPP), which lacks `REGEXP_LIKE()`, the `utf8mb4_0900_ai_ci` collation and
`INTERSECT`.

```powershell
cd server
npm install
Copy-Item .env.example .env      # then put your MySQL root password in .env
npm run db:reset                 # builds the database and loads the sample data
npm start                        # http://localhost:3000
```

`npm run db:reset` drops and rebuilds the `uhid` database — **everything in it is replaced**.
The first time, it also creates `uhid_app`, the limited MySQL user the server connects as,
and adds its password to `.env`.

| Command (in `server/`) | What it does |
|---|---|
| `npm start` | Runs the site and API at http://localhost:3000 |
| `npm run db:reset` | Rebuilds the database from `database/*.sql` |
| `npm run db:test` | Runs the 64 database tests, then resets |
| `npm run api:test` | Runs the 59 API checks, then resets |
| `npm run race` | Two receptionists booking one slot at once, five times |
| `npm run db:run -- <file.sql>` | Runs any SQL file, e.g. `../database/queries.sql` |

**Demo accounts** — password `demo1234` for every one:

| Username | Role | Hospital |
|---|---|---|
| `rezaul` | Receptionist | Dhaka Medical College Hospital |
| `anisur` | Doctor | Dhaka Medical College Hospital (and Square Hospital) |
| `rahim` | Patient | — |
| `nasima` | Hospital Admin | Dhaka Medical College Hospital |
| `rumana` | Lab Technician | Dhaka Medical College Hospital |
| `sysadmin` | System Admin | — |

**Without MySQL:** open `public/index.html` straight from disk. The pages detect that there is
no server and run on built-in sample data, as the original prototype did.

For the viva, follow **`docs/demo-script.md`**.

---

## Repository layout

```
database/   schema.sql      40 tables, CHECKs and foreign keys
            triggers.sql    the rules a CHECK cannot express
            procedures.sql  every write, and the logged read
            views.sql       the read models the screens use
            seed.sql        sample data: 8 hospitals, 11 doctors, 18 patients
            grants.sql      the least-privilege uhid_app user
            queries.sql     20 demonstration queries
            tests.sql       64 tests
server/     app.js, auth.js, routes/, db/, lib/, scripts/   the Express API
public/     the website: landing page, sign-in, privacy, 404, and the clinical console
docs/       er-design.md        the ER model and the reasoning behind it
            er-diagrams/        Chen and crow's-foot diagrams (draw.io)
            data-dictionary.md  every table and column
            normalization.md    1NF to BCNF, and every deliberate redundancy
            use-cases.md        17 use cases, each mapped to its procedure
            api.md              every endpoint and the procedure behind it
            demo-script.md      the viva demonstration, click by click
            guides/             learning guides for each team member
prototype/  the original single-file prototype
```

---

## Status

As of 1 November 2026: the database, the API, the frontend wired to the API, and the
documentation are complete and tested. `CHECKLIST.md` records each item.

---

## Team

Nobo Ishraque · Abir · Noria — Department of ICT, Bangladesh University of Professionals
