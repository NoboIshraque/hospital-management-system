# Learning guide — Nobo

**Your track: the hard parts, the ones that carry the marks.** Transactions and locking,
concurrency, recursive CTEs, triggers that maintain derived state, access-controlled reads that
write an audit log, and the backend core: login with bcrypt, sessions, and a transaction that
spans several stored procedures from Node.

These are the parts behind design decisions **2, 3, 4 and 7**, which are also the parts the
viva will press hardest on. A student who can *demonstrate* two bookings racing for one slot and
explain why exactly one wins has answered the hardest question before it is asked.

**This is a practice version of the real work.** You will build each mechanism small, on your
own `nb_` tables, prove it works, and then read the full version in the real project. The real
files are long because they handle every case. Yours will be short because they show one idea
each.

**Time:** about 14–16 hours spread over the week, plus Part 0 (setup).

| Task | You learn | Real project file to compare with | Decision |
|---|---|---|---|
| 1 | Transactions, locks, isolation, deadlock, by hand | — | 4 |
| 2 | A transactional procedure, proven under a real race | `procedures.sql` §6 `book_appointment` | 4 |
| 3 | Recursive CTEs: computing availability instead of storing it | `procedures.sql` §5 `doctor_availability` | 3 |
| 4 | Triggers that maintain derived state | `triggers.sql` §6 (beds) | 7 |
| 5 | A read that decides its own authority and logs itself | `procedures.sql` §7 `get_patient_record` | 2 |
| 6 | Backend core: bcrypt login, sessions, multi-result procedures, transactions from Node | `server/` (the real API) | 2, 5 |

You will need **two PowerShell windows** for Tasks 1 and 2. Each task ends with viva questions.
Answer them out loud first.

**Part 0 on your laptop:** MySQL 8.4, Node and `server/.env` are already set up (31 Oct 2026),
so skip 0.1, 0.2, 0.4 and 0.5. Do 0.3 (give Abir and Noria access), check 0.6
(`npm run db:reset`) works, and do the PATH shortcut in 0.7.

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

If you have **XAMPP** installed, open the XAMPP control panel and make sure its MySQL is
**stopped**. It uses the same port (3306) and is a different database (MariaDB) that our files do
not work on.

### 0.3 Give the others access to the repository

The repository is yours. On GitHub, open
`https://github.com/NoboIshraque/hospital-management-system` → **Settings** → **Collaborators** →
**Add people**, and add Abir's and Noria's GitHub usernames. Each of them must accept the
invitation email before they can push. You can skip 0.4's `git clone`: your laptop already has
the project at `E:\hospital-management-system`, so run 0.4's last two commands from its `server`
folder.

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

Database rebuilt: 40 tables, 8 views, 21 triggers, 31 procedures/functions, 18 patients, 24 encounters.
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
mkdir practice\nobo
```

(Use your own name in lowercase: `nobo`, `abir` or `noria`.)

There are **two ways to run a `.sql` file**. Use whichever you like:

```powershell
# Way 1 — from the server folder, through Node:
npm run db:run -- practice/nobo/01-something.sql

# Way 2 — from inside the mysql prompt:
#   mysql> source practice/nobo/01-something.sql
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

Your Node files also go in `practice/nobo/`. **Always run them from the `server` folder**:

```powershell
cd $HOME\Documents\hospital-management-system\server
node practice/nobo/app.js
```

That matters because `require('dotenv').config()` reads `.env` from the folder you are *in*, and
`require('express')` finds Express in `server/node_modules`. Stop a running server with
**Ctrl+C**.

### 0.10 Saving your work to GitHub

Do this every time you finish a task:

```powershell
cd $HOME\Documents\hospital-management-system
git pull
git add server/practice/nobo
git commit -m "Nobo: task 3 practice"
git push
```

- `git pull` **first** brings down what the others pushed. Because each of you only touches your
  own `practice/` folder, there will be nothing to clash.
- `git add server/practice/nobo`, **not** `git add .`. Only your own folder.
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

## Task 1 — Transactions and locks, by hand (about 1.5 hours)

**Goal:** *see* the behaviour every later task depends on, before you write any code that relies
on it.

Open **two** PowerShell windows side by side. In each, run `mysql -u root -p uhid`. Call the
left one **A** and the right one **B**. Type exactly what each step says, in the window it
says, in order.

### 1a. A transaction is all-or-nothing

In **A**:

```sql
START TRANSACTION;
UPDATE hospital SET name = 'Renamed by mistake' WHERE hospital_id = 8;
SELECT name FROM hospital WHERE hospital_id = 8;      -- 'Renamed by mistake'
```

In **B**:

```sql
SELECT name FROM hospital WHERE hospital_id = 8;      -- still 'Rangpur Medical College Hospital'
```

B can't see A's change, because A has not committed. Back in **A**:

```sql
ROLLBACK;
SELECT name FROM hospital WHERE hospital_id = 8;      -- back to 'Rangpur Medical College Hospital'
```

`ROLLBACK` undid it as if it never happened. Had A typed `COMMIT`, B would see the new name from
then on. **Without `START TRANSACTION`, MySQL commits every statement on its own the moment it
runs** (this is called autocommit).

### 1b. A lock makes the other session wait

In **A**:

```sql
START TRANSACTION;
SELECT * FROM doctor WHERE doctor_id = 1 FOR UPDATE;
```

In **B**:

```sql
START TRANSACTION;
SELECT * FROM doctor WHERE doctor_id = 1 FOR UPDATE;
```

**B hangs. It does not return.** `FOR UPDATE` put an exclusive lock on doctor 1's row, and B is
queuing for it. Now in **A**:

```sql
COMMIT;
```

B immediately returns its row. Type `COMMIT;` in **B** too.

(If you wait about 50 seconds instead, B gives up with
`ERROR 1205: Lock wait timeout exceeded`. That is `innodb_lock_wait_timeout`.)

