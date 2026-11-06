# Checklist — finishing the UHID system

Written 31 October 2026. Target: everything below done by **7 November 2026**.
Items are in build order: each one depends only on the ones above it.
Tick an item only when it has been run and checked, not when it has been written.

## A. Database

- [x] **A1. Phase 2 tables in `schema.sql`** — `referral`, `consent_grant`, `lab_test`,
      `lab_order`, `lab_result`, `encounter_vitals`, `patient_merge`, plus `uhid_sequence`
      (the locked serial counter for issuing UHIDs) and `medicine.drug_class` (needed for the
      allergy cross-reaction check).
- [x] **A2. `triggers.sql`** — the seven deferred constraints from the foot of `schema.sql`:
      user-account role consistency, one open bed per admission, `bed.status` maintenance,
      inpatient-only admissions, append-only `access_log`; plus the encounter fee snapshot
      (decision 1) and the allergy-conflict block on prescribing.
- [x] **A3. `procedures.sql`** — `has_permission()`, `register_patient()` (issues the UHID
      under a lock), `book_appointment()` (`SELECT … FOR UPDATE`), `doctor_availability()`
      (recursive CTE), `admit_patient()`, `transfer_patient()`, `discharge_patient()`,
      `mark_bed_clean()`, `get_patient_record()` (writes `access_log`, decides the basis,
      break-glass), `refer_patient()`, `merge_patients()`.
- [x] **A4. `views.sql`** — the read models the screens use: hospital directory, doctor
      directory, patient search list, bed board, ward occupancy, break-glass review queue,
      referrals awaiting arrival.
- [x] **A5. `seed.sql`** — every row in `js/data.js` and `js/seed.js`, coded properly: the
      8 hospitals, 10 doctors, 5 patients with their encounters, diagnoses, prescriptions and
      allergies, the 4 demo logins with bcrypt hashes, wards and beds, schedules, labs,
      vitals, referrals, consent grants.
- [x] **A6. `grants.sql`** — the least-privilege application user: `EXECUTE` on procedures,
      `SELECT` on views and lookup tables, nothing on the clinical tables directly.
- [x] **A7. `queries.sql`** — the demonstration queries: joins, aggregates, subqueries,
      window functions, CTEs, each answering a question the system should answer.
- [x] **A8. `tests.sql`** — a re-runnable script proving every constraint, trigger and
      procedure rejects what it must and accepts what it should.
- [x] **A9. One-command rebuild** — `npm run db:reset` runs all of the above in order.

## B. Backend (Express API)

- [x] **B1. Skeleton** — `server/package.json`, `.env.example`, connection pool,
      `server/app.js` serving `public/` as static files.
- [x] **B2. Authentication** — `POST /api/login` (bcrypt), `POST /api/logout`, `GET /api/me`,
      sessions, a `requireRole()` middleware.
- [x] **B3. Reference data** — `GET /api/hospitals`, `/api/departments`, `/api/doctors`,
      `/api/doctors/:id/availability`.
- [x] **B4. Patients** — `GET /api/patients` (search list), `POST /api/patients` (register),
      `GET /api/patients/:uhid` (the logged record read, with break-glass). *Replaced 6 Nov 2026
      by G3 and G4: `POST /api/patients/search` and `POST /api/patients/:uhid/read`.*
- [x] **B5. Appointments** — `POST /api/appointments`, plus a script that fires two bookings
      for one slot at the same instant and shows exactly one succeed.
- [x] **B6. Wards** — `GET /api/wards`, admit, discharge, mark clean.
- [x] **B7. Referrals and audit** — `POST /api/referrals`, `GET /api/audit/break-glass`.

## C. Team learning guides

- [x] **C1. `docs/guides/nobo.md`** — the hardest and longest parts.
- [x] **C2. `docs/guides/abir.md`** — the middle band.
- [x] **C3. `docs/guides/noria.md`** — the smallest and easiest parts.

## D. Frontend wired to the API

