## Abstract

This project builds a nationwide hospital management and health-record system for Bangladesh in which every patient receives one **Unified Health ID (UHID)** on first contact with any connected hospital, and that record follows them to every other hospital. The system is a MySQL 8 database of **41 tables, 21 triggers, 76 stored procedures, 8 functions and 9 views**, served through a Node.js/Express JSON API (60 endpoints) to a plain HTML, CSS and JavaScript web console.

The design places the business rules in the database rather than in application code: duplicate-free UHID issue anchored to the national ID, role- and consent-based access with a logged read of every clinical record, doctor availability computed from schedules rather than stored, double-booking prevented with a unique key and row locking, an encounter-centred clinical model coded against ICD-10 and drug catalogues, inter-hospital referrals, and bed status maintained by triggers. The web server connects as a least-privilege MySQL user that may only execute named procedures and read views.

The result was verified with **309 database tests**, **145 end-to-end API checks**, and concurrency tests in which two receptionists repeatedly try to book one slot and fill one bed at the same moment; in every run exactly one succeeded.

## 1. Introduction

In Bangladesh, a patient's medical history is held separately by each hospital that treated them, mostly on paper. A man diagnosed with hypertension in Dhaka, treated for a reaction to penicillin in Sylhet and referred to a cardiologist in Chattogram carries three unconnected files, and the third hospital sees none of the first two. Allergies, current medicines and earlier test results are lost at exactly the moment they matter.

This project proposes and builds a **national hospital management system** in which all connected hospitals share one database behind one patient identity. A patient receives a **Unified Health ID (UHID)** the first time they visit any connected hospital, for example `BD-2019-04821-5`, and that ID opens the same record everywhere. Around this record the system runs the daily work of a hospital: registration, appointments, consultations, prescriptions, laboratory tests, ward admissions and inter-hospital referrals.

Because this is a Database Management System course project, the database carries the design. Every rule that protects the record, from "one person, one UHID" to "no two patients in one bed", is enforced by MySQL itself through constraints, triggers and stored procedures. The web application exists to demonstrate the database and cannot bypass it.

## 2. Motivation

The project is motivated by four everyday failures of per-hospital record keeping:

- **Duplicate identities.** The same person is registered again at each hospital, often with a misspelt name or without a national ID. Their history splits across records that nobody can join.
- **Missing safety information.** A drug allergy recorded at one hospital is invisible at the next, so a dangerous prescription can be written in good faith.
- **Referrals without history.** A referred patient arrives with a paper slip, and the receiving doctor repeats tests the referring hospital already ran.
- **Uncontrolled access.** Where records are digital, there is often no record of who read them. Health data is sensitive, and a patient should be able to see who looked at theirs.

These are database problems at heart: identity, integrity, concurrency and access control. That made the subject a strong fit for a DBMS course, where each failure could be answered with a specific database feature and defended in the viva.

## 3. Objectives

The project set out to build a working system that meets seven objectives, each tied to one design decision that the database enforces.

| # | Objective | How the database enforces it |
| --- | --- | --- |
| 1 | Issue exactly one UHID per person | Duplicate check on NID, name + date of birth and mobile before issue; serial taken from a counter row locked with `SELECT … FOR UPDATE`; a CHECK constraint verifies the UHID format and check digit |
| 2 | Grant access, never assume it | Role permissions, patient consent grants that expire after 24 hours, an append-only `access_log` row written on every clinical read, and flagged break-glass emergency access |
| 3 | Compute doctor availability, never store it | A recursive CTE generates slots from the weekly schedule, minus leave, minus bookings |
| 4 | Make double booking impossible | `UNIQUE(doctor_id, slot_start)` plus a procedure that locks the doctor's row |
| 5 | Make the encounter the clinical hub | Diagnoses (ICD-10), prescriptions, lab orders and vitals hang off `encounter` and reference catalogue tables, not free text |
| 6 | Make records follow the patient nationally | A referral writes a consent grant for the receiving hospital in the same transaction |
| 7 | Keep bed status correct automatically | Triggers on `bed_occupancy` set a bed occupied, cleaning or free |

