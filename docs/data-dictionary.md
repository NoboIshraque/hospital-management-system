# Data dictionary — UHID National Hospital Management System

Every table and column in `database/schema.sql`: 40 tables, 249 columns, 35 CHECK constraints
and 75 foreign keys.

**`schema.sql` is the authority.** This file was generated from it on 31 October 2026, so the
types, nullability, defaults, keys and constraints below are copied from it rather than retyped.
If the two ever disagree, the schema is right and this file is stale. Change a column in
`schema.sql` and its row here in the same commit.
The *why* behind each table is in `docs/er-design.md`. The rules that need more than a CHECK
constraint are in `database/triggers.sql`, and the foot of `schema.sql` lists which trigger
enforces which rule.

## How to read it

| Column | Meaning |
|---|---|
| **Type** | MySQL 8 type. `UNSIGNED` integers are used for every id, because an id is never negative and the sign bit doubles the range |
| **Null** | `no` = `NOT NULL`. Where `yes` matters, the Notes say what the NULL means |
| **Default** | Value used when an INSERT leaves the column out |
| **Key** | `PK` primary key · `UQ` unique on its own · `UQ (composite)` part of a multi-column unique key · `FK → table.column` foreign key |
| **Notes** | What the column means, where that is not obvious from its name |

Under each table: the remaining indexes, what happens to each foreign key when the parent row
is deleted (`restrict` refuses, `cascade` deletes the child too, `set null` keeps the child and
empties the reference), and the CHECK constraints.

### Conventions used throughout

- **Every id is a surrogate `AUTO_INCREMENT` integer named `<table>_id`**. The exceptions are
  the weak entities `bed`, `prescription_item` and `encounter_vitals`, identified by parent plus
  discriminator (er-design.md §6.1), and the pure link tables, whose key is the pair they join.
- **Timestamps are `DATETIME` and end in `_at`.** Dates of birth and validity periods are `DATE`.
- **Money is `DECIMAL(8,2)`**, in taka. Never `FLOAT`: binary floating point cannot store 0.10 exactly.
- **Character set `utf8mb4`, collation `utf8mb4_0900_ai_ci`**, so Bangla names and `৳` store
  correctly. One exception: `patient.uhid` is `ascii_bin`, which makes its format check
  case-sensitive.
- **Small fixed sets are lookup tables** (`hospital_tier`, `encounter_type`, `ward_type`,
  `bed_status`, `role`). An `ENUM` is used only where the set is fixed by something outside the
  system: sex, blood group, severity, and the status columns that drive the workflows.

## Tables, in the order schema.sql creates them

| Cluster | Tables |
|---|---|
| Geography and institutions | `division` · `district` · `hospital_tier` · `hospital` · `department` |
| Roles and permissions | `role` · `permission` · `role_permission` |
| Doctors | `doctor` · `hospital_department` · `doctor_posting` |
| Patient and login | `patient` · `user_account` |
| Clinical spine | `encounter_type` · `encounter` · `diagnosis` · `encounter_diagnosis` · `medicine` · `prescription` · `prescription_item` · `allergen` · `patient_allergy` |
| Scheduling | `doctor_schedule` · `doctor_leave` · `appointment` |
| Wards and beds | `ward_type` · `ward` · `bed_status` · `bed` · `admission` · `bed_occupancy` |
| Audit | `access_log` |
| Phase 2 | `uhid_sequence` · `encounter_vitals` · `lab_test` · `lab_order` · `lab_result` · `referral` · `consent_grant` · `patient_merge` |

---

### `division`

The 8 administrative divisions of Bangladesh. Lookup.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `division_id` | TINYINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(40) | no |  | UQ |  |


### `district`

The 64 districts, each in one division. Geography stops here (er-design.md §8, decision 4).

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `district_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `division_id` | TINYINT UNSIGNED | no |  | FK → division.division_id |  |
| `name` | VARCHAR(60) | no |  | UQ |  |

**Indexes:** Index `ix_district_division` (division_id)

**On delete:** `division_id` → restrict


### `hospital_tier`

Medical College · District · Upazila · Specialised · Private. A lookup table rather than an ENUM so it can be a foreign-key target and grow by INSERT.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `tier_id` | TINYINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(30) | no |  | UQ |  |


### `hospital`

A connected facility.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `hospital_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(120) | no |  |  |  |
| `district_id` | SMALLINT UNSIGNED | no |  | FK → district.district_id |  |
| `tier_id` | TINYINT UNSIGNED | no |  | FK → hospital_tier.tier_id |  |
| `address` | VARCHAR(200) | yes |  |  |  |
| `phone` | VARCHAR(20) | yes |  |  |  |
| `is_active` | BOOLEAN | no | `TRUE` |  | FALSE hides the hospital from directories without deleting its history. |
| `created_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |

**Indexes:** Index `ix_hospital_district` (district_id) · Index `ix_hospital_tier` (tier_id) · Index `ix_hospital_name` (name)

**On delete:** `district_id` → restrict · `tier_id` → restrict


### `department`

The national catalogue of specialities. "Cardiology" exists once, so "Cardiology anywhere" is an equality join, not a LIKE.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `department_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(60) | no |  | UQ |  |