This is the whole mechanism behind decision 4. Two bookings for the same doctor both try to lock
that doctor's row, and the second one **waits** until the first is finished.

### 1c. The snapshot surprise (read this one twice)

In **A**:

```sql
START TRANSACTION;
SELECT COUNT(*) FROM hospital;                 -- 8
```

In **B** (no transaction, so it commits at once):

```sql
INSERT INTO hospital (name, district_id, tier_id) VALUES ('Snapshot Test', 1, 3);
```

In **A**:

```sql
SELECT COUNT(*) FROM hospital;                 -- STILL 8
SELECT COUNT(*) FROM hospital FOR SHARE;       -- 9
COMMIT;
SELECT COUNT(*) FROM hospital;                 -- 9
```

The same question, asked twice in a row inside one transaction, gave two different answers. The
reason:

- MySQL's default isolation level is **REPEATABLE READ**. Check it with
  `SELECT @@transaction_isolation;`. Inside a transaction, an ordinary `SELECT` reads a
  **snapshot** taken at the first ordinary read, so it keeps seeing the database as it was then,
  even after another session commits.
- A **locking read** (`FOR SHARE` or `FOR UPDATE`) does not use the snapshot. It reads the latest
  committed rows, and locks them.

**Why this matters:** a booking procedure that checks "is this slot already taken?" with an
ordinary `SELECT` might be looking at an old snapshot and miss a booking another session committed
a millisecond ago. That is why the real `book_appointment()` makes its check a **locking** read.
Find the comment in `procedures.sql` §6 that begins "Why the 'already taken' check is ALSO a
locking read" and read it now.

Clean up in either window: `DELETE FROM hospital WHERE name = 'Snapshot Test';`

### 1d. A deadlock

In **A**: `START TRANSACTION; SELECT * FROM doctor WHERE doctor_id = 1 FOR UPDATE;`

In **B**: `START TRANSACTION; SELECT * FROM doctor WHERE doctor_id = 2 FOR UPDATE;`

In **A**: `SELECT * FROM doctor WHERE doctor_id = 2 FOR UPDATE;` (A hangs, waiting for B)

In **B**: `SELECT * FROM doctor WHERE doctor_id = 1 FOR UPDATE;`

```
ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
```

A waits for B and B waits for A, so neither could ever finish. InnoDB detects the cycle at once,
kills one transaction (B) and rolls it back, which releases B's lock, so A's query returns. Type
`ROLLBACK;` in both.

The cure is to always take locks in the **same order**. `book_appointment()` only ever locks one
doctor row, so it cannot deadlock with itself.

<details><summary><b>Viva: what are the four ACID properties, with an example from this project for each?</b></summary>

- **Atomicity:** all or nothing. `admit_patient()` inserts an encounter, an admission and a bed
  occupancy; if the bed turns out to be taken, all three are rolled back.
- **Consistency:** a transaction moves the database from one valid state to another. Every
  constraint and trigger still holds after it commits.
- **Isolation:** concurrent transactions don't see each other's uncommitted work. B could not see
  A's rename in 1a.
- **Durability:** once `COMMIT` returns, the change survives a crash. InnoDB writes it to its redo
  log first.
</details>

<details><summary><b>Viva: what is the difference between FOR UPDATE and FOR SHARE?</b></summary>

`FOR UPDATE` takes an exclusive lock: nobody else can lock the row for update or share until you
commit. `FOR SHARE` takes a shared lock: others can also read-lock it, but nobody can change it.
Both are locking reads, so both see the latest committed data instead of the snapshot.
</details>

---

## Task 2 — A booking procedure, proven under a real race (about 3 hours)

**Goal:** a procedure that books a slot inside a transaction, and a Node script that fires
**two bookings for the same slot at the same instant**, so you can watch exactly one succeed. Then
remove the lock and watch the UNIQUE key catch what the procedure missed.

### The table and the procedure

Create `server/practice/nobo/01-booking.sql`:

```sql
USE uhid;

DROP PROCEDURE IF EXISTS nb_book;
DROP TABLE IF EXISTS nb_booking;

CREATE TABLE nb_booking (
  booking_id  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  doctor_id   SMALLINT UNSIGNED NOT NULL,
  patient_id  INT UNSIGNED      NOT NULL,
  slot_start  DATETIME          NOT NULL,
  booked_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (booking_id),
  UNIQUE KEY uq_nb_booking_slot (doctor_id, slot_start),     -- THE real guard
  KEY ix_nb_booking_patient (patient_id),
  CONSTRAINT fk_nb_booking_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctor (doctor_id),
  CONSTRAINT fk_nb_booking_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
) ENGINE = InnoDB;

DELIMITER $$

CREATE PROCEDURE nb_book(
  IN p_doctor_id SMALLINT UNSIGNED,
  IN p_uhid      VARCHAR(20),
  IN p_slot      DATETIME,
  IN p_pause     TINYINT UNSIGNED,   -- seconds to sleep mid-transaction, to make the race visible
  IN p_use_lock  BOOLEAN             -- TRUE = the correct version; FALSE = the naive one
)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_doctor  SMALLINT UNSIGNED;
  DECLARE v_taken   INT;

  -- Handlers: what to do if an error happens later in this procedure.
  -- The MOST SPECIFIC handler wins, so a duplicate key (1062) gets its own
  -- message, and anything else is rolled back and passed on unchanged.
  DECLARE EXIT HANDLER FOR 1062
  BEGIN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refused by the UNIQUE key: that slot was taken a moment ago.';
  END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_patient(p_uhid, v_patient);

  START TRANSACTION;

  IF p_use_lock THEN
    -- Serialise on the doctor: a second booking for this doctor waits HERE.
    SELECT doctor_id INTO v_doctor FROM doctor WHERE doctor_id = p_doctor_id FOR UPDATE;
    -- Locking read, so it sees a booking committed while we were waiting (Task 1c).
    SELECT COUNT(*) INTO v_taken FROM nb_booking
     WHERE doctor_id = p_doctor_id AND slot_start = p_slot
       FOR UPDATE;
  ELSE
    -- The naive version: no lock, ordinary read.
    SELECT COUNT(*) INTO v_taken FROM nb_booking
     WHERE doctor_id = p_doctor_id AND slot_start = p_slot;
  END IF;

  IF v_taken > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refused by the check: that slot is already booked.';
  END IF;

  DO SLEEP(p_pause);     -- pretend this step is slow, so the two calls overlap

  INSERT INTO nb_booking (doctor_id, patient_id, slot_start)
  VALUES (p_doctor_id, v_patient, p_slot);

  COMMIT;

  SELECT LAST_INSERT_ID() AS booking_id;
END $$

DELIMITER ;
```

