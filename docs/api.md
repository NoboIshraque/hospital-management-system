# API reference — UHID National Hospital Management System

The Express server in `server/` serves the website and this JSON API from one address.

```powershell
cd server
npm start                # http://localhost:3000
npm run api:test         # checks every endpoint below (rebuilds the database first)
npm run race             # two receptionists booking one slot at once, five times
```

**Who is asking** always comes from the login session, never from the request. Sign in with
`POST /api/login`; the server sets an httpOnly cookie that the browser sends back automatically.
A session ends after **30 minutes without a request**, and **8 hours after sign-in** whatever
happens; then every endpoint answers 401 and the console sends the user to the sign-in page.

**Every response** carries a Content-Security-Policy (scripts only from this site, fonts only from
Google Fonts, no framing by another site), `X-Content-Type-Options: nosniff` and
`Referrer-Policy: same-origin`. A `POST` or `DELETE` whose `Origin` or `Sec-Fetch-Site` header
shows it came from another website is refused with 403 — a backstop behind the `SameSite=Lax`
cookie. All of this is `server/security.js`.

**Errors** come back as `{ "error": "…" }`, with the database's own message wherever the
database refused (see `server/db/errors.js`):

| Status | Meaning | Comes from |
|---|---|---|
| 400 | The request is missing something, a value is the wrong type, too long or not a valid date (MySQL 1406, 1265, 1292, 1366, 1264, 1048), a field holds a list or object where one value belongs, an id is not a whole number, or a list is too long (at most 10 diagnoses, 20 drug lines, 20 lab tests per visit) | the route (`id()`, `list()` in `db/errors.js`) |
| 401 | Not signed in | `requireLogin` |
| 403 | Your role may not do this — or the write came from another website | `require_permission()` — MYSQL_ERRNO 5403; `sameOriginWrites` in `security.js` |
| 404 | No such patient / thing | MYSQL_ERRNO 5404 |
| 409 | A rule said no (slot taken, NID registered, allergy conflict, bed not free…) | SIGNAL (1644), CHECK (3819), duplicate (1062). For 1062, 1451, 1452 and 3819 the browser gets a plain sentence, not MySQL's text, which names tables and constraints; the server log keeps the original |
| 429 | Too many failed sign-ins: 5 for one username, or 30 from one address, in 15 minutes | `loginLimiter` in `security.js`; the `Retry-After` header says how many seconds to wait |
| 423 | No access basis for this record — break-glass is possible | `get_patient_record()` — MYSQL_ERRNO 5423; the body has `"breakGlassAvailable": true`. Also from `start_encounter()`: no appointment, referral, consent or admission, and no reason given |

## Endpoints

