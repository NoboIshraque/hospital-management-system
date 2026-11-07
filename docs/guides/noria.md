# Learning guide — Noria

**Your track: the foundations.** You will learn how data gets *into* a relational database
correctly, how to get it back *out* with queries, how a view packages a query, and how a web
server hands database rows to a browser. These are the first things anyone asks about a
database project, and every other part of the project rests on them.

**This is a practice version of the real work.** The real project loads hundreds of rows. You
will load three or four, by hand, and understand every one. Your files go in your own practice
folder. They do not change the real project, so you cannot break anything for anyone else.

**Time:** about 6–8 hours spread over the week, plus Part 0 (setup).

| Task | You learn | Real project file to compare with |
|---|---|---|
| 1 | Reading a schema: tables, keys, foreign keys | `database/schema.sql` |
| 2 | INSERT, in the right order, with foreign keys | `database/seed.sql` §2 and §4 |
| 3 | CHECK constraints: the database refusing bad data | `database/schema.sql`, the `patient` table |
| 4 | SELECT with JOIN, GROUP BY, COUNT | `database/views.sql` |
| 5 | Views | `database/views.sql` |
| 6 | A web server that returns database rows as JSON | `server/` (the real API) |

Each task ends with **viva questions**. Try to answer them out loud before opening the answer.
The teacher will ask questions like these, and an answer you can say in your own words is worth
far more than one you memorised.

---

## Part 0 — Set up your laptop (everyone does this, about 45 minutes)

Do every step in order, even if you think you have something already. When a step says
**"You should see"**, check that you do before moving on. Most problems later come from a
skipped step here.

All commands are for **Windows PowerShell**. Open it from the Start menu: type `PowerShell`,
click **Windows PowerShell**.

### 0.1 Install the tools

Paste these one at a time. Each one can take a few minutes. Say **Yes** to any Windows prompt.

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Oracle.MySQL
winget install Microsoft.VisualStudioCode
```

**Close PowerShell and open a new one** (new programs are only found by new windows), then check:

```powershell
git --version
node --version
```

You should see something like `git version 2.x` and `v24.x`. Any number at least that high is fine.

### 0.2 Set up MySQL

1. Open **MySQL Configurator** from the Start menu (it may have opened by itself).
2. Accept the defaults: port **3306**, Windows service named **MySQL84**, start automatically.
3. Choose a **root password**. Write it down somewhere safe. You will type it often, and it must
   **never** be put in any file that goes to GitHub.
4. Finish the configurator.

**If the configurator asks you to *enter the current* root password** instead of letting you choose
one, MySQL has been set up on this laptop before — usually by an earlier install whose data folder
stayed behind when it was uninstalled. That folder holds the old password, so the configurator
wants it. First try leaving it blank, and any password you might have used before. If neither
works, start MySQL again from nothing. This deletes every database in that MySQL, which is fine
on a laptop with none in it yet — ours is rebuilt by `npm run db:reset` whenever you want it.
Close the configurator, then open PowerShell **as administrator** (right-click → *Run as
administrator*) and run:

```powershell
Get-Service *mysql*                        # which MySQL services exist — note their names
Get-Service *mysql* | Stop-Service         # stop them
winget uninstall Oracle.MySQL
Remove-Item -Recurse -Force "C:ProgramDataMySQL"   # the old data folder, with the old password in it
```

If `Get-Service *mysql*` still lists a service after the uninstall, remove it with
`sc.exe delete MySQL84` (use the name it showed). **Restart the laptop**, run
`winget install Oracle.MySQL` again, and go back to step 1. This time it asks you to choose a
password.

If you have **XAMPP** installed, open the XAMPP control panel and make sure its MySQL is
**stopped**. It uses the same port (3306) and is a different database (MariaDB) that our files do
not work on.

### 0.3 Get access to the repository

Ask **Nobo** to add your GitHub username as a collaborator on
`https://github.com/NoboIshraque/hospital-management-system`. Accept the invitation email.

Then tell Git who you are (use your own name and the email on your GitHub account):

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 0.4 Download the project

```powershell
cd $HOME\Documents
git clone https://github.com/NoboIshraque/hospital-management-system.git
cd hospital-management-system\server
npm install
```

You should see `added NN packages` at the end.

> **If `npm install` says "running scripts is disabled on this system":** run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer `Y`, and try again. Or type
> `npm.cmd` instead of `npm` everywhere in this guide; it does the same thing.