Run it: `npm run db:run -- practice/nobo/01-booking.sql` → `01-booking.sql: 5 statements OK`.

**The handler pattern is the part to master.** `DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
ROLLBACK; RESIGNAL; END;` means: if *anything* fails after `START TRANSACTION` (a SIGNAL, a
foreign key, a duplicate), undo the whole transaction, then re-raise the same error to the caller.
Without the `ROLLBACK`, a failed procedure could leave a transaction open, holding its locks. Every
ATOMIC procedure in the real project starts with this.

### The race

Create `server/practice/nobo/race.js`:

```js
require('dotenv').config();
const mysql = require('mysql2/promise');

const useLock = process.argv[2] !== 'nolock';
const SLOT = '2026-12-01 09:00:00';

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true
};

async function attempt(conn, who, uhid, t0) {
  try {
    await conn.query('CALL nb_book(1, ?, ?, 2, ?)', [uhid, SLOT, useLock]);
    console.log(`${who}: BOOKED   after ${Date.now() - t0} ms`);
  } catch (err) {
    console.log(`${who}: REFUSED  after ${Date.now() - t0} ms — ${err.message}`);
  }
}

(async () => {
  // Two SEPARATE connections = two separate MySQL sessions, like two
  // receptionists at two computers.
  const a = await mysql.createConnection(config);
  const b = await mysql.createConnection(config);
  await a.query('DELETE FROM nb_booking');

  console.log(useLock ? 'With FOR UPDATE:' : 'Without FOR UPDATE:');
  const t0 = Date.now();
  // Promise.all starts both calls without waiting for the first to finish.
  await Promise.all([
    attempt(a, 'Patient A', 'BD-2019-04821-5', t0),
    attempt(b, 'Patient B', 'BD-2021-11904-5', t0)
  ]);

  const [rows] = await a.query('SELECT booking_id, patient_id, slot_start FROM nb_booking');
  console.table(rows);
  await a.end();
  await b.end();
})();
```

Run it, from the `server` folder:

```powershell
node practice/nobo/race.js
```

You should see something like:

```
With FOR UPDATE:
Patient A: BOOKED   after 2028 ms
Patient B: REFUSED  after 2029 ms — Refused by the check: that slot is already booked.
┌─────────┬────────────┬────────────┬───────────────────────┐
│ (index) │ booking_id │ patient_id │ slot_start            │
├─────────┼────────────┼────────────┼───────────────────────┤
│ 0       │ 1          │ 1          │ '2026-12-01 09:00:00' │
└─────────┴────────────┴────────────┴───────────────────────┘
```

(A and B may swap: whichever reaches the lock first wins.) Read the timing. B was refused at
**~2 seconds**, not immediately. It spent those two seconds waiting at the `FOR UPDATE` while A
slept, then ran its check, saw A's committed booking, and got the polite message. Exactly one row
exists.

Now the naive version:

```powershell
node practice/nobo/race.js nolock
```

```
Without FOR UPDATE:
Patient A: BOOKED   after 2033 ms
Patient B: REFUSED  after 2034 ms — Refused by the UNIQUE key: that slot was taken a moment ago.
```

This time **both** checks passed: both ran before either had inserted, so both saw an empty slot.
Both went on to insert, and the **UNIQUE key** stopped the second, which the 1062 handler turned
into a message. Still exactly one row.

### What this proves, and what to say in the viva

1. **The UNIQUE key is the real guarantee.** Even the broken version could not create a double
   booking. The database refused it.
2. **The lock is what makes the outcome *correct and polite*.** With it, the loser waits and is
   told the slot is gone. Without it, the loser's check is wrong, and only the constraint saves the
   day. In the real system that would also mean the loser's other work in the transaction ran
   for nothing.
3. **Both layers exist on purpose.** Constraint for correctness, lock for behaviour.

**Compare with the real project:** read `book_appointment()` in `procedures.sql` §6 from top to
bottom. Everything you just built is there, plus:
- it locks the **doctor**, not the posting: a doctor with two hospitals has one diary;
- it checks the slot is really in the doctor's schedule and not in their leave;
- it checks for **overlapping** slots, not just equal start times;
- its UNIQUE key is on `active_slot`, a **generated column** that is NULL for cancelled bookings,
  so a cancelled slot becomes bookable again. Read the comment on `uq_doctor_slot` in
  `schema.sql` to see why.

<details><summary><b>Viva: if the UNIQUE key already prevents double booking, why have FOR UPDATE at all?</b></summary>

The UNIQUE key guarantees the data is never wrong; the lock makes the procedure *behave*
correctly. Without the lock, two transactions both pass the availability check on stale
information, and the loser fails with a duplicate-key error halfway through. With the lock, the
second transaction waits, re-checks against the committed data, and is refused cleanly before
doing any work. Correctness from the constraint, a clean outcome from the lock.
</details>

<details><summary><b>Viva: why is the "already taken" check written with FOR UPDATE too, when the doctor row is already locked?</b></summary>

Because of the REPEATABLE READ snapshot (Task 1c). An ordinary SELECT inside the transaction could
read an old snapshot and miss the booking the other session just committed. A locking read always
reads the latest committed rows.
</details>