### `role`

The six roles. Permissions hang off the role, never off an individual account.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `role_id` | TINYINT UNSIGNED | no | `auto-increment` | PK |  |
| `code` | VARCHAR(30) | no |  | UQ | patient, receptionist, doctor, |
| `label` | VARCHAR(40) | no |  |  | hospital_admin, system_admin, |


### `permission`

One capability, e.g. `bed.admit`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `permission_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `code` | VARCHAR(60) | no |  | UQ | e.g. 'bed.admit', 'bed.discharge' |
| `description` | VARCHAR(160) | no |  |  |  |


### `role_permission`

Which role may do what. Many-to-many between `role` and `permission`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `role_id` | TINYINT UNSIGNED | no |  | PK, FK → role.role_id |  |
| `permission_id` | SMALLINT UNSIGNED | no |  | PK, FK → permission.permission_id |  |

**Indexes:** Index `ix_rp_permission` (permission_id)

**On delete:** `role_id` → cascade · `permission_id` → cascade


### `doctor`

A registered practitioner, identified nationally by BMDC registration.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `doctor_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(100) | no |  |  |  |
| `bmdc_reg` | VARCHAR(20) | no |  | UQ | Bangladesh Medical and Dental Council registration number — the national identity of a doctor. |
| `qualifications` | VARCHAR(200) | no |  |  | Display text, deliberately not decomposed (normalization.md, §5). |
| `is_active` | BOOLEAN | no | `TRUE` |  |  |

**Indexes:** Index `ix_doctor_name` (name)


### `hospital_department`

Which hospital offers which speciality: many-to-many between `hospital` and `department`, with its own attributes.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `hospital_id` | SMALLINT UNSIGNED | no |  | PK, FK → hospital.hospital_id |  |
| `department_id` | SMALLINT UNSIGNED | no |  | PK, FK → department.department_id |  |
| `head_doctor_id` | SMALLINT UNSIGNED | yes |  | FK → doctor.doctor_id | Head of the speciality at this hospital; NULL if none is named. |
| `opd_room` | VARCHAR(20) | yes |  |  |  |

**Indexes:** Index `ix_hd_department` (department_id) · Index `ix_hd_head` (head_doctor_id)

**On delete:** `hospital_id` → cascade · `department_id` → restrict · `head_doctor_id` → set null


### `doctor_posting`

This doctor, at this hospital, in this speciality, for this fee, over these dates. An associative entity — a doctor with two practices has two postings. Every appointment and encounter references a posting.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `posting_id` | MEDIUMINT UNSIGNED | no | `auto-increment` | PK, UQ (composite) |  |
| `doctor_id` | SMALLINT UNSIGNED | no |  | UQ (composite), FK → doctor.doctor_id |  |
| `hospital_id` | SMALLINT UNSIGNED | no |  | UQ (composite), FK → hospital.hospital_id |  |
| `department_id` | SMALLINT UNSIGNED | no |  | UQ (composite), FK → department.department_id |  |
| `consultation_fee` | DECIMAL(8,2) | no |  |  | Fee in taka for this posting. Copied onto each encounter when it is created. |
| `valid_from` | DATE | no |  | UQ (composite) |  |
| `valid_to` | DATE | yes |  |  | NULL = current posting. |

**Indexes:** Unique `uq_posting_doctor` (posting_id, doctor_id) · Unique `uq_posting_unique` (doctor_id, hospital_id, department_id, valid_from) · Index `ix_posting_hospital` (hospital_id) · Index `ix_posting_department` (department_id)

**On delete:** `doctor_id` → restrict · `hospital_id` → restrict · `department_id` → restrict

**Checks:**

- `ck_posting_dates` — `valid_to IS NULL OR valid_to >= valid_from`
- `ck_posting_fee` — `consultation_fee >= 0`


### `patient`

A human with a UHID. The natural key `uhid` is UNIQUE; the surrogate `patient_id` is what other tables reference (er-design.md §4.2).

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `patient_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `uhid` | CHAR(15) CHARACTER SET ascii COLLATE ascii_bin | no |  | UQ | `BD-<year>-<serial>-<check>`. Binary collation, so the format CHECK is case-sensitive. |
| `name` | VARCHAR(100) | no |  |  |  |
| `dob` | DATE | no |  |  |  |
| `sex` | ENUM('Male','Female','Other') | no |  |  |  |
| `blood_group` | ENUM('Unknown','A+','A-','B+','B-','AB+','AB-','O+','O-') | no | `'Unknown'` |  |  |
| `phone` | VARCHAR(20) | yes |  |  |  |
| `nid` | VARCHAR(17) | yes |  | UQ | National ID or birth registration number. NULL, never '' (trg_patient_bi converts). |
| `district_id` | SMALLINT UNSIGNED | yes |  | FK → district.district_id |  |
| `address` | VARCHAR(200) | yes |  |  |  |
| `kin_name` | VARCHAR(100) | yes |  |  |  |
| `kin_relation` | VARCHAR(30) | yes |  |  |  |
| `kin_phone` | VARCHAR(20) | yes |  |  |  |
| `registered_at` | DATE | no |  |  |  |
| `registered_hospital_id` | SMALLINT UNSIGNED | no |  | FK → hospital.hospital_id | Where the UHID was issued. |
| `identity_verified` | BOOLEAN | no | `FALSE` |  | TRUE once the NID has been checked by `verified_by`. |
| `verified_by` | INT UNSIGNED | yes |  | FK → user_account.account_id |  |
| `verified_at` | DATETIME | yes |  |  |  |
| `created_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |

**Indexes:** Index `ix_patient_name_dob` (name, dob) · Index `ix_patient_phone` (phone) · Index `ix_patient_district` (district_id) · Index `ix_patient_reg_hospital` (registered_hospital_id) · Index `ix_patient_verified_by` (verified_by)

**On delete:** `district_id` → restrict · `registered_hospital_id` → restrict · `verified_by` → restrict

**Checks:**

- `ck_patient_uhid_format` — `REGEXP_LIKE(uhid, '^BD-[0-9]{4}-[0-9]{5}-[0-9]$')`
- `ck_patient_uhid_check_digit` — `( CAST(SUBSTRING(uhid, 9, 1) AS UNSIGNED) + CAST(SUBSTRING(uhid, 10, 1) AS UNSIGNED) + CAST(SUBSTRING(uhid, 11, 1) AS UNSIGNED) + CAST(SUBSTRING(uhid, 12, 1) AS UNSIGNED) + CAST(SUBSTRING(uhid, 13, 1) AS UNSIGNED) ) % 10 = CAST(SUBSTRING(uhid, 15, 1) AS UNSIGNED)`
- `ck_patient_verified` — `(identity_verified = FALSE AND verified_by IS NULL AND verified_at IS NULL) OR (identity_verified = TRUE AND verified_by IS NOT NULL)`


### `user_account`

One login, for any of the six roles. Which of `hospital_id` / `patient_id` / `doctor_id` / `staff_name` is set depends on the role, enforced by `trg_user_account_bi`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `account_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `username` | VARCHAR(40) | no |  | UQ |  |
| `password_hash` | CHAR(60) | no |  |  | bcrypt hash; the password is checked in Node, never in SQL or the browser. bcrypt, verified on the SERVER |
| `staff_name` | VARCHAR(100) | yes |  |  | Name for roles that have no patient or doctor row. |
| `role_id` | TINYINT UNSIGNED | no |  | FK → role.role_id |  |
| `hospital_id` | SMALLINT UNSIGNED | yes |  | FK → hospital.hospital_id | The hospital a staff member or doctor works at. NULL for patients and the system admin. |
| `patient_id` | INT UNSIGNED | yes |  | UQ, FK → patient.patient_id | Set only for a patient account. UNIQUE: one login per patient. |
| `doctor_id` | SMALLINT UNSIGNED | yes |  | UQ, FK → doctor.doctor_id | Set only for a doctor account. UNIQUE: one login per doctor. |
| `is_active` | BOOLEAN | no | `TRUE` |  |  |
| `last_login_at` | DATETIME | yes |  |  |  |
| `created_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |

**Indexes:** Index `ix_account_role` (role_id) · Index `ix_account_hospital` (hospital_id)

**On delete:** `role_id` → restrict · `hospital_id` → restrict · `patient_id` → cascade · `doctor_id` → restrict


### `encounter_type`

OPD · Emergency · Inpatient.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `type_id` | TINYINT UNSIGNED | no | `auto-increment` | PK |  |
| `code` | VARCHAR(20) | no |  | UQ | OPD, Emergency, Inpatient |
| `label` | VARCHAR(30) | no |  |  |  |


### `encounter`

**The clinical hub (decision 5).** One clinical contact. `hospital_id`, `department_id` and `consultation_fee` are copied from the posting by `trg_encounter_bi`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `encounter_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `patient_id` | INT UNSIGNED | no |  | FK → patient.patient_id |  |
| `hospital_id` | SMALLINT UNSIGNED | no |  | FK → hospital.hospital_id | Copied from the posting by trg_encounter_bi. |
| `type_id` | TINYINT UNSIGNED | no |  | FK → encounter_type.type_id |  |
| `posting_id` | MEDIUMINT UNSIGNED | no |  | FK → doctor_posting.posting_id | The doctor-at-hospital this encounter happened under. |
| `department_id` | SMALLINT UNSIGNED | no |  | FK → department.department_id | Copied from the posting by trg_encounter_bi. |
| `consultation_fee` | DECIMAL(8,2) | no |  |  | Snapshot of the posting's fee at creation; never updated (decision 1). |
| `started_at` | DATETIME | no |  |  |  |
| `ended_at` | DATETIME | yes |  |  | NULL = encounter still open. An open encounter is the `treating` access basis. |
| `chief_complaint` | VARCHAR(200) | yes |  |  |  |
| `notes` | TEXT | yes |  |  | Narrative text, never queried. narrative, never queried |
| `created_by` | INT UNSIGNED | no |  | FK → user_account.account_id | The account that opened the encounter. |

**Indexes:** Index `ix_encounter_patient` (patient_id, started_at DESC) · Index `ix_encounter_hospital` (hospital_id, started_at) · Index `ix_encounter_posting` (posting_id) · Index `ix_encounter_type` (type_id) · Index `ix_encounter_department` (department_id) · Index `ix_encounter_created_by` (created_by)

**On delete:** `patient_id` → restrict · `hospital_id` → restrict · `type_id` → restrict · `posting_id` → restrict · `department_id` → restrict · `created_by` → restrict

**Checks:**

- `ck_encounter_dates` — `ended_at IS NULL OR ended_at >= started_at`


### `diagnosis`

Catalogue of ICD-10 codes and terms.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `diagnosis_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `icd10_code` | VARCHAR(10) | no |  | UQ |  |
| `term` | VARCHAR(160) | no |  |  |  |
| `category` | VARCHAR(60) | yes |  |  |  |