### 0.5 Tell the project your MySQL password

Still in the `server` folder:

```powershell
Copy-Item .env.example .env
code .env
```

VS Code opens the file. Change `your-mysql-root-password` to your real root password, and change
the `SESSION_SECRET` line to any long sentence. Save (Ctrl+S) and close.

`.env` is listed in `.gitignore`, so Git will never upload it. That is the only reason it is safe
to put a password in it. Check:

```powershell
git status
```

You should **not** see `.env` anywhere in the output.

### 0.6 Build the database

```powershell
npm run db:reset
```

You should see:

```
  (no APP_DB_PASSWORD in .env — generated one and added it)
  schema.sql — 45 statements
  triggers.sql — 28 statements
  procedures.sql — 163 statements
  views.sql — 10 statements
  reference.sql — 15 statements
  seed.sql — 42 statements
  grants.sql — 85 statements

Database rebuilt: 41 tables, 9 views, 21 triggers, 84 procedures/functions, 18 patients, 24 encounters.
```

The first line appears only the first time. `grants.sql` creates a second MySQL user,
`uhid_app`, with very limited rights, for the real API to connect as, and its password is
generated once and saved at the bottom of your `.env`. The exact numbers may grow as the
project grows. What matters is the last line starting with
`Database rebuilt`. That one command dropped the `uhid` database, created all the tables,
triggers, procedures and views, and loaded the reference data (districts, roles, catalogues) and the
demo data.

**`npm run db:reset` is your undo button.** Whatever you break while practising, running it puts
the database back exactly as it started. It also **deletes everything you made yourself**, which
is why you keep your work in files (0.8) and not just typed into the prompt.

### 0.7 Open a MySQL prompt

This is where you type SQL and see results immediately:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p uhid
```

Type your root password (nothing appears as you type, which is normal) and press Enter. You
should see a `mysql>` prompt. Try:

```sql
SHOW TABLES;
SELECT name FROM hospital;
```

Type `exit` to leave.

**Shortcut so you can just type `mysql`:** run this once, then open a new PowerShell:

```powershell
[Environment]::SetEnvironmentVariable('Path', $env:Path + ';C:\Program Files\MySQL\MySQL Server 8.4\bin', 'User')
```

After that, `mysql -u root -p uhid` works from anywhere. The rest of this guide writes it that way.

### 0.8 Where your work goes, and how to run it

Make your own folder. Everything you write in this guide goes in it:

```powershell
cd $HOME\Documents\hospital-management-system\server
mkdir practice\noria
```

(Use your own name in lowercase: `nobo`, `abir` or `noria`.)

There are **two ways to run a `.sql` file**. Use whichever you like:

```powershell
# Way 1 — from the server folder, through Node:
npm run db:run -- practice/noria/01-something.sql

# Way 2 — from inside the mysql prompt:
#   mysql> source practice/noria/01-something.sql
# (start the mysql prompt from the server folder so the path works)
```

Way 1 prints any `SELECT` results as a table and stops at the first error, telling you the line
number. Way 2 is the classic MySQL way and keeps going after errors.

**Rules for your practice files**

- **Prefix everything you create** with your initials: Nobo `nb_`, Abir `ab_`, Noria `nr_`. That way
  three people's practice tables can never clash with each other or with the real project.
- **Start every file with `USE uhid;`**, and with `DROP … IF EXISTS` for anything it creates, so
  you can run it again and again.
- **Number your files** (`01-…`, `02-…`) in the order they must run. After `npm run db:reset`
  wipes the database, you run them again in that order.
- **Never edit the files in `database/`** while practising. Those are the real project. You will
  be *reading* them a lot.

### 0.9 Running a practice server

Your Node files also go in `practice/noria/`. **Always run them from the `server` folder**:

```powershell
cd $HOME\Documents\hospital-management-system\server
node practice/noria/app.js
```

That matters because `require('dotenv').config()` reads `.env` from the folder you are *in*, and
`require('express')` finds Express in `server/node_modules`. Stop a running server with
**Ctrl+C**.

### 0.10 Saving your work to GitHub

Do this every time you finish a task:

```powershell
cd $HOME\Documents\hospital-management-system
git pull
git add server/practice/noria
git commit -m "Noria: task 3 practice"
git push
```

- `git pull` **first** brings down what the others pushed. Because each of you only touches your
  own `practice/` folder, there will be nothing to clash.
- `git add server/practice/noria`, **not** `git add .`. Only your own folder.
- If `git push` is refused with "rejected … fetch first", run `git pull` and push again.
- Never use `git push --force`.

### 0.11 When something goes wrong

| You see | It means | Do this |
|---|---|---|
| `'mysql' is not recognized` | MySQL's folder is not on your PATH | Use the long command in 0.7, or do the PATH shortcut |
| `ER_ACCESS_DENIED_ERROR` / `Access denied for user 'root'` | Wrong password in `.env` | Fix `DB_PASSWORD` in `server/.env` |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL is not running | Start menu → **Services** → find **MySQL84** → Start. Check XAMPP's MySQL is stopped |
| `Cannot find module 'express'` | You are not in the `server` folder, or skipped `npm install` | `cd` into `server`, run `npm install` |
| `Table 'nr_x' already exists` | Your file creates something without dropping it first | Add `DROP TABLE IF EXISTS nr_x;` at the top |
| `Table 'uhid.nr_x' doesn't exist` | You ran `db:reset` and it wiped your practice objects | Run your files again, in number order |
| `EADDRINUSE` | Your server is already running in another window | Find that window and press Ctrl+C |
| `PROCEDURE uhid.x does not exist` | You have not run the file that creates it, or misspelled it | Run the file; check the spelling |
| An error with a line number from `npm run db:run` | MySQL refused the statement on that line | Read the message. It is usually precise |

