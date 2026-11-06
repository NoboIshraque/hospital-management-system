# Checklist — finishing the UHID system

Written 31 October 2026. Target: everything below done by **7 November 2026**; submission is
8 November 2026. Every item was done by 6 November.
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

## H. Stress test, 7 November 2026 — open

Three test agents attacked the project at once: one on the database (live probes as `uhid_app`),
one on the server (its own copy on port 3100, black-box HTTP), one on the frontend and the
documents (reading review). Each finding says whether the agent **ran** it (VERIFIED) or found it
by **reading** (suspected). Afterwards `db:test` (145) and `api:test` (88) still passed and the
data was reset. Nothing below is fixed yet. A database fix gets a `tests.sql` test with its errno.

### H1. Fix before the viva — they break one of the seven decisions, or are wrong on paper

- [ ] **H1.1 Two patients can be admitted to the same bed at once** (decision 7) — VERIFIED: two
      simultaneous `admit_patient` calls on GM-09 both succeeded, 3 of 5 trials. The free-bed
      check in `trg_bed_occupancy_bi` is a plain read. Fix: lock the bed row (`SELECT … FROM bed
      … FOR UPDATE`) in `admit_patient` and `transfer_patient` before inserting, or a unique key
      on a generated column that is set only while the stay is open. Add a race to `npm run race`.
- [ ] **H1.2 A chain of merges breaks UHID resolution** (decision 1) — VERIFIED: merging A→B, then
      B→C, left `resolve_patient(A)` pointing at the empty B. Fix: refuse a merge whose losing
      record is already a survivor of another merge (or make `resolve_patient` follow the chain).
- [ ] **H1.3 A merge can leave one patient with two open admissions** — VERIFIED. Fix: refuse the
      merge while both records have an open admission.
- [ ] **H1.4 A revoked consent still lets the referred-to hospital in** (decision 2) — VERIFIED:
      after the patient revoked the referral's grant, `start_encounter` still accepted the
      issued referral as a basis, and the doctor then read the record as *treating*. Fix: the
      referral clause must require that referral's live, unrevoked `consent_grant`.
- [ ] **H1.5 Admitting a patient grants *treating* access with no basis and no log** (decision 2) —
      VERIFIED: a receptionist admitted an unrelated patient; a doctor of that department then
      read the record as *treating*, no log row for the admission. Fix: `admit_patient` needs a
      basis or a reason, logged like `start_encounter`'s.
- [ ] **H1.6 The login rate limit can be bypassed** — VERIFIED twice: 40 parallel wrong passwords
      all got 401 (the count happens after the await), and `ｓｙｓａｄｍｉｎ`, `sýsadmin` or
      `sysadmin` + a soft hyphen sign in as `sysadmin` with a fresh limit each (MySQL's collation
      treats them as equal). Fix: count before the awaits; key on the account found, or allow
      only `[a-z0-9_.]` usernames.
- [ ] **H1.7 Counts in the documents are wrong** — checked: 31 endpoints, not 32 (CLAUDE.md,
      README.md, handover.md); 18 use cases, not 17 (CLAUDE.md:113, README.md:118); the three
      guides print "32 procedures/functions" where `db:reset` now prints 39; CLAUDE.md's status
      row still says 135 tests in one place; `docs/er-diagram-guide.md` says 39 tables.

### H2. Should fix — real flaws, smaller reach

- [ ] **H2.1** `trust proxy 'loopback'` lets any local client set its own IP through
      `X-Forwarded-For`: it dodges the per-address login limit and forges the IP in `access_log`
      (VERIFIED). A 210-character header makes every logged read fail with 500. Fix: `trust proxy`
      off; validate with `net.isIP`.
- [ ] **H2.2** A failed visit hides an allergy probe: with a reason and a Penicillin drug line, a
      doctor with no basis gets the allergy message, and the rollback erases the flagged log row
      (VERIFIED). Fix: write that log row outside the visit's transaction.
- [ ] **H2.3** `GET /api/wards` (patient names, UHIDs, diagnoses) is open to any signed-in staff
      role, e.g. the lab technician, and unlogged (VERIFIED). Fix: require a ward permission.
- [ ] **H2.4** Views do carry clinical content — `v_bed_board` (diagnosis), `v_referral_inbox`
      (reason), `v_break_glass_queue` (justification) — although `views.sql` says no view does;
      `uhid_app` reads every hospital's rows and only the route filters (VERIFIED). Fix: scoped
      procedures, or correct the comment and record it as accepted.
- [ ] **H2.5** User mistakes return 500: data too long, bad date, wrong type, out of range,
      `diagnoses:[null]` (VERIFIED, 10 cases). Fix: map errnos 1406, 1265, 1292, 1366, 1264,
      1048, 1318 to 400; type-check body fields.