**Indexes:** Index `ix_diagnosis_term` (term)


### `encounter_diagnosis`

What was concluded at an encounter. Many-to-many between `encounter` and `diagnosis`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `encounter_id` | INT UNSIGNED | no |  | PK, FK → encounter.encounter_id |  |
| `diagnosis_id` | SMALLINT UNSIGNED | no |  | PK, FK → diagnosis.diagnosis_id |  |
| `is_primary` | BOOLEAN | no | `FALSE` |  | The diagnosis shown as the encounter's headline. |
| `certainty` | ENUM('provisional','confirmed') | no | `'provisional'` |  |  |
| `note` | VARCHAR(200) | yes |  |  |  |

**Indexes:** Index `ix_ed_diagnosis` (diagnosis_id)

**On delete:** `encounter_id` → cascade · `diagnosis_id` → restrict


### `medicine`

Catalogue of medicines by generic name, form and strength. `drug_class` drives the allergy-conflict trigger.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `medicine_id` | MEDIUMINT UNSIGNED | no | `auto-increment` | PK |  |
| `generic_name` | VARCHAR(100) | no |  | UQ (composite) |  |
| `brand_name` | VARCHAR(100) | yes |  |  |  |
| `form` | VARCHAR(30) | no |  | UQ (composite) | tablet, capsule, syrup, cream |
| `strength` | VARCHAR(30) | no |  | UQ (composite) | '5 mg', '500 mg', '1%' |
| `drug_class` | VARCHAR(60) | yes |  |  |  |

**Indexes:** Unique `uq_medicine` (generic_name, form, strength) · Index `ix_medicine_generic` (generic_name) · Index `ix_medicine_class` (drug_class)


### `prescription`

The header of the one prescription an encounter may have (er-design.md §8, decision 2).

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `prescription_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `encounter_id` | INT UNSIGNED | no |  | UQ, FK → encounter.encounter_id | UNIQUE: one prescription per encounter (decision 2). |
| `prescribed_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `prescribed_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `advice` | TEXT | yes |  |  | narrative, never queried |
| `amended_at` | DATETIME | yes |  |  | Set when a line is added after the encounter ended. |
| `amended_by` | INT UNSIGNED | yes |  | FK → user_account.account_id |  |

**Indexes:** Index `ix_prescription_by` (prescribed_by) · Index `ix_prescription_amended_by` (amended_by)

**On delete:** `encounter_id` → cascade · `prescribed_by` → restrict · `amended_by` → restrict

**Checks:**

- `ck_prescription_amend` — `(amended_at IS NULL AND amended_by IS NULL) OR (amended_at IS NOT NULL AND amended_by IS NOT NULL)`


### `prescription_item`

One drug line. A weak entity: identified by its prescription plus a line number.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `prescription_id` | INT UNSIGNED | no |  | PK, FK → prescription.prescription_id |  |
| `line_no` | TINYINT UNSIGNED | no |  | PK | Position on the prescription; with prescription_id, the identity of the line. |
| `medicine_id` | MEDIUMINT UNSIGNED | no |  | FK → medicine.medicine_id |  |
| `dose` | VARCHAR(40) | no |  |  | '1 tablet' |
| `frequency` | VARCHAR(40) | no |  |  | 'at night', 'twice daily' |
| `duration_days` | SMALLINT UNSIGNED | yes |  |  | NULL = continuing medication. |
| `instruction` | VARCHAR(120) | yes |  |  | 'after meals' |

**Indexes:** Index `ix_pi_medicine` (medicine_id)

**On delete:** `prescription_id` → cascade · `medicine_id` → restrict


### `allergen`

Catalogue of substances and drug classes a patient can be allergic to.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `allergen_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(80) | no |  | UQ | 'Penicillin', 'Sulfa drugs' |
| `class` | VARCHAR(60) | yes |  |  | drug class, for cross-reaction |


### `patient_allergy`