If you are still stuck after reading the error carefully: copy the **whole** error message, the
command you ran, and the file, and send all three to the group. "It doesn't work" can't be
answered. The full message usually can.

---

## Task 1 — Read the schema (about 1 hour)

**Goal:** before you write anything into a database, know what is in it.

Open the mysql prompt (Part 0.7) and run each of these. Read the output each time.

```sql
SHOW TABLES;
```
41 tables. Each is one *kind of thing*: `patient`, `hospital`, `doctor`, `encounter` (one visit
to a doctor), and so on.

```sql
DESCRIBE hospital;
```

You should see:

```
+-------------+-------------------+------+-----+-------------------+-------------------+
| Field       | Type              | Null | Key | Default           | Extra             |
+-------------+-------------------+------+-----+-------------------+-------------------+
| hospital_id | smallint unsigned | NO   | PRI | NULL              | auto_increment    |
| name        | varchar(120)      | NO   | MUL | NULL              |                   |
| district_id | smallint unsigned | NO   | MUL | NULL              |                   |
| tier_id     | tinyint unsigned  | NO   | MUL | NULL              |                   |
| address     | varchar(200)      | YES  |     | NULL              |                   |
| phone       | varchar(20)       | YES  |     | NULL              |                   |
| is_active   | tinyint(1)        | NO   |     | 1                 |                   |
| created_at  | datetime          | NO   |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
+-------------+-------------------+------+-----+-------------------+-------------------+
```

How to read it:

- **`PRI`** = primary key. `hospital_id` is the number that identifies one hospital, and no two
  hospitals can share it. `auto_increment` means MySQL picks the next number for you.
- **`MUL`** = there is an index on this column (it allows duplicates). `district_id` is
  indexed because it is a **foreign key**: it holds the `district_id` of a row in the `district`
  table. The hospital does not store the text "Dhaka". It stores the number of the Dhaka row.
- **`Null: NO`** = the column must have a value.

Now see the actual rows, and follow the foreign key by hand:

```sql
SELECT * FROM hospital;
SELECT * FROM district WHERE district_id = 1;
SELECT * FROM division WHERE division_id = 1;
```

Hospital 1 has `district_id` 1, district 1 is Dhaka, and its `division_id` is 1, which is the Dhaka
division. Three tables, joined by numbers. A **JOIN** does exactly what you just did by hand:

```sql
SELECT h.name AS hospital, ds.name AS district, dv.name AS division
  FROM hospital h
  JOIN district ds ON ds.district_id = h.district_id
  JOIN division dv ON dv.division_id = ds.division_id;
```

`h`, `ds` and `dv` are short nicknames (aliases) for the tables, so you don't type full names
every time. `ON` says which columns must match.

Finally, open `database/schema.sql` in VS Code and find `CREATE TABLE hospital`. Every column
you saw in `DESCRIBE` is written there, with a comment explaining why. Read the comments for
`hospital`, `department` and `patient`.

<details><summary><b>Viva: why does <code>hospital</code> store <code>district_id</code> instead of the district's name?</b></summary>

