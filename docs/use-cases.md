# Use cases — UHID National Hospital Management System

What each kind of user does with the system, and **which database object does the work**. That
second column is what makes this a DBMS document rather than a requirements list: every use case
ends in a procedure, trigger or view in `database/`, and the rules are enforced there, not in
the browser.

## Actors

| Actor | Who | Signs in as (demo) |
|---|---|---|
| **Patient** | Anyone holding a UHID | `rahim` |
| **Receptionist** | Front desk at one hospital | `rezaul` (Dhaka Medical), `jahanara` (Chattogram) |
| **Doctor** | A clinician with one or more postings | `anisur`, and nine others |
| **Hospital Admin** | Runs one hospital's records and audit | `nasima` |
| **Lab Technician** | Enters results at one hospital | `rumana` |
| **System Admin** | National administration | `sysadmin` |

Every demo password is `demo1234`. What each actor may do is decided by `role_permission`
(seeded in `seed.sql` §3) and checked by `require_permission()` at the top of every procedure.

## Summary

| # | Use case | Actor | Implemented by | Design decision |
|---|---|---|---|---|
| UC1 | Sign in | all | `get_login()`, `record_login()` | 2 |
| UC2 | Register a patient and issue a UHID | Receptionist | `registration_matches()`, `register_patient()` | 1 |
| UC3 | Find a patient nationally | Receptionist, Doctor, Admin | `search_patients()` | 1 |
| UC4 | Open a patient record | Doctor, Patient, Receptionist | `get_patient_record()` | 2 |
| UC5 | Break-glass access | Doctor | `get_patient_record(…, TRUE, reason)` | 2 |
| UC6 | Find a doctor and see free slots | Patient, Receptionist | `v_doctor_directory`, `doctor_availability()` | 3 |
| UC7 | Book an appointment | Patient, Receptionist | `book_appointment()` | 4 |
| UC8 | Cancel an appointment | Patient, Receptionist | `cancel_appointment()` | 4 |
| UC9 | Record an encounter | Doctor | `start_encounter()`, `add_diagnosis()`, `prescribe()`, `record_vitals()`, `order_lab()`, `end_encounter()` | 5 |
| UC10 | Report a lab result | Lab Technician | `lab_worklist()`, `report_lab_result()` | 5 |
| UC11 | Admit a patient to a bed | Receptionist | `admit_patient()` | 7 |
| UC12 | Transfer an inpatient | Receptionist, Doctor | `transfer_patient()` | 7 |
| UC13 | Discharge an inpatient | Doctor | `discharge_patient()` | 7 |
| UC14 | Mark a bed clean | Receptionist, Admin | `mark_bed_clean()` | 7 |
| UC15 | Refer a patient to another hospital | Doctor | `refer_patient()`, `v_referral_inbox` | 6 |
| UC16 | Review break-glass access | Hospital Admin, System Admin | `v_break_glass_queue`, `review_break_glass()` | 2 |
| UC17 | Merge two UHIDs for one person | Hospital Admin, System Admin | `v_possible_duplicates`, `merge_patients()` | 1 |
| UC18 | See and revoke a consent | Patient | `list_consents()`, `revoke_consent()` | 2 |
| UC19 | Record an allergy found during a visit | Doctor | `record_allergy()` | 5 |
| UC20 | Manage staff accounts | Hospital Admin, System Admin | `create_staff_account()`, `reset_password()`, `set_account_active()`, `list_accounts()` | 2 |
| UC21 | Give a patient a portal login | Receptionist | `issue_patient_login()` | 2 |
| UC22 | Change your own password | Everyone | `change_password()` | 2 |
| UC23 | See an appointment list, and mark a missed appointment | Patient, Doctor, Receptionist, Hospital Admin | `list_appointments()`, `mark_no_show()` | 4 |

---

## UC1 — Sign in

**Actor:** any. **Goal:** reach the screens for their role.

1. The user enters a username and password.
2. The server calls `get_login(username)`, which returns the account, its role and the stored
   bcrypt hash. Inactive accounts return nothing.
3. The server compares the password with the hash (`bcrypt.compare` in Node). The plaintext is
   never stored and never reaches SQL.
