-- =====================================================================
-- UHID National Hospital Management System — schema
-- Nobo Ishraque · Dept. of ICT, Bangladesh University of Professionals
--
-- Derived from docs/er-design.md. That document is the authority: if this
-- file and it disagree, the document is right and this file is a bug.
--
-- Phase 1 = the 32 tables the five existing screens need (er-design.md §7).
-- Phase 2 = section 9: labs, vitals, referral, consent, merge — the tables
-- that carry decisions 2, 5 and 6 — plus uhid_sequence, the locked counter
-- that UHID serials are issued from.
--
-- Triggers, stored procedures and views are NOT in this file. They live in
-- database/triggers.sql, procedures.sql and views.sql. The constraints that
-- could not be expressed as CHECK are listed at the foot of this file with
-- where each one is now enforced — read that list, it is part of the design.
--
-- Build order: schema → triggers → procedures → views → seed → grants.
-- `npm run db:reset` (in server/) runs all six in that order.
--
-- Requires MySQL 8.0.16 or later: CHECK constraints are parsed but silently
-- ignored before 8.0.16, which would let bad UHIDs in without complaint.
--
-- Run with:  mysql -u root -p < database/schema.sql
-- =====================================================================

-- WARNING: this DROP destroys every row in the database. It is here because
-- during development this file is re-run constantly and a clean rebuild is
-- what you want. Comment it out the moment there is data worth keeping.
DROP DATABASE IF EXISTS uhid;

CREATE DATABASE uhid
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE uhid;


-- =====================================================================
-- 1. GEOGRAPHY AND INSTITUTIONS                     (er-design.md §4.1)
-- =====================================================================

CREATE TABLE division (
  division_id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(40)      NOT NULL,
  PRIMARY KEY (division_id),
  UNIQUE KEY uq_division_name (name)
) ENGINE = InnoDB;