| Method and path | Who | Body / query | Database object |
|---|---|---|---|
| `POST /api/login` | anyone | `{ username, password }` | `get_login()`, bcrypt in Node, `record_login()` |
| `POST /api/logout` | signed in | — | — |
| `GET /api/me` | signed in | — | the session, including `mustChange` |
| `GET /api/config` | public | — | `{ demo }` — whether the sign-in page lists the demo accounts (`DEMO_MODE=1` in `server/.env`) |
| `POST /api/me/password` | signed in | `{ current, next }` | the current password is checked with bcrypt, the new one against `lib/passwords.js` (10+ characters, not common, not the username), then `change_password()` |
| `GET /api/accounts` | hospital admin (own hospital's staff), system admin (all) | — | `list_accounts()` — no hashes |
| `POST /api/accounts` | hospital admin, system admin | `{ username, role, hospitalId, doctorId, staffName }` → `{ accountId, username, oneTimePassword }` | `create_staff_account()`; the one-time password is made in Node, shown once, stored only as a hash |
| `POST /api/accounts/:id/reset` | hospital admin, system admin | — → `{ oneTimePassword }` | `reset_password()` |
| `POST /api/accounts/:id/active` | hospital admin, system admin | `{ active }` | `set_account_active()` — never your own |
| `POST /api/patients/:uhid/login` | reception (`patient.register`) | `{ username }` → `{ username, oneTimePassword }` | `issue_patient_login()` — creates the patient's portal login, or gives an existing one a new one-time password; logged |
| `GET /api/hospitals` | public | — | `v_hospital_directory` |
| `GET /api/departments` | public | — | `department` |
| `GET /api/districts` | public | — | `v_district_list` |
| `GET /api/doctors` | public | — | `v_doctor_directory` + `doctor_availability()` for `nextFree` |
| `GET /api/doctors/:postingId/availability` | public | `?days=8` (default 7, max 31; the booking screen asks for 8) | `doctor_availability()` |
| `GET /api/catalogue` | signed in | — | `allergen`, `medicine`, `diagnosis`, `lab_test` |
| `POST /api/patients/search` | reception, doctors, admin | `{ q }` — a UHID, an NID, an 11-digit mobile, or 3+ letters of a name | `search_patients()` — at most 20, NID and phone masked, each match logged |
| `POST /api/patients/matches` | reception | `{ name, dob, phone, nid }` | `registration_matches()` — decision 1's duplicate check, masked and logged |
| `POST /api/patients` | reception | `{ name, dob, sex, blood, phone, nid, district, address, kinName, kinRelation, kinPhone, allergies[] }` | `register_patient()` |
| `POST /api/patients/:uhid/read` | signed in | `{}` or `{ breakGlass: true, reason }` | `get_patient_record()` — logged. A POST on purpose: see below |
| `GET /api/consents` | patient | — | `list_consents()` — the signed-in patient's own grants, with `status` active / expired / revoked |
| `POST /api/consents/:id/revoke` | patient (own grants) | — | `revoke_consent()` — stamps `revoked_at`; the hospital loses that basis at once |
| `GET /api/audit/duplicates` | hospital admin, system admin | — | `v_possible_duplicates` — a self-join: same name + date of birth, or same mobile (after `has_permission('patient.merge')`) |
| `POST /api/patients/merge` | admin | `{ losingUhid, survivingUhid, reason }` | `merge_patients()` |
| `POST /api/appointments` | reception, patient (own) | `{ postingId, uhid, slotStart }` | `book_appointment()` |
| `DELETE /api/appointments/:id` | reception, patient (own) | — | `cancel_appointment()` |
| `GET /api/wards` | reception, doctors, hospital admin (`bed.view`) | — | `bed_board()` — the signed-in hospital only; a procedure because the board shows diagnoses |
| `POST /api/admissions` | reception | `{ uhid, postingId, wardId, bedNo, complaint }` | `admit_patient()` |
| `POST /api/admissions/:id/transfer` | reception, doctor | `{ wardId, bedNo }` | `transfer_patient()` |
| `POST /api/admissions/:id/discharge` | doctor | `{ summary, outcome }` | `discharge_patient()` |
| `POST /api/beds/clean` | reception, admin | `{ wardId, bedNo }` | `mark_bed_clean()` |
| `POST /api/encounters` | doctor | `{ uhid, type, complaint, notes, reason, diagnoses[], vitals, prescriptions[], labTests[], end }` — `reason` only when there is no appointment today, referral, consent or admission | `start_encounter()` … `end_encounter()` in **one transaction** |
| `GET /api/lab-orders` | lab technician | — | `lab_worklist()` — the caller's hospital only; a procedure, not a view, because test names are clinical content |
| `POST /api/lab-results` | lab technician | `{ orderId, valueNum, valueText }` → `{ reported, abnormal }` | `report_lab_result()`; `abnormal` is what `trg_lab_result_bi` decided |
| `POST /api/referrals` | doctor | `{ encounterId, toHospitalId, dept, reason, urgency }` | `refer_patient()` |
| `GET /api/referrals/inbox` | doctors | — | `referral_inbox()` — the signed-in hospital only |
| `POST /api/allergies` | doctor with an open visit for the patient | `{ uhid, allergen, severity, note }` | `record_allergy()` — linked to that visit |
| `GET /api/audit/break-glass` | hospital admin (own hospital), system admin (all) | — | `break_glass_queue()` — break-glass reads, and visits or admissions opened with no basis (`action` says which) |
| `POST /api/audit/break-glass/:id/review` | hospital admin (own hospital), system admin (all) | — | `review_break_glass()` — refuses another hospital's read with 403 |

"Who" is what the seed data's role permissions allow. The permission check itself is in the
database (`require_permission()` inside each procedure, or `has_permission()` in front of a view),
so this column describes the result rather than adding a second rule.

### Why there is no patient list, and why a record read is a POST

Both changed on 6 November 2026, after the security review.

- **No `GET /api/patients`.** It returned every live patient's name, date of birth, phone and NID
  to any staff account in one response, unlogged — on a national system, the population's
  identity list. `search_patients()` now needs a specific query, returns at most 20 people,
  masks the NID and phone (`017•••••031`), and writes an `access_log` row (`search.match`) for
  each person it returns, so a patient can see who looked them up. `uhid_app` no longer has
  `SELECT` on `v_patient_directory` at all.
- **A record read is `POST /api/patients/:uhid/read`.** The session cookie is `SameSite=Lax`,
  which the browser *does* send when the user follows a link from another website. When the
  read was a `GET`, a link such as `…/api/patients/BD-…?breakGlass=1&reason=…` made a signed-in
  doctor perform a flagged emergency read in their own name. A `POST` started by another site
  arrives without the cookie, and this server reads only JSON bodies, which a plain HTML form on
  another site cannot send.

## Shapes

The JSON is in the shapes `public/js/data.js` and `public/js/seed.js` already use, so the pages
render it without change:

- `GET /api/hospitals` → `[{ id, name, div, dist, tier }]`
- `GET /api/doctors` → `[{ id, name, dept, qual, hospitalId, fee, bmdc, doctorId, nextFree }]`, where `id` is the **posting** id
- `POST /api/patients/search` → `[{ uhid, name, dob, sex, blood, phone, nid, district, registeredAt, registeredHospitalId, identityVerified, encounterCount, matchedOn }]`, phone and NID masked
- `POST /api/patients/:uhid/read` → the `js/seed.js` patient object (`uhid, name, dob, … allergies[], encounters[]` with each encounter's `rx[]`), plus `encounters[].labs[]`, `encounters[].vitals[]`, `referrals[]`, `accessLog[]` and `access: { basis, consentExpires, breakGlass }`
- `GET /api/wards` → `[{ id, name, type, beds: [{ no, status, patient, uhid, dx, days, admissionId }] }]`
- `GET /api/doctors/:id/availability` → `[{ date, label, slots: [{ time, start, taken }] }]`