A further objective was practical: a web console for six roles (patient, receptionist, doctor, lab technician, hospital admin, system admin) that demonstrates every rule above through ordinary screens.

## 4. Literature review

Existing national systems show that a single patient identifier, a shared record and an audit of access are the core of a national health record; this project combines the three in one relational design.

**National health identifiers.** The United Kingdom's NHS assigns every patient a 10-digit NHS number whose last digit is a modulus-11 check digit, so a mistyped number is caught at entry [1]. India's Ayushman Bharat Digital Mission issues a 14-digit ABHA number linked to a person's identity and lets records from different providers be connected to it [2]. The UHID in this project follows the same pattern: a structured number with a check digit (`BD-<year>-<serial>-<check>`), anchored to the National ID card to stop duplicates.

**Shared records and patient-visible access.** Estonia's national e-health record, in operation since 2008, gathers records from all providers and lets patients see which professionals viewed their data [3]. That idea appears here as the `access_log` table and the patient's *Who has viewed this* tab.

**Health information systems in Bangladesh.** The Directorate General of Health Services uses DHIS2, an open-source platform, for national aggregate health reporting [4]. DHIS2 counts cases and services; it does not hold an individual's clinical history across hospitals, which is the gap this project addresses.

**Open-source medical record systems.** OpenMRS is a widely used open-source electronic medical record platform built on a relational database, with a concept dictionary so that diagnoses and observations are coded rather than typed [5]. This project takes the same approach with ICD-10 diagnosis codes [6] and catalogue tables for medicines and lab tests.

**Interoperability standards.** HL7 FHIR defines resources such as Patient, Encounter, Observation and MedicationRequest for exchanging health data between systems [7]. The entities in this project map closely onto those resources (`patient`, `encounter`, `lab_result`, `prescription_item`), which would make a FHIR interface a natural extension.

**Database foundations.** The design rests on the relational model [8] and on normalisation to BCNF as taught in the standard texts [9]. Access follows role-based access control (RBAC), in which permissions are attached to roles and roles to users [10]. Audit controls that record activity on health data are a requirement of health-data law in many countries, for example the HIPAA Security Rule in the United States [11].

**The gap.** Published systems either aggregate statistics (DHIS2) or run one hospital's records (most hospital EMRs). Few student or open designs show a single relational database that enforces identity, consent, auditing and concurrency rules for many hospitals at once, inside the database rather than in application code. That is the contribution of this project.

## 5. Methodology

The system was built database-first in six stages, each finished and tested before the next began:

1. **Requirements as use cases.** 28 use cases for six actors, each mapped to the stored procedure, trigger or view that implements it (`docs/use-cases.md`).
2. **Conceptual design.** An ER model in Chen notation, drawn in five clusters: institutions and geography; people, identity and access; the clinical spine; scheduling and beds; referral, consent and audit (`docs/er-design.md`, `docs/er-diagrams/`).
3. **Logical design and normalisation.** The ER model was mapped to 41 tables and normalised to BCNF; every deliberate redundancy is written down with its reason (`docs/normalization.md`).
4. **Physical design.** `schema.sql` (tables, keys, CHECKs), `triggers.sql`, `procedures.sql`, `views.sql`, then reference and demo data, and `grants.sql` for the least-privilege application user.
5. **Front end first, on sample data.** A single-file prototype fixed the screens and data shapes before any server existed; it was then split into the `public/` site.
6. **API and integration.** An Express API returns exactly the shapes the pages already used, so the same pages run on the live database or, opened from disk, on built-in sample data.

Testing ran alongside every stage: 309 SQL tests that each expect a specific MySQL error number, 145 end-to-end API checks, and race tests for booking and admission.

### 5.1 Use case diagram

The 28 use cases are drawn in three UML diagrams, one per area of the system, so that no diagram needs crossing lines through its use cases. Each actor is a role in the `role` table; what each may do is decided by `role_permission` and checked by `require_permission()` inside every procedure. «include» marks a step that always happens (registration always checks for duplicates); «extend» marks an optional addition (break-glass extends opening a record when no consent exists).

