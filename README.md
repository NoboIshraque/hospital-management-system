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
   an expiry, and an immutable access log written by a database trigger on every clinical
   read. Emergency "break-glass" access is allowed but flagged.
3. **Availability is computed, never stored.** A doctor's free slots are derived from their
   recurring schedule, their leave exceptions, and existing bookings.
4. **Booking is transactional.** A unique constraint on `(doctor_id, slot_start)` plus a
   stored procedure using `SELECT … FOR UPDATE`, so two patients clicking the same slot at
   the same instant can never both succeed.

---

## Stack

| Layer | Technology |
|---|---|
| Database | MySQL 8 |
| Backend | Node.js, Express, `mysql2` |
| Frontend | HTML, CSS, JavaScript — no framework |
| Architecture | Static pages calling a REST API via `fetch`, served by Express |

---

## Repository layout

```
docs/         Use cases, ER diagram, data dictionary, normalization write-up
database/     schema.sql, seed.sql, queries.sql, views, triggers, procedures
server/       Express application
  routes/       HTTP endpoints
  controllers/  Request handling and validation
  services/     Business logic and SQL
  db/           Connection pool and config
public/       Frontend served as static files
  css/  js/  pages/
mock/         Mock JSON standing in for the API until the backend exists
prototype/    Standalone clickable prototype (open the .html directly)
```

---

## Status

| Milestone | Due | State |
|---|---|---|
| Use cases and ER diagram | 5 Sep 2026 | In progress |
| Frontend complete on mock data | 13 Sep 2026 | Prototype built |
| Database schema, seed data, views | 19 Sep 2026 | Not started |
| Express API and authentication | 26 Sep 2026 | Not started |
| Appointments and concurrency control | 3 Oct 2026 | Not started |
| Clinical records, wards, access control | 10 Oct 2026 | Not started |
| Referrals and hardening | 17 Oct 2026 | Not started |
| Documentation and demo | 25 Oct 2026 | Not started |

---

## Running the prototype

No server, no database, no install:

```
prototype/uhid-prototype.html
```

Open it in any browser. It runs on sample data held in JavaScript and saves registered
patients to browser storage.

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

## Running the full system

Not yet available — the backend is built in weeks 4–7. Setup instructions will be added
here as `schema.sql`, `seed.sql` and the Express app land.

---

## Author

Nobo Ishraque · Department of ICT, Bangladesh University of Professionals