<details><summary><b>Viva: what does RESIGNAL do?</b></summary>

Inside a handler, it re-raises the error that triggered the handler, with the same error number and
message. So the handler can clean up (ROLLBACK) without hiding what went wrong from the caller.
</details>

---

## Task 3 — Recursive CTEs: availability as a query (about 2.5 hours)

**Goal:** decision 3, "availability is computed, never stored". Generate a doctor's slots for
the next week from their weekly schedule, then subtract leave and bookings, in one query.

### How a recursive CTE works

```sql
WITH RECURSIVE n AS (
  SELECT 1 AS i                       -- the ANCHOR: the starting row(s)
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5     -- the RECURSIVE part: built from the previous rows
)
SELECT i FROM n;                      -- 1, 2, 3, 4, 5
```

MySQL runs the anchor once, giving `1`. Then it runs the recursive part on the rows it just
produced (1 → 2), then on those (2 → 3), and so on, until the recursive part produces nothing
(`i < 5` fails at 5). All the rows together form `n`.

Create `server/practice/nobo/02-cte.sql` and build it up in three steps, running the file after
each.

```sql
USE uhid;

-- 1. Counting to 5
WITH RECURSIVE n AS (
  SELECT 1 AS i
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5
)
SELECT i FROM n;

-- 2. The next 7 days. Same shape, stepping a date instead of a number.
WITH RECURSIVE days AS (
  SELECT CURDATE() AS d
  UNION ALL
  SELECT d + INTERVAL 1 DAY FROM days WHERE d < CURDATE() + INTERVAL 6 DAY
)
SELECT d, DAYNAME(d) AS day_name, DAYOFWEEK(d) - 1 AS weekday FROM days;
```

`doctor_schedule.weekday` uses 0 = Sunday, but MySQL's `DAYOFWEEK()` returns 1 = Sunday, hence
the `- 1`. Check that today's row shows the right day name.

Now the real thing. Each CTE in the chain uses the one before it:

```sql
-- 3. Every slot of posting 1 (Dr. Anisur at Dhaka Medical) in the next 7 days,
--    minus his leave, with booked ones marked
WITH RECURSIVE
days AS (                                   -- one row per date
  SELECT CURDATE() AS d
  UNION ALL
  SELECT d + INTERVAL 1 DAY FROM days WHERE d < CURDATE() + INTERVAL 6 DAY
),
sessions AS (                               -- the clinics that fall on those dates
  SELECT days.d, s.start_time, s.end_time, s.slot_minutes
    FROM days
    JOIN doctor_schedule s ON s.posting_id = 1
                          AND s.weekday = DAYOFWEEK(days.d) - 1
),
slots AS (                                  -- each clinic cut into slots (recursive!)
  SELECT d, slot_minutes,
         TIMESTAMP(d, end_time)   AS session_end,
         TIMESTAMP(d, start_time) AS slot_start
    FROM sessions
  UNION ALL
  SELECT d, slot_minutes, session_end, slot_start + INTERVAL slot_minutes MINUTE
    FROM slots
   WHERE slot_start + INTERVAL (2 * slot_minutes) MINUTE <= session_end
)
SELECT slot_start,
       EXISTS (SELECT 1 FROM appointment a
                WHERE a.doctor_id = 1 AND a.status <> 'cancelled'
                  AND a.slot_start = slots.slot_start) AS taken
  FROM slots
 WHERE NOT EXISTS (SELECT 1 FROM doctor_leave l
                    WHERE l.doctor_id = 1
                      AND l.from_at < slots.slot_start + INTERVAL slots.slot_minutes MINUTE
                      AND l.to_at   > slots.slot_start)
 ORDER BY slot_start;
```

