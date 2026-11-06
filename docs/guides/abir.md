# Learning guide — Abir

**Your track: making the database enforce rules.** You will design tables with constraints,
then go past what constraints can do with triggers, wrap a business operation in a stored
procedure, write the kind of queries examiners like (sub-queries, window functions, CTEs), work
through a normalization exercise, and build an API that sends user input to a procedure and turns
the database's refusals into proper HTTP errors.

**This is a practice version of the real work.** The real project's triggers and procedures
cover 40 tables. You will build the same patterns on one small feature, a **vaccination
record**, that the real project does not have. Every pattern you use is one the real project
uses, and each task tells you exactly where to compare.

**Time:** about 10–12 hours spread over the week, plus Part 0 (setup).

| Task | You learn | Real project file to compare with |
|---|---|---|
| 1 | Designing tables: keys, foreign keys, UNIQUE, CHECK, and what CHECK can't do | `database/schema.sql` phase 2 section |
| 2 | Triggers: rules that need another table or another row | `database/triggers.sql` §2, §8, §9 |
| 3 | A stored procedure with guards and SIGNAL | `database/procedures.sql` §8 (`add_diagnosis`, `order_lab`) |
| 4 | HAVING, NOT EXISTS, window functions, CTEs | `database/views.sql`, `procedures.sql` §5 |
| 5 | Normalization: functional dependencies and decomposition | `docs/normalization.md` |
| 6 | An API that takes input, calls a procedure and maps errors | `server/` (the real API) |

Each task ends with **viva questions**. Answer them out loud before opening the answer.

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
  schema.sql — 44 statements
  triggers.sql — 28 statements
  procedures.sql — 57 statements
  views.sql — 9 statements
  seed.sql — 54 statements
  grants.sql — 26 statements

Database rebuilt: 40 tables, 9 views, 21 triggers, 47 procedures/functions, 18 patients, 24 encounters.
```

The first line appears only the first time. `grants.sql` creates a second MySQL user,
`uhid_app`, with very limited rights, for the real API to connect as, and its password is
generated once and saved at the bottom of your `.env`. The exact numbers may grow as the
project grows. What matters is the last line starting with
`Database rebuilt`. That one command dropped the `uhid` database, created all the tables,
triggers, procedures and views, and loaded the sample data.

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
mkdir practice\abir
```

(Use your own name in lowercase: `nobo`, `abir` or `noria`.)

There are **two ways to run a `.sql` file**. Use whichever you like:

```powershell
# Way 1 — from the server folder, through Node:
npm run db:run -- practice/abir/01-something.sql

# Way 2 — from inside the mysql prompt:
#   mysql> source practice/abir/01-something.sql
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

Your Node files also go in `practice/abir/`. **Always run them from the `server` folder**:

```powershell
cd $HOME\Documents\hospital-management-system\server
node practice/abir/app.js
```

That matters because `require('dotenv').config()` reads `.env` from the folder you are *in*, and
`require('express')` finds Express in `server/node_modules`. Stop a running server with
**Ctrl+C**.

### 0.10 Saving your work to GitHub

Do this every time you finish a task:

```powershell
cd $HOME\Documents\hospital-management-system
git pull
git add server/practice/abir
git commit -m "Abir: task 3 practice"
git push
```

- `git pull` **first** brings down what the others pushed. Because each of you only touches your
  own `practice/` folder, there will be nothing to clash.
- `git add server/practice/abir`, **not** `git add .`. Only your own folder.
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

## Task 1 — Design two tables (about 1.5 hours)

**Goal:** a vaccination record. A patient gets dose 1, 2, 3… of a vaccine. Each vaccine has a
fixed number of doses.

### First, think before typing

Answer these on paper. The design follows from the answers.

1. Should the vaccine's name be typed into each vaccination row?
2. What makes one vaccination row unique: what can never happen twice?
3. Which values are never allowed?

<details><summary>Answers</summary>

1. **No.** "Hepatitis B", "Hep B" and "HepB" would all appear, and "how many people had Hepatitis
   B" would be wrong. Also, "number of doses required" is a fact about the *vaccine*, not about one
   patient's injection. So the vaccine gets its own **catalogue table**, and each vaccination
   points at it by id. The real project does the same with `diagnosis`, `medicine`, `allergen`
   and `lab_test` (`docs/normalization.md` §2.3).
2. One patient cannot have **dose 2 of the same vaccine twice**. That is
   `UNIQUE (patient_id, vaccine_id, dose_no)`.
3. A dose number below 1, and a vaccine with fewer than 1 or more than 5 doses.
</details>

### Write it

Create `server/practice/abir/01-tables.sql`:

```sql
USE uhid;

