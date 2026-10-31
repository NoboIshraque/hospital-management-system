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

**Errors** come back as `{ "error": "…" }`, with the database's own message wherever the
database refused (see `server/db/errors.js`):

| Status | Meaning | Comes from |
|---|---|---|
| 400 | The request is missing something | the route |
| 401 | Not signed in | `requireLogin` |
| 403 | Your role may not do this | `require_permission()` — MYSQL_ERRNO 5403 |
| 404 | No such patient / thing | MYSQL_ERRNO 5404 |
| 409 | A rule said no (slot taken, NID registered, allergy conflict, bed not free…) | SIGNAL (1644), CHECK (3819), duplicate (1062) |
| 423 | No access basis for this record — break-glass is possible | `get_patient_record()` — MYSQL_ERRNO 5423; the body has `"breakGlassAvailable": true` |

## Endpoints

| Method and path | Who | Body / query | Database object |
|---|---|---|---|
| `POST /api/login` | anyone | `{ username, password }` | `get_login()`, bcrypt in Node, `record_login()` |
| `POST /api/logout` | signed in | — | — |
| `GET /api/me` | signed in | — | the session |
| `GET /api/hospitals` | public | — | `v_hospital_directory` |
| `GET /api/departments` | public | — | `department` |
| `GET /api/districts` | public | — | `v_district_list` |
| `GET /api/doctors` | public | — | `v_doctor_directory` + `doctor_availability()` for `nextFree` |
| `GET /api/doctors/:postingId/availability` | public | `?days=7` | `doctor_availability()` |
| `GET /api/catalogue` | signed in | — | `allergen`, `medicine`, `diagnosis`, `lab_test` |
| `GET /api/patients` | reception, doctors, admin | — | `v_patient_directory` (after `has_permission`) |
| `POST /api/patients` | reception | `{ name, dob, sex, blood, phone, nid, district, address, kinName, kinRelation, kinPhone, allergies[] }` | `register_patient()` |
| `GET /api/patients/:uhid` | signed in | `?breakGlass=1&reason=…` | `get_patient_record()` — logged |
| `POST /api/patients/merge` | admin | `{ losingUhid, survivingUhid, reason }` | `merge_patients()` |
| `POST /api/appointments` | reception, patient (own) | `{ postingId, uhid, slotStart }` | `book_appointment()` |
| `DELETE /api/appointments/:id` | reception, patient (own) | — | `cancel_appointment()` |
| `GET /api/wards` | hospital staff | — | `v_bed_board` for the signed-in hospital |
| `POST /api/admissions` | reception | `{ uhid, postingId, wardId, bedNo, complaint }` | `admit_patient()` |
| `POST /api/admissions/:id/transfer` | reception, doctor | `{ wardId, bedNo }` | `transfer_patient()` |
| `POST /api/admissions/:id/discharge` | doctor | `{ summary, outcome }` | `discharge_patient()` |
| `POST /api/beds/clean` | reception, admin | `{ wardId, bedNo }` | `mark_bed_clean()` |
| `POST /api/encounters` | doctor | `{ uhid, type, complaint, notes, diagnoses[], vitals, prescriptions[], labTests[], end }` | `start_encounter()` … `end_encounter()` in **one transaction** |
| `POST /api/lab-results` | lab technician | `{ orderId, valueNum, valueText }` | `report_lab_result()` |
| `POST /api/referrals` | doctor | `{ encounterId, toHospitalId, dept, reason, urgency }` | `refer_patient()` |
| `GET /api/referrals/inbox` | doctors | — | `v_referral_inbox` |
| `GET /api/audit/break-glass` | admin | — | `v_break_glass_queue` |
| `POST /api/audit/break-glass/:id/review` | admin | — | `review_break_glass()` |

"Who" is what the seed data's role permissions allow. The permission check itself is in the
database (`require_permission()` inside each procedure, or `has_permission()` in front of a view),
so this column describes the result rather than adding a second rule.

## Shapes

The JSON is in the shapes `public/js/data.js` and `public/js/seed.js` already use, so the pages
render it without change:

- `GET /api/hospitals` → `[{ id, name, div, dist, tier }]`
- `GET /api/doctors` → `[{ id, name, dept, qual, hospitalId, fee, bmdc, doctorId, nextFree }]`, where `id` is the **posting** id
- `GET /api/patients/:uhid` → the `js/seed.js` patient object (`uhid, name, dob, … allergies[], encounters[]` with each encounter's `rx[]`), plus `encounters[].labs[]`, `encounters[].vitals[]`, `referrals[]`, `accessLog[]` and `access: { basis, consentExpires, breakGlass }`
- `GET /api/wards` → `[{ id, name, type, beds: [{ no, status, patient, uhid, dx, days, admissionId }] }]`
- `GET /api/doctors/:id/availability` → `[{ date, label, slots: [{ time, start, taken }] }]`