4. On a match the server calls `record_login()`, which stamps `last_login_at`, and starts a session.

**Alternative:** no match → "No account matches those details". The message does not say whether
the username or the password was wrong, so the form cannot be used to discover usernames.

## UC2 — Register a patient and issue a UHID

**Actor:** Receptionist. **Goal:** a new patient leaves with exactly one UHID.

1. The receptionist types NID, name, date of birth and mobile. When typing pauses, the screen
   calls `registration_matches()`, which looks for the same NID, the same name and date of birth,
   or the same mobile number, and shows possible existing records (NID and phone masked; each
   one logged as a search match).
2. If one of them is the patient, the receptionist opens it. **No UHID is issued.** This is the
   normal success path for a returning patient.
3. Otherwise they complete the form and submit. `register_patient()` runs, as **one transaction**:
   1. checks the role has `patient.register`;
   2. refuses an NID that already holds a UHID, naming the existing UHID;
   3. locks this year's `uhid_sequence` row with `SELECT … FOR UPDATE` and takes the next serial;
   4. builds `BD-<year>-<serial>-<check digit>`, which `ck_patient_uhid_format` and
      `ck_patient_uhid_check_digit` then verify independently;
   5. inserts the patient (`trg_patient_bi` stores an empty NID as NULL);
   6. matches each named allergy against the `allergen` catalogue.
4. The new UHID is shown.

**Alternatives**
- NID already registered → refused, with the existing UHID in the message.
- Unknown district or allergen name → refused, before anything is saved.
- Two receptionists submit at the same instant → the second waits on the `uhid_sequence` lock
  and receives the next serial. Two patients can never be issued the same UHID.

## UC3 — Find a patient nationally

**Actor:** Receptionist, Doctor, Admin. **Goal:** locate one patient's record from any hospital.

1. The user types a UHID, an NID, an 11-digit mobile number, or at least 3 letters of a name.
2. `search_patients()` refuses anything vaguer, returns at most 20 live records (a merged-away
   UHID finds the surviving record), masks the NID and phone, and writes one `access_log` row
   (`search.match`) per person returned.
3. The user opens a result (UC4).

Demographics only, so it needs no access basis — but it is logged, because a national search is
itself a way of looking someone up. There is no "list everyone" query: the browser never holds
the national register (security review L1).

## UC4 — Open a patient record

**Actor:** Doctor, Patient, Receptionist. **Goal:** read the national record, if entitled to.

1. The user opens a record by UHID.
2. `get_patient_record()` works out the **basis** for the read, in this order:
   - **own_record**: a patient opening their own record;
   - **treating**: a clinician with an open encounter for this patient that is their own, or in
     a department they are posted to at that hospital — an OPD encounter only on the day it
     began;
   - **consent**: a live `consent_grant` to the reader's hospital;
   - **demographics_only**: reception and admin roles, which see no clinical content.
3. It writes an `access_log` row recording who, where, when and under what basis, **before**
   returning any data.
4. It returns the record: demographics and allergies, then (unless demographics-only) encounters,
   prescriptions, lab results, vitals and referrals, and finally the list of everyone who has read
   this record, including this read.

**Alternatives**
- A patient opens someone else's UHID → refused.
- A clinician has no basis → refused with "no consent grant or open encounter", and the screen
  offers break-glass (UC5).
- The UHID belongs to a merged-away record → `resolve_patient()` opens the surviving record.

## UC5 — Break-glass access

**Actor:** Doctor. **Goal:** read a record in an emergency when no consent exists.

1. After UC4 is refused, the doctor chooses break-glass and writes a reason.
2. `get_patient_record()` is called again with the break-glass flag and the reason. The basis
   becomes **break_glass**, and the log row has `is_break_glass = TRUE` and the justification.
3. The record is shown, marked as break-glass.
4. The read now appears in `v_break_glass_queue` for review (UC16).

**Alternative:** no reason given → refused. `ck_log_break_glass` makes a justification
mandatory, and `trg_access_log_bi` means the row cannot be inserted already reviewed.

## UC6 — Find a doctor and see free slots

**Actor:** Patient, Receptionist. **Goal:** find a doctor anywhere in the country with a free slot.