CREATE TABLE district (
  district_id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  division_id   TINYINT UNSIGNED  NOT NULL,
  name          VARCHAR(60)       NOT NULL,
  PRIMARY KEY (district_id),
  UNIQUE KEY uq_district_name (name),
  KEY ix_district_division (division_id),
  CONSTRAINT fk_district_division FOREIGN KEY (division_id)
    REFERENCES division (division_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

-- Lookup, not ENUM: a new tier of facility is an INSERT, and an ENUM cannot
-- be the target of a foreign key. See er-design.md §3.
CREATE TABLE hospital_tier (
  tier_id       TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(30)      NOT NULL,
  PRIMARY KEY (tier_id),
  UNIQUE KEY uq_tier_name (name)
) ENGINE = InnoDB;

CREATE TABLE hospital (
  hospital_id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)      NOT NULL,
  district_id   SMALLINT UNSIGNED NOT NULL,
  tier_id       TINYINT UNSIGNED  NOT NULL,
  address       VARCHAR(200)      NULL,
  phone         VARCHAR(20)       NULL,
  is_active     BOOLEAN           NOT NULL DEFAULT TRUE,
  created_at    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (hospital_id),
  KEY ix_hospital_district (district_id),
  KEY ix_hospital_tier (tier_id),
  KEY ix_hospital_name (name),
  CONSTRAINT fk_hospital_district FOREIGN KEY (district_id)
    REFERENCES district (district_id) ON DELETE RESTRICT,
  CONSTRAINT fk_hospital_tier FOREIGN KEY (tier_id)
    REFERENCES hospital_tier (tier_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

-- The NATIONAL catalogue of specialities. "Cardiology" exists once in the
-- whole database, which is what makes "Cardiology anywhere" a real query
-- rather than a LIKE over free text. See er-design.md §4.1.
CREATE TABLE department (
  department_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(60)       NOT NULL,
  PRIMARY KEY (department_id),
  UNIQUE KEY uq_department_name (name)
) ENGINE = InnoDB;


-- =====================================================================
-- 2. ROLES AND PERMISSIONS                          (er-design.md §4.2)
-- =====================================================================

CREATE TABLE role (
  role_id       TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(30)      NOT NULL,   -- patient, receptionist, doctor,
  label         VARCHAR(40)      NOT NULL,   -- hospital_admin, system_admin,
  PRIMARY KEY (role_id),                     -- lab_technician
  UNIQUE KEY uq_role_code (code)
) ENGINE = InnoDB;

CREATE TABLE permission (
  permission_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(60)       NOT NULL,  -- e.g. 'bed.admit', 'bed.discharge'
  description   VARCHAR(160)      NOT NULL,
  PRIMARY KEY (permission_id),
  UNIQUE KEY uq_permission_code (code)
) ENGINE = InnoDB;

-- Receptionist admits, doctor discharges: that difference is two rows in
-- here, not two tables anywhere else. See CLAUDE.md "Roles".
CREATE TABLE role_permission (
  role_id       TINYINT UNSIGNED  NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY ix_rp_permission (permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id)
    REFERENCES role (role_id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id)
    REFERENCES permission (permission_id) ON DELETE CASCADE
) ENGINE = InnoDB;


-- =====================================================================
-- 3. DOCTORS AND POSTINGS                           (er-design.md §4.2)
-- =====================================================================

CREATE TABLE doctor (
  doctor_id      SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100)      NOT NULL,
  bmdc_reg       VARCHAR(20)       NOT NULL,
  qualifications VARCHAR(200)      NOT NULL,
  is_active      BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (doctor_id),
  UNIQUE KEY uq_doctor_bmdc (bmdc_reg),
  KEY ix_doctor_name (name)
) ENGINE = InnoDB;

CREATE TABLE hospital_department (
  hospital_id     SMALLINT UNSIGNED NOT NULL,
  department_id   SMALLINT UNSIGNED NOT NULL,
  head_doctor_id  SMALLINT UNSIGNED NULL,
  opd_room        VARCHAR(20)       NULL,
  PRIMARY KEY (hospital_id, department_id),
  KEY ix_hd_department (department_id),
  KEY ix_hd_head (head_doctor_id),
  CONSTRAINT fk_hd_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE CASCADE,
  CONSTRAINT fk_hd_department FOREIGN KEY (department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT,
  CONSTRAINT fk_hd_head FOREIGN KEY (head_doctor_id)
    REFERENCES doctor (doctor_id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- A consultant holds a government post AND a private chamber, at different
-- fees. Department and fee therefore belong to the POSTING, not to the
-- doctor. GET /api/doctors returns one row per posting, which is why the
-- frontend's { id, name, dept, hospitalId, fee } shape survives unchanged.
-- See er-design.md §4.2.
CREATE TABLE doctor_posting (
  posting_id       MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doctor_id        SMALLINT UNSIGNED  NOT NULL,
  hospital_id      SMALLINT UNSIGNED  NOT NULL,
  department_id    SMALLINT UNSIGNED  NOT NULL,
  consultation_fee DECIMAL(8,2)       NOT NULL,
  valid_from       DATE               NOT NULL,
  valid_to         DATE               NULL,    -- NULL = current posting
  PRIMARY KEY (posting_id),

  -- Not decoration. appointment carries (posting_id, doctor_id) as a
  -- composite foreign key so that UNIQUE(doctor_id, slot_start) is possible,
  -- and a composite FK needs an index on exactly these columns to point at.
  UNIQUE KEY uq_posting_doctor (posting_id, doctor_id),

  UNIQUE KEY uq_posting_unique (doctor_id, hospital_id, department_id, valid_from),
  KEY ix_posting_hospital (hospital_id),
  KEY ix_posting_department (department_id),
  CONSTRAINT fk_posting_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctor (doctor_id) ON DELETE RESTRICT,
  CONSTRAINT fk_posting_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_posting_department FOREIGN KEY (department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT,
  CONSTRAINT ck_posting_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT ck_posting_fee CHECK (consultation_fee >= 0)
) ENGINE = InnoDB;


-- =====================================================================
-- 4. PATIENT AND LOGIN                              (er-design.md §4.2)
--
-- patient and user_account reference each other (patient.verified_by is an
-- account; user_account.patient_id is a patient). MySQL cannot create a
-- circular pair of foreign keys in one CREATE TABLE, so patient is created
-- without fk_patient_verified_by and it is added by ALTER TABLE below.
-- =====================================================================

CREATE TABLE patient (
  patient_id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,

  -- The natural key. UNIQUE, not the primary key: it is CHAR(15) and would
  -- be the FK in every large table, and a duplicate-UHID merge must be able
  -- to repoint child rows without rewriting the key column of a medical
  -- history. See er-design.md §4.2.
  --
  -- ascii_bin, not the database's utf8mb4 default. That collation is
  -- case-INsensitive, and the format CHECK below inherits it: under it,
  -- 'bd-2026-13052-1' satisfies '^BD-' and gets stored. A binary collation
  -- makes the regex case-sensitive and the unique index byte-exact, and an
  -- ASCII-only identifier costs 15 bytes in the index instead of up to 60.
  uhid                   CHAR(15) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  name                   VARCHAR(100)      NOT NULL,
  dob                    DATE              NOT NULL,
  sex                    ENUM('Male','Female','Other') NOT NULL,
  blood_group            ENUM('Unknown','A+','A-','B+','B-','AB+','AB-','O+','O-')
                                           NOT NULL DEFAULT 'Unknown',
  phone                  VARCHAR(20)       NULL,

  -- NULL, never ''. An empty string is a value and eleven patients with no
  -- NID would collide on uq_patient_nid; eleven NULLs do not. js/seed.js
  -- stores nid: '' for the unverified patient — that must import as NULL.
  nid                    VARCHAR(17)       NULL,

  district_id            SMALLINT UNSIGNED NULL,
  address                VARCHAR(200)      NULL,
  kin_name               VARCHAR(100)      NULL,
  kin_relation           VARCHAR(30)       NULL,
  kin_phone              VARCHAR(20)       NULL,
  registered_at          DATE              NOT NULL,
  registered_hospital_id SMALLINT UNSIGNED NOT NULL,
  identity_verified      BOOLEAN           NOT NULL DEFAULT FALSE,
  verified_by            INT UNSIGNED      NULL,
  verified_at            DATETIME          NULL,
  created_at             DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (patient_id),
  UNIQUE KEY uq_patient_uhid (uhid),
  UNIQUE KEY uq_patient_nid (nid),

  -- The duplicate-detection query in pages/register.js searches on exactly
  -- these three. They are indexed because that search runs on every
  -- keystroke during registration. See er-design.md §1, decision 1.
  KEY ix_patient_name_dob (name, dob),
  KEY ix_patient_phone (phone),
  KEY ix_patient_district (district_id),
  KEY ix_patient_reg_hospital (registered_hospital_id),
  KEY ix_patient_verified_by (verified_by),

  CONSTRAINT fk_patient_district FOREIGN KEY (district_id)
    REFERENCES district (district_id) ON DELETE RESTRICT,
  CONSTRAINT fk_patient_reg_hospital FOREIGN KEY (registered_hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,

  -- BD-<year>-<5-digit serial>-<check digit>, e.g. BD-2026-13052-1
  CONSTRAINT ck_patient_uhid_format CHECK (
    REGEXP_LIKE(uhid, '^BD-[0-9]{4}-[0-9]{5}-[0-9]$')
  ),

  -- The check digit is the serial's five digits summed mod 10. Positions in
  -- 'BD-YYYY-SSSSS-C' are 1-based: the serial is 9..13, the check digit 15.
  -- This is the project's own rule, enforced by the database rather than by
  -- issueUhid() alone; uhidCheckDigit() in js/util.js is the same rule.
  CONSTRAINT ck_patient_uhid_check_digit CHECK (
    ( CAST(SUBSTRING(uhid,  9, 1) AS UNSIGNED)
    + CAST(SUBSTRING(uhid, 10, 1) AS UNSIGNED)
    + CAST(SUBSTRING(uhid, 11, 1) AS UNSIGNED)
    + CAST(SUBSTRING(uhid, 12, 1) AS UNSIGNED)
    + CAST(SUBSTRING(uhid, 13, 1) AS UNSIGNED) ) % 10
    = CAST(SUBSTRING(uhid, 15, 1) AS UNSIGNED)
  ),

  CONSTRAINT ck_patient_verified CHECK (
    (identity_verified = FALSE AND verified_by IS NULL AND verified_at IS NULL)
    OR (identity_verified = TRUE AND verified_by IS NOT NULL)
  ),

  -- Stress test 7 Nov 2026 (H2.7, H3.1). An NID is digits only, 10, 13 or 17
  -- of them — otherwise '1234567890' and '123-456-7890' are two people to
  -- uq_patient_nid. A phone is digits with optional spaces, dashes and a
  -- leading +. A date of birth before 1900 is a typing mistake.
  CONSTRAINT ck_patient_nid CHECK (
    nid IS NULL OR REGEXP_LIKE(nid, '^([0-9]{10}|[0-9]{13}|[0-9]{17})$')
  ),
  CONSTRAINT ck_patient_phone CHECK (
    phone IS NULL OR REGEXP_LIKE(phone, '^[+]?[0-9][0-9 -]{6,18}[0-9]$')
  ),
  CONSTRAINT ck_patient_dob CHECK (dob >= '1900-01-01')
) ENGINE = InnoDB;

-- One login table for all six roles. patient_id / doctor_id / hospital_id are
-- nullable because which one applies depends on the role; UNIQUE on
-- patient_id and doctor_id gives "at most one account per person" (§8,
-- decision 3) and costs nothing for staff rows, because MySQL permits any
-- number of NULLs in a unique index.
CREATE TABLE user_account (
  account_id    INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  username      VARCHAR(40)       NOT NULL,
  password_hash CHAR(60)          NOT NULL,   -- bcrypt, verified on the SERVER

  -- Only for roles with no patient or doctor row to take a name from:
  -- receptionist, hospital admin, lab technician, system admin. A patient's
  -- or doctor's name is NOT copied here — it lives on their own row, and a
  -- copy would be a transitive dependency (account → patient → name) that
  -- could disagree with the original. trg_user_account_bi enforces which
  -- roles must have it and which must not.
  staff_name    VARCHAR(100)      NULL,

  role_id       TINYINT UNSIGNED  NOT NULL,
  hospital_id   SMALLINT UNSIGNED NULL,
  patient_id    INT UNSIGNED      NULL,
  doctor_id     SMALLINT UNSIGNED NULL,
  is_active     BOOLEAN           NOT NULL DEFAULT TRUE,
  -- A password an administrator or the reception desk set (a new account, a
  -- reset) is known to someone other than its owner, so it must be changed
  -- at the next sign-in; until then the account can do nothing else.
  must_change_password BOOLEAN   NOT NULL DEFAULT FALSE,
  password_changed_at  DATETIME  NULL,
  last_login_at DATETIME          NULL,
  created_at    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  UNIQUE KEY uq_account_username (username),
  -- Plain ASCII usernames: MySQL compares text ignoring accents and width,
  -- so 'sýsadmin' would otherwise name the account 'sysadmin'.
  CONSTRAINT ck_account_username CHECK (REGEXP_LIKE(username, '^[a-z0-9._-]{3,40}$', 'c')),
  UNIQUE KEY uq_account_patient (patient_id),
  UNIQUE KEY uq_account_doctor (doctor_id),
  KEY ix_account_role (role_id),
  KEY ix_account_hospital (hospital_id),
  CONSTRAINT fk_account_role FOREIGN KEY (role_id)
    REFERENCES role (role_id) ON DELETE RESTRICT,
  CONSTRAINT fk_account_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_account_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE CASCADE,
  CONSTRAINT fk_account_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctor (doctor_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

-- The deferred half of the circular reference described above.
ALTER TABLE patient
  ADD CONSTRAINT fk_patient_verified_by FOREIGN KEY (verified_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT;


-- =====================================================================
-- 5. THE CLINICAL SPINE                             (er-design.md §4.3)
-- =====================================================================

CREATE TABLE encounter_type (
  type_id  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code     VARCHAR(20)      NOT NULL,   -- OPD, Emergency, Inpatient
  label    VARCHAR(30)      NOT NULL,
  PRIMARY KEY (type_id),
  UNIQUE KEY uq_enc_type_code (code)
) ENGINE = InnoDB;

CREATE TABLE encounter (
  encounter_id     INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  patient_id       INT UNSIGNED       NOT NULL,
  hospital_id      SMALLINT UNSIGNED  NOT NULL,
  type_id          TINYINT UNSIGNED   NOT NULL,
  posting_id       MEDIUMINT UNSIGNED NOT NULL,
  department_id    SMALLINT UNSIGNED  NOT NULL,

  -- A COPY of doctor_posting.consultation_fee, taken at insert and never
  -- updated (§8, decision 1). A fee is a property of what happened, not of
  -- the doctor: raising a fee next year must not restate what this patient
  -- was charged in 2026.
  consultation_fee DECIMAL(8,2)       NOT NULL,

  started_at       DATETIME           NOT NULL,
  ended_at         DATETIME           NULL,    -- NULL = encounter still open
  chief_complaint  VARCHAR(200)       NULL,
  notes            TEXT               NULL,    -- narrative, never queried
  created_by       INT UNSIGNED       NOT NULL,
  PRIMARY KEY (encounter_id),

  -- The patient record screen reads "this patient's encounters, newest
  -- first" on every open. That is this index.
  KEY ix_encounter_patient (patient_id, started_at DESC),
  KEY ix_encounter_hospital (hospital_id, started_at),
  KEY ix_encounter_posting (posting_id),
  KEY ix_encounter_type (type_id),
  KEY ix_encounter_department (department_id),
  KEY ix_encounter_created_by (created_by),
  CONSTRAINT fk_encounter_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounter_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounter_type FOREIGN KEY (type_id)
    REFERENCES encounter_type (type_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounter_posting FOREIGN KEY (posting_id)
    REFERENCES doctor_posting (posting_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounter_department FOREIGN KEY (department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT,
  CONSTRAINT fk_encounter_created_by FOREIGN KEY (created_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_encounter_dates CHECK (ended_at IS NULL OR ended_at >= started_at)
) ENGINE = InnoDB;

CREATE TABLE diagnosis (
  diagnosis_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  icd10_code   VARCHAR(10)       NOT NULL,
  term         VARCHAR(160)      NOT NULL,
  category     VARCHAR(60)       NULL,
  PRIMARY KEY (diagnosis_id),
  UNIQUE KEY uq_diagnosis_icd (icd10_code),
  KEY ix_diagnosis_term (term)
) ENGINE = InnoDB;

-- Free text becomes a foreign key. 'Essential hypertension — review' in
-- js/seed.js cannot answer "how many hypertensive patients are there";
-- diagnosis_id can. See er-design.md §4.3.
CREATE TABLE encounter_diagnosis (
  encounter_id INT UNSIGNED      NOT NULL,
  diagnosis_id SMALLINT UNSIGNED NOT NULL,
  is_primary   BOOLEAN           NOT NULL DEFAULT FALSE,
  certainty    ENUM('provisional','confirmed') NOT NULL DEFAULT 'provisional',
  note         VARCHAR(200)      NULL,
  PRIMARY KEY (encounter_id, diagnosis_id),
  KEY ix_ed_diagnosis (diagnosis_id),
  CONSTRAINT fk_ed_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE CASCADE,
  CONSTRAINT fk_ed_diagnosis FOREIGN KEY (diagnosis_id)
    REFERENCES diagnosis (diagnosis_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE medicine (
  medicine_id  MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generic_name VARCHAR(100)       NOT NULL,
  brand_name   VARCHAR(100)       NULL,
  form         VARCHAR(30)        NOT NULL,   -- tablet, capsule, syrup, cream
  strength     VARCHAR(30)        NOT NULL,   -- '5 mg', '500 mg', '1%'

  -- Matches allergen.class. This one column is what lets the database refuse
  -- Amoxicillin to a patient whose allergy says Penicillin — two different
  -- names, one class. trg_prescription_item_bi in triggers.sql reads it.
  drug_class   VARCHAR(60)        NULL,

  PRIMARY KEY (medicine_id),
  UNIQUE KEY uq_medicine (generic_name, form, strength),
  KEY ix_medicine_generic (generic_name),
  KEY ix_medicine_class (drug_class)
) ENGINE = InnoDB;

-- One prescription per encounter (§8, decision 2). A doctor who changes
-- their mind edits this row, and amended_at / amended_by make that edit
-- visible instead of silent.
CREATE TABLE prescription (
  prescription_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  encounter_id    INT UNSIGNED NOT NULL,
  prescribed_by   INT UNSIGNED NOT NULL,
  prescribed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  advice          TEXT         NULL,    -- narrative, never queried
  amended_at      DATETIME     NULL,
  amended_by      INT UNSIGNED NULL,
  PRIMARY KEY (prescription_id),
  UNIQUE KEY uq_prescription_encounter (encounter_id),
  KEY ix_prescription_by (prescribed_by),
  KEY ix_prescription_amended_by (amended_by),
  CONSTRAINT fk_prescription_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE CASCADE,
  CONSTRAINT fk_prescription_by FOREIGN KEY (prescribed_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_prescription_amended_by FOREIGN KEY (amended_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_prescription_amend CHECK (
    (amended_at IS NULL AND amended_by IS NULL)
    OR (amended_at IS NOT NULL AND amended_by IS NOT NULL)
  )
) ENGINE = InnoDB;

-- Weak entity: a drug line has no existence apart from its prescription,
-- hence the composite key and ON DELETE CASCADE. er-design.md §6.1.
-- 'Amlodipine 5 mg — 1 tablet at night — 90 days' decomposes into a
-- medicine_id plus three columns.
CREATE TABLE prescription_item (
  prescription_id INT UNSIGNED       NOT NULL,
  line_no         TINYINT UNSIGNED   NOT NULL,
  medicine_id     MEDIUMINT UNSIGNED NOT NULL,
  dose            VARCHAR(40)        NOT NULL,   -- '1 tablet'
  frequency       VARCHAR(40)        NOT NULL,   -- 'at night', 'twice daily'
  duration_days   SMALLINT UNSIGNED  NULL,       -- NULL = continuing
  instruction     VARCHAR(120)       NULL,       -- 'after meals'
  PRIMARY KEY (prescription_id, line_no),
  KEY ix_pi_medicine (medicine_id),
  CONSTRAINT fk_pi_prescription FOREIGN KEY (prescription_id)
    REFERENCES prescription (prescription_id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_medicine FOREIGN KEY (medicine_id)
    REFERENCES medicine (medicine_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE allergen (
  allergen_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)       NOT NULL,   -- 'Penicillin', 'Sulfa drugs'
  class       VARCHAR(60)       NULL,       -- drug class, for cross-reaction
  PRIMARY KEY (allergen_id),
  UNIQUE KEY uq_allergen_name (name)
) ENGINE = InnoDB;

-- Coded, not free text, for one reason: the prescribing check needs to fire
-- when the allergy says Penicillin and the drug is Amoxicillin. Two strings
-- cannot do that; two catalogue rows sharing a class can.
CREATE TABLE patient_allergy (
  patient_id                  INT UNSIGNED      NOT NULL,
  allergen_id                 SMALLINT UNSIGNED NOT NULL,
  severity                    ENUM('Mild','Moderate','Severe') NOT NULL,
  note                        VARCHAR(200)      NULL,
  first_recorded_encounter_id INT UNSIGNED      NULL,
  recorded_at                 DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (patient_id, allergen_id),
  KEY ix_pa_allergen (allergen_id),
  KEY ix_pa_encounter (first_recorded_encounter_id),
  CONSTRAINT fk_pa_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_allergen FOREIGN KEY (allergen_id)
    REFERENCES allergen (allergen_id) ON DELETE RESTRICT,
  CONSTRAINT fk_pa_encounter FOREIGN KEY (first_recorded_encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE SET NULL
) ENGINE = InnoDB;


-- =====================================================================
-- 6. SCHEDULING AND APPOINTMENTS                    (er-design.md §4.4)
--
-- There is deliberately no `slot` table. Availability is
--   schedule − leave − booked appointments
-- computed by a recursive CTE at read time. Materialising slots would be
-- ~27,000 mostly-empty rows that go stale whenever a schedule changes.
-- =====================================================================

CREATE TABLE doctor_schedule (
  schedule_id   MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  posting_id    MEDIUMINT UNSIGNED NOT NULL,
  weekday       TINYINT UNSIGNED   NOT NULL,   -- 0 = Sunday .. 6 = Saturday
  start_time    TIME               NOT NULL,
  end_time      TIME               NOT NULL,
  slot_minutes  TINYINT UNSIGNED   NOT NULL DEFAULT 20,
  valid_from    DATE               NOT NULL,
  valid_to      DATE               NULL,       -- NULL = still running
  PRIMARY KEY (schedule_id),
  KEY ix_schedule_posting (posting_id, weekday),
  CONSTRAINT fk_schedule_posting FOREIGN KEY (posting_id)
    REFERENCES doctor_posting (posting_id) ON DELETE CASCADE,
  CONSTRAINT ck_schedule_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT ck_schedule_times CHECK (end_time > start_time),
  CONSTRAINT ck_schedule_slot CHECK (slot_minutes BETWEEN 5 AND 120),
  CONSTRAINT ck_schedule_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
) ENGINE = InnoDB;

-- Hangs off doctor_id, not posting_id: a doctor on leave is away from every
-- hospital they practise at, not from one of them.
CREATE TABLE doctor_leave (
  leave_id   MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doctor_id  SMALLINT UNSIGNED  NOT NULL,
  from_at    DATETIME           NOT NULL,
  to_at      DATETIME           NOT NULL,
  reason     VARCHAR(120)       NULL,
  PRIMARY KEY (leave_id),
  KEY ix_leave_doctor (doctor_id, from_at, to_at),
  CONSTRAINT fk_leave_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctor (doctor_id) ON DELETE CASCADE,
  CONSTRAINT ck_leave_dates CHECK (to_at > from_at)
) ENGINE = InnoDB;

CREATE TABLE appointment (
  appointment_id INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  posting_id     MEDIUMINT UNSIGNED NOT NULL,

  -- Denormalized on purpose, and the only such column in the schema apart
  -- from bed.status. uq_doctor_slot below has to be on the DOCTOR: a
  -- consultant with a government post and a private chamber must not be
  -- bookable at 09:00 in both, and no human is in two hospitals at once.
  -- A UNIQUE index cannot span a join, so doctor_id lives here, held
  -- correct by the composite FK to doctor_posting. er-design.md §4.4.
  doctor_id      SMALLINT UNSIGNED  NOT NULL,

  patient_id     INT UNSIGNED       NOT NULL,
  slot_start     DATETIME           NOT NULL,
  slot_end       DATETIME           NOT NULL,
  status         ENUM('booked','attended','cancelled','no_show')
                                    NOT NULL DEFAULT 'booked',
  booked_by      INT UNSIGNED       NOT NULL,
  booked_at      DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  encounter_id   INT UNSIGNED       NULL,   -- NULL until the patient attends
  cancelled_by   INT UNSIGNED       NULL,   -- checklist I11: who, and when
  cancelled_at   DATETIME           NULL,

  -- slot_start for a live booking, NULL for a cancelled one. Computed by
  -- MySQL from the two columns above; nothing ever writes it.
  active_slot    DATETIME GENERATED ALWAYS AS
                   (CASE WHEN status <> 'cancelled' THEN slot_start END) VIRTUAL,

  PRIMARY KEY (appointment_id),

  -- Decision 4. Two patients cannot take one slot, and the database says so
  -- rather than the application hoping so.
  --
  -- On active_slot, not slot_start: a UNIQUE on slot_start would count
  -- cancelled rows too, and a slot somebody cancelled could never be booked
  -- again. A cancelled row's active_slot is NULL, and NULLs never collide in
  -- a unique index — the same reason patient.nid can be NULL for many
  -- patients. (The first version of this file had UNIQUE(doctor_id,
  -- slot_start); writing book_appointment() exposed the problem.)
  UNIQUE KEY uq_doctor_slot (doctor_id, active_slot),
  KEY ix_appointment_doctor_time (doctor_id, slot_start),

  UNIQUE KEY uq_appointment_encounter (encounter_id),
  KEY ix_appointment_patient (patient_id, slot_start DESC),
  KEY ix_appointment_posting (posting_id, slot_start),
  KEY ix_appointment_booked_by (booked_by),
  KEY ix_appointment_cancelled_by (cancelled_by),
  CONSTRAINT fk_appointment_posting FOREIGN KEY (posting_id, doctor_id)
    REFERENCES doctor_posting (posting_id, doctor_id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_booked_by FOREIGN KEY (booked_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE SET NULL,
  CONSTRAINT fk_appointment_cancelled_by FOREIGN KEY (cancelled_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_appointment_slot CHECK (slot_end > slot_start),
  -- The status and the two columns tell one story.
  CONSTRAINT ck_appointment_cancelled CHECK (
    (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_by IS NULL AND cancelled_at IS NULL)
  )
) ENGINE = InnoDB;


-- =====================================================================
-- 7. WARDS, BEDS AND ADMISSION                      (er-design.md §4.4)
-- =====================================================================

CREATE TABLE ward_type (
  ward_type_id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(20)      NOT NULL,   -- General, ICU, Paeds, Isolation
  label        VARCHAR(40)      NOT NULL,
  PRIMARY KEY (ward_type_id),
  UNIQUE KEY uq_ward_type_code (code)
) ENGINE = InnoDB;

CREATE TABLE ward (
  ward_id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hospital_id     SMALLINT UNSIGNED NOT NULL,
  name            VARCHAR(80)       NOT NULL,
  ward_type_id    TINYINT UNSIGNED  NOT NULL,
  sex_restriction ENUM('Male','Female') NULL,   -- NULL = mixed
  PRIMARY KEY (ward_id),
  UNIQUE KEY uq_ward_name (hospital_id, name),
  KEY ix_ward_type (ward_type_id),
  CONSTRAINT fk_ward_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE CASCADE,
  CONSTRAINT fk_ward_type FOREIGN KEY (ward_type_id)
    REFERENCES ward_type (ward_type_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE bed_status (
  status_id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code      VARCHAR(20)      NOT NULL,   -- free, occupied, reserved, cleaning
  label     VARCHAR(30)      NOT NULL,
  PRIMARY KEY (status_id),
  UNIQUE KEY uq_bed_status_code (code)
) ENGINE = InnoDB;

-- Weak entity: "GM-04" means nothing nationally, so the identity is
-- (ward_id, bed_no) rather than a surrogate. er-design.md §6.1.
--
-- status_id is a DERIVED attribute stored for speed — the bed board reads it
-- for every bed on every render, and deriving it would join the whole
-- occupancy history. It is maintained by a trigger on bed_occupancy and
-- application code must NEVER write it. That is what makes the redundancy
-- safe. er-design.md §4.4.
CREATE TABLE bed (
  ward_id           SMALLINT UNSIGNED NOT NULL,
  bed_no            VARCHAR(12)       NOT NULL,   -- 'GM-04', 'ICU-02'
  status_id         TINYINT UNSIGNED  NOT NULL,
  is_out_of_service BOOLEAN           NOT NULL DEFAULT FALSE,
  PRIMARY KEY (ward_id, bed_no),
  KEY ix_bed_status (status_id),
  CONSTRAINT fk_bed_ward FOREIGN KEY (ward_id)
    REFERENCES ward (ward_id) ON DELETE CASCADE,
  CONSTRAINT fk_bed_status FOREIGN KEY (status_id)
    REFERENCES bed_status (status_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

-- No bed_id here. A stay can move between beds, and one bed_id on the
-- admission would erase where the patient was yesterday. The bed history is
-- in bed_occupancy. Receptionist admits, doctor discharges — a
-- role_permission difference, not two tables. er-design.md §4.4.
CREATE TABLE admission (
  admission_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  encounter_id      INT UNSIGNED NOT NULL,
  admitted_at       DATETIME     NOT NULL,
  admitted_by       INT UNSIGNED NOT NULL,
  discharged_at     DATETIME     NULL,   -- NULL IS the definition of a
  discharged_by     INT UNSIGNED NULL,   -- current inpatient
  discharge_summary TEXT         NULL,
  outcome           ENUM('recovered','improved','referred','absconded','died') NULL,
  PRIMARY KEY (admission_id),
  UNIQUE KEY uq_admission_encounter (encounter_id),
  KEY ix_admission_by (admitted_by),
  KEY ix_admission_disch_by (discharged_by),
  KEY ix_admission_open (discharged_at),
  CONSTRAINT fk_admission_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE RESTRICT,
  CONSTRAINT fk_admission_by FOREIGN KEY (admitted_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_admission_disch_by FOREIGN KEY (discharged_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_admission_dates CHECK (
    discharged_at IS NULL OR discharged_at >= admitted_at
  ),
  CONSTRAINT ck_admission_discharge CHECK (
    (discharged_at IS NULL AND discharged_by IS NULL)
    OR (discharged_at IS NOT NULL AND discharged_by IS NOT NULL)
  )
) ENGINE = InnoDB;

-- Admit, transfer and discharge are all the same operation on this table:
--   admit     insert a row with to_at = NULL
--   transfer  close the open row, insert a new open row
--   discharge close the open row
-- Exactly one row per admission has to_at IS NULL at any moment. That
-- invariant cannot be expressed as a constraint here — see the deferred
-- list at the foot of this file.
CREATE TABLE bed_occupancy (
  occupancy_id INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  admission_id INT UNSIGNED      NOT NULL,
  ward_id      SMALLINT UNSIGNED NOT NULL,
  bed_no       VARCHAR(12)       NOT NULL,
  from_at      DATETIME          NOT NULL,
  to_at        DATETIME          NULL,   -- NULL = currently in this bed
  PRIMARY KEY (occupancy_id),
  UNIQUE KEY uq_occupancy_start (admission_id, from_at),
  KEY ix_occupancy_bed (ward_id, bed_no, from_at),
  KEY ix_occupancy_open (admission_id, to_at),
  CONSTRAINT fk_occupancy_admission FOREIGN KEY (admission_id)
    REFERENCES admission (admission_id) ON DELETE CASCADE,
  CONSTRAINT fk_occupancy_bed FOREIGN KEY (ward_id, bed_no)
    REFERENCES bed (ward_id, bed_no) ON DELETE RESTRICT,
  CONSTRAINT ck_occupancy_dates CHECK (to_at IS NULL OR to_at > from_at)
) ENGINE = InnoDB;


-- =====================================================================
-- 8. AUDIT                                          (er-design.md §4.5)
-- =====================================================================

-- Append-only: no UPDATE, no DELETE, and the application's database user is
-- granted INSERT and SELECT only.
--
-- `basis` is what makes this table mean anything. A log that records only who
-- read what cannot tell care apart from snooping; one that records under what
-- AUTHORITY can. That is also what makes break-glass acceptable rather than a
-- loophole: it is allowed, it is flagged, and reviewed_by IS NULL is a work
-- queue.
--
-- MySQL has no SELECT trigger, so "a trigger logs every read" cannot be
-- literally true. Clinical reads go through a stored procedure that inserts
-- here and then returns rows, and the app user is granted EXECUTE on that
-- procedure rather than SELECT on the clinical tables. er-design.md §4.5.
CREATE TABLE access_log (
  log_id        BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  patient_id    INT UNSIGNED      NOT NULL,
  account_id    INT UNSIGNED      NOT NULL,
  hospital_id   SMALLINT UNSIGNED NULL,   -- NULL when a patient reads their own
  encounter_id  INT UNSIGNED      NULL,
  action        VARCHAR(40)       NOT NULL,   -- 'record.read', 'search.match'
  basis         ENUM('own_record','treating','consent','break_glass',
                     'demographics_only') NOT NULL,
  is_break_glass BOOLEAN          NOT NULL DEFAULT FALSE,
  justification VARCHAR(300)      NULL,   -- required when break-glass
  at            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address    VARCHAR(45)       NULL,   -- 45 = longest IPv6 text form
  reviewed_by   INT UNSIGNED      NULL,
  reviewed_at   DATETIME          NULL,
  -- Checklist I11: a review is a judgement, not a tick. 'not_justified'
  -- must say why — that note is what a disciplinary process would read.
  review_verdict ENUM('justified','not_justified') NULL,
  review_note   VARCHAR(300)      NULL,
  PRIMARY KEY (log_id),

  -- The access log on the patient record screen, newest first.
  KEY ix_log_patient (patient_id, at DESC),
  KEY ix_log_account (account_id, at DESC),

  -- The break-glass review queue.
  KEY ix_log_unreviewed (is_break_glass, reviewed_by),
  KEY ix_log_hospital (hospital_id),
  KEY ix_log_encounter (encounter_id),
  KEY ix_log_reviewed_by (reviewed_by),
  CONSTRAINT fk_log_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_log_account FOREIGN KEY (account_id)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_log_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_log_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE RESTRICT,
  CONSTRAINT fk_log_reviewed_by FOREIGN KEY (reviewed_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,

  -- Break-glass without a stated reason is not break-glass, it is snooping
  -- with extra steps.
  CONSTRAINT ck_log_break_glass CHECK (
    (is_break_glass = FALSE) OR (justification IS NOT NULL)
  ),
  CONSTRAINT ck_log_verdict CHECK (
    (reviewed_by IS NULL AND review_verdict IS NULL AND review_note IS NULL)
    OR (reviewed_by IS NOT NULL AND review_verdict IS NOT NULL
        AND (review_verdict = 'justified' OR review_note IS NOT NULL))
  ),
  CONSTRAINT ck_log_basis_flag CHECK (
    (basis = 'break_glass') = (is_break_glass = TRUE)
  ),
  CONSTRAINT ck_log_review CHECK (
    (reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
) ENGINE = InnoDB;


-- =====================================================================
-- 9. PHASE 2 — LABS, VITALS, REFERRAL, CONSENT, MERGE
--                                         (er-design.md §4.3, §4.5, §7)
-- =====================================================================

-- The UHID serial counter. One row per year. register_patient() takes this
-- row with SELECT ... FOR UPDATE, so two receptionists registering at the
-- same instant queue on it and can never be handed the same serial.
-- Why not MAX(serial) + 1 over patient? Because that reads a range of an
-- index other sessions are inserting into; the counter is one row, one lock.
CREATE TABLE uhid_sequence (
  year         SMALLINT UNSIGNED  NOT NULL,
  last_serial  MEDIUMINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (year),
  -- Five digits in the format: 99,999 registrations per year, nationally.
  -- A real national system would need a wider serial; the format is the
  -- project's, and this CHECK turns its limit into an error, not a wrap.
  CONSTRAINT ck_sequence_serial CHECK (last_serial <= 99999),
  CONSTRAINT ck_sequence_year   CHECK (year BETWEEN 2000 AND 2099)
) ENGINE = InnoDB;

-- Weak entity: a blood pressure is meaningless without the visit it was
-- taken at, so the identity is (encounter_id, recorded_at). er-design.md §6.1.
CREATE TABLE encounter_vitals (
  encounter_id  INT UNSIGNED      NOT NULL,
  recorded_at   DATETIME          NOT NULL,
  bp_systolic   SMALLINT UNSIGNED NULL,
  bp_diastolic  SMALLINT UNSIGNED NULL,
  pulse         SMALLINT UNSIGNED NULL,
  temp_c        DECIMAL(4,1)      NULL,
  spo2          TINYINT UNSIGNED  NULL,
  weight_kg     DECIMAL(5,1)      NULL,
  height_cm     DECIMAL(4,1)      NULL,
  recorded_by   INT UNSIGNED      NOT NULL,
  PRIMARY KEY (encounter_id, recorded_at),
  KEY ix_vitals_by (recorded_by),
  CONSTRAINT fk_vitals_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE CASCADE,
  CONSTRAINT fk_vitals_by FOREIGN KEY (recorded_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  -- Plausibility, not diagnosis: wide enough for any living patient, narrow
  -- enough to catch a value typed into the wrong box.
  -- Both readings or neither (stress test H2.12): with one NULL, the second
  -- branch alone would be UNKNOWN, which a CHECK lets through.
  CONSTRAINT ck_vitals_bp CHECK (
    (bp_systolic IS NULL AND bp_diastolic IS NULL)
    OR (bp_systolic IS NOT NULL AND bp_diastolic IS NOT NULL
        AND bp_systolic BETWEEN 40 AND 300 AND bp_diastolic BETWEEN 20 AND 200
        AND bp_systolic > bp_diastolic)
  ),
  CONSTRAINT ck_vitals_pulse  CHECK (pulse     IS NULL OR pulse     BETWEEN 20 AND 250),
  CONSTRAINT ck_vitals_temp   CHECK (temp_c    IS NULL OR temp_c    BETWEEN 30.0 AND 45.0),
  CONSTRAINT ck_vitals_spo2   CHECK (spo2      IS NULL OR spo2      BETWEEN 50 AND 100),
  CONSTRAINT ck_vitals_weight CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0.3 AND 350),
  CONSTRAINT ck_vitals_height CHECK (height_cm IS NULL OR height_cm BETWEEN 20 AND 250)
) ENGINE = InnoDB;

CREATE TABLE lab_test (
  test_id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(80)       NOT NULL,   -- 'Haemoglobin', 'Serum creatinine'
  specimen  VARCHAR(30)       NOT NULL,   -- 'Blood', 'Urine'
  unit      VARCHAR(20)       NULL,       -- 'g/dL'; NULL for a text result
  ref_low   DECIMAL(10,2)     NULL,
  ref_high  DECIMAL(10,2)     NULL,
  PRIMARY KEY (test_id),
  UNIQUE KEY uq_lab_test_name (name),
  CONSTRAINT ck_lab_test_range CHECK (
    ref_low IS NULL OR ref_high IS NULL OR ref_high >= ref_low
  )
) ENGINE = InnoDB;

CREATE TABLE lab_order (
  order_id     INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  encounter_id INT UNSIGNED      NOT NULL,
  test_id      SMALLINT UNSIGNED NOT NULL,
  ordered_by   INT UNSIGNED      NOT NULL,
  ordered_at   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status       ENUM('ordered','collected','reported','cancelled')
                                 NOT NULL DEFAULT 'ordered',
  -- Checklist I13: ordered → collected (a sample was taken) → reported.
  collected_by INT UNSIGNED      NULL,
  collected_at DATETIME          NULL,
  PRIMARY KEY (order_id),
  KEY ix_lab_order_collected_by (collected_by),
  KEY ix_lab_order_encounter (encounter_id),
  KEY ix_lab_order_test (test_id),
  KEY ix_lab_order_status (status),
  KEY ix_lab_order_by (ordered_by),
  CONSTRAINT fk_lab_order_encounter FOREIGN KEY (encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_order_test FOREIGN KEY (test_id)
    REFERENCES lab_test (test_id) ON DELETE RESTRICT,
  CONSTRAINT fk_lab_order_by FOREIGN KEY (ordered_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_lab_order_collected_by FOREIGN KEY (collected_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_lab_order_collected CHECK ((collected_by IS NULL) = (collected_at IS NULL))
) ENGINE = InnoDB;

-- 1 : 1 optional with lab_order. order_id is both the primary key and the
-- foreign key, which is how "at most one result per order" is enforced.
CREATE TABLE lab_result (
  order_id     INT UNSIGNED  NOT NULL,
  value_num    DECIMAL(10,2) NULL,
  value_text   VARCHAR(200)  NULL,
  is_abnormal  BOOLEAN       NOT NULL DEFAULT FALSE,
  reported_by  INT UNSIGNED  NOT NULL,
  reported_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY ix_lab_result_by (reported_by),
  CONSTRAINT fk_lab_result_order FOREIGN KEY (order_id)
    REFERENCES lab_order (order_id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_result_by FOREIGN KEY (reported_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_lab_result_value CHECK (value_num IS NOT NULL OR value_text IS NOT NULL)
) ENGINE = InnoDB;

-- Decision 6. to_encounter_id is NULL until the patient arrives at Hospital
-- B, and that null is the whole mechanism: it is the difference between
-- "referred" and "arrived", and "referred to us but never came" becomes a
-- WHERE clause instead of a phone call. er-design.md §4.5.
CREATE TABLE referral (
  referral_id       INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  patient_id        INT UNSIGNED      NOT NULL,
  from_hospital_id  SMALLINT UNSIGNED NOT NULL,
  to_hospital_id    SMALLINT UNSIGNED NOT NULL,
  to_department_id  SMALLINT UNSIGNED NULL,   -- NULL = "whichever is right"
  from_encounter_id INT UNSIGNED      NOT NULL,
  to_encounter_id   INT UNSIGNED      NULL,
  reason            VARCHAR(300)      NOT NULL,
  urgency           ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
  referred_by       INT UNSIGNED      NOT NULL,
  referred_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status            ENUM('issued','arrived','completed','expired')
                                      NOT NULL DEFAULT 'issued',
  -- Checklist I11: did the patient agree to the receiving hospital reading
  -- their record? Only then does refer_patient() write the 24-hour consent
  -- grant; without it the referral still travels, the record does not.
  patient_agreed    BOOLEAN           NOT NULL DEFAULT FALSE,
  PRIMARY KEY (referral_id),
  UNIQUE KEY uq_referral_to_encounter (to_encounter_id),
  KEY ix_referral_patient (patient_id, referred_at DESC),
  KEY ix_referral_inbox (to_hospital_id, status),
  KEY ix_referral_from_hospital (from_hospital_id),
  KEY ix_referral_department (to_department_id),
  KEY ix_referral_from_encounter (from_encounter_id),
  KEY ix_referral_by (referred_by),
  CONSTRAINT fk_referral_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_from_hospital FOREIGN KEY (from_hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_to_hospital FOREIGN KEY (to_hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_department FOREIGN KEY (to_department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_from_encounter FOREIGN KEY (from_encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_to_encounter FOREIGN KEY (to_encounter_id)
    REFERENCES encounter (encounter_id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_by FOREIGN KEY (referred_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  -- Sending a patient to the hospital they are already in is a ward
  -- transfer, not a referral.
  CONSTRAINT ck_referral_hospitals CHECK (from_hospital_id <> to_hospital_id),
  -- The status and the null must tell the same story.
  CONSTRAINT ck_referral_arrival CHECK (
    (status IN ('issued','expired')     AND to_encounter_id IS NULL)
    OR (status IN ('arrived','completed') AND to_encounter_id IS NOT NULL)
  )
) ENGINE = InnoDB;

-- Decision 2, and §8 decision 5: a grant lasts 24 hours unless stated
-- otherwise. The default is an expression over granted_at, so "24 hours" is
-- written once, here, not in every INSERT. A long inpatient stay does not
-- need re-consent — it reads under basis = 'treating'. er-design.md §4.5.
CREATE TABLE consent_grant (
  grant_id        INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  patient_id      INT UNSIGNED      NOT NULL,
  to_hospital_id  SMALLINT UNSIGNED NOT NULL,
  to_doctor_id    SMALLINT UNSIGNED NULL,   -- NULL = anyone at that hospital
  scope           ENUM('demographics','clinical','full') NOT NULL DEFAULT 'clinical',
  granted_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME          NOT NULL DEFAULT (granted_at + INTERVAL 24 HOUR),
  revoked_at      DATETIME          NULL,
  granted_via     ENUM('in_person','otp','referral') NOT NULL,
  referral_id     INT UNSIGNED      NULL,     -- set exactly when granted_via = 'referral'
  PRIMARY KEY (grant_id),
  -- "Is there a live grant for this patient at this hospital?" — asked by
  -- get_patient_record() on every read.
  KEY ix_grant_lookup (patient_id, to_hospital_id, expires_at),
  KEY ix_grant_hospital (to_hospital_id),
  KEY ix_grant_doctor (to_doctor_id),
  KEY ix_grant_referral (referral_id),
  CONSTRAINT fk_grant_patient FOREIGN KEY (patient_id)
    REFERENCES patient (patient_id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_hospital FOREIGN KEY (to_hospital_id)
    REFERENCES hospital (hospital_id) ON DELETE RESTRICT,
  CONSTRAINT fk_grant_doctor FOREIGN KEY (to_doctor_id)
    REFERENCES doctor (doctor_id) ON DELETE RESTRICT,
  CONSTRAINT fk_grant_referral FOREIGN KEY (referral_id)
    REFERENCES referral (referral_id) ON DELETE RESTRICT,
  CONSTRAINT ck_grant_window  CHECK (expires_at > granted_at),
  CONSTRAINT ck_grant_revoked CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CONSTRAINT ck_grant_via     CHECK ((granted_via = 'referral') = (referral_id IS NOT NULL))
) ENGINE = InnoDB;

-- Decision 1's admission that prevention sometimes arrives too late. The
-- losing patient row is NOT deleted: its UHID stays resolvable, so a patient
-- holding the old card is still found. merge_patients() repoints the child
-- rows and this table records that it happened. UNIQUE on losing_patient_id:
-- a record can only be merged away once.
CREATE TABLE patient_merge (
  merge_id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  losing_patient_id    INT UNSIGNED NOT NULL,
  surviving_patient_id INT UNSIGNED NOT NULL,
  merged_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  merged_by            INT UNSIGNED NOT NULL,
  reason               VARCHAR(300) NOT NULL,
  PRIMARY KEY (merge_id),
  UNIQUE KEY uq_merge_losing (losing_patient_id),
  KEY ix_merge_surviving (surviving_patient_id),
  KEY ix_merge_by (merged_by),
  CONSTRAINT fk_merge_losing FOREIGN KEY (losing_patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_merge_surviving FOREIGN KEY (surviving_patient_id)
    REFERENCES patient (patient_id) ON DELETE RESTRICT,
  CONSTRAINT fk_merge_by FOREIGN KEY (merged_by)
    REFERENCES user_account (account_id) ON DELETE RESTRICT,
  CONSTRAINT ck_merge_distinct CHECK (losing_patient_id <> surviving_patient_id)
) ENGINE = InnoDB;


-- =====================================================================
-- 10. WEB SESSIONS — checklist I6, 7 November 2026
--
-- A signed-in session used to live in the web server's memory, so a
-- restart signed everybody out. It lives here now, read and written only
-- through the session_* procedures.
--
-- sid_hash is the SHA-256 of the cookie's session id, never the id itself:
-- someone who can read this table still cannot sign in as anyone. The
-- account_id is copied out of the data so that switching an account off,
-- or resetting its password, can end its sessions at once.
-- =====================================================================

CREATE TABLE web_session (
  sid_hash   CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_id INT UNSIGNED NULL,
  data       JSON         NOT NULL,
  expires_at DATETIME     NOT NULL,
  PRIMARY KEY (sid_hash),
  KEY ix_session_account (account_id),
  KEY ix_session_expires (expires_at),
  CONSTRAINT fk_session_account FOREIGN KEY (account_id)
    REFERENCES user_account (account_id) ON DELETE CASCADE,
  CONSTRAINT ck_session_hash CHECK (REGEXP_LIKE(sid_hash, '^[0-9a-f]{64}$', 'c'))
) ENGINE = InnoDB;


-- =====================================================================
-- WHAT A CHECK COULD NOT SAY, AND WHERE IT IS ENFORCED INSTEAD
--
-- These are real constraints in the design that MySQL cannot express as a
-- CHECK, because a CHECK may not contain a subquery or reference another
-- table. They are not optional polish — without them the schema permits
-- states the design forbids.
--
--  1. user_account role consistency (the table in er-design.md §4.2)
--       → trg_user_account_bi / _bu                       triggers.sql
--  2. One open bed_occupancy row per admission
--       → trg_bed_occupancy_bi / _bu                      triggers.sql
--  3. bed.status maintenance — decision 7
--       → trg_bed_occupancy_ai / _au                      triggers.sql
--  4. UHID issue under a lock
--       → register_patient(), via uhid_sequence           procedures.sql
--  5. Transactional booking — decision 4
--       → book_appointment(), SELECT ... FOR UPDATE       procedures.sql
--  6. Only an Inpatient encounter may have an admission
--       → trg_admission_bi                                triggers.sql
--  7. access_log is append-only
--       → trg_access_log_bu / _bd, and grants.sql gives the application
--         user no UPDATE or DELETE on it                  triggers.sql
--
-- And three more that came out of writing those:
--
--  8. encounter.consultation_fee, hospital_id and department_id are copied
--     from the posting, never typed in — decision 1
--       → trg_encounter_bi / _bu                          triggers.sql
--  9. A medicine may not be prescribed against a recorded allergy to it or
--     to its drug class
--       → trg_prescription_item_bi                        triggers.sql
-- 10. A bed can be occupied only if it is free and in service
--       → trg_bed_occupancy_bi                            triggers.sql
-- =====================================================================