A recorded allergy. Many-to-many between `patient` and `allergen`, with severity.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `patient_id` | INT UNSIGNED | no |  | PK, FK → patient.patient_id |  |
| `allergen_id` | SMALLINT UNSIGNED | no |  | PK, FK → allergen.allergen_id |  |
| `severity` | ENUM('Mild','Moderate','Severe') | no |  |  |  |
| `note` | VARCHAR(200) | yes |  |  |  |
| `first_recorded_encounter_id` | INT UNSIGNED | yes |  | FK → encounter.encounter_id | The encounter at which the allergy was first noted, if known. |
| `recorded_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |

**Indexes:** Index `ix_pa_allergen` (allergen_id) · Index `ix_pa_encounter` (first_recorded_encounter_id)

**On delete:** `patient_id` → cascade · `allergen_id` → restrict · `first_recorded_encounter_id` → set null


### `doctor_schedule`

A recurring weekly clinic for a posting. Availability is computed from these rows (decision 3); no slot is ever stored.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `schedule_id` | MEDIUMINT UNSIGNED | no | `auto-increment` | PK |  |
| `posting_id` | MEDIUMINT UNSIGNED | no |  | FK → doctor_posting.posting_id |  |
| `weekday` | TINYINT UNSIGNED | no |  |  | 0 = Sunday … 6 = Saturday. 0 = Sunday .. 6 = Saturday |
| `start_time` | TIME | no |  |  |  |
| `end_time` | TIME | no |  |  |  |
| `slot_minutes` | TINYINT UNSIGNED | no | `20` |  | Length of one bookable slot. |
| `valid_from` | DATE | no |  |  |  |
| `valid_to` | DATE | yes |  |  | NULL = still running |

**Indexes:** Index `ix_schedule_posting` (posting_id, weekday)

**On delete:** `posting_id` → cascade

**Checks:**

- `ck_schedule_weekday` — `weekday BETWEEN 0 AND 6`
- `ck_schedule_times` — `end_time > start_time`
- `ck_schedule_slot` — `slot_minutes BETWEEN 5 AND 120`
- `ck_schedule_dates` — `valid_to IS NULL OR valid_to >= valid_from`


### `doctor_leave`

A period when a doctor is away from every hospital they work at.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `leave_id` | MEDIUMINT UNSIGNED | no | `auto-increment` | PK |  |
| `doctor_id` | SMALLINT UNSIGNED | no |  | FK → doctor.doctor_id |  |
| `from_at` | DATETIME | no |  |  |  |
| `to_at` | DATETIME | no |  |  |  |
| `reason` | VARCHAR(120) | yes |  |  |  |

**Indexes:** Index `ix_leave_doctor` (doctor_id, from_at, to_at)

**On delete:** `doctor_id` → cascade

**Checks:**

- `ck_leave_dates` — `to_at > from_at`


### `appointment`

A booked slot. `UNIQUE(doctor_id, active_slot)` is decision 4's guard against double-booking.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `appointment_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `posting_id` | MEDIUMINT UNSIGNED | no |  | FK → doctor_posting.posting_id |  |
| `doctor_id` | SMALLINT UNSIGNED | no |  | UQ (composite), FK → doctor_posting.doctor_id | Denormalized from the posting so UNIQUE(doctor_id, active_slot) is possible. Held correct by the composite FK. |
| `patient_id` | INT UNSIGNED | no |  | FK → patient.patient_id |  |
| `slot_start` | DATETIME | no |  |  |  |
| `slot_end` | DATETIME | no |  |  |  |
| `status` | ENUM('booked','attended','cancelled','no_show') | no | `'booked'` |  |  |
| `booked_by` | INT UNSIGNED | no |  | FK → user_account.account_id | The account that made the booking (reception, or the patient). |
| `booked_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `encounter_id` | INT UNSIGNED | yes |  | UQ, FK → encounter.encounter_id | NULL until the patient attends |
| `active_slot` | DATETIME | yes |  | UQ (composite) | Generated: `(CASE WHEN status <> 'cancelled' THEN slot_start END) VIRTUAL`.  |

**Indexes:** Unique `uq_doctor_slot` (doctor_id, active_slot) · Index `ix_appointment_doctor_time` (doctor_id, slot_start) · Index `ix_appointment_patient` (patient_id, slot_start DESC) · Index `ix_appointment_posting` (posting_id, slot_start) · Index `ix_appointment_booked_by` (booked_by)

**On delete:** `posting_id, doctor_id` → restrict · `patient_id` → restrict · `booked_by` → restrict · `encounter_id` → set null

**Checks:**

- `ck_appointment_slot` — `slot_end > slot_start`


### `ward_type`

General · ICU · Paeds · Isolation.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `ward_type_id` | TINYINT UNSIGNED | no | `auto-increment` | PK |  |
| `code` | VARCHAR(20) | no |  | UQ | General, ICU, Paeds, Isolation |
| `label` | VARCHAR(40) | no |  |  |  |


### `ward`

A ward in one hospital, optionally restricted to one sex.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `ward_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `hospital_id` | SMALLINT UNSIGNED | no |  | UQ (composite), FK → hospital.hospital_id |  |
| `name` | VARCHAR(80) | no |  | UQ (composite) |  |
| `ward_type_id` | TINYINT UNSIGNED | no |  | FK → ward_type.ward_type_id |  |
| `sex_restriction` | ENUM('Male','Female') | yes |  |  | NULL = mixed ward. Enforced on admission by trg_bed_occupancy_bi. |