So the name is stored once. If a district were renamed, one row in `district` changes and every
hospital in it is automatically correct. If each hospital stored the text, the name would be
repeated in many rows, and they could disagree ("Chittagong" in one row, "Chattogram" in another).
The number also lets MySQL enforce that the district actually exists, with a foreign key.
</details>

<details><summary><b>Viva: what is the difference between a primary key and a foreign key?</b></summary>

A primary key identifies a row in its **own** table and must be unique (`hospital.hospital_id`).
A foreign key is a column that holds **another** table's primary key, to say "this row belongs
to / refers to that row" (`hospital.district_id` → `district.district_id`). MySQL refuses a
foreign key value that does not exist in the other table.
</details>

---

## Task 2 — Insert data in the right order (about 1 hour)

**Goal:** add a new hospital, a new doctor, and the doctor's job at that hospital, and see them
appear in the doctor directory the website uses.

**The real version:** `database/seed.sql` inserts all 8 hospitals, 11 doctors and 15 postings.
You will insert 1, 1 and 1.

### Why order matters

A **posting** (`doctor_posting`) says "this doctor works at this hospital, in this department,
for this fee". It has foreign keys to `doctor`, `hospital` and `department`, so those rows must
exist **before** the posting. Parents first, children after. That is the whole secret of a seed
file.

### Write the file

Create `server/practice/noria/01-seed.sql` in VS Code and type this in. Typing it rather than
pasting makes you notice each part:

```sql
USE uhid;

-- 1. A hospital. We don't know Mymensingh's district_id or the tier's id,
--    so we LOOK THEM UP with a sub-query instead of guessing a number.
INSERT INTO hospital (name, district_id, tier_id)
VALUES (
  'Mymensingh Medical College Hospital',
  (SELECT district_id FROM district WHERE name = 'Mymensingh'),
  (SELECT tier_id FROM hospital_tier WHERE name = 'Medical College')
);

-- 2. A doctor. BMDC is the doctors' council registration number; it is unique.
INSERT INTO doctor (name, bmdc_reg, qualifications)
VALUES ('Dr. Lutfun Nahar', 'A-90001', 'MBBS, DLO (ENT)');

-- 3. The posting: this doctor, at this hospital, in ENT, for 500 taka.
INSERT INTO doctor_posting (doctor_id, hospital_id, department_id, consultation_fee, valid_from)
VALUES (
  (SELECT doctor_id     FROM doctor     WHERE bmdc_reg = 'A-90001'),
  (SELECT hospital_id   FROM hospital   WHERE name = 'Mymensingh Medical College Hospital'),
  (SELECT department_id FROM department WHERE name = 'ENT'),
  500,
  '2026-01-01'
);

-- 4. Did it work? v_doctor_directory is the view the "Find a doctor" page reads.
SELECT * FROM v_doctor_directory WHERE bmdc = 'A-90001';
```

Notice we never wrote `hospital_id` in the first INSERT. It is `AUTO_INCREMENT`, so MySQL chose
it. That is why step 3 looks the hospital up by name instead of assuming its number.

### Run it

```powershell
cd $HOME\Documents\hospital-management-system\server
npm run db:run -- practice/noria/01-seed.sql
```

You should see:

```
┌─────────┬────┬────────────────────┬───────┬───────────────────┬────────────┬──────────┬───────────┬──────────┐
│ (index) │ id │ name               │ dept  │ qual              │ hospitalId │ fee      │ bmdc      │ doctorId │
├─────────┼────┼────────────────────┼───────┼───────────────────┼────────────┼──────────┼───────────┼──────────┤
│ 0       │ 16 │ 'Dr. Lutfun Nahar' │ 'ENT' │ 'MBBS, DLO (ENT)' │ 9          │ '500.00' │ 'A-90001' │ 12       │
└─────────┴────┴────────────────────┴───────┴───────────────────┴────────────┴──────────┴───────────┴──────────┘
01-seed.sql: 5 statements OK
```

Your new doctor is now in the national directory, and the website will show her once it reads from
the database.

### Break it on purpose

Running the file a second time **fails**. Try it:

```
Duplicate entry 'A-90001' for key 'doctor.uq_doctor_bmdc'
```

The `doctor` table has a UNIQUE key on `bmdc_reg`, so MySQL refuses a second doctor with the same
registration number. (The hospital insert before it *did* run again, so you now have two
Mymensingh hospitals. Run `npm run db:reset` and then your file once, to get back to a clean
state.)

