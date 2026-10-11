# UHID — National Hospital Management System

A nationwide hospital management and health-record system. Every patient is issued one
**Unified Health ID (UHID)** the first time they present at any connected hospital, and
that identifier follows them for life — so a doctor in Chattogram can see a diagnosis
recorded in Dhaka, an allergy recorded in Sylhet, and a prescription written in Savar.

Database Management System course project · Department of ICT, Bangladesh University of
Professionals · September–October 2026.

---

## The problem it solves

Hospital records in Bangladesh are per-hospital and mostly on paper. A patient treated in
one district arrives at another with no history, no allergy record, and no medication list.
This system puts every connected hospital on one database, behind one patient identity.

Four design decisions carry the project:

1. **Identity before records.** A UHID is anchored to a national ID or birth registration
   number. Registration runs a duplicate check on NID, name + date of birth, and mobile
   before it will issue a new identifier — because a patient with two UHIDs is a national
   record split silently in half.
2. **Access is granted, not assumed.** Role-based permissions, patient consent grants with
   an expiry, and an append-only access log with a row for every clinical read. MySQL has no
   trigger that fires on a read, so clinical reads go through a stored procedure that writes
   the log row and then returns the data — the application may call that procedure but never
   read the clinical tables directly. Emergency "break-glass" access is allowed but flagged.
3. **Availability is computed, never stored.** A doctor's free slots are derived from their
   recurring schedule, their leave exceptions, and existing bookings.
4. **Booking is transactional.** A unique constraint on `(doctor_id, slot_start)` plus a
   stored procedure using `SELECT … FOR UPDATE`, so two patients clicking the same slot at
   the same instant can never both succeed.

---

## Stack

| Layer | Technology |
|---|---|
| Database | MySQL 8 (developed on 8.4 LTS; needs 8.0.16 or later) |
| Backend | Node.js, Express, `mysql2` (developed on Node.js 24 LTS) |
| Frontend | HTML, CSS, JavaScript — no framework |
| Architecture | Static pages calling a REST API via `fetch`, served by Express |

---

## Repository layout

```
docs/         er-design.md — the ER model and the reasoning behind every decision
              er-diagram-guide.md — how the diagrams are drawn
              er-diagrams/ — Chen and crow's-foot diagrams (draw.io)
              planned: use cases, data dictionary, normalization write-up
database/     schema.sql — phase 1, 32 tables
              planned: seed data, triggers, stored procedures, views, queries
server/       planned: the Express application
  routes/       HTTP endpoints
  controllers/  Request handling and validation
  services/     Business logic and SQL
  db/           Connection pool and config
public/       The website: public landing page, sign-in, and the clinical console
  css/  js/  pages/
prototype/    Standalone clickable prototype (open the .html directly)
```

---

## Status

As of 11 October 2026.

| Milestone | Due | State |
|---|---|---|
| Use cases and ER diagram | 5 Sep 2026 | ER model and diagrams done (27 Sep). Use cases not started |
| Frontend complete on mock data | 13 Sep 2026 | Done — public site plus a five-screen clinical console, running on in-browser sample data |
| Database schema, seed data, views | 19 Sep 2026 | Schema done — 32 tables, verified on MySQL 8.4 on 11 Oct. Seed data and views not started |
| Express API and authentication | 26 Sep 2026 | Not started |
| Appointments and concurrency control | 3 Oct 2026 | The one-doctor-one-slot constraint is in the schema and tested. The booking procedure is not started |
| Clinical records, wards, access control | 10 Oct 2026 | Tables and constraints are in the schema. Triggers and procedures not started |
| Referrals and hardening | 17 Oct 2026 | Not started |
| Documentation and demo | 25 Oct 2026 | Not started |

---

## Running the website

No server, no database, no install. Open either file in any browser:

```
public/index.html                 the website: landing page, sign-in, clinical console
prototype/uhid-prototype.html     the original single-file prototype
```

Both run on sample data held in JavaScript and save registered patients to browser storage.
The clinical console starts from `public/login.html`.

**Demo accounts** — password `demo1234` for all four:

| Username | Role |
|---|---|
| `rezaul` | Receptionist |
| `anisur` | Doctor |
| `rahim`  | Patient |
| `nasima` | Hospital Admin |

> The prototype's passwords sit in client-side JavaScript. That is a stand-in, not
> security. The real system hashes passwords with bcrypt and verifies them on the server.

---

## Creating the database

Needs MySQL 8.0.16 or later — earlier versions accept `CHECK` constraints but silently
ignore them, which would let malformed UHIDs in. It will not run on MariaDB (for example the
one bundled with XAMPP), which lacks the `utf8mb4_0900_ai_ci` collation and `REGEXP_LIKE()`.

```
mysql -u root -p < database/schema.sql
```

This creates a database named `uhid` with the 32 phase-1 tables, empty. **It drops any
existing `uhid` database first**, so do not run it against data you want to keep.

## Running the full system

Not yet available. Sample data, triggers, stored procedures and the Express API are still to
come; instructions will be added here as each one lands.

---

## Author

Nobo Ishraque · Department of ICT, Bangladesh University of Professionals