- [x] **D1. `js/api.js`** — one `fetch` wrapper; pages load from the API when served by
      Express and fall back to the built-in sample data when opened from disk.
- [x] **D2. Login against the server**; console pages use real data.
- [x] **D3. Register, book, admit, discharge** call the API; errors from the database
      (duplicate NID, slot taken, allergy conflict, wrong role) reach the user as toasts.
- [x] **D4. Record page** — real access log, real access basis, break-glass prompt,
      referrals and lab results.
- [x] **D5. Print stylesheet** for the patient record; **404 page** served by Express.

## E. Documentation

- [x] **E1. `docs/use-cases.md`**
- [x] **E2. `docs/data-dictionary.md`**
- [x] **E3. `docs/normalization.md`**
- [x] **E4. `docs/demo-script.md`** — the click-by-click viva demonstration.
- [x] **E5. README and CLAUDE.md** brought up to date.

## F. A screen for every role (added 1 November 2026)

- [x] **F1. Database:** `lab_worklist()`, `v_possible_duplicates`, `review_break_glass()` limited
      to the admin's own hospital, `report_lab_result()` returns the abnormal flag — tested in
      `tests.sql` (74 pass) and `api-test.js` (66 pass).
- [x] **F2. Doctor:** `encounter.html` (one-transaction visit), *Refer…* on the record,
      `referrals.html` inbox.
- [x] **F3. Lab technician:** `lab.html` worklist.
- [x] **F4. Admins:** `audit.html` break-glass review, `merge.html` merge records.
- [x] **F5. Bed transfer** on the bed board, online and offline.
- [x] **F6. `ROLES` blurbs** match the screens; browser-tested as every role and offline.
- [x] **F7. `docs/demo-script.md`** walks through the new screens (steps 5–9); the SQL step is now 11.

## G. Security review findings (added 1 November 2026)

The review: https://claude.ai/artifact/5DUs8QRcx7Ztc31xjqNZE5 — 33 items in four groups. Group 1
("fix before the viva") first:

- [x] **G1. A1** — `start_encounter()` requires an existing basis or a logged, reviewed reason.
- [x] **G2. A3** — discharge, transfer and mark-clean limited to the caller's hospital.
- [x] **G3. L1** — national patient list replaced by a limited, masked, logged search.
- [x] **G4. W1** — opening a record (and break-glass) becomes a POST.
- [x] **G5. A4, A2, A5, A6, I2** — cancel scope, narrower "treating", author-only encounter writes,
      merge scope, two missing `esc()` calls.
      *G1–G5 done 6 November 2026: `tests.sql` §9 (each refusal with its errno), `api-test.js`
      (76 pass), browser-tested as receptionist, doctor and hospital admin and offline. On the way,
      `t_value` in tests.sql was found to have recorded nothing since it was written; fixed, so
      `db:test` now really runs 135 checks.*
- [x] **G6.** Groups 2–3 of the review (going live, hardening) — done 6 Nov 2026 where it fits a
      site that runs on one laptop: S1 login rate limit, S3 secure cookie + HSTS behind
      `COOKIE_SECURE=1`, S5 30-minute idle timeout, S6 equal-time login, W2 cross-site write
      refusal, W3 CSP and headers, W4 plain DB errors, I3 id and list checks, A7 masked NID on
      demographics reads, A9 patients see and revoke consents, D5 `npm audit` (0). Tested:
      `tests.sql` 145, `api-test.js` 88, `npm run race` 5/5, browser as patient and on the
      landing page. **Left on purpose, with reasons, in `er-design.md` §8.5:** S2, S4, D3, the
      hosted-site privacy page, L2/A8/L5 (need schema and ER-diagram changes), L3.
- [x] **G7.** Group 4 — accepted risks A10, D2, L4 and what is out of scope, written down in
      `docs/er-design.md` §8.4, each claim checked against the code (6 Nov 2026). D2's rule — no
      procedure builds SQL from text — is now a code convention in CLAUDE.md.