-- Drop in reverse order: the child (vaccination) before the parent (vaccine),
-- because a parent cannot be dropped while a foreign key points at it.
DROP TABLE IF EXISTS ab_vaccination;
DROP TABLE IF EXISTS ab_vaccine;

CREATE TABLE ab_vaccine (
  vaccine_id      SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(60)       NOT NULL,
  doses_required  TINYINT UNSIGNED  NOT NULL,
  PRIMARY KEY (vaccine_id),
  UNIQUE KEY uq_ab_vaccine_name (name),
  CONSTRAINT ck_ab_vaccine_doses CHECK (doses_required BETWEEN 1 AND 5)
) ENGINE = InnoDB;

CREATE TABLE ab_vaccination (
  vaccination_id  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  patient_id      INT UNSIGNED      NOT NULL,
  vaccine_id      SMALLINT UNSIGNED NOT NULL,
  dose_no         TINYINT UNSIGNED  NOT NULL,
  given_at        DATETIME          NOT NULL,
  given_by        INT UNSIGNED      NOT NULL,
  PRIMARY KEY (vaccination_id),
  UNIQUE KEY uq_ab_vaccination_dose (patient_id, vaccine_id, dose_no),
  KEY ix_ab_vaccination_vaccine (vaccine_id),
  KEY ix_ab_vaccination_given_by (given_by),
  CONSTRAINT fk_ab_vaccination_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ab_vaccination_vaccine FOREIGN KEY (vaccine_id)
    REFERENCES ab_vaccine (vaccine_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ab_vaccination_given_by FOREIGN KEY (given_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_ab_vaccination_dose CHECK (dose_no >= 1)
) ENGINE = InnoDB;

INSERT INTO ab_vaccine (name, doses_required) VALUES
  ('Hepatitis B', 3),
  ('Tetanus toxoid', 5),
  ('COVID-19', 2);

-- given_by is a user_account: 6 is Dr. Anisur Rahman, 7 is Dr. Farzana Haque.
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by) VALUES
  (1, 1, 1, '2025-01-10 10:00', 6),
  (1, 1, 2, '2025-02-10 10:00', 6),
  (2, 2, 1, '2026-03-01 09:30', 7);

SELECT p.name AS patient, v.name AS vaccine, x.dose_no, x.given_at
  FROM ab_vaccination x
  JOIN patient p    ON p.patient_id = x.patient_id
  JOIN ab_vaccine v ON v.vaccine_id = x.vaccine_id
 ORDER BY p.name, v.name, x.dose_no;
```

Line by line, the parts that matter:

| Part | Why it is there |
|---|---|
| `UNSIGNED` on ids | An id is never negative; unsigned doubles the range for free |
| `NOT NULL` almost everywhere | A vaccination with no patient or no date is meaningless. Allow NULL only when "unknown" is a real answer |
| `UNIQUE KEY … (patient_id, vaccine_id, dose_no)` | A **composite** unique key: the *combination* must be unique, not each column alone |
| `KEY ix_…` on each foreign key column | MySQL needs an index to check foreign keys quickly; naming it yourself keeps names readable |
| `ON DELETE RESTRICT` | A patient with vaccinations cannot be deleted. Medical history must not vanish |
| `ENGINE = InnoDB` | The only MySQL storage engine that enforces foreign keys and supports transactions |

### Run it

```powershell
cd $HOME\Documents\hospital-management-system\server
npm run db:run -- practice/abir/01-tables.sql
```

You should see:

```
┌─────────┬───────────────────┬──────────────────┬─────────┬───────────────────────┐
│ (index) │ patient           │ vaccine          │ dose_no │ given_at              │
├─────────┼───────────────────┼──────────────────┼─────────┼───────────────────────┤
│ 0       │ 'Fatema Begum'    │ 'Tetanus toxoid' │ 1       │ '2026-03-01 09:30:00' │
│ 1       │ 'Md. Rahim Uddin' │ 'Hepatitis B'    │ 1       │ '2025-01-10 10:00:00' │
│ 2       │ 'Md. Rahim Uddin' │ 'Hepatitis B'    │ 2       │ '2025-02-10 10:00:00' │
└─────────┴───────────────────┴──────────────────┴─────────┴───────────────────────┘
01-tables.sql: 8 statements OK
```

### Break it on purpose

In the mysql prompt (`mysql -u root -p uhid`), run each and read the error:

```sql
-- Dose 2 of Hepatitis B for Rahim again:
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (1, 1, 2, '2025-03-01', 6);
-- ERROR 1062: Duplicate entry '1-1-2' for key 'ab_vaccination.uq_ab_vaccination_dose'

-- Dose 0:
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (1, 3, 0, '2025-03-01', 6);
-- ERROR 3819: Check constraint 'ck_ab_vaccination_dose' is violated.

-- A patient that doesn't exist:
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (999, 3, 1, '2025-03-01', 6);
-- ERROR 1452: Cannot add or update a child row: a foreign key constraint fails (...)
```

Now the important one. **These are wrong, yet MySQL accepts them:**

```sql
-- Dose 3 of COVID-19, which only has 2 doses:
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (1, 3, 3, '2025-03-01', 6);

-- A vaccination in the year 2030:
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (2, 1, 1, '2030-01-01', 6);
```

Both succeed. Why couldn't we simply write `CHECK (dose_no <= doses_required)`? Because
`doses_required` is in **another table**, and a MySQL CHECK may only look at columns of the row
being inserted. It cannot read another table or run a query. Try it:

```sql
ALTER TABLE ab_vaccination ADD CONSTRAINT ck_test
  CHECK (dose_no <= (SELECT doses_required FROM ab_vaccine WHERE vaccine_id = 1));
```

```
ERROR 3815: An expression of a check constraint 'ck_test' contains disallowed function.
```

MySQL refuses the sub-query. And a CHECK using `NOW()` is refused too:

```sql
ALTER TABLE ab_vaccination ADD CONSTRAINT ck_test2 CHECK (given_at <= NOW());
```
```
ERROR 3814: An expression of a check constraint 'ck_test2' contains disallowed function: now.
```

because `NOW()` changes over time, and a CHECK must give the same answer every time it is
evaluated. Those rules
need a **trigger**, which is Task 2. Run your file again to throw away the two bad rows (it drops
and recreates the tables).

Read the foot of `database/schema.sql`, the section headed **"What a CHECK could not say"**. It
lists the ten real rules in this project that hit exactly this wall, and which trigger handles
each one.

<details><summary><b>Viva: why is the vaccine a separate table instead of a <code>vaccine_name</code> column?</b></summary>

Two reasons. Data quality: one catalogue row means one spelling, so counts and searches are
correct. Normalization: `doses_required` depends only on the vaccine, not on the patient or the
dose, so storing it on every vaccination row would repeat it, and one wrong row could contradict
the others. That is a partial dependency, which 2NF removes.
</details>

<details><summary><b>Viva: what can a CHECK constraint not do in MySQL, and what do you use instead?</b></summary>

It cannot read another table, run a sub-query, or use functions whose result changes over time,
such as `NOW()`. It can only test the values in the row being written. Rules like those are
enforced with a `BEFORE INSERT` / `BEFORE UPDATE` trigger that raises an error with `SIGNAL`.
</details>

---

## Task 2 — Triggers (about 2 hours)

**Goal:** enforce the three rules the CHECK constraints couldn't, and make vaccination history
impossible to delete.

### What a trigger is

A trigger is code stored in the database that runs **automatically** when a row is inserted,
updated or deleted in one table. Nobody calls it, and nobody can skip it.

- **`BEFORE INSERT`** runs before the row is saved. It can inspect the new row (`NEW.column`),
  change it, or refuse it.
- **`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '…'`** refuses. It raises an error, the INSERT is
  cancelled, and the message is what the user sees.
- `NEW.x` is the row being written. In UPDATE and DELETE triggers, `OLD.x` is the row as it was.

### Why `DELIMITER`

A trigger's body contains several statements, each ending with `;`. But `;` is also what tells
the client "the statement is finished, send it". So for the length of the trigger we switch the
end-marker to `$$`, and switch it back afterwards. `DELIMITER` is an instruction to the
*client*, not SQL. The server never sees it.

### Write it

Create `server/practice/abir/02-triggers.sql`:

```sql
USE uhid;

DROP TRIGGER IF EXISTS trg_ab_vaccination_bi;
DROP TRIGGER IF EXISTS trg_ab_vaccination_bd;

DELIMITER $$

CREATE TRIGGER trg_ab_vaccination_bi BEFORE INSERT ON ab_vaccination
FOR EACH ROW
BEGIN
  DECLARE v_required TINYINT UNSIGNED;

  -- Rule 1: not in the future. NOW() is allowed here, unlike in a CHECK.
  IF NEW.given_at > NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A vaccination cannot be recorded in the future.';
  END IF;

  -- Rule 2: not more doses than the vaccine has. Reads ANOTHER table.
  SELECT doses_required INTO v_required FROM ab_vaccine WHERE vaccine_id = NEW.vaccine_id;
  IF NEW.dose_no > v_required THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That vaccine does not have that many doses.';
  END IF;

  -- Rule 3: dose 3 needs dose 2 first. Reads OTHER ROWS of this table.
  IF NEW.dose_no > 1 AND NOT EXISTS (
       SELECT 1 FROM ab_vaccination
        WHERE patient_id = NEW.patient_id
          AND vaccine_id = NEW.vaccine_id
          AND dose_no = NEW.dose_no - 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The previous dose has not been recorded.';
  END IF;
END $$

-- History is never deleted. This trigger refuses every DELETE.
CREATE TRIGGER trg_ab_vaccination_bd BEFORE DELETE ON ab_vaccination
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Vaccination history cannot be deleted.';
END $$

DELIMITER ;
```

The naming pattern `trg_<table>_<b|a><i|u|d>` means **B**efore/**A**fter and
**I**nsert/**U**pdate/**D**elete. The real project uses it throughout.

Run it: `npm run db:run -- practice/abir/02-triggers.sql`. You should see
`02-triggers.sql: 5 statements OK`.

### Test every rule

In the mysql prompt:

```sql
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (1, 3, 1, '2030-01-01', 6);
-- ERROR 1644: A vaccination cannot be recorded in the future.

INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (1, 3, 3, '2025-03-01', 6);
-- ERROR 1644: That vaccine does not have that many doses.

INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (2, 2, 3, '2026-04-01', 7);
-- ERROR 1644: The previous dose has not been recorded.   (Fatema only has dose 1)

DELETE FROM ab_vaccination WHERE vaccination_id = 1;
-- ERROR 1644: Vaccination history cannot be deleted.

-- And a correct one still works:
INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
VALUES (2, 2, 2, '2026-04-01', 7);
-- Query OK, 1 row affected
```

`1644` is the error number MySQL gives every `SIGNAL` by default. Remember it, because Task 6 uses it.

**Compare with the real project.** Open `database/triggers.sql`:

- §2 `trg_patient_bi`: a trigger that **changes** the row instead of refusing it (turns `''`
  into NULL).
- §8 `trg_lab_result_bi`: reads another table (the test's reference range) to *set* a column.
  `trg_lab_result_ai` is an **AFTER** trigger that updates a *different* table.
- §9 the `access_log` triggers: the same "append-only" idea as your `_bd` trigger, plus an
  UPDATE trigger that allows exactly one kind of change. Read its comment, which also explains what
  triggers **cannot** stop (`TRUNCATE`).

<details><summary><b>Viva: what is the difference between a BEFORE and an AFTER trigger?</b></summary>

A BEFORE trigger runs before the row is written: it can check the row, change its values
(`SET NEW.x = …`) or refuse it with SIGNAL. An AFTER trigger runs once the row is written: it can
no longer change that row, but it can act on *other* tables, like the real project's trigger that
marks a bed occupied after a patient is placed in it.
</details>

<details><summary><b>Viva: your trigger refuses DELETE. Can someone still remove the history?</b></summary>

Yes. `TRUNCATE TABLE` and `DROP TABLE` do not fire triggers. A trigger is a guard against mistakes
and against the application, not against an administrator. The real defence is privileges: the
application's database user is simply not given DELETE, TRUNCATE or DROP. The real project does
this in `grants.sql`.
</details>

<details><summary><b>Viva: why is the rule "dose 3 needs dose 2" a trigger and not a foreign key?</b></summary>

A foreign key says "this value must exist in that column of that table". This rule is about a
*different row of the same table*, with a computed value (`dose_no - 1`), and that cannot be
expressed as a foreign key. A trigger can run the `NOT EXISTS` query.
</details>

---

## Task 3 — A stored procedure (about 2 hours)

**Goal:** one call, `CALL ab_record_vaccination(account, uhid, vaccine)`, that checks the caller is
allowed, finds the patient by UHID, works out the next dose number itself, and records it.

### Why a procedure, when the triggers already check the data?

Triggers protect the **data**. A procedure defines the **operation**: who may do it, how the
inputs are looked up, what is computed. With a procedure the application never has to know the
`patient_id` or count doses. It sends the UHID and the vaccine name, and the database does the
rest.

### Write it

Create `server/practice/abir/03-procedure.sql`:

```sql
USE uhid;

DROP PROCEDURE IF EXISTS ab_record_vaccination;

DELIMITER $$

CREATE PROCEDURE ab_record_vaccination(
  IN p_account_id INT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_vaccine    VARCHAR(60)
)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_vaccine SMALLINT UNSIGNED;
  DECLARE v_dose    TINYINT UNSIGNED;
  DECLARE v_msg     VARCHAR(200);

  -- Guards from the real project (procedures.sql §2). Each either returns
  -- quietly or stops everything with an error.
  CALL require_permission(p_account_id, 'encounter.write');   -- doctors only
  CALL require_patient(p_uhid, v_patient);                     -- UHID → patient_id

  SELECT vaccine_id INTO v_vaccine FROM ab_vaccine WHERE name = p_vaccine;
  IF v_vaccine IS NULL THEN
    SET v_msg = CONCAT('Unknown vaccine "', p_vaccine, '".');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  -- Next dose = highest so far + 1. COALESCE turns "no doses yet" (NULL) into 0.
  SELECT COALESCE(MAX(dose_no), 0) + 1 INTO v_dose
    FROM ab_vaccination
   WHERE patient_id = v_patient AND vaccine_id = v_vaccine;

  -- The triggers from Task 2 still check this INSERT.
  INSERT INTO ab_vaccination (patient_id, vaccine_id, dose_no, given_at, given_by)
  VALUES (v_patient, v_vaccine, v_dose, NOW(), p_account_id);

  -- A SELECT at the end of a procedure becomes its result.
  SELECT p_uhid AS uhid, p_vaccine AS vaccine, v_dose AS dose_no;
END $$

DELIMITER ;
```

Two details:
- `SIGNAL … SET MESSAGE_TEXT = v_msg` uses a **variable**. You cannot put `CONCAT(...)`
  directly after `MESSAGE_TEXT =`, so the message is built first with `SET`.
- **Parameters start with `p_`, local variables with `v_`.** Otherwise a parameter called
  `vaccine_id` would be confused with the column `vaccine_id` in the queries.

Run it with `npm run db:run -- practice/abir/03-procedure.sql`, then in the mysql prompt:

```sql
-- As Dr. Anisur (account 6): Rahim's third Hepatitis B dose.
CALL ab_record_vaccination(6, 'BD-2019-04821-5', 'Hepatitis B');
-- +-----------------+-------------+---------+
-- | uhid            | vaccine     | dose_no |
-- | BD-2019-04821-5 | Hepatitis B |       3 |

-- Again: the trigger stops a 4th dose.
CALL ab_record_vaccination(6, 'BD-2019-04821-5', 'Hepatitis B');
-- ERROR 1644: That vaccine does not have that many doses.

-- As Rezaul the receptionist (account 1): no permission.
CALL ab_record_vaccination(1, 'BD-2019-04821-5', 'COVID-19');
-- ERROR 5403: Your role is not allowed to do this (it needs the encounter.write permission).

-- A UHID nobody holds:
CALL ab_record_vaccination(6, 'BD-2026-99999-5', 'COVID-19');
-- ERROR 5404: No patient holds UHID BD-2026-99999-5.

-- A vaccine not in the catalogue:
CALL ab_record_vaccination(6, 'BD-2019-04821-5', 'Polio');
-- ERROR 1644: Unknown vaccine "Polio".
```

Look at the error **numbers**: 1644, 5403, 5404. The real project's guard procedures set
`MYSQL_ERRNO` on purpose so a program can tell "not allowed" (5403) from "not found" (5404) from
"a rule said no" (1644) without reading the text. Open `database/procedures.sql` and read the
box at the top headed **"How errors come out"**, then read `require_permission` and
`require_patient` in §2.

**Compare with the real project:** `add_diagnosis()` and `order_lab()` in `procedures.sql` §8 have
exactly your shape: guards, catalogue lookup, SIGNAL if unknown, INSERT. Then read the header box
about **ATOMIC vs STEP procedures**. Yours is a *step* (no transaction of its own), and the header
explains why that matters.

<details><summary><b>Viva: why does the procedure look the patient up by UHID instead of taking a patient_id?</b></summary>

The UHID is what people actually have: it's printed on the card and typed at the desk. `patient_id`
is an internal number that should never leave the database. `require_patient` also follows
merges: if two records were merged, an old UHID still finds the surviving patient, and every
procedure gets that for free.
</details>

<details><summary><b>Viva: is <code>MAX(dose_no) + 1</code> safe if two doctors record a dose for the same patient at the same moment?</b></summary>

Not by itself. Both could read MAX = 1 and both try to insert dose 2. Here the UNIQUE key
`(patient_id, vaccine_id, dose_no)` saves us: the second insert fails with a duplicate error
instead of creating a wrong record. The real project's `register_patient()` shows the stronger
pattern for when a failure is not acceptable: lock a counter row with `SELECT … FOR UPDATE` inside
a transaction, so the second caller waits and then reads the updated value. Nobo's guide goes into
this in depth.
</details>

---

## Task 4 — Queries one step up (about 2 hours)

Create `server/practice/abir/04-queries.sql`. Add and run one query at a time.

```sql
USE uhid;

-- 1. HAVING — patients treated at more than one hospital
SELECT p.uhid, p.name, COUNT(DISTINCT e.hospital_id) AS hospitals
  FROM patient p
  JOIN encounter e ON e.patient_id = p.patient_id
 GROUP BY p.patient_id, p.uhid, p.name
HAVING COUNT(DISTINCT e.hospital_id) > 1
 ORDER BY hospitals DESC;
```

`WHERE` filters rows **before** grouping; `HAVING` filters groups **after**. You can't write
`WHERE COUNT(...) > 1` because the count does not exist yet at that point. You should see
Md. Rahim Uddin at 4 hospitals and Abdul Karim Mia at 2. This one query is the national-record
idea in miniature.

```sql
-- 2. NOT EXISTS — doctors with no booked appointment
SELECT d.name
  FROM doctor d
 WHERE NOT EXISTS (
         SELECT 1 FROM appointment a
          WHERE a.doctor_id = d.doctor_id AND a.status = 'booked')
 ORDER BY d.name;
```

A **correlated sub-query**: the inner query refers to `d` from the outer one, so it is checked
once per doctor. `SELECT 1` because we only care whether a row exists, not what is in it. You
should see seven doctors, from Dr. Ayesha Siddika to Dr. Shamsul Alam.

```sql
-- 3. Window function — each patient's most recent visit
SELECT uhid, name, last_visit, hospital
  FROM (
    SELECT p.uhid, p.name, DATE(e.started_at) AS last_visit, h.name AS hospital,
           ROW_NUMBER() OVER (PARTITION BY e.patient_id ORDER BY e.started_at DESC) AS rn
      FROM encounter e
      JOIN patient p  ON p.patient_id  = e.patient_id
      JOIN hospital h ON h.hospital_id = e.hospital_id
  ) ranked
 WHERE rn = 1
 ORDER BY last_visit DESC
 LIMIT 5;
```

`ROW_NUMBER() OVER (PARTITION BY patient ORDER BY date DESC)` numbers each patient's visits 1, 2,
3… starting from the newest, *without* squashing the rows the way `GROUP BY` would. Then
`WHERE rn = 1` keeps each patient's newest. Try running only the inner SELECT to see the
numbering. (The dates are relative to when you last ran `db:reset`, so yours will differ from a
friend's.)

```sql
-- 4. CTE — average fee per department against the national average
WITH dept_fee AS (
  SELECT dept.name AS department, AVG(dp.consultation_fee) AS avg_fee
    FROM doctor_posting dp
    JOIN department dept ON dept.department_id = dp.department_id
   WHERE dp.valid_to IS NULL
   GROUP BY dept.department_id, dept.name
)
SELECT department,
       ROUND(avg_fee) AS avg_fee,
       ROUND(avg_fee - (SELECT AVG(consultation_fee) FROM doctor_posting WHERE valid_to IS NULL)) AS vs_national
  FROM dept_fee
 ORDER BY avg_fee DESC;
```

A **CTE** (`WITH name AS (…)`) is a named sub-query you then use like a table. It makes long
queries readable from top to bottom. You should see Cardiology highest (about 1167, which is 374
above the national average) and Medicine and ENT below it.

**Compare with the real project:** `doctor_availability()` in `procedures.sql` §5 is one
statement built from four CTEs, two of them *recursive*. That is Nobo's track, but read it now and
you'll see how far CTEs go.

<details><summary><b>Viva: what is the difference between WHERE and HAVING?</b></summary>

`WHERE` filters individual rows before they are grouped; `HAVING` filters the groups after
`GROUP BY`, so it can use aggregates like `COUNT()` and `SUM()`.
</details>

<details><summary><b>Viva: what does a window function do that GROUP BY can't?</b></summary>

It computes across a set of related rows (the "window") but keeps every row in the output. GROUP
BY collapses each group into one row, so you lose the individual visits. ROW_NUMBER, RANK and
running totals all need the rows kept.
</details>

---

## Task 5 — Normalization on paper (about 1 hour)

No computer needed. Imagine a clinic kept vaccinations in one spreadsheet-like table:

```
vaccination_sheet
uhid            | patient_name    | patient_phone | vaccine     | doses_required | dose_no | given_at   | doctor
BD-2019-04821-5 | Md. Rahim Uddin | 01711-482031  | Hepatitis B | 3              | 1       | 2025-01-10 | Dr. Anisur Rahman
BD-2019-04821-5 | Md. Rahim Uddin | 01711-482031  | Hepatitis B | 3              | 2       | 2025-02-10 | Dr. Anisur Rahman
BD-2021-11904-5 | Fatema Begum    | 01819-330442  | Tetanus     | 5              | 1       | 2026-03-01 | Dr. Farzana Haque
```

Write down:

1. The candidate key of this table.
2. The functional dependencies (X → Y means "knowing X tells you Y").
3. Which normal form it fails first, and why.
4. The decomposition into tables in 3NF.
5. Three **anomalies**: something that goes wrong on update, on insert, and on delete because
   of the bad design.

<details><summary>Answers</summary>

1. **Key:** (`uhid`, `vaccine`, `dose_no`).
2. **Dependencies:**
   - `uhid → patient_name, patient_phone`
   - `vaccine → doses_required`
   - `(uhid, vaccine, dose_no) → given_at, doctor`
3. **Fails 2NF.** `patient_name` and `patient_phone` depend on `uhid` alone, and
   `doses_required` on `vaccine` alone. Those are parts of the key, so they are partial
   dependencies. (It is in 1NF: every cell holds one value.)
4. **Decomposition:**
   - `patient (uhid, patient_name, patient_phone)`: the real project's `patient`
   - `vaccine (vaccine, doses_required)`: your `ab_vaccine`
   - `vaccination (uhid, vaccine, dose_no, given_at, doctor)`: your `ab_vaccination`, where
     `doctor` becomes `given_by` → `user_account`
5. **Anomalies:**
   - **Update:** Rahim changes his phone number. It must be changed on every row; miss one and the
     table contradicts itself.
   - **Insert:** a new vaccine can't be added until somebody has received it, because there is no
     row to put `doses_required` on.
   - **Delete:** delete Fatema's only vaccination and you lose the fact that Tetanus needs 5 doses.
</details>

Then read `docs/normalization.md` §3, which does the same exercise with the project's own
`patient_allergy` table, and §6, which lists the places the real schema keeps a copy **on
purpose**, with what keeps each copy correct. Be ready to explain one of them, for example
`encounter.consultation_fee`.

---

## Task 6 — An API that calls your procedure (about 2.5 hours)

**Goal:** a Node server where
- `GET /patients?q=rahim` searches patients, and
- `POST /vaccinations` records a vaccination through your procedure and turns each kind of
  database refusal into the correct HTTP status.

The picture:

```
PowerShell / browser ──HTTP──▶ Express route ──CALL ab_record_vaccination(?,?,?)──▶ MySQL
                     ◀─JSON +  status code ◀── error number 5403 / 5404 / 1644 ◀───
```

HTTP status codes you need: **200** OK, **201** Created, **400** your request is missing
something, **403** you're not allowed, **404** not found, **409** conflict (a rule said no),
**500** the server itself broke.

### Write it

Create `server/practice/abir/app.js`:

```js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true
});