Dr. Anisur works Sunday, Tuesday and Thursday, 09:00–12:00, in 20-minute slots, so you should see
nine slots on each of those days (09:00, 09:20 … 11:40), with `taken = 1` on the ones the seed
data booked, for example next Sunday at 09:00 (Rahim's referral appointment).

Two details worth understanding:
- **The stopping condition is `2 * slot_minutes`.** The recursive step creates the *next* slot
  from the current one, and that next slot must also *end* by the session end. The current slot
  plus one more slot makes two slot-lengths.
- **The overlap test** `l.from_at < slot_end AND l.to_at > slot_start` is the standard test for
  "do two time ranges overlap". Draw it on paper with two bars to convince yourself.

**Try this:** change `posting_id = 1` and `doctor_id = 1` to posting `7` and doctor `7` (Dr.
Mizanur Rahman). The seed data puts him on leave from Tuesday to Thursday of next week, so his
Tuesday and Thursday clinics in that week should vanish. (If your 7-day window doesn't reach that
week, change both `6 DAY`s to `13 DAY` to look 14 days ahead.) No slot row was deleted, because no
slot row ever existed.

**Compare with the real project:** `doctor_availability()` in `procedures.sql` §5 is this same
query, made general: any posting or all postings, a date range, schedule and posting validity
dates, overlapping bookings across a doctor's *other* hospitals, and past slots removed. Then read
the comment at the top of the scheduling section in `schema.sql` that begins "There is
deliberately no `slot` table". That paragraph is your answer to "why didn't you store slots?".

<details><summary><b>Viva: why compute availability instead of storing a slot table?</b></summary>

A slot table would need about 10 doctors × 30 slots × 90 days ≈ 27,000 rows, almost all empty,
generated in advance by a scheduled job, and wrong the moment a schedule or leave changes. Computed
availability is always exactly consistent with the schedule, leave and bookings, because it is
derived from them each time it is read. Only bookings are stored, because only bookings are facts.
</details>

<details><summary><b>Viva: what stops a recursive CTE from running forever?</b></summary>

The WHERE in the recursive part eventually returns no rows, which ends the recursion. As a safety
net, MySQL stops at `cte_max_recursion_depth` (1000 by default) with an error.
</details>

---

## Task 4 — Triggers that maintain derived state (about 2 hours)

**Goal:** decision 7, "bed state changes via trigger, not in app code". Build a miniature
version: rooms with a status, and stays in rooms, where nobody ever sets a room's status by hand.
The triggers do it.

### The idea

A room's status (`free` / `occupied` / `cleaning`) is **derived**: you could always work it out
from whether there is an open stay in it. We store it anyway, because the bed board reads it
constantly. The danger of a stored derived value is that it drifts out of step with what it is
derived from. The cure is to let **only triggers** change it, whenever the thing it derives
from changes.

Create `server/practice/nobo/03-rooms.sql`:

```sql
USE uhid;

DROP TABLE IF EXISTS nb_stay;
DROP TABLE IF EXISTS nb_room;

CREATE TABLE nb_room (
  room_no  VARCHAR(10) NOT NULL,
  status   ENUM('free','occupied','cleaning') NOT NULL DEFAULT 'free',
  PRIMARY KEY (room_no)
) ENGINE = InnoDB;

CREATE TABLE nb_stay (
  stay_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_no     VARCHAR(10)  NOT NULL,
  patient_id  INT UNSIGNED NOT NULL,
  from_at     DATETIME     NOT NULL,
  to_at       DATETIME     NULL,              -- NULL = still in the room
  PRIMARY KEY (stay_id),
  KEY ix_nb_stay_room (room_no),
  KEY ix_nb_stay_patient (patient_id, to_at),
  CONSTRAINT fk_nb_stay_room    FOREIGN KEY (room_no)    REFERENCES nb_room (room_no),
  CONSTRAINT fk_nb_stay_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
  CONSTRAINT ck_nb_stay_dates   CHECK (to_at IS NULL OR to_at > from_at)
) ENGINE = InnoDB;

INSERT INTO nb_room (room_no) VALUES ('R-1'), ('R-2');

DELIMITER $$

-- BEFORE INSERT: refuse an impossible stay.
CREATE TRIGGER trg_nb_stay_bi BEFORE INSERT ON nb_stay
FOR EACH ROW
BEGIN
  IF NEW.to_at IS NULL THEN
    IF (SELECT status FROM nb_room WHERE room_no = NEW.room_no) <> 'free' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That room is not free.';
    END IF;
    IF EXISTS (SELECT 1 FROM nb_stay WHERE patient_id = NEW.patient_id AND to_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That patient is already in a room.';
    END IF;
  END IF;
END $$

-- AFTER INSERT: a stay opened, so the room is occupied.
CREATE TRIGGER trg_nb_stay_ai AFTER INSERT ON nb_stay
FOR EACH ROW
BEGIN
  IF NEW.to_at IS NULL THEN
    UPDATE nb_room SET status = 'occupied' WHERE room_no = NEW.room_no;
  END IF;
END $$

-- AFTER UPDATE: a stay closed, so the room needs cleaning.
CREATE TRIGGER trg_nb_stay_au AFTER UPDATE ON nb_stay
FOR EACH ROW
BEGIN
  IF OLD.to_at IS NULL AND NEW.to_at IS NOT NULL THEN
    UPDATE nb_room SET status = 'cleaning' WHERE room_no = NEW.room_no;
  END IF;
END $$

DELIMITER ;
```

Why the checks are in a **BEFORE** trigger but the status change is in an **AFTER** trigger: a
BEFORE trigger runs before the row exists, so it is the place to refuse. An AFTER trigger runs once
the row is safely written, so it is the place for consequences in *other* tables.

Run it (`npm run db:run -- practice/nobo/03-rooms.sql`), then test in the mysql prompt:

```sql
INSERT INTO nb_stay (room_no, patient_id, from_at) VALUES ('R-1', 1, NOW());
SELECT * FROM nb_room;
-- R-1 occupied, R-2 free — and you never wrote to nb_room

INSERT INTO nb_stay (room_no, patient_id, from_at) VALUES ('R-1', 2, NOW());
-- ERROR 1644: That room is not free.

INSERT INTO nb_stay (room_no, patient_id, from_at) VALUES ('R-2', 1, NOW());
-- ERROR 1644: That patient is already in a room.

UPDATE nb_stay SET to_at = NOW() + INTERVAL 1 SECOND WHERE room_no = 'R-1' AND to_at IS NULL;
SELECT * FROM nb_room;
-- R-1 cleaning
```

(`+ INTERVAL 1 SECOND` because the CHECK requires `to_at > from_at`, and the stay opened within
the same second.)

**Compare with the real project:** `triggers.sql` §6 is the full version: `bed_occupancy` instead
of `nb_stay`, and three more checks (the bed is in service, in the same hospital as the admission,
and in a ward the patient's sex and age allow). Note especially `trg_bed_bu`. It refuses any
change to `bed.status_id` that did not come from these triggers, using a session variable the
triggers set. Read its comment to see how it works and what it honestly can't stop. Then read
`admit_patient()` and `discharge_patient()` in `procedures.sql` §9 and notice they **never touch
the `bed` table**.

<details><summary><b>Viva: bed status is redundant: it can be derived. Isn't storing it a normalization violation?</b></summary>

Yes, deliberately. It is a derived attribute stored for read speed, because the bed board reads
every bed's status on every render, and deriving it would join the whole occupancy history each
time. A stored copy is only dangerous if it can drift, and here it can't: only the triggers on
`bed_occupancy` write it, `trg_bed_bu` refuses any other change, and the application's database
user has no UPDATE right on `bed`. `docs/normalization.md` §6 lists this and every other
deliberate redundancy.
</details>

<details><summary><b>Viva: why not just update the bed status in the procedure that admits the patient?</b></summary>

Because then every code path that changes occupancy (admit, transfer, discharge, a future script,
a manual fix) must remember to update the status too, and one that forgets leaves the board
wrong. A trigger fires on *every* change to `bed_occupancy`, whoever makes it, so the status
cannot be forgotten.
</details>

---

## Task 5 — A read that decides its own authority and logs itself (about 2 hours)

**Goal:** decision 2, "access is granted, not assumed". MySQL has **no SELECT trigger**, so "log
every read with a trigger" is impossible. The solution: the read *is* a procedure. It works out
whether the caller has a reason to see the record, writes the access log, and only then returns the
data.

Create `server/practice/nobo/04-read.sql`:

```sql
USE uhid;

DROP PROCEDURE IF EXISTS nb_read_record;

DELIMITER $$

CREATE PROCEDURE nb_read_record(IN p_account_id INT UNSIGNED, IN p_uhid VARCHAR(20))
BEGIN
  DECLARE v_patient  INT UNSIGNED;
  DECLARE v_hospital SMALLINT UNSIGNED;
  DECLARE v_basis    VARCHAR(20);

  CALL require_patient(p_uhid, v_patient);
  SELECT hospital_id INTO v_hospital FROM user_account WHERE account_id = p_account_id;

  -- What authority does this reader have?
  IF EXISTS (SELECT 1 FROM encounter
              WHERE patient_id = v_patient AND hospital_id = v_hospital AND ended_at IS NULL) THEN
    SET v_basis = 'treating';              -- my hospital is treating them right now
  ELSEIF EXISTS (SELECT 1 FROM consent_grant
                  WHERE patient_id = v_patient AND to_hospital_id = v_hospital
                    AND revoked_at IS NULL AND NOW() BETWEEN granted_at AND expires_at) THEN
    SET v_basis = 'consent';               -- the patient said my hospital may look
  ELSE
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No access basis for this record.', MYSQL_ERRNO = 5423;
  END IF;

  -- Log FIRST. If this INSERT fails, the procedure stops and no data is returned.
  INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis)
  VALUES (v_patient, p_account_id, v_hospital, 'record.read', v_basis);

  -- Then return the data, as two result sets.
  SELECT uhid, name, dob, v_basis AS basis FROM patient WHERE patient_id = v_patient;

  SELECT DATE(e.started_at) AS date, h.name AS hospital, dg.term AS diagnosis
    FROM encounter e
    JOIN hospital h ON h.hospital_id = e.hospital_id
    LEFT JOIN encounter_diagnosis ed ON ed.encounter_id = e.encounter_id AND ed.is_primary
    LEFT JOIN diagnosis dg ON dg.diagnosis_id = ed.diagnosis_id
   WHERE e.patient_id = v_patient
   ORDER BY e.started_at DESC;
END $$

DELIMITER ;
```

Run it, then in the mysql prompt (account 6 is Dr. Anisur at Dhaka Medical):

```sql
SELECT COUNT(*) FROM access_log;                      -- note the number
CALL nb_read_record(6, 'BD-2019-04821-5');            -- Rahim: basis 'consent', then his visits
CALL nb_read_record(6, 'BD-2021-11904-5');            -- Fatema:
-- ERROR 5423: No access basis for this record.
SELECT COUNT(*) FROM access_log;                      -- exactly one more than before
```

Why does Anisur have consent for Rahim? This morning (relative to when you last ran `db:reset`),
Square Hospital **referred** Rahim to Dhaka Medical, and `refer_patient()` wrote a 24-hour consent
grant along with the referral. Look at it:

```sql
SELECT * FROM consent_grant WHERE patient_id = 1;
```

The grant from the referral expires 24 hours after it was given. If you run `db:reset` today and
try again in two days, Anisur's read of Rahim will be refused too. That expiry is decision 5 in
`docs/er-design.md` §8.

Now try to cover your tracks:

```sql
DELETE FROM access_log ORDER BY log_id DESC LIMIT 1;
-- ERROR 1644: The access log is append-only.
```

**Compare with the real project:** `get_patient_record()` in `procedures.sql` §7 is the full
version. Read its long header comment first. It adds the patient's own record, reception's
demographics-only view, **break-glass** (read anyway in an emergency, with a written reason,
flagged for review), and eight result sets shaped exactly as the record screen needs them. Then
read the access-log triggers in `triggers.sql` §9.

<details><summary><b>Viva: MySQL has no SELECT trigger. So how is every read of a record logged?</b></summary>

Clinical reads go through a stored procedure that writes the access-log row and then returns the
data. The application's database user is granted EXECUTE on that procedure but no SELECT on the
clinical tables, so there is no way to read a record without passing through the procedure and
leaving a log row behind. "A trigger logs every read" would be a wrong answer.
</details>

<details><summary><b>Viva: what is break-glass, and why is it acceptable?</b></summary>

Emergency access when no consent or treating relationship exists, for example an unconscious
patient. It is allowed because refusing could cost a life. It is acceptable because it is never
silent: it requires a written justification (a CHECK enforces that), is flagged
`is_break_glass`, and lands unreviewed in `v_break_glass_queue` until an admin reviews it. A log
that records *under what authority* each read happened is what tells legitimate care apart from
snooping.
</details>

---

## Task 6 — The backend core (about 4 hours)

**Goal:** a Node server with the parts every other route depends on:

1. **Login** with a bcrypt password check, and a **session** so the server remembers who you are.
2. A **guard** that refuses requests from people who haven't signed in.
3. A route that calls a procedure returning **several result sets** and maps its error numbers to
   HTTP status codes, including **423** for "break-glass is possible".
4. A route that runs **several procedures inside one transaction** from Node, and rolls all of them
   back if any one fails.

### The concepts, before the code

**bcrypt.** Passwords are never stored. `user_account.password_hash` holds a bcrypt hash: a
one-way scramble with a random salt baked in. At login, `bcrypt.compare(typedPassword, hash)`
re-scrambles what was typed and checks it matches. The database never sees the typed password,
and a stolen database does not reveal anyone's password.

**Sessions.** HTTP has no memory: each request arrives on its own. After a successful login, the
`express-session` library stores `{ id, role, … }` on the server and gives the browser a cookie
holding only a random session id. Every later request sends that cookie back, and the library
looks up who it belongs to and puts it in `req.session`. The user can't edit `req.session`, which
is what fixes the flaw at the end of Abir's guide (the account id sent in the request body).

**Middleware.** A function that runs *before* a route, and either calls `next()` to continue or
answers the request itself. `requireLogin` is one.

**Connections vs the pool, for transactions.** `pool.query()` may use a *different* connection
for each call. A transaction belongs to one connection. So for a transaction you borrow **one**
connection (`pool.getConnection()`), run everything on it, then commit or roll back, and always
give it back (`release()`), even when something fails, or the pool runs dry.

### Write it

Create `server/practice/nobo/app.js`:

```js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
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
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,   // signs the cookie so it can't be forged
  resave: false,
  saveUninitialized: false,             // no cookie until someone actually signs in
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }   // JS can't read it; 8 hours
}));

// MYSQL_ERRNO → HTTP status. 5423 is get_patient_record's "no basis; break-glass possible".
const STATUS = { 5403: 403, 5404: 404, 5423: 423, 1644: 409, 1062: 409 };

function sendError(res, err) {
  const status = STATUS[err.errno] || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: status === 500 ? 'Database error' : err.message,
    breakGlassAvailable: err.errno === 5423
  });
}

function requireLogin(req, res, next) {
  if (!req.session.account) return res.status(401).json({ error: 'Sign in first.' });
  next();
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [result] = await pool.query('CALL get_login(?)', [username || '']);
    const account = result[0][0];                        // undefined if no such user
    const ok = account && await bcrypt.compare(password || '', account.password_hash);
    // One message for "no such user" and "wrong password", so the form can't be
    // used to find out which usernames exist.
    if (!ok) return res.status(401).json({ error: 'No account matches those details.' });

    await pool.query('CALL record_login(?)', [account.account_id]);
    req.session.account = {
      id: account.account_id,
      role: account.role,
      name: account.name,
      hospitalId: account.hospital_id
    };
    res.json(req.session.account);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/me', requireLogin, (req, res) => res.json(req.session.account));

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ signedOut: true }));
});

// GET /patients/BD-2019-04821-5
// GET /patients/BD-2021-11904-5?breakGlass=1&reason=Unconscious%20in%20emergency
app.get('/patients/:uhid', requireLogin, async (req, res) => {
  const breakGlass = req.query.breakGlass === '1';
  try {
    // The account comes from the SESSION, never from the request.
    const [sets] = await pool.query('CALL get_patient_record(?, ?, ?, ?, ?)', [
      req.session.account.id, req.params.uhid, breakGlass, req.query.reason || null, req.ip
    ]);
    // One entry in `sets` per SELECT in the procedure (plus a status packet at the end).
    res.json({
      patient:    sets[0][0],
      allergies:  sets[1],
      encounters: sets[2],
      accessLog:  sets[7]
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /encounters  body: { uhid, complaint, icd10, medicineId, dose, frequency, days }
// Four STEP procedures, one transaction: the whole visit is saved, or none of it.
app.post('/encounters', requireLogin, async (req, res) => {
  const me = req.session.account.id;
  const { uhid, complaint, icd10, medicineId, dose, frequency, days } = req.body;

  const conn = await pool.getConnection();        // ONE connection for the whole transaction
  try {
    await conn.beginTransaction();

    const [opened] = await conn.query('CALL start_encounter(?, ?, ?, ?, ?)',
      [me, uhid, 'OPD', complaint, null]);
    const encounterId = opened[0][0].encounter_id;

    await conn.query('CALL add_diagnosis(?, ?, ?, TRUE, ?, NULL)',
      [me, encounterId, icd10, 'confirmed']);

    if (medicineId) {
      await conn.query('CALL prescribe(?, ?, ?, ?, ?, ?, NULL)',
        [me, encounterId, medicineId, dose, frequency, days]);
    }

    await conn.query('CALL end_encounter(?, ?)', [me, encounterId]);

    await conn.commit();
    res.status(201).json({ encounterId });
  } catch (err) {
    await conn.rollback();                        // undo start_encounter too
    sendError(res, err);
  } finally {
    conn.release();                               // ALWAYS give the connection back
  }
});

app.listen(3001, () => console.log('Nobo practice API: http://localhost:3001'));
```

### Run and test it

Terminal 1 (from `server`): `node practice/nobo/app.js`

Terminal 2: PowerShell keeps the session cookie in a variable. `-SessionVariable s` creates it at
login, and `-WebSession $s` sends it on every later request:

```powershell
# Not signed in yet → 401
try { Invoke-RestMethod -Uri http://localhost:3001/me } catch { $_.ErrorDetails.Message }

# Wrong password → 401, same message as an unknown user
try { Invoke-RestMethod -Method Post -Uri http://localhost:3001/login -ContentType 'application/json' `
  -Body '{"username":"anisur","password":"wrong"}' } catch { $_.ErrorDetails.Message }

# Sign in as Dr. Anisur Rahman
Invoke-RestMethod -Method Post -Uri http://localhost:3001/login -ContentType 'application/json' `
  -Body '{"username":"anisur","password":"demo1234"}' -SessionVariable s

Invoke-RestMethod -Uri http://localhost:3001/me -WebSession $s

# Rahim: allowed, under consent from this morning's referral
$rec = Invoke-RestMethod -Uri http://localhost:3001/patients/BD-2019-04821-5 -WebSession $s
"$($rec.patient.name), basis $($rec.patient.basis), $($rec.encounters.Count) encounters"

# Fatema: refused with 423 — break-glass is possible
try { Invoke-RestMethod -Uri http://localhost:3001/patients/BD-2021-11904-5 -WebSession $s } catch { $_.ErrorDetails.Message }

# Fatema with break-glass and a reason: allowed, and flagged
$bg = Invoke-RestMethod -Uri 'http://localhost:3001/patients/BD-2021-11904-5?breakGlass=1&reason=Unconscious%20in%20emergency' -WebSession $s
$bg.accessLog[0]
```

You should see, in order: `{"error":"Sign in first."}`, `{"error":"No account matches those
details."}`, Anisur's `id/role/name/hospitalId`, the same again from `/me`,
`Md. Rahim Uddin, basis consent, 5 encounters`, the 423 message with
`"breakGlassAvailable":true`, and finally the newest access-log entry: Dr. Anisur Rahman,
`Break-glass — emergency`, kind `crit`.

Now the transaction. Rahim has a **Severe Penicillin allergy**, and medicine 15 is Amoxicillin,
a penicillin:

```powershell
# Count Rahim's encounters first
(Invoke-RestMethod -Uri http://localhost:3001/patients/BD-2019-04821-5 -WebSession $s).encounters.Count

# Prescribe Amoxicillin → the allergy trigger refuses, and the WHOLE encounter is rolled back
try { Invoke-RestMethod -Method Post -Uri http://localhost:3001/encounters -ContentType 'application/json' -WebSession $s `
  -Body '{"uhid":"BD-2019-04821-5","complaint":"Sore throat","icd10":"J18.9","medicineId":15,"dose":"1 capsule","frequency":"three times daily","days":7}' } catch { $_.ErrorDetails.Message }

# Same count as before: start_encounter's row was rolled back
(Invoke-RestMethod -Uri http://localhost:3001/patients/BD-2019-04821-5 -WebSession $s).encounters.Count

# Paracetamol (medicine 4) instead → 201, and the count goes up by one
Invoke-RestMethod -Method Post -Uri http://localhost:3001/encounters -ContentType 'application/json' -WebSession $s `
  -Body '{"uhid":"BD-2019-04821-5","complaint":"Fever","icd10":"J18.9","medicineId":4,"dose":"1 tablet","frequency":"as required","days":5}'

(Invoke-RestMethod -Uri http://localhost:3001/patients/BD-2019-04821-5 -WebSession $s).encounters.Count

# Sign out → the session is gone
Invoke-RestMethod -Method Post -Uri http://localhost:3001/logout -WebSession $s
try { Invoke-RestMethod -Uri http://localhost:3001/me -WebSession $s } catch { $_.ErrorDetails.Message }
```

The counts go **5 → 5 → 6**. The refused visit left no trace, even though `start_encounter`
had already inserted the encounter row before `prescribe` failed. That's atomicity, controlled from
Node. The message reads: *"Allergy conflict: this patient has a recorded allergy to Penicillin,
and Amoxicillin belongs to the same class."*

**Experiment, to feel why `finally { conn.release() }` matters:** delete the line
`conn.release();`, restart the server, sign in again, and send the Amoxicillin request eleven
times. The first ten each answer 409. The **eleventh never answers**. Each failed request kept its
borrowed connection, and the pool holds only ten (mysql2's default `connectionLimit`), so request
eleven waits forever for a connection that will never come back. One forgotten line takes the
whole server down after ten errors. Put the line back. (Press Ctrl+C in the PowerShell window to
give up on the hung request.)

**Compare with the real project:** the real API in `server/` splits this file into
`db/pool.js` (the pool), `db/errors.js` (the errno → status map), a session/auth module, and one
file per resource in `routes/`. The same ideas, organised so they scale to every screen.

<details><summary><b>Viva: why is the password checked in Node and not in SQL?</b></summary>

bcrypt isn't a MySQL function, and it shouldn't be: sending the typed password into SQL would put
it in query logs. The database hands over only the hash (`get_login`), Node runs
`bcrypt.compare`, and the plaintext never leaves the server's memory.
</details>

<details><summary><b>Viva: why are start_encounter, add_diagnosis and prescribe written WITHOUT their own START TRANSACTION?</b></summary>

MySQL has no nested transactions: a `START TRANSACTION` inside a procedure silently **commits**
whatever transaction is already open. If `start_encounter` started its own, it would commit the
API's transaction halfway through, and a later failure in `prescribe` could no longer roll it back.
So "step" procedures leave transaction control to the caller, which wraps the whole visit in one.
The header of `procedures.sql` explains ATOMIC versus STEP procedures.
</details>

<details><summary><b>Viva: what does the session cookie contain, and why can't a user change who they are?</b></summary>

Only a random session id, signed with `SESSION_SECRET`. The account details stay on the server.
Changing the cookie produces an id that either doesn't exist or fails the signature check. Because
routes take the account from `req.session`, never from the request body, the user can't claim to
be someone else.
</details>

---

## You're done. What next?

1. Push everything (Part 0.10).
2. **Your viva map.** For each of the seven design decisions in `CLAUDE.md`, be able to say in two
   sentences what it is, and point at the exact table, trigger or procedure that enforces it:

   | Decision | Where it lives |
   |---|---|
   | 1 UHID anchored to NID | `uq_patient_nid`, the UHID CHECKs, `register_patient()`, `merge_patients()` |
   | 2 Access granted, not assumed | `role_permission`, `require_permission()`, `get_patient_record()`, `access_log` triggers |
   | 3 Availability computed | `doctor_availability()` |
   | 4 Booking transactional | `uq_doctor_slot` on `active_slot`, `book_appointment()` |
   | 5 Encounter is the hub | `encounter` and everything with an `encounter_id` FK; the catalogue tables |
   | 6 Referrals make it national | `referral`, `refer_patient()`, `v_referral_inbox` |
   | 7 Bed state via trigger | `trg_bed_occupancy_*`, `trg_bed_bu` |

3. Run your race (Task 2) in front of Abir and Noria and explain it. If you can teach it, you can
   defend it.
