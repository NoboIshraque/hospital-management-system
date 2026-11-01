# Demo script — UHID National Hospital Management System

A click-by-click demonstration for the viva, about 15 minutes. It shows each of the seven design
decisions working, in the order a hospital would meet them. Every step says what to click, what
appears, and the one sentence to say about it.

The point to make throughout: **the database enforces the rules.** The web pages only show what
the database decided.

---

## The morning of the demo

Do these in order. The reset matters: the referral consent Dr. Anisur uses in step 6 lasts 24
hours from the moment the seed data is loaded.

```powershell
cd hospital-management-system\server
npm run db:reset          # fresh sample data — ends "Database rebuilt: 40 tables, …"
npm run db:test           # 64 database tests — every line PASS
npm run api:test          # 59 API checks — "59 passed, 0 failed"
npm start                 # "UHID running at http://localhost:3000"
```

`db:test` and `api:test` reset the database themselves when they finish, so they can run before
`npm start` without leaving test data behind.

Open **http://localhost:3000** in the browser. Keep a second PowerShell window open in
`server` for step 4 and step 9, and a MySQL prompt (`mysql -u root -p uhid`) for step 9.

Every demo password is `demo1234`.

---

## 1. The public site — 1 minute

1. The landing page opens. Point to the strip at the top: *"a course project, not a live
   government service."*
2. Scroll to the numbers under the hero: 8 hospitals, 12 doctors. **Say:** "These counts come
   from the database through the API — the doctor list has 12 rows because one doctor works at
   two hospitals, and the database stores that as two postings."
3. Scroll to **Find a doctor**. Every card shows a real *next free* time. **Say:** "No slot is
   stored anywhere. That time was computed just now from the doctor's weekly schedule, minus
   leave, minus bookings — decision 3."

## 2. Registration — decision 1 — 2 minutes

1. **Sign in** as `rezaul` (receptionist). The console opens on **Register patient**.
2. In *Full name* type `Md. Rahim`, in *Date of birth* enter `12/04/1978`. The right-hand
   panel shows **two** existing records for Md. Rahim Uddin. **Say:** "This is the failure the
   system exists to prevent: the same man registered twice, once without his NID. The check runs
   on NID, on name with date of birth, and on mobile — before a UHID is issued."
3. Click **Clear**. Register someone new: any name, a date of birth, NID `1999000000009`,
   district `Dhaka` (the box suggests all 64), allergy `Penicillin`. Click **Issue UHID**.
4. The modal shows **BD-2026-00001-1**. **Say:** "The database issued this, not the browser. It
   takes the next serial from a counter row locked with `SELECT … FOR UPDATE`, so two
   receptionists can never get the same number. The last digit is the check digit — 0+0+0+0+1 —
   and a CHECK constraint on the table verifies it independently."
5. Click **Register another**, type the same NID `1999000000009` and any name, and submit.
   A red toast: *"This NID already holds UHID BD-2026-00001-1."* **Say:** "Refused by the stored
   procedure, which names the existing record."

## 3. The record a receptionist sees — decision 2 — 30 seconds

1. **Find patient** → type `Rahim` → open **BD-2019-04821-5**.
2. A blue banner: *Demographics only*. The allergies show; the timeline does not. **Say:**
   "Reception needs name, age, phone and allergies. It does not get diagnoses — and that is
   decided inside the database, which simply does not return them for this role."

## 4. Booking — decisions 3 and 4 — 2 minutes

1. **Book appointment**. The directory lists doctors nationally with their next free slot.
2. Open the address bar and add `?uhid=BD-2020-27615-1` to the URL (Shirin Akter), press Enter,
   then click **See slots** on Dr. Anisur Rahman (Dhaka Medical).
3. The grid: struck-through slots are already booked. **Say:** "This grid is one stored
   procedure — a recursive CTE that generates the slots from the schedule, removes leave, and
   marks bookings."
4. Pick a free slot → **Confirm appointment** → **Confirm booking**. Toast: *Appointment booked.*
5. In the second PowerShell window: `npm run race`. Five rounds; in each, two receptionists at
   two hospitals book the same slot at the same instant. Every round ends **"✓ exactly one
   booking"**. **Say:** "The procedure locks the doctor's row, so the second request waits, then
   sees the first booking and is told politely. And if the lock were missing, the UNIQUE key on
   doctor and slot would still refuse the second row. Correctness from the constraint, a clean
   answer from the lock."

## 5. Wards — decision 7 — 1.5 minutes

1. **Wards & beds**. 36 beds in 4 wards, coloured by status.
2. Click a green bed, e.g. **GM-04**. Choose Abdul Karim Mia and a consultant, click **Admit
   patient**. GM-04 turns red. **Say:** "The page never set that colour. Admitting inserts a
   bed-occupancy row; a trigger on that table set the bed to occupied."
3. Click **GM-04** again → **Discharge**. Red toast: *"Your role is not allowed to do this (it
   needs the bed.discharge permission)."* **Say:** "Receptionist admits, doctor discharges. That
   difference is two rows in the role-permission table, and the procedure checks it."
4. **Sign out.**