const app = express();
app.use(express.json());   // lets routes read a JSON body as req.body

// Turn a MySQL error into an HTTP status. The numbers on the left are
// MYSQL_ERRNO values: 1644 is what SIGNAL uses by default, and 5403/5404
// are the ones procedures.sql chose for "not allowed" and "not found".
function statusFor(err) {
  if (err.errno === 5403) return 403;
  if (err.errno === 5404) return 404;
  if (err.errno === 1644) return 409;
  if (err.errno === 1062) return 409;   // duplicate key
  return 500;
}

function sendError(res, err) {
  const status = statusFor(err);
  if (status === 500) console.error(err);   // real faults: log them, hide details
  res.status(status).json({ error: status === 500 ? 'Database error' : err.message });
}

// GET /patients?q=rahim
app.get('/patients', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const like = '%' + q + '%';      // % = "anything" in a LIKE pattern
    const [rows] = await pool.query(
      `SELECT uhid, name, dob, district
         FROM v_patient_directory
        WHERE name LIKE ? OR uhid LIKE ?
        ORDER BY name
        LIMIT 20`,
      [like, like]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /vaccinations   body: { "accountId": 6, "uhid": "BD-...", "vaccine": "COVID-19" }
app.post('/vaccinations', async (req, res) => {
  const { accountId, uhid, vaccine } = req.body;
  if (!accountId || !uhid || !vaccine) {
    return res.status(400).json({ error: 'accountId, uhid and vaccine are all required.' });
  }
  try {
    const [result] = await pool.query('CALL ab_record_vaccination(?, ?, ?)', [accountId, uhid, vaccine]);
    res.status(201).json(result[0][0]);
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(3002, () => console.log('Abir practice API: http://localhost:3002/patients?q=rahim'));
```

**Why `result[0][0]`?** A `CALL` can return several result sets (one per SELECT inside the
procedure) plus a status packet at the end. `result[0]` is the first result set, an array of rows,
and `[0]` again is its first row.

### Run and test it

Terminal 1:

```powershell
cd $HOME\Documents\hospital-management-system\server
node practice/abir/app.js
```

**Searching** (in the browser):

| URL | You should see |
|---|---|
| `http://localhost:3002/patients?q=rahim` | Two Md. Rahim Uddin records, `BD-2019-04821-5` and `BD-2018-00723-2`: the deliberate duplicate in the sample data |
| `http://localhost:3002/patients?q=' OR '1'='1` | `[]`: the injection attempt is just a strange name nobody has |

That second one matters. If the code had built the SQL with `+`, the query would have become
`… WHERE name LIKE '%' OR '1'='1%' …` and returned everyone. With `?` placeholders it is only
ever a value.

**Recording** (in a second PowerShell window). Each `try/catch` shows the error message when the
server refuses:

```powershell
# 201 — Dr. Anisur (account 6) gives Fatema her first COVID-19 dose
Invoke-RestMethod -Method Post -Uri http://localhost:3002/vaccinations -ContentType 'application/json' `
  -Body '{"accountId":6,"uhid":"BD-2021-11904-5","vaccine":"COVID-19"}'

# 403 — the receptionist may not
try { Invoke-RestMethod -Method Post -Uri http://localhost:3002/vaccinations -ContentType 'application/json' `
  -Body '{"accountId":1,"uhid":"BD-2021-11904-5","vaccine":"COVID-19"}' } catch { $_.ErrorDetails.Message }

# 404 — nobody holds this UHID
try { Invoke-RestMethod -Method Post -Uri http://localhost:3002/vaccinations -ContentType 'application/json' `
  -Body '{"accountId":6,"uhid":"BD-2026-99999-5","vaccine":"COVID-19"}' } catch { $_.ErrorDetails.Message }

# 409 — not in the catalogue
try { Invoke-RestMethod -Method Post -Uri http://localhost:3002/vaccinations -ContentType 'application/json' `
  -Body '{"accountId":6,"uhid":"BD-2021-11904-5","vaccine":"Polio"}' } catch { $_.ErrorDetails.Message }

# 400 — missing fields
try { Invoke-RestMethod -Method Post -Uri http://localhost:3002/vaccinations -ContentType 'application/json' `
  -Body '{"uhid":"BD-2021-11904-5"}' } catch { $_.ErrorDetails.Message }
```

(The backtick `` ` `` at the end of a line means "this command continues on the next line".)

You should see, in order:

```
uhid            vaccine  dose_no
----            -------  -------
BD-2021-11904-5 COVID-19       1
{"error":"Your role is not allowed to do this (it needs the encounter.write permission)."}
{"error":"No patient holds UHID BD-2026-99999-5."}
{"error":"Unknown vaccine \"Polio\"."}
{"error":"accountId, uhid and vaccine are all required."}
```

Run the first command two more times. The second gives dose 2; the third is refused by your
**trigger**, as a 409, with "That vaccine does not have that many doses." The rule lives in the
database, and the API just reports it.

### The flaw you should spot

The request **says** who is calling: `"accountId": 6`. Anyone could send `"accountId": 6` and act
as Dr. Anisur. In the real API the account comes from the **login session** instead. The server
remembers who signed in and the request can't change it. That is the core of Nobo's Task 6. Read it
once you're done here.

<details><summary><b>Viva: why turn database errors into different HTTP status codes instead of always 500?</b></summary>

So the program on the other end can react correctly without reading text: a 403 means don't offer
this button to this user, a 404 means check the UHID, a 409 means show the message and let them
fix it, and a 500 means something is broken that the user can't fix. 500 also hides the details,
because internal errors can reveal how the system works.
</details>

<details><summary><b>Viva: where is the rule "a receptionist may not record a vaccination" enforced, and why there?</b></summary>

In the database: `require_permission` checks `role_permission`, inside the procedure. Not in the
JavaScript. Even if the API had a bug, or someone called the procedure from the mysql prompt, the
rule would still hold. The API only translates the refusal into a 403.
</details>

---

## You're done. What next?

1. Push everything (Part 0.10).
2. Read `docs/use-cases.md`: UC2 (registration), UC9 (recording an encounter) and UC11–UC13 (beds).
   Each names the trigger or procedure behind it. Open those in `database/` and you'll recognise
   every pattern from Tasks 2 and 3.
3. Be able to explain, out loud and without notes, what you built in Task 6 and the flaw it has.