![diagrams/usecase-1.png](Use cases (a): front desk and appointments.)

![diagrams/usecase-2.png](Use cases (b): clinical care and wards.)

![diagrams/usecase-3.png](Use cases (c): administration, and the two use cases every user has.)

### 5.2 Data flow diagram

The data flow diagrams use Gane–Sarson notation. The context diagram (level 0) treats the whole system as one process exchanging data with the six roles. Level 1 opens it into eight processes and seven data stores. Each store is a group of tables: for example D7 *Access log* is the `access_log` table, written by process 4.0 on every read and reviewed by process 8.0.

![diagrams/dfd-1.png](Data flow diagram, level 0 (context diagram).)

![diagrams/dfd-2.png](Data flow diagram, level 1.)

### 5.3 Sequence diagram

The sequence diagram shows design decision 4 at work: two receptionists ask for the same 10:00 slot at the same moment. Request A takes a row lock on the doctor with `SELECT … FOR UPDATE`; request B's identical statement waits. When A commits, B gets the lock, finds the slot taken and is refused with a clear message. This exact race is run five times by `npm run race`, and every round ends with one booking.

![diagrams/seq-1.png](Sequence diagram: two concurrent bookings for one slot.)

### 5.4 Entity–relationship model

The 41 tables fall into five clusters. The full Chen diagram is in `docs/er-diagrams/uhid-er-chen-boxed.drawio`; the main relationships are:

| Cluster | Main tables | Key relationships |
| --- | --- | --- |
| Institutions and geography | `division`, `district`, `hospital`, `department`, `ward`, `bed` | A district has many hospitals; a hospital has many wards; a ward has many beds (`bed` is a weak entity) |
| People, identity and access | `patient`, `user_account`, `role`, `permission`, `doctor`, `doctor_posting` | A doctor is posted to many hospitals (M:N through `doctor_posting`); a role has many permissions (M:N) |
| Clinical spine | `encounter`, `encounter_diagnosis`, `prescription`, `prescription_item`, `lab_order`, `lab_result`, `encounter_vitals` | A patient has many encounters; an encounter has many diagnoses (ICD-10), prescriptions and lab orders |
| Scheduling and beds | `doctor_schedule`, `doctor_leave`, `appointment`, `admission`, `bed_occupancy` | A doctor has a weekly schedule and leave; an admission has one or more bed stays |
| Referral, consent and audit | `referral`, `consent_grant`, `access_log`, `patient_merge` | A referral links two hospitals and two encounters; every record read writes one `access_log` row |

## 6. Technical tools

The stack is deliberately small: MySQL holds the rules, Express passes requests to it, and plain web pages display the results.

### 6.1 Backend

| Tool | Version | Used for |
| --- | --- | --- |
| MySQL Server | 8.4 LTS (needs 8.0.31+) | The database: 41 tables, 21 triggers, 76 stored procedures, 8 functions, 9 views. MySQL 8 features used: CHECK constraints, `REGEXP_LIKE`, recursive CTEs, window functions, `INTERSECT`, `utf8mb4_0900_ai_ci` |
| Node.js | 24 LTS (runs on 20+) | Runs the web server |
| Express | 4 | HTTP routing: serves the static pages and 60 JSON endpoints under `/api` |
| mysql2 | 3 | MySQL driver; every value is sent as a `?` parameter, never pasted into SQL |
| express-session | 1 | Sign-in sessions, stored in the MySQL table `web_session` |
| bcryptjs | 2 | Password hashing; passwords never reach SQL in plain text |
| dotenv | 16 | Reads credentials from `server/.env`, which is not in Git |

### 6.2 Frontend

| Tool | Used for |
| --- | --- |
| HTML5 | 4 public pages (landing, sign-in, privacy, 404) and 14 console screens |
| CSS3 | A design system of custom properties (colour tokens) with light and dark themes, a responsive layout and a print stylesheet |
| JavaScript (ES2020, no framework) | Rendering from data with template literals, `fetch()` calls to the API, and an offline mode that runs on built-in sample data |
| IBM Plex Sans, Mono, Serif | Typefaces, from Google Fonts |