## 6. The national record — decisions 2, 5 and 6 — 3 minutes

1. Sign in as `anisur` (doctor at Dhaka Medical). Open **Md. Rahim Uddin, BD-2019-04821-5**.
2. The button reads *Access basis: active consent grant*. At the top of the timeline: a referral
   **Square Hospital → Dhaka Medical College Hospital**. **Say:** "This morning Square referred
   him here. The referral procedure wrote a 24-hour consent grant for this hospital in the same
   transaction — that grant is why I can read this. Decision 6 feeding decision 2."
3. Scroll the timeline: five encounters, four hospitals, two divisions; vitals, prescriptions, a
   cholesterol result flagged **abnormal**. **Say:** "The encounter is the hub — diagnoses are
   ICD-10 codes, medicines and tests come from catalogues, so a query can count hypertensive
   patients, which free text never could."
4. Click **Who has viewed this**. The top line is *Dr. Anisur Rahman*, today's date and time,
   *Consent*.
   **Say:** "Opening the record wrote that line first. MySQL has no trigger that fires on a
   read, so the read itself is a stored procedure that logs and then returns the rows — and the
   web server's database account has no other way to read these tables."
5. **Find patient** → open **Fatema Begum, BD-2021-11904-5**. Refused: *no consent grant or open
   encounter*, with **Use break-glass**.
6. Click it, type a reason (`Unconscious in emergency`), **Open the record**. A red banner:
   *Opened under break-glass.* In **Who has viewed this**, the line shows the reason and
   *awaiting review*. **Say:** "Emergency access is allowed, never silent: a reason is
   compulsory, and the read joins the administrator's review queue."
7. **Wards & beds** → click **GM-04** → **Discharge**. It turns grey: *cleaning*. **Say:** "A
   doctor may discharge; closing the bed stay fired the trigger that sets cleaning."

## 7. The patient's own view — 30 seconds

1. **Sign out**, sign in as `rahim`. He lands on **Find a doctor**; **My health record** shows his
   own timeline, and **Who has viewed this** lists every doctor and receptionist who has opened
   it. **Say:** "A patient sees their record and who read it,
   and cannot open anyone else's."

## 8. Print — 15 seconds

On any record, **Print record**. The preview is dark ink on white with no menus, ending with
*"Printed from the UHID national health record by …, access basis …"*.

## 9. The database itself — 3 minutes, in the MySQL prompt

This is the part that carries the marks: show the rules refusing things directly, with no web
page involved.

```sql
-- Decision 7: nobody writes a bed's status by hand.
UPDATE bed SET status_id = 1 WHERE bed_no = 'GM-01';
-- ERROR 1644: Bed status is maintained by the database. Admit, transfer or discharge instead.

-- Decision 2: the access log is append-only.
DELETE FROM access_log WHERE log_id = 1;
-- ERROR 1644: The access log is append-only.

-- The catalogue rule: Amoxicillin for a patient with a Penicillin allergy.
INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency)
VALUES (10, 9, 15, '1 capsule', 'three times daily');
-- ERROR 1644: Allergy conflict: … allergy to Penicillin, and Amoxicillin belongs to the same class.

-- Decision 1: a UHID with a wrong check digit.
INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id)
VALUES ('BD-2026-70413-4', 'X', '2000-01-01', 'Male', CURDATE(), 1);
-- ERROR 3819: Check constraint 'ck_patient_uhid_check_digit' is violated.

-- Decision 3: availability, computed.
CALL doctor_availability(1, CURDATE(), 7);

-- Least privilege: what the web server's own account may do.
SHOW GRANTS FOR 'uhid_app'@'localhost';
-- EXECUTE on procedures, SELECT on views and lookup tables — nothing on patient or encounter.
```

Then open `database/queries.sql` and run two or three: **1** (one patient, every hospital),
**5** (possible duplicate patients — a self-join), **7** (busiest departments — a window
function), **11** (a calendar from a recursive CTE).

Finally, in the second PowerShell window: `npm run db:test` — **64 tests, every one PASS**, each
proving a rule refuses what it must with the exact error number. (It resets the database when it
finishes, so do it last, or restart `npm start` afterwards.)

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Dr. Anisur is refused Rahim's record in step 6 | More than 24 hours since `db:reset`; the consent expired | Use break-glass and say why — it demonstrates the expiry. Or reset before the demo |
| Step 2 issues `BD-2026-00002-2`, not `00001-1` | Someone registered a patient since the reset | Nothing is wrong — the counter moved on |
| "The server is not answering" toast | `npm start` was stopped | Start it again |
| Login refused for every account | The database was rebuilt while the server ran | Restart `npm start` |
| The pages show only 5 patients and no break-glass | The site was opened from disk, not from http://localhost:3000 | Open the localhost address |

## Where the answers are

| Question | Document |
|---|---|
| Why is it modelled this way? | `docs/er-design.md` |
| What does each column hold? | `docs/data-dictionary.md` |
| Which normal form, and where is it broken on purpose? | `docs/normalization.md` |
| What does each user do, and which procedure does it? | `docs/use-cases.md` |
| Which URL calls which procedure? | `docs/api.md` |