1. The user filters `v_doctor_directory` by division, department, hospital or name. A doctor with
   two practices appears once per posting, each with its own fee.
2. Choosing a doctor calls `doctor_availability(posting, from, days)`, a recursive CTE that
   generates the slots from `doctor_schedule`, removes slots that overlap `doctor_leave`, and
   marks slots already in `appointment` as taken.

No slot is stored anywhere. Change a schedule and the next read reflects it (decision 3).

## UC7 — Book an appointment

**Actor:** Patient (for themselves), Receptionist. **Goal:** hold one slot, safely.

1. The user picks a free slot and confirms.
2. `book_appointment()` runs as one transaction:
   1. checks permission, and that a patient is booking for themselves;
   2. locks the **doctor** row with `SELECT … FOR UPDATE`, so bookings for one doctor queue,
      whichever hospital they are for;
   3. checks the time is a real slot in the schedule and not in leave;
   4. checks for an overlapping booking with a locking read, so it sees anything just committed;
   5. inserts the appointment.
3. The booking is confirmed.

**Alternative: two people book the same slot at the same moment.** The second waits at the lock,
then finds the first booking and is told "That slot has just been taken". If anything ever got
past the procedure, `UNIQUE(doctor_id, active_slot)` would still refuse the second row
(decision 4).

## UC8 — Cancel an appointment

**Actor:** Patient (own appointments), Receptionist (appointments at their own hospital, or ones
they booked themselves). `cancel_appointment()` sets the status to
`cancelled`. The generated column `active_slot` becomes NULL, which frees the slot in the unique
index for the next patient. Only before the slot starts: after that it was attended or missed
(UC23), and cancelling it would erase that.

## UC9 — Record an encounter

**Actor:** Doctor. **Goal:** record a visit as coded data.

1. `start_encounter()` first checks the doctor has a reason to be seeing this patient: an
   appointment with them today, an issued referral to this hospital, a live consent grant, or an
   open admission here. Without one, the doctor must write a reason; the encounter then opens and
   an `access_log` row is written exactly like a break-glass read, flagged for review. Without
   either, it refuses with 5423.
   It opens the encounter under the doctor's current posting at their hospital.
   `trg_encounter_bi` copies the hospital, department and fee from the posting. In the same call:
   - a booked appointment for today with this doctor becomes `attended` and is linked;
   - an issued referral to this hospital becomes `arrived` and is linked (decision 6).
2. The doctor adds coded diagnoses (`add_diagnosis()`, an ICD-10 code), vitals
   (`record_vitals()`, range-checked by CHECK constraints), prescription lines (`prescribe()`)
   and lab orders (`order_lab()`). Only the encounter's own doctor may — or, for an inpatient,
   a doctor of the admitting department — and a closed encounter takes only a prescription
   amendment (`require_encounter_author()`).
3. `end_encounter()` closes it.

Steps 1–3 are **step** procedures with no transaction of their own. The API wraps a whole
encounter in one transaction, so it is saved completely or not at all.

**Alternative:** prescribing a drug the patient is allergic to, or one in the same class (e.g.
Amoxicillin for a Penicillin allergy) → `trg_prescription_item_bi` refuses the line and names
the allergy.

## UC10 — Report a lab result

**Actor:** Lab Technician. `lab_worklist()` lists the tests waiting at their own hospital (a
procedure, not a view: test names are clinical content). `report_lab_result()` stores the value. `trg_lab_result_bi` flags it
abnormal if it is outside the test's reference range, and `trg_lab_result_ai` marks the order
`reported`. A cancelled order cannot receive a result. The procedure returns the abnormal flag, so
the screen (`pages/lab.html`) shows the database's verdict.

## UC11 — Admit a patient to a bed

**Actor:** Receptionist. **Goal:** patient into a free bed, with the bed board updated.

1. The receptionist picks a free bed, finds the patient by search, and chooses the consultant and
   the reason for admission.
2. `admit_patient()` asks `care_basis()` whether the patient has a reason to be here already — a
   visit here today, an appointment, a live referral or consent. If not, the reason for admission
   (at least 8 characters) is required and written to `access_log` as a flagged entry for the
   hospital administrator to review: an admission makes the admitting department *treating*, so it
   must not be a quiet way into a record.