- [ ] **H2.6** A JSON array in a string field expands into extra procedure arguments, shifting
      values between parameters (VERIFIED; not SQL injection). Fix: `pool.execute` or coerce
      every field.
- [ ] **H2.7** NID is free text: `1234567890`, `123-456-7890` and `12345 67890` became three UHIDs,
      and `abc` counted as a verified NID (VERIFIED). Fix: a CHECK for 10, 13 or 17 digits;
      store digits only; set `identity_verified` only by a verification step.
- [ ] **H2.8** Any doctor at a hospital can refer another doctor's encounter (and so grant 24h
      consent); an unknown department is silently dropped (VERIFIED). Fix: author check;
      refuse an unknown department.
- [ ] **H2.9** A same-day appointment booked by any receptionist anywhere becomes a basis to open
      an encounter (suspected). Fix: count only bookings by the patient or by the doctor's own
      hospital.
- [ ] **H2.10** Merge edge cases (suspected): a patient's login can be left on the merged-away
      record, locking them out; `INSERT IGNORE` keeps the weaker allergy severity. Allergies can
      be recorded only at registration.
- [ ] **H2.11** A patient discharged as *died* can be admitted again (VERIFIED). Fix: refuse
      clinical actions after a recorded death.
- [ ] **H2.12** The blood-pressure CHECK accepts one reading without the other (VERIFIED). Fix:
      both NULL or both set.
- [ ] **H2.13** `privacy.html` misses two browser-storage items in server mode (`uhid.session.v1`
      in localStorage, the toast queue in sessionStorage) and has a stale review date.
- [ ] **H2.14** Frontend: if the API answers 500 at start-up the site silently drops into the
      offline sample-data mode; after the 30-minute timeout screens show error boxes instead of
      returning to sign-in; the top-bar search opens the first of up to 20 matches (a logged read
      of a possibly wrong patient); `boot()` swallows a render error and leaves a blank page.

### H3. Low — polish and robustness

- [ ] **H3.1** Database: `prescribe` accepts an empty dose, 0 or 9999 days, the same drug twice;
      two open encounters for one doctor and patient; one-character break-glass reasons; phone
      and date of birth unvalidated (`0001-01-01` accepted); a `+880` mobile is searched as an
      NID; a lab value of 99,999,999 accepted; a raw deadlock (1213) or 1062 can reach the user;
      a STEP procedure called alone can leave no primary diagnosis; deactivated doctors and
      hospitals still work; UHID serial capacity 99,999 a year.
- [ ] **H3.2** Enumeration: a made-up UHID gives 404 where a real one gives 423 (doctor) or 403
      (patient), so UHIDs can be probed without a log row.
- [ ] **H3.3** `uhid_app` may run internal helpers too (`record_login`, `has_permission`…):
      grant EXECUTE per public procedure instead of `uhid.*`.
- [ ] **H3.4** Server: body-parser messages echoed to the browser; the failed-login map never
      shrinks; public availability endpoints have no cache or throttle; `id()` accepts `true`,
      `"0x10"`, `"1e2"`; a deactivated account keeps routes that use only `requireLogin`.
- [ ] **H3.5** Frontend conventions: raw `#fff` in components/shell/site.css; transitions on
      non-composited properties and gaps in the reduced-motion block; `+` concatenation in
      shell.js:175 and home.js; modals do not move or trap focus and leak Escape listeners;
      toasts lack `aria-live`, record tabs lack tab roles; register's panel says "no match"
      while still checking; landing-page filters reset when the API answers; merge compare no
      longer highlights matching phone/NID; "new" badge uses the UTC date; wards: 0-bed ward
      shows NaN%, buttons can double-submit; book.js ids without `Number()`.
- [ ] **H3.6** `docs/api.md` says the API test covers every endpoint; `/districts` and
      `/catalogue` are not checked. `.claude/` is untracked and not in `.gitignore`.
- [ ] **H3.7** Tests to add with the fixes above: concurrent admission/transfer, merge chains and
      open admissions, revoke vs referral, admission basis, NID format, vitals pairs.

**Checked and found sound** (the agents' summaries): the booking lock and its 1062 fallback;
hospital scope on discharge, transfer, cancel and merge; the access log stays append-only;
`uhid_app` cannot read the patient table or the directory view; search escapes wildcards, masks
and logs; session id regenerated at sign-in, logout kills the cookie, forged cookies refused;
cross-site writes refused for every edge case tried; static files never expose `server/`,
`.env` or `.git`; security headers on every response type; no inline script anywhere and the CSP
matches what the pages load; every value escaped and every storage access in try/catch; the
debounced searches drop stale answers; no secret in git history; the visit transaction releases
its connection on every path.