### 6.3 Development tools

| Tool | Used for |
| --- | --- |
| draw.io | Chen-notation ER diagrams, and the use case, data flow and sequence diagrams in this report |
| MySQL command-line client | Running scripts and the demonstration queries |
| Playwright with Chromium | Browser tests and the screenshots in this report |
| Git and GitHub | Version control and the shared copy of the project |
| Visual Studio Code | Editing |

## 7. Implementation and results

The finished system runs end to end: the database builds from seven SQL scripts in one command (`npm run db:reset`), the API serves 60 endpoints, and every console screen works for the role it is meant for. All rows and screenshots below were captured from the running system on 7 November 2026, on the demo data in `seed.sql`.

### 7.1 The database in numbers

| Object | Count | Where |
| --- | --- | --- |
| Tables | 41 | `database/schema.sql` |
| Triggers | 21 | `database/triggers.sql` |
| Stored procedures | 76 | `database/procedures.sql` |
| Stored functions | 8 | `database/procedures.sql` |
| Views | 9 | `database/views.sql` |
| Demonstration queries | 20 | `database/queries.sql` |
| Database tests | 309 | `database/tests.sql` |
| API endpoints | 60 | `server/routes/` |

### 7.2 Rows from the database

**The `patient` table.** Each UHID ends in a check digit equal to the sum of its 5-digit serial's digits mod 10, verified by the CHECK constraint `ck_patient_uhid_check_digit`. Rows 1 and 3 are the same man registered twice, once without his NID; this is the duplicate the merge screen exists to resolve.

| uhid | name | dob | sex | blood_group | nid | identity_verified |
| --- | --- | --- | --- | --- | --- | --- |
| BD-2019-04821-5 | Md. Rahim Uddin | 1978-04-12 | Male | B+ | 1978419923041 | 1 |
| BD-2021-11904-5 | Fatema Begum | 1991-09-30 | Female | O+ | 1991773310448 | 1 |
| BD-2018-00723-2 | Md. Rahim Uddin | 1978-04-12 | Male | B+ | NULL | 0 |
| BD-2023-38104-6 | Abdul Karim Mia | 1965-01-22 | Male | A- | 1965110220317 | 1 |
| BD-2020-27615-1 | Shirin Akter | 1996-11-05 | Female | AB+ | 1996884411052 | 1 |

**One patient across four hospitals.** A five-table join (`encounter`, `patient`, `hospital`, `encounter_diagnosis`, `diagnosis`) returns Md. Rahim Uddin's diagnoses, coded in ICD-10, from every hospital that treated him.

| uhid | visit | hospital | icd10_code | term |
| --- | --- | --- | --- | --- |
| BD-2019-04821-5 | 2024-03-14 | Upazila Health Complex, Savar | A09 | Acute gastroenteritis |
| BD-2019-04821-5 | 2024-11-02 | Dhaka Medical College Hospital | S52.5 | Fracture of distal radius |
| BD-2019-04821-5 | 2025-06-19 | Chattogram Medical College Hospital | M54.5 | Low back pain |
| BD-2019-04821-5 | 2026-08-08 | Square Hospital, Dhaka | I10 | Essential hypertension |
| BD-2019-04821-5 | 2026-11-07 | Square Hospital, Dhaka | I10 | Essential hypertension |

**The `access_log` table.** Every opening of a record wrote a row before the data was returned, with the legal basis for the read. Reception gets `demographics_only`; the doctor reads under the consent grant that Square Hospital's referral created; the patient reads their own record.