**Indexes:** Unique `uq_ward_name` (hospital_id, name) · Index `ix_ward_type` (ward_type_id)

**On delete:** `hospital_id` → cascade · `ward_type_id` → restrict


### `bed_status`

free · occupied · reserved · cleaning.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `status_id` | TINYINT UNSIGNED | no | `auto-increment` | PK |  |
| `code` | VARCHAR(20) | no |  | UQ | free, occupied, reserved, cleaning |
| `label` | VARCHAR(30) | no |  |  |  |


### `bed`

One bed. A weak entity identified by `(ward_id, bed_no)`. `status_id` is written only by triggers (decision 7).

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `ward_id` | SMALLINT UNSIGNED | no |  | PK, FK → ward.ward_id |  |
| `bed_no` | VARCHAR(12) | no |  | PK | 'GM-04', 'ICU-02' |
| `status_id` | TINYINT UNSIGNED | no |  | FK → bed_status.status_id | Derived attribute stored for speed. Written only by triggers and mark_bed_clean(). |
| `is_out_of_service` | BOOLEAN | no | `FALSE` |  | A broken bed: it keeps its status but cannot be occupied. |

**Indexes:** Index `ix_bed_status` (status_id)

**On delete:** `ward_id` → cascade · `status_id` → restrict


### `admission`

One inpatient stay, belonging to one Inpatient encounter. `discharged_at IS NULL` defines a current inpatient.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `admission_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `encounter_id` | INT UNSIGNED | no |  | UQ, FK → encounter.encounter_id |  |
| `admitted_at` | DATETIME | no |  |  |  |
| `admitted_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `discharged_at` | DATETIME | yes |  |  | NULL = current inpatient. NULL IS the definition of a |
| `discharged_by` | INT UNSIGNED | yes |  | FK → user_account.account_id | current inpatient |
| `discharge_summary` | TEXT | yes |  |  |  |
| `outcome` | ENUM('recovered','improved','referred','absconded','died') | yes |  |  | Recorded at discharge. |

**Indexes:** Index `ix_admission_by` (admitted_by) · Index `ix_admission_disch_by` (discharged_by) · Index `ix_admission_open` (discharged_at)

**On delete:** `encounter_id` → restrict · `admitted_by` → restrict · `discharged_by` → restrict

**Checks:**

- `ck_admission_dates` — `discharged_at IS NULL OR discharged_at >= admitted_at`
- `ck_admission_discharge` — `(discharged_at IS NULL AND discharged_by IS NULL) OR (discharged_at IS NOT NULL AND discharged_by IS NOT NULL)`


### `bed_occupancy`

Which bed, for which part of a stay. Admit, transfer and discharge are all operations on this table; exactly one row per admission is open.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `occupancy_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `admission_id` | INT UNSIGNED | no |  | UQ (composite), FK → admission.admission_id |  |
| `ward_id` | SMALLINT UNSIGNED | no |  | FK → bed.ward_id |  |
| `bed_no` | VARCHAR(12) | no |  | FK → bed.bed_no |  |
| `from_at` | DATETIME | no |  | UQ (composite) |  |
| `to_at` | DATETIME | yes |  |  | NULL = the patient is in this bed now. NULL = currently in this bed |

**Indexes:** Unique `uq_occupancy_start` (admission_id, from_at) · Index `ix_occupancy_bed` (ward_id, bed_no, from_at) · Index `ix_occupancy_open` (admission_id, to_at)

**On delete:** `admission_id` → cascade · `ward_id, bed_no` → restrict

**Checks:**

- `ck_occupancy_dates` — `to_at IS NULL OR to_at > from_at`


### `access_log`

Every read of a patient record, with the authority it happened under (decision 2). Append-only.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `log_id` | BIGINT UNSIGNED | no | `auto-increment` | PK |  |
| `patient_id` | INT UNSIGNED | no |  | FK → patient.patient_id |  |
| `account_id` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `hospital_id` | SMALLINT UNSIGNED | yes |  | FK → hospital.hospital_id | NULL when a patient reads their own |
| `encounter_id` | INT UNSIGNED | yes |  | FK → encounter.encounter_id |  |
| `action` | VARCHAR(40) | no |  |  | 'record.read', 'record.demographics', 'search.match', 'encounter.open' |
| `basis` | ENUM('own_record','treating','consent','break_glass' | yes |  |  | The authority the read happened under: own_record, treating, consent, break_glass or demographics_only. |
| `'demographics_only')` | NOT | no |  |  |  |
| `is_break_glass` | BOOLEAN | no | `FALSE` |  | Always equal to basis = 'break_glass' (ck_log_basis_flag); indexed for the review queue. |
| `justification` | VARCHAR(300) | yes |  |  | Required when is_break_glass is TRUE. required when break-glass |
| `at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `ip_address` | VARCHAR(45) | yes |  |  | 45 = longest IPv6 text form |
| `reviewed_by` | INT UNSIGNED | yes |  | FK → user_account.account_id | NULL on a break-glass row = still waiting in the review queue. |
| `reviewed_at` | DATETIME | yes |  |  |  |