3. It runs as one transaction: it opens an Inpatient encounter, the `admission` and a
   `bed_occupancy` row.
4. `trg_bed_occupancy_bi` locks the bed row and checks it is free and in service, in this
   hospital, in a ward the patient's sex and age allow, and that the admission has no other open
   bed. The lock means two admissions to one bed at the same instant cannot both succeed.
5. `trg_bed_occupancy_ai` sets the bed to **occupied**. The procedure never touches `bed`.

**Alternatives:** patient already an inpatient anywhere → refused, naming the hospital. Bed not
free, wrong ward, wrong hospital → refused, and nothing is saved.

## UC12 — Transfer an inpatient

**Actor:** Receptionist, Doctor. `transfer_patient()` closes the open `bed_occupancy` row and opens
a new one, in one transaction. The triggers set the old bed to **cleaning** and the new one to
**occupied**. If the new bed is not free, the whole transfer is rolled back and the patient stays put.

## UC13 — Discharge an inpatient

**Actor:** Doctor only. A receptionist trying this is refused by `require_permission()`, because
their role has `bed.admit` but not `bed.discharge`. `discharge_patient()` closes the bed stay, sets
`discharged_at`, the summary and the outcome, and ends the encounter. `trg_bed_occupancy_au` sets
the bed to **cleaning**.

## UC14 — Mark a bed clean

**Actor:** Receptionist, Hospital Admin. `mark_bed_clean()` moves a bed from **cleaning** to
**free**. It is the only status change not caused by an occupancy row.

## UC15 — Refer a patient to another hospital

**Actor:** Doctor. **Goal:** Hospital B receives the patient and can read their history.

1. From an encounter at their hospital, the doctor chooses the receiving hospital and
   department, and gives a reason and urgency.
2. `refer_patient()` writes the `referral` (`trg_referral_bi` copies the sending hospital) **and**
   a 24-hour `consent_grant` to Hospital B (`granted_via = 'referral'`), in one transaction.
3. The patient appears in Hospital B's `v_referral_inbox`.
4. A doctor at B opens the record under **consent** (UC4). When the patient is seen there,
   `start_encounter()` links the referral and marks it arrived, and from then on B reads under
   **treating**.

## UC16 — Review break-glass access

**Actor:** Hospital Admin, System Admin. The admin works through `v_break_glass_queue`, reading
each justification, and calls `review_break_glass()` for each. That stamps `reviewed_by` and
`reviewed_at`, which is the **only** change `trg_access_log_bu` allows on the log, and only once.
No log row can ever be deleted (`trg_access_log_bd`). A hospital admin sees and reviews reads
made at their own hospital only; the system admin, who has no hospital, reviews every hospital's.
`review_break_glass()` refuses anything else with error 5403. Screen: `pages/audit.html`.

## UC17 — Merge two UHIDs for one person

**Actor:** Hospital Admin, System Admin. **Goal:** repair the failure decision 1 exists to prevent.

1. The admin identifies two records for one person. `v_possible_duplicates` (a self-join: same name
   and date of birth, or same mobile) suggests pairs on `pages/merge.html`. The seed data contains
   exactly this case: `BD-2019-04821-5` and `BD-2018-00723-2`.
2. `merge_patients(losing, surviving, reason)` runs as one transaction: it moves encounters,
   appointments, referrals, consent grants and allergies to the surviving record, moves the NID if
   only the losing record had one, and records the merge in `patient_merge`.
3. The losing record stays, and its UHID still opens the surviving record through
   `resolve_patient()`. `access_log` is **not** moved: who read the old record is a fact about
   the past.

## UC18 — See and revoke a consent

**Actor:** Patient. **Goal:** know which hospitals may read the record, and take a permission back.

1. On their own record, the patient opens *Who may read it*. `list_consents()` finds the patient
   from the signed-in account — never from the request — and returns every grant on the record:
   the hospital (and doctor, if the grant names one), the scope, how it was given (in person, by
   one-time code, with a referral), and whether it is active, expired or revoked.
2. The patient chooses **Revoke** on an active grant. `revoke_consent()` checks the grant is theirs
   and still live, and stamps `revoked_at`.