Now try these in the mysql prompt, one at a time, and read each error:

```sql
-- A district that doesn't exist (there is no district 999):
INSERT INTO hospital (name, district_id, tier_id) VALUES ('Test', 999, 1);
```
```
ERROR 1452: Cannot add or update a child row: a foreign key constraint fails (... CONSTRAINT `fk_hospital_district` ...)
```

```sql
-- Deleting a district that a hospital still uses:
DELETE FROM district WHERE name = 'Mymensingh';
```
```
ERROR 1451: Cannot delete or update a parent row: a foreign key constraint fails (...)
```

```sql
-- A negative fee:
INSERT INTO doctor_posting (doctor_id, hospital_id, department_id, consultation_fee, valid_from)
VALUES (1, 1, 1, -100, '2026-02-01');
```
```
ERROR 3819: Check constraint 'ck_posting_fee' is violated.
```

In each case **the database itself** refused bad data. No application code was involved. That
is the most important idea in this project.

### Save your work

Follow Part 0.10 with the message `"Noria: task 2, seed practice"`.

<details><summary><b>Viva: why use a sub-query like <code>(SELECT district_id FROM district WHERE name = 'Mymensingh')</code> instead of just writing the number?</b></summary>

Because the number is chosen by `AUTO_INCREMENT` and could be different on another laptop or after
the data changes. Looking it up by a unique name always finds the right row. If the name is
misspelled, the sub-query returns NULL, `district_id` is `NOT NULL`, and the insert fails loudly
instead of silently pointing at the wrong district.
</details>

<details><summary><b>Viva: what does <code>ON DELETE RESTRICT</code> mean, and why is it used for <code>hospital.district_id</code>?</b></summary>

It means "refuse to delete the parent row while any child row points at it". Deleting the
Mymensingh district would otherwise leave hospitals pointing at a district that no longer exists.
The alternatives are `CASCADE` (delete the children too, which would be disastrous for hospitals)
and `SET NULL` (keep the child, empty the reference).
</details>

---

## Task 3 — The database checks the UHID (about 45 minutes)

**Goal:** see a CHECK constraint protect the most important value in the project.

Every patient's UHID looks like `BD-2026-13052-1`:

- `BD`, then the **year**, then a 5-digit **serial**, then one **check digit**
- the check digit = the serial's digits added up, keeping only the last digit (that is "mod 10").
  For serial `13052`: 1 + 3 + 0 + 5 + 2 = **11**, so the last digit is **1**, giving `BD-2026-13052-1`.

The check digit catches typing mistakes: change one digit of the serial and the sum no longer
matches. Open `database/schema.sql`, find `CREATE TABLE patient`, and read the two CHECK
constraints `ck_patient_uhid_format` and `ck_patient_uhid_check_digit`.

### Work one out yourself

Your serial is **70412**. Add the digits: 7 + 0 + 4 + 1 + 2 = ____ . The last digit of that is
your check digit. Write the full UHID down before you continue.

<details><summary>Check your answer</summary>

7 + 0 + 4 + 1 + 2 = 14, so the check digit is **4**: `BD-2026-70412-4`.
</details>

### Try a wrong one first

In the mysql prompt:

```sql
INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id)
VALUES ('BD-2026-70413-4', 'Practice Patient', '2000-01-15', 'Female', CURDATE(), 1);
```
```
ERROR 3819: Check constraint 'ck_patient_uhid_check_digit' is violated.
```
(Serial 70413 adds to 15, so its check digit would be 5, not 4.)

```sql
INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id)
VALUES ('bd-2026-70412-4', 'Practice Patient', '2000-01-15', 'Female', CURDATE(), 1);
```
```
ERROR 3819: Check constraint 'ck_patient_uhid_format' is violated.
```
Lower-case `bd` is refused. The column uses a *case-sensitive* collation on purpose; the comment
above `uhid` in `schema.sql` explains why.

### Now the right one

Create `server/practice/noria/02-patient.sql`:

```sql
USE uhid;

INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id)
VALUES ('BD-2026-70412-4', 'Practice Patient', '2000-01-15', 'Female', CURDATE(), 1);

SELECT patient_id, uhid, name, nid FROM patient WHERE uhid = 'BD-2026-70412-4';
```

Run it with `npm run db:run -- practice/noria/02-patient.sql`. You should see your patient, with
`nid` showing `null`.

### How the real system does it