| log_id | uhid | username | action | basis | is_break_glass | at |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | BD-2019-04821-5 | rahim | record.read | own_record | 0 | 2026-11-07 09:37:40 |
| 16 | BD-2019-04821-5 | anisur | record.read | consent | 0 | 2026-11-07 09:37:23 |
| 13 | BD-2019-04821-5 | rezaul | record.demographics | demographics_only | 0 | 2026-11-07 09:37:10 |
| 11 | BD-2018-00723-2 | rezaul | search.match | demographics_only | 0 | 2026-11-07 09:37:09 |

**The `appointment` table.** `slot_end` is computed by `book_appointment()` from the doctor's slot length; a cancelled row keeps its history.

| appointment_id | uhid | doctor_id | slot_start | slot_end | status |
| --- | --- | --- | --- | --- | --- |
| 1 | BD-2019-04821-5 | 6 | 2026-08-08 09:00 | 2026-08-08 09:20 | attended |
| 2 | BD-2019-04821-5 | 1 | 2026-11-08 09:00 | 2026-11-08 09:20 | booked |
| 10 | BD-2023-40218-5 | 11 | 2026-11-08 09:00 | 2026-11-08 09:20 | booked |
| 5 | BD-2018-00723-2 | 1 | 2026-11-08 09:40 | 2026-11-08 10:00 | cancelled |

**A demonstration query: window functions.** Query 7 in `queries.sql` ranks departments by encounter volume with `RANK()` and computes each one's share with `SUM() OVER ()`.

```sql
SELECT dept.name AS department, COUNT(*) AS encounters,
       RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_by_volume,
       ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct_of_all
  FROM encounter e JOIN department dept ON dept.department_id = e.department_id
 GROUP BY dept.department_id, dept.name ORDER BY rank_by_volume;
```

| department | encounters | rank_by_volume | pct_of_all |
| --- | --- | --- | --- |
| Medicine | 11 | 1 | 45.8 |
| Cardiology | 3 | 2 | 12.5 |
| Paediatrics | 2 | 3 | 8.3 |
| Gynae & Obstetrics | 2 | 3 | 8.3 |
| Emergency | 2 | 3 | 8.3 |

### 7.3 The database refusing what it should

Each rule was tested by attempting to break it. These are the actual MySQL responses:

| Attempt | Result |
| --- | --- |
| Insert a patient with UHID `BD-2026-00042-9` (correct check digit is 6) | `ERROR 3819: Check constraint 'ck_patient_uhid_check_digit' is violated.` |
| Insert a second appointment for doctor 1 at 2026-11-08 09:00 | `ERROR 1062: Duplicate entry '1-2026-11-08 09:00:00' for key 'appointment.uq_doctor_slot'` |
| Edit a row of the access log, even as root | `ERROR 1644: The access log is append-only.` (trigger) |
| `SELECT * FROM patient` as the web server's user `uhid_app` | `ERROR 1142: SELECT command denied to user 'uhid_app'@'localhost' for table 'patient'` |
| `DELETE FROM access_log` as `uhid_app` | `ERROR 1142: DELETE command denied to user 'uhid_app'@'localhost' for table 'access_log'` |

### 7.4 Test results

| Test suite | Command | Result |
| --- | --- | --- |
| Database constraints, triggers and procedures | `npm run db:test` | 309 / 309 passed |
| End-to-end API checks | `npm run api:test` | 145 / 145 passed |
| Two receptionists book one slot at the same instant | `npm run race` | 5 / 5 rounds: exactly one booking |
| Two admissions to one bed at the same instant | `npm run race` | 5 / 5 rounds: exactly one patient in the bed |
| Empty install to a booked patient | `npm run first-day:test` | 17 / 17 passed |

### 7.5 The front end, page by page

The web front end has 4 public pages and 14 console screens. Each screenshot below was taken from the running system signed in as the role named in its caption.

#### Public pages (no sign-in)

![screenshots/01-index.png](Landing page. The counts of hospitals, divisions and doctors come from the database through the API; the strip at the top states that this is a course project, not a government service.)

![screenshots/01b-index-doctors.png](Landing page, doctor directory. Each card's *next free* time is computed at that moment from the doctor's schedule, leave and bookings (decision 3); no slot is stored.)