3. From that moment `get_patient_record()` and `start_encounter()` no longer count the grant as a
   basis: a doctor at that hospital who relied on it is refused (5423) and must use break-glass.

**Alternatives:** a grant that has expired or was already revoked → refused (1644); another
patient's grant, or a staff account trying → refused (5403). The row is never deleted: that the
grant existed, and when it ended, stays part of the record.

## UC19 — Record an allergy found during a visit

**Actor:** Doctor. **Goal:** an allergy discovered after registration is on the record, so the
database refuses any drug in its class from then on.

1. On the record of a patient they are treating, the doctor chooses *Record an allergy*, picks the
   allergen from the catalogue, a severity and an optional note.
2. `record_allergy()` requires the doctor's own open visit for this patient (or one in their
   department) — the same *treating* rule as reading — and links the allergy to that visit.
3. Recording the same allergen again updates its severity and note.

**Alternatives:** no open visit → refused (5423); an allergen not in the catalogue, or a severity
other than Mild, Moderate or Severe → refused.

## UC20 — Manage staff accounts

**Actor:** Hospital Admin, System Admin. **Goal:** every member of staff signs in with their own
password, and someone who leaves can no longer sign in.

1. On *Staff accounts* the admin sees the accounts they manage: a hospital admin, the receptionist,
   doctor and lab accounts of their own hospital; the system admin, every staff account.
2. *New account*: a username, a role, and a name (a doctor's name comes from their doctor record,
   and the doctor must be posted at that hospital). `create_staff_account()` checks the scope in
   `require_account_scope()` and stores the account with `must_change_password` set.
3. The server makes a 12-character one-time password, stores only its bcrypt hash, and shows it
   once. The admin hands it over in person.
4. *Reset password* gives a new one-time password; *Switch off* stops the account signing in,
   without deleting it — its name stays on every log row it wrote.

**Alternatives:** an account outside the admin's scope → refused (5403); a username taken or
badly formed → refused (1644); a doctor who already has an account → refused; an admin switching
off their own account → refused.

## UC21 — Give a patient a portal login

**Actor:** Receptionist. **Goal:** a patient can see their own record and book from home.

1. After registering a patient, or from their record, reception chooses *Portal login*, and a
   username (suggested from the first name).
2. `issue_patient_login()` creates the patient account with a one-time password and writes
   `login.issued` to the patient's access log, which they see.
3. Asked again for a patient who already has a login, it keeps the username and issues a new
   one-time password — the way a patient who forgot theirs gets back in.

**Alternatives:** a receptionist without `patient.register` → refused (5403); a merged-away UHID
→ the surviving record gets the login.

## UC22 — Change your own password

**Actor:** everyone. **Goal:** nobody else knows the password.

1. A one-time password signs in, but the server answers every request except `/api/me…` with 403
   until it is changed, and the console opens on *My account*.
2. The user gives the current password and a new one: at least 10 characters, not a common
   password, not containing the username. The server checks it and `change_password()` stores the
   new hash and clears `must_change_password`.

**Why the rule is length, not symbols:** a long phrase is harder to guess than a short password
with a digit and a capital, and people do not write it on a note.

## UC23 — See an appointment list, and mark a missed appointment

**Actors:** Patient, Doctor, Receptionist, Hospital Admin. **Goal:** everyone sees the bookings
that concern them, and a patient who did not come is on the record.

1. *My appointments* / *Appointment list* asks `list_appointments()` for a day, a week or a month.
   The procedure decides whose list it is from the role: a patient's own appointments at every
   hospital; a doctor's own across all their postings; everything at a receptionist's or hospital
   admin's own hospital.
2. Each row says whether it can be cancelled or marked missed, by the same rules the two
   procedures apply, so the screen shows only buttons that will work.
3. Once a slot's time has passed and the patient has not come, reception chooses *Did not come*.
   `mark_no_show()` sets the status to `no_show`. The slot stays taken — its time is over, and the
   missed visit stays on the record.
4. A doctor's list has *Start visit* for today's bookings; opening the visit marks the booking
   attended (UC9).

**Alternatives:** a lab technician or the system admin → no list (5403); a period over 62 days →
refused; marking before the slot starts, at another hospital, or by a patient → refused.