Real receptionists never type a UHID. The procedure `register_patient()` in
`database/procedures.sql` works out the next serial and the check digit itself. Try it in the
mysql prompt (account 1 is the receptionist Rezaul):

```sql
CALL register_patient(1, 'Noria Test', '2001-05-05', 'Female', 'O+', '01700-111222',
                      NULL, 'Dhaka', 'Mirpur, Dhaka', NULL, NULL, NULL, NULL);
```

It replies with a brand-new UHID such as `BD-2026-00001-1`. Check the digit yourself:
0+0+0+0+1 = 1. ✓

<details><summary><b>Viva: the frontend's JavaScript also calculates the check digit. Why put a CHECK in the database as well?</b></summary>

Because the database is the last line of defence and the only one that cannot be skipped. Anything
can write to a database: the website, a script, someone at the mysql prompt, a future mobile app.
A rule in JavaScript only protects the one path that runs that JavaScript. A CHECK constraint
protects every path, and you have just watched it refuse a bad UHID typed directly into MySQL.
</details>

<details><summary><b>Viva: why is <code>nid</code> NULL and not an empty string <code>''</code> when a patient has no NID?</b></summary>

`nid` has a UNIQUE key. `''` is a real value, so a second patient with `''` would be a duplicate
and be refused. NULL means "no value", and a UNIQUE key allows any number of NULLs. The trigger
`trg_patient_bi` turns `''` into NULL automatically, so a form sending an empty box still works.
</details>

---

## Task 4 — Ask questions with SELECT (about 1.5 hours)

**Goal:** four queries that answer real questions, each using a new idea.

Create `server/practice/noria/03-queries.sql`. Add one query at a time, run the file, and look at
the result before writing the next.

```sql
USE uhid;

-- Q1. How many hospitals in each division? (including divisions with none)
SELECT dv.name AS division, COUNT(h.hospital_id) AS hospitals
  FROM division dv
  LEFT JOIN district ds ON ds.division_id = dv.division_id
  LEFT JOIN hospital h  ON h.district_id  = ds.district_id
 GROUP BY dv.division_id, dv.name
 ORDER BY hospitals DESC, division;
```

New ideas:
- **`GROUP BY`** squashes many rows into one row per division; **`COUNT(...)`** counts the rows
  that were squashed together.
- **`LEFT JOIN`** keeps divisions that have no hospital. With a plain `JOIN`, Barishal (0
  hospitals) would vanish from the answer. Try changing both to `JOIN` and see.
- `COUNT(h.hospital_id)`, not `COUNT(*)`: for Barishal the hospital columns are NULL, and
  `COUNT(column)` does not count NULLs, so it correctly says 0.

You should see Dhaka with 3 at the top and Barishal with 0 at the bottom (Mymensingh shows 1 if
you ran Task 2).

```sql
-- Q2. How many doctors work in each department right now?
SELECT dept.name AS department, COUNT(dp.posting_id) AS doctors
  FROM department dept
  LEFT JOIN doctor_posting dp
         ON dp.department_id = dept.department_id
        AND dp.valid_to IS NULL
 GROUP BY dept.department_id, dept.name
 ORDER BY doctors DESC, department;
```

`valid_to IS NULL` means "posting still current". It sits in the `ON` clause, not in a `WHERE`, so
departments with no current doctor (Emergency) still show up with 0.

**Look closely at Cardiology: it says 3.** But there are only two cardiologists. Dr. Anisur
Rahman has **two** postings, one at Dhaka Medical and one at Square Hospital, and we counted
postings. Change `COUNT(dp.posting_id)` to `COUNT(DISTINCT dp.doctor_id)` and run it again.
Cardiology becomes 2. Knowing exactly *what* you are counting is half of writing correct SQL.

```sql
-- Q3. How many patients registered each year?
SELECT YEAR(registered_at) AS year, COUNT(*) AS patients
  FROM patient
 GROUP BY YEAR(registered_at)
 ORDER BY year;
```

`YEAR()` pulls the year out of a date. You can group by a calculated value, not just a column.

```sql
-- Q4. Md. Rahim Uddin's visits, newest first: when, where, which doctor, what type.
SELECT DATE(e.started_at) AS date, h.name AS hospital, d.name AS doctor, t.code AS type
  FROM encounter e
  JOIN patient p         ON p.patient_id  = e.patient_id
  JOIN hospital h        ON h.hospital_id = e.hospital_id
  JOIN doctor_posting dp ON dp.posting_id = e.posting_id
  JOIN doctor d          ON d.doctor_id   = dp.doctor_id
  JOIN encounter_type t  ON t.type_id     = e.type_id
 WHERE p.uhid = 'BD-2019-04821-5'
 ORDER BY e.started_at DESC;
```