**Indexes:** Index `ix_log_patient` (patient_id, at DESC) · Index `ix_log_account` (account_id, at DESC) · Index `ix_log_unreviewed` (is_break_glass, reviewed_by) · Index `ix_log_hospital` (hospital_id) · Index `ix_log_encounter` (encounter_id) · Index `ix_log_reviewed_by` (reviewed_by)

**On delete:** `patient_id` → restrict · `account_id` → restrict · `hospital_id` → restrict · `encounter_id` → restrict · `reviewed_by` → restrict

**Checks:**

- `ck_log_break_glass` — `(is_break_glass = FALSE) OR (justification IS NOT NULL)`
- `ck_log_basis_flag` — `(basis = 'break_glass') = (is_break_glass = TRUE)`
- `ck_log_review` — `(reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)`


### `uhid_sequence`

The per-year counter UHID serials are issued from, under a row lock.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `year` | SMALLINT UNSIGNED | no |  | PK |  |
| `last_serial` | MEDIUMINT UNSIGNED | no | `0` |  | The last serial issued in that year. Locked with FOR UPDATE while a UHID is issued. |

**Checks:**

- `ck_sequence_serial` — `last_serial <= 99999`
- `ck_sequence_year` — `year BETWEEN 2000 AND 2099`


### `encounter_vitals`

One set of observations at a moment in an encounter. A weak entity identified by `(encounter_id, recorded_at)`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `encounter_id` | INT UNSIGNED | no |  | PK, FK → encounter.encounter_id |  |
| `recorded_at` | DATETIME | no |  | PK |  |
| `bp_systolic` | SMALLINT UNSIGNED | yes |  |  |  |
| `bp_diastolic` | SMALLINT UNSIGNED | yes |  |  |  |
| `pulse` | SMALLINT UNSIGNED | yes |  |  |  |
| `temp_c` | DECIMAL(4,1) | yes |  |  |  |
| `spo2` | TINYINT UNSIGNED | yes |  |  |  |
| `weight_kg` | DECIMAL(5,1) | yes |  |  |  |
| `height_cm` | DECIMAL(4,1) | yes |  |  |  |
| `recorded_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |

**Indexes:** Index `ix_vitals_by` (recorded_by)

**On delete:** `encounter_id` → cascade · `recorded_by` → restrict

**Checks:**

- `ck_vitals_bp` — `(bp_systolic IS NULL AND bp_diastolic IS NULL) OR (bp_systolic BETWEEN 40 AND 300 AND bp_diastolic BETWEEN 20 AND 200 AND bp_systolic > bp_diastolic)`
- `ck_vitals_pulse` — `pulse IS NULL OR pulse BETWEEN 20 AND 250`
- `ck_vitals_temp` — `temp_c IS NULL OR temp_c BETWEEN 30.0 AND 45.0`
- `ck_vitals_spo2` — `spo2 IS NULL OR spo2 BETWEEN 50 AND 100`
- `ck_vitals_weight` — `weight_kg IS NULL OR weight_kg BETWEEN 0.3 AND 350`
- `ck_vitals_height` — `height_cm IS NULL OR height_cm BETWEEN 20 AND 250`


### `lab_test`

Catalogue of investigations with units and reference ranges.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `test_id` | SMALLINT UNSIGNED | no | `auto-increment` | PK |  |
| `name` | VARCHAR(80) | no |  | UQ | 'Haemoglobin', 'Serum creatinine' |
| `specimen` | VARCHAR(30) | no |  |  | 'Blood', 'Urine' |
| `unit` | VARCHAR(20) | yes |  |  | 'g/dL'; NULL for a text result |
| `ref_low` | DECIMAL(10,2) | yes |  |  |  |
| `ref_high` | DECIMAL(10,2) | yes |  |  |  |

**Checks:**

- `ck_lab_test_range` — `ref_low IS NULL OR ref_high IS NULL OR ref_high >= ref_low`


### `lab_order`

An investigation ordered during an encounter.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `order_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `encounter_id` | INT UNSIGNED | no |  | FK → encounter.encounter_id |  |
| `test_id` | SMALLINT UNSIGNED | no |  | FK → lab_test.test_id |  |
| `ordered_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `ordered_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `status` | ENUM('ordered','collected','reported','cancelled') | no | `'ordered'` |  |  |

**Indexes:** Index `ix_lab_order_encounter` (encounter_id) · Index `ix_lab_order_test` (test_id) · Index `ix_lab_order_status` (status) · Index `ix_lab_order_by` (ordered_by)

**On delete:** `encounter_id` → cascade · `test_id` → restrict · `ordered_by` → restrict


### `lab_result`

What came back for one order. One-to-one optional with `lab_order`.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `order_id` | INT UNSIGNED | no |  | PK, FK → lab_order.order_id |  |
| `value_num` | DECIMAL(10,2) | yes |  |  |  |
| `value_text` | VARCHAR(200) | yes |  |  |  |
| `is_abnormal` | BOOLEAN | no | `FALSE` |  | Set by trg_lab_result_bi from the reference range at the time of reporting. |
| `reported_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `reported_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |

**Indexes:** Index `ix_lab_result_by` (reported_by)

**On delete:** `order_id` → cascade · `reported_by` → restrict