![screenshots/02-login.png](Sign-in page. The demo accounts are listed only while `DEMO_MODE=1` is set in `server/.env`.)

![screenshots/03-privacy.png](Privacy page: what the system stores, what leaves the browser, and what a real deployment would change.)

![screenshots/04-404.png](The 404 page Express sends for any unknown address.)

#### Receptionist (rezaul, Dhaka Medical College Hospital)

![screenshots/05-register.png](Register patient. Typing a name and date of birth already shows two existing records for Md. Rahim Uddin, found by `registration_matches()` before any UHID is issued (decision 1).)

![screenshots/06-search.png](Find patient. Search runs across every hospital; mobile numbers are masked, at most 20 matches return, and each match shown is logged.)

![screenshots/07-record-reception.png](Patient record as reception sees it: demographics and allergies only. The database itself withholds the clinical history from this role (decision 2).)

![screenshots/08-book.png](Book appointment: the national doctor directory, filtered by division, department and hospital.)

![screenshots/08b-book-slots.png](The slot grid for one doctor, produced by `doctor_availability()`, a recursive CTE. Struck-through slots are already booked.)

![screenshots/10-appointments-reception.png](Appointment list for the receptionist's hospital, with cancel before the slot and *did not come* after it.)

![screenshots/09-wards.png](Wards and beds. Every bed's colour comes from `bed.status_id`, which only the bed-occupancy triggers change (decision 7).)

#### Doctor (anisur)

![screenshots/12-record-doctor.png](Patient record as a doctor sees it: allergies, the referral from Square Hospital that granted access, and five encounters across four hospitals in two divisions (decisions 5 and 6).)

![screenshots/13-encounter.png](Record encounter. The form is saved by several procedure calls in one transaction; the side panel shows the allergies the database will check every prescription against.)

![screenshots/14-referrals.png](Referral inbox: patients referred to this hospital who have not yet arrived.)

![screenshots/15-appointments-doctor.png](The doctor's own appointment list across every hospital where they hold a posting.)

#### Lab Technician (rumana)

![screenshots/16-lab.png](Lab worklist: tests ordered at this hospital, moving from ordered to collected to reported. A trigger compares each result with the test's reference range and flags abnormal values.)

#### Hospital Admin (nasima)

![screenshots/17-audit.png](Break-glass review: Dr. Anisur's emergency read of Fatema Begum's record, with the reason he gave, waiting for a verdict.)

![screenshots/18-merge.png](Merge records: the two Md. Rahim Uddin records, found by a self-join in `v_possible_duplicates`, ready to compare and merge.)

![screenshots/19-accounts.png](Staff accounts: create, reset with a one-time password, or switch off accounts at this hospital.)

![screenshots/20-setup.png](Hospital setup: doctors and fees, weekly sessions, leave, wards and beds.)

#### Every role

![screenshots/11-account.png](My account: change your own password (at least 10 characters, hashed with bcrypt in Node).)

#### Patient (rahim)

![screenshots/21-patient-record.png](A patient's own record, including the tabs *Who has viewed this* and *Who may read it*, where consent can be revoked.)

![screenshots/22-patient-book.png](The patient's view of the doctor directory, from which they book for themselves only.)

## 8. Limitations

The system is a complete course prototype, not a deployed national service. Its known limits, each recorded in `docs/er-design.md` §8.4–8.5, are:

- **Not hosted.** It runs on one laptop at `http://localhost:3000`. A real deployment needs a server, a domain, HTTPS (`COOKIE_SECURE=1` is already supported), off-site backups and uptime monitoring.
- **The database trusts the server's account id.** Every procedure receives the signed-in account from the web server. A fully compromised web server could act as any user; MySQL cannot verify who is behind the browser.
- **Procedures run with root's rights.** This is what lets the restricted `uhid_app` user reach tables it cannot touch directly. It is safe only because no procedure builds SQL from text; a production system would use a dedicated, lower-privilege owner account.
- **Root can still erase the access log.** Triggers stop edits and deletes, but `TRUNCATE` and `DROP` fire no trigger. A real system would copy each log row to write-once storage outside the database.
- **Demo data only.** The 18 patients, 8 hospitals and 12 doctor postings are invented. Performance has not been measured at national scale, where indexes and partitioning of `encounter` and `access_log` would need tuning.
- **No real identity check.** The NID is stored and checked for duplicates, but not verified against the national ID database.
- **No notifications.** There is no email or SMS for appointment reminders or password resets.
- **Security outside the course scope.** Multi-factor sign-in, encryption of database files at rest, independent penetration testing and compliance with health-data law were not attempted.
- **MySQL 8 only.** The schema uses `REGEXP_LIKE`, `INTERSECT` and the `utf8mb4_0900_ai_ci` collation, so it does not run on MariaDB (for example the one bundled with XAMPP).

## 9. Conclusion and future work

The project shows that a national health record can be built on one relational database whose own rules keep it correct. Every one of the seven objectives is enforced by MySQL rather than by application code: a CHECK constraint and a locked counter keep UHIDs unique and valid, a logged-read procedure and a least-privilege user make every clinical read auditable, a recursive CTE computes availability, a unique key and a row lock prevent double booking, catalogue tables keep diagnoses and medicines codable, referrals carry consent between hospitals, and triggers keep the bed board true. 309 database tests, 145 API checks and repeated race tests confirm that each rule refuses what it should.

The main lesson for the team was where to put a rule. A rule written in the database holds for every program that ever touches the data; a rule written in the web server holds only for that server.

**Future work**

1. **Hosting** on a real server with HTTPS, off-site backups and monitoring (the one open checklist item, `CHECKLIST.md` I14).
2. **NID verification** against the national identity service at registration.
3. **An HL7 FHIR interface** exposing `patient`, `encounter`, `lab_result` and prescriptions as FHIR resources, so existing hospital systems can join the network.
4. **SMS and email** for appointment reminders and password resets.
5. **A separate, append-only copy of the access log** that the database administrator cannot alter.
6. **A dedicated low-privilege owner** for the stored procedures in place of root.
7. **Analytics for the health directorate**: disease burden by district and season, built on the coded diagnoses the system already stores.
8. **Load testing** at national scale, with partitioning of the largest tables.

## References

[1] NHS, "What is an NHS number?" [Online]. Available: https://www.nhs.uk/using-the-nhs/about-the-nhs/what-is-an-nhs-number/

[2] National Health Authority, Government of India, "Ayushman Bharat Digital Mission." [Online]. Available: https://abdm.gov.in/

[3] e-Estonia, "e-Health Record." [Online]. Available: https://e-estonia.com/solutions/healthcare/e-health-records/

[4] DHIS2, "DHIS2: the world's largest health management information system platform." [Online]. Available: https://dhis2.org/

[5] OpenMRS, "OpenMRS: open-source medical record system." [Online]. Available: https://openmrs.org/

[6] World Health Organization, "ICD-10 Version: 2019." [Online]. Available: https://icd.who.int/browse10/2019/en

[7] HL7 International, "FHIR Release 4." [Online]. Available: https://hl7.org/fhir/R4/

[8] E. F. Codd, "A relational model of data for large shared data banks," *Communications of the ACM*, vol. 13, no. 6, pp. 377–387, 1970.

[9] A. Silberschatz, H. F. Korth and S. Sudarshan, *Database System Concepts*, 7th ed. New York: McGraw-Hill, 2019.

[10] R. S. Sandhu, E. J. Coyne, H. L. Feinstein and C. E. Youman, "Role-based access control models," *IEEE Computer*, vol. 29, no. 2, pp. 38–47, 1996.

[11] U.S. Department of Health and Human Services, "45 CFR §164.312, Technical safeguards (audit controls)." [Online]. Available: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312

[12] Oracle, *MySQL 8.4 Reference Manual*. [Online]. Available: https://dev.mysql.com/doc/refman/8.4/en/

[13] OpenJS Foundation, "Express: Node.js web application framework." [Online]. Available: https://expressjs.com/