You should see five visits at four different hospitals: Square, Chattogram, Dhaka Medical and
Savar. **That is the whole point of the project.** One patient, one UHID, and their history
follows them across the country. Notice how the doctor is reached: encounter → posting → doctor.
The encounter records *which job* the doctor was doing, not just who they are.

<details><summary><b>Viva: what is the difference between <code>JOIN</code> and <code>LEFT JOIN</code>?</b></summary>

`JOIN` (inner join) keeps only rows that have a match on both sides. `LEFT JOIN` keeps every row
from the left table, and fills the right side with NULL when there is no match. Use `LEFT JOIN`
whenever "none" is a valid answer you want to see, like a division with no hospitals.
</details>

<details><summary><b>Viva: why must every column in the SELECT of a GROUP BY query be either grouped or inside an aggregate like COUNT?</b></summary>

After grouping, there is one output row per group. A column that is not grouped could have many
different values inside one group, and MySQL would have to pick one at random. MySQL's
`ONLY_FULL_GROUP_BY` mode (on by default) refuses such a query instead of guessing.
</details>

---

## Task 5 — Package a query as a view (about 30 minutes)

**Goal:** save a query under a name so it can be used like a table.

Create `server/practice/noria/04-view.sql`:

```sql
USE uhid;

CREATE OR REPLACE VIEW nr_v_hospital_load AS
SELECT h.name                       AS hospital,
       COUNT(e.encounter_id)        AS encounters,
       COUNT(DISTINCT e.patient_id) AS patients
  FROM hospital h
  LEFT JOIN encounter e ON e.hospital_id = h.hospital_id
 GROUP BY h.hospital_id, h.name;

SELECT * FROM nr_v_hospital_load ORDER BY encounters DESC, hospital;
```

Run it. Dhaka Medical College Hospital is at the top with 14 encounters (the inpatients on its
wards), and Khulna is at the bottom with 0.

A view stores **no data**. It stores the query, and runs it every time someone selects from it,
so it is never out of date. Prove it in the mysql prompt:

```sql
SELECT COUNT(*) FROM nr_v_hospital_load;          -- note the number
INSERT INTO hospital (name, district_id, tier_id) VALUES ('Test Clinic', 1, 3);
SELECT * FROM nr_v_hospital_load WHERE hospital = 'Test Clinic';
```

The new hospital is in the view straight away, with 0 encounters, even though you never touched
the view. (Run `npm run db:reset` and your files 01–04 again afterwards if you want the test
clinic gone.)

**Compare with the real project:** open `database/views.sql` and read `v_hospital_directory`. It
joins three tables and renames the columns to `id, name, div, dist, tier`, which is *exactly* the
shape the website's JavaScript already uses. The website does not need to know the database is
split into three tables. The view hides that.

<details><summary><b>Viva: why use views at all, instead of writing the query in the application?</b></summary>

1. **One place:** the query is written once in the database and every program that needs it
   uses the same definition.
2. **Shape:** the view can return rows in the shape the screen needs, while the tables stay
   normalized.
3. **Security:** a user can be allowed to read a view without being allowed to read the tables
   behind it. The real project uses this so the web server can read the doctor directory but not
   the clinical tables.
</details>

---

## Task 6 — A web server that returns database rows (about 2 hours)

**Goal:** a tiny Node.js server where `http://localhost:3003/hospitals` in a browser shows the
hospital list, straight from MySQL.

This is new territory, so here is the picture first:

```
browser ──HTTP request──▶ your Node server ──SQL query──▶ MySQL
browser ◀──JSON reply──── your Node server ◀──rows─────── MySQL
```

- **Node.js** runs JavaScript outside the browser. Here it is the program in the middle.
- **Express** is a library that makes it easy to say "when someone asks for `/hospitals`, run
  this function".
- **mysql2** is the library that lets Node talk to MySQL.
- **JSON** is the text format the reply is sent in. It looks just like a JavaScript object.

All three libraries are already installed. That is what `npm install` did in Part 0.

### Write it

Create `server/practice/noria/app.js`:

```js
// Read DB_HOST, DB_PASSWORD etc. from the .env file into process.env.
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');

// A "pool" keeps a few connections to MySQL open and lends one out for each
// query, so we don't reconnect for every request.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true          // give dates back as '2026-01-01', not JS Date objects
});

const app = express();

// When a browser asks for GET /hospitals, run this function.
// req = the request (what was asked), res = the response (what we send back).
app.get('/hospitals', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_hospital_directory ORDER BY id');
    res.json(rows);          // send the rows back as JSON
  } catch (err) {
    console.error(err);      // the full error goes to OUR terminal...
    res.status(500).json({ error: 'Database error' });   // ...not to the browser
  }
});

// GET /hospitals/3 — one hospital. ":id" means "whatever is in this part of the URL".
app.get('/hospitals/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM v_hospital_directory WHERE id = ?',
      [req.params.id]        // this value replaces the ? — safely (see below)
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No hospital has id ' + req.params.id });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(3003, () => console.log('Noria practice API: http://localhost:3003/hospitals'));
```

Three things to understand:

1. **`async` / `await`.** Asking MySQL takes time. `await` means "wait for the answer here, but
   let the server handle other visitors meanwhile". `await` only works inside a function marked
   `async`.
2. **`const [rows] = …`.** `pool.query` returns two things, the rows and some details about the
   columns. The square brackets take the first and ignore the second.
3. **The `?` placeholder.** Never glue a value from the URL into SQL text with `+`. If you wrote
   `'… WHERE id = ' + req.params.id`, a visitor could type SQL into the URL and MySQL would run
   it. That is called **SQL injection**. With `?`, mysql2 sends the value separately, and it is
   always treated as data, never as SQL.

### Run it

```powershell
cd $HOME\Documents\hospital-management-system\server
node practice/noria/app.js
```

You should see `Noria practice API: http://localhost:3003/hospitals`. Leave that window open.
The server keeps running until you press Ctrl+C.

Open these in your browser:

| URL | You should see |
|---|---|
| `http://localhost:3003/hospitals` | A list starting `[{"id":1,"name":"Dhaka Medical College Hospital","div":"Dhaka",…` |
| `http://localhost:3003/hospitals/3` | `{"id":3,"name":"Chattogram Medical College Hospital",…}` |
| `http://localhost:3003/hospitals/99` | `{"error":"No hospital has id 99"}` |

The last one returns status **404 Not Found**. Press F12 in the browser, open the **Network**
tab, reload, and click the request to see the status code.

### Try this

- Stop MySQL (Services → MySQL84 → Stop) and reload `/hospitals`. The browser gets
  `{"error":"Database error"}`, and your terminal shows the real reason (`ECONNREFUSED`). Start
  MySQL again afterwards. This is why the full error is printed in the terminal but not sent to the
  browser: error details help attackers, and the real reason is for you.
- Add a third route, `GET /departments`, that returns `SELECT name FROM department ORDER BY name`.
  Restart the server (Ctrl+C, then run it again) and test it.

**Compare with the real project:** when the real API in `server/` is finished, the hospital
route there is this same idea: a route, a query on a view, and `res.json`. The website's
`js/data.js` then gets its hospital list from that route instead of from a list typed into the
file.

<details><summary><b>Viva: what is an API, in one sentence?</b></summary>

A set of URLs a program can call to get or change data, here returning JSON, so the website (or
any other program) never talks to the database directly.
</details>

<details><summary><b>Viva: why must the browser never connect to MySQL directly?</b></summary>

The browser would need the database password, and anything sent to a browser can be read by its
user. It would also let any visitor run any SQL. The server sits in the middle, holds the password
privately, and only runs the specific queries its routes allow.
</details>

<details><summary><b>Viva: what is SQL injection, and how does your code prevent it?</b></summary>

It is when text typed by a user ends up inside an SQL statement and changes what the statement
does. For example, entering `1 OR 1=1` to make a query return everything. The code prevents it
with `?` placeholders: the SQL text and the values are sent to MySQL separately, so a value can
never be run as SQL.
</details>

---

## You're done. What next?

1. Push everything (Part 0.10).
2. Read `docs/use-cases.md` from top to bottom. It describes what the whole system does, and every
   use case names the database object behind it. You now know enough to follow each one.
3. Read `docs/normalization.md` §1–§4. It explains, with this project's own data, *why* the
   tables are split the way you saw in Task 1.

If you finish early, look at Abir's guide, Task 4: queries with sub-queries, window functions and
CTEs, one step up from yours.