**Checks:**

- `ck_lab_result_value` — `value_num IS NOT NULL OR value_text IS NOT NULL`


### `referral`

Hospital A sends a patient to Hospital B (decision 6). `to_encounter_id IS NULL` means the patient has not arrived yet.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `referral_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `patient_id` | INT UNSIGNED | no |  | FK → patient.patient_id |  |
| `from_hospital_id` | SMALLINT UNSIGNED | no |  | FK → hospital.hospital_id | Copied from the referring encounter by trg_referral_bi. |
| `to_hospital_id` | SMALLINT UNSIGNED | no |  | FK → hospital.hospital_id |  |
| `to_department_id` | SMALLINT UNSIGNED | yes |  | FK → department.department_id | NULL = "whichever is right" |
| `from_encounter_id` | INT UNSIGNED | no |  | FK → encounter.encounter_id |  |
| `to_encounter_id` | INT UNSIGNED | yes |  | UQ, FK → encounter.encounter_id | NULL until the patient arrives at the receiving hospital. |
| `reason` | VARCHAR(300) | no |  |  |  |
| `urgency` | ENUM('routine','urgent','emergency') | no | `'routine'` |  |  |
| `referred_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `referred_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `status` | ENUM('issued','arrived','completed','expired') | no | `'issued'` |  |  |

**Indexes:** Index `ix_referral_patient` (patient_id, referred_at DESC) · Index `ix_referral_inbox` (to_hospital_id, status) · Index `ix_referral_from_hospital` (from_hospital_id) · Index `ix_referral_department` (to_department_id) · Index `ix_referral_from_encounter` (from_encounter_id) · Index `ix_referral_by` (referred_by)

**On delete:** `patient_id` → restrict · `from_hospital_id` → restrict · `to_hospital_id` → restrict · `to_department_id` → restrict · `from_encounter_id` → restrict · `to_encounter_id` → restrict · `referred_by` → restrict

**Checks:**

- `ck_referral_hospitals` — `from_hospital_id <> to_hospital_id`
- `ck_referral_arrival` — `(status IN ('issued','expired') AND to_encounter_id IS NULL) OR (status IN ('arrived','completed') AND to_encounter_id IS NOT NULL)`


### `consent_grant`

Permission for a hospital (or one doctor there) to read a record, for 24 hours by default.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `grant_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `patient_id` | INT UNSIGNED | no |  | FK → patient.patient_id |  |
| `to_hospital_id` | SMALLINT UNSIGNED | no |  | FK → hospital.hospital_id |  |
| `to_doctor_id` | SMALLINT UNSIGNED | yes |  | FK → doctor.doctor_id | NULL = anyone at the hospital may read under this grant. NULL = anyone at that hospital |
| `scope` | ENUM('demographics','clinical','full') | no | `'clinical'` |  |  |
| `granted_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `expires_at` | DATETIME | no | `(granted_at + INTERVAL 24 HOUR)` |  | Defaults to granted_at + 24 hours (er-design.md §8, decision 5). |
| `revoked_at` | DATETIME | yes |  |  |  |
| `granted_via` | ENUM('in_person','otp','referral') | no |  |  |  |
| `referral_id` | INT UNSIGNED | yes |  | FK → referral.referral_id | Set exactly when granted_via = 'referral'. set exactly when granted_via = 'referral' |

**Indexes:** Index `ix_grant_lookup` (patient_id, to_hospital_id, expires_at) · Index `ix_grant_hospital` (to_hospital_id) · Index `ix_grant_doctor` (to_doctor_id) · Index `ix_grant_referral` (referral_id)

**On delete:** `patient_id` → cascade · `to_hospital_id` → restrict · `to_doctor_id` → restrict · `referral_id` → restrict

**Checks:**

- `ck_grant_window` — `expires_at > granted_at`
- `ck_grant_revoked` — `revoked_at IS NULL OR revoked_at >= granted_at`
- `ck_grant_via` — `(granted_via = 'referral') = (referral_id IS NOT NULL)`


### `patient_merge`

Records that two UHIDs were found to be one person, and which record survived.

| Column | Type | Null | Default | Key | Notes |
|---|---|---|---|---|---|
| `merge_id` | INT UNSIGNED | no | `auto-increment` | PK |  |
| `losing_patient_id` | INT UNSIGNED | no |  | UQ, FK → patient.patient_id | The record merged away. Its row and UHID stay; resolve_patient() follows this table. |
| `surviving_patient_id` | INT UNSIGNED | no |  | FK → patient.patient_id |  |
| `merged_at` | DATETIME | no | `CURRENT_TIMESTAMP` |  |  |
| `merged_by` | INT UNSIGNED | no |  | FK → user_account.account_id |  |
| `reason` | VARCHAR(300) | no |  |  |  |

**Indexes:** Index `ix_merge_surviving` (surviving_patient_id) · Index `ix_merge_by` (merged_by)

**On delete:** `losing_patient_id` → restrict · `surviving_patient_id` → restrict · `merged_by` → restrict

**Checks:**

- `ck_merge_distinct` — `losing_patient_id <> surviving_patient_id`

