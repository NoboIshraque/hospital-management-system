# Normalization — UHID National Hospital Management System

This shows how the prototype's data, a set of nested JavaScript objects in `public/js/seed.js`
and `public/js/data.js`, was normalized into the tables in `database/schema.sql`. It also lists
the places where the schema **deliberately** stores something twice, each with the reason and
the mechanism that keeps the copy correct.

It assumes the definitions from the course. Briefly:

| Form | A relation is in it when… |
|---|---|
| **1NF** | every attribute holds one atomic value: no lists, no repeating groups, no value that has to be parsed |
| **2NF** | it is in 1NF and no non-key attribute depends on only *part* of a composite key |
| **3NF** | it is in 2NF and no non-key attribute depends on another non-key attribute (no transitive dependency) |
| **BCNF** | for every non-trivial functional dependency X → Y, X is a superkey |

---

## 1. The starting point: one patient object

This is the first patient in `js/seed.js`, cut down to one encounter:

```js
{
  uhid: 'BD-2019-04821-5', name: 'Md. Rahim Uddin', dob: '1978-04-12', sex: 'Male', blood: 'B+',
  phone: '01711-482031', nid: '1978419923041', district: 'Dhaka',
  address: 'House 42, Road 7, Mirpur-2, Dhaka',
  kin: 'Salma Rahim (wife) · 01911-330218',
  registeredAt: '2019-02-11', registeredHospitalId: 1, identityVerified: true,
  allergies: [ { agent: 'Penicillin', severity: 'Severe', note: 'Anaphylaxis, 2019' },
               { agent: 'Sulfa drugs', severity: 'Moderate', note: 'Rash' } ],
  encounters: [
    { date: '2026-08-08', hospitalId: 7, type: 'OPD', doctor: 'Dr. Tahmina Akter', dept: 'Cardiology',
      dx: 'Essential hypertension — review',
      notes: 'BP 148/94. Advised salt restriction and weight loss.',
      rx: ['Amlodipine 5 mg — 1 tablet at night — 90 days',
           'Atorvastatin 10 mg — 1 tablet at night — 90 days'] }
  ]
}
```

This is exactly the right shape for the patient record *screen*. It is the wrong shape to
*store*. Imagine it flattened into one table, `PATIENT_RECORD`, with one row per patient. It
then fails every normal form.

---

## 2. First normal form — remove repeating groups and non-atomic values

### 2.1 Repeating groups

`allergies[]`, `encounters[]` and each encounter's `rx[]` are lists inside a single row. A table
row cannot hold a list, and fixed columns (`allergy1`, `allergy2`, `allergy3`, …) fail in the
usual ways: a hard maximum, mostly-empty columns, and a query like "who is allergic to
Penicillin" that has to check every one of them.

Each repeating group becomes its own relation, keyed by its parent plus whatever identifies one
member of the group:

| Repeating group | New relation | Key |
|---|---|---|
| `patient.allergies[]` | `patient_allergy` | (`patient_id`, `allergen_id`) |
| `patient.encounters[]` | `encounter` | `encounter_id` (a surrogate, since nothing natural identifies a visit) |
| `encounter.rx[]` | `prescription_item` | (`prescription_id`, `line_no`) |

### 2.2 Values that have to be parsed

1NF also asks for **atomic** values: a value you never have to take apart to use. Several
prototype fields fail that test because they pack several facts into one string:

| Prototype value | Facts packed inside | Stored as |
|---|---|---|
| `kin: 'Salma Rahim (wife) · 01911-330218'` | name, relationship, phone | `kin_name`, `kin_relation`, `kin_phone` |
| `rx: 'Amlodipine 5 mg — 1 tablet at night — 90 days'` | drug, strength, dose, frequency, duration | `medicine_id` → (`generic_name`, `strength`), plus `dose`, `frequency`, `duration_days` |
| `dx: 'Essential hypertension — review'` | the condition, plus a qualifier | `diagnosis_id` (→ ICD-10 `I10`), plus `note = 'review'` |
| `address` + `district` | a free-text address and a place in the national geography | `address` text, plus `district_id` FK |

The test for "atomic" is whether a query needs to look inside the value. "How many patients
take Amlodipine?" has to look inside the `rx` string, so the string was not atomic. Nothing ever
needs to look inside `address`, so it stays one text column.

### 2.3 Why the free text had to go, not just be split

Splitting `dx` into its own table is not enough if it stays free text. The same condition gets
typed `Essential hypertension`, `HTN`, `high BP` and `hypertension (essential)`, and a
`COUNT(*)` gives four small answers instead of one right one. So clinical facts reference
**catalogue** tables: `diagnosis` (ICD-10), `medicine`, `allergen`, `lab_test`. Free text
survives only where it is genuinely narrative and never queried: `encounter.notes`,
`prescription.advice`, `patient_allergy.note`.

The catalogues also make the allergy check possible. The allergy says `Penicillin` and the drug
is `Amoxicillin`: as strings they share nothing. As catalogue rows, `allergen.class` and
`medicine.drug_class` are both `penicillin`, and `trg_prescription_item_bi` refuses the
prescription with a join.

---

## 3. Second normal form — no partial dependencies

2NF only bites on relations with a **composite** key. After 1NF the candidates are the link
tables, and the obvious first draft of them fails.

### Worked example: the first draft of `patient_allergy`

```
patient_allergy_draft (patient_id, agent, agent_class, severity, note)
key: (patient_id, agent)
```

Functional dependencies:

```
(patient_id, agent) → severity, note        -- this patient's reaction to this substance
agent               → agent_class           -- Penicillin is a penicillin, for everyone
```

`agent_class` depends on **part** of the key (`agent` alone). That is a partial dependency, so
the draft is not in 2NF. The cost is real: the class of Penicillin is repeated in every allergic
patient's row, and one mistyped row would make the allergy check miss it.

**Decomposition:** move the dependency to a relation keyed by its determinant.

```
allergen        (allergen_id, name, class)                      key: allergen_id; name UNIQUE
patient_allergy (patient_id, allergen_id, severity, note, …)    key: (patient_id, allergen_id)
```

The same reasoning produced these:

| Draft with a partial dependency | Dependency on part of the key | Moved to |
|---|---|---|
| `encounter_diagnosis (encounter_id, icd10, term, category, is_primary)` | `icd10 → term, category` | `diagnosis` |
| `prescription_item (prescription_id, line_no, drug, strength, form, …)` | none on part of *this* key, but `(drug, form, strength)` is a fact about the medicine, not the line | `medicine` |
| `hospital_department (hospital_id, dept_name, …)` | `dept_name` identifies a national speciality independent of the hospital | `department` |
| `role_permission (role_code, perm_code, perm_description)` | `perm_code → perm_description` | `permission` |

Every remaining composite-key table (`role_permission`, `hospital_department`,
`encounter_diagnosis`, `patient_allergy`, `prescription_item`, `bed`, `encounter_vitals`) has
non-key attributes that depend on the **whole** key and nothing less. For example,
`patient_allergy.severity` is a fact about *this patient and this substance*, not either alone.

---

## 4. Third normal form — no transitive dependencies

### Worked example 1: the hospital's location

The prototype stores `{ id, name, div, dist, tier }` on every hospital:

```
hospital_draft (hospital_id, name, district, division, tier)

hospital_id → district          -- the hospital is in Dhaka district
district    → division          -- Dhaka district is in Dhaka division, for every hospital
```

`division` depends on the key only **through** `district`, which is transitive. Stored this way,
every hospital in Dhaka district repeats "Dhaka division", and nothing stops one row saying
Chattogram.

**Decomposition:**

```
division (division_id, name)
district (district_id, division_id → division, name)
hospital (hospital_id, name, district_id → district, tier_id → hospital_tier, …)
```

`v_hospital_directory` joins the three back together, so the screen still receives
`{ id, name, div, dist, tier }`. The JSON shape the frontend expects is a *view* over normalized
tables. Storage and presentation are separate concerns, and the view is where they meet.

### Worked example 2: the doctor's hospital and fee

`js/data.js` gives each doctor one `hospitalId`, `dept` and `fee`. In reality a consultant often
holds a government post *and* a private chamber, at different fees. Keeping `hospital_id`,
`dept` and `fee` on `doctor` would force either duplicate doctor rows (breaking `bmdc_reg`
uniqueness and splitting one person's diary in two) or losing the second practice. The
dependency that actually holds is:

```
(doctor, hospital, department, valid_from) → consultation_fee
```

so it becomes its own relation, `doctor_posting`. Department and fee are facts about the
posting, not the doctor.

### Worked example 3: who a login belongs to

Staff need a name on their login. Patients and doctors already have a name on their own row.
Copying it onto `user_account` would create:

```
account_id → patient_id → patient.name
```

That is transitive, and a renamed patient would disagree with their own login. So
`user_account.staff_name` exists **only** for roles with no patient or doctor row, and
`trg_user_account_bi` refuses a `staff_name` on a patient or doctor account. The function
`account_name()` resolves the right name at read time.

---

## 5. BCNF

Every table in the schema is in BCNF **except where §6 says otherwise**. The check for each one:
list the functional dependencies and confirm that every determinant is a candidate key.

Two cases are worth stating because they look like violations and are not:

- **`patient`** has two candidate keys, `patient_id` and `uhid` (and `nid` is unique when
  present). `uhid → name` is a dependency whose determinant is not the primary key, but `uhid`
  is a candidate key, so BCNF holds. `uhid` is UNIQUE rather than the PK because of
  foreign-key width and merging (er-design.md §4.2), not normalization.
- **`doctor_posting`** has two unique keys, `posting_id` and
  `(doctor_id, hospital_id, department_id, valid_from)`. Both determine everything; both are
  candidate keys.

**`doctor.qualifications` is a conscious exception to 1NF.** `'MBBS, FCPS (Medicine), MD
(Cardiology)'` is a list in one string. It is displayed and never queried: no screen asks for
every FCPS. A `qualification` catalogue plus a `doctor_qualification` link table would add two
tables and a join to render a grey subtitle. If a query ever needs it, those two tables are the fix.

---

## 6. Deliberate redundancy, and what keeps each copy correct

Normalization removes redundancy because a fact stored twice can disagree with itself. Each of
the copies below was kept for a stated reason, and **each has a mechanism that prevents the
disagreement**. That mechanism is what turns a redundancy into a design decision.

| Stored copy | Could be derived from | Why it is stored | What keeps it correct |
|---|---|---|---|
| `bed.status_id` | the open `bed_occupancy` row for that bed | The bed board reads the status of every bed on every render; deriving it would scan the whole occupancy history each time | Written **only** by `trg_bed_occupancy_ai/_au` and `mark_bed_clean()`. `trg_bed_bu` refuses any other change, and the application user has no `UPDATE` on `bed` (decision 7) |
| `appointment.doctor_id` | `doctor_posting.doctor_id` via `posting_id` | `UNIQUE(doctor_id, active_slot)` must be on the **doctor**, and a unique index cannot span a join (decision 4) | Composite FK `(posting_id, doctor_id) → doctor_posting(posting_id, doctor_id)`: a mismatched pair cannot be inserted |
| `encounter.consultation_fee` | `doctor_posting.consultation_fee` | Not actually redundant over time: it records what was charged **then**, while the posting holds what is charged now. A fee rise must not restate history (§8 decision 1) | `trg_encounter_bi` copies it at insert, whatever the INSERT said; `trg_encounter_bu` refuses any later change |
| `encounter.hospital_id`, `encounter.department_id` | the posting | Every timeline and per-hospital report filters on them; `ix_encounter_hospital` needs the column | Copied by `trg_encounter_bi`; frozen by `trg_encounter_bu` |
| `referral.from_hospital_id` | the referring encounter's hospital | The referral inbox and "sent from" reports filter on it | Copied by `trg_referral_bi`; frozen by `trg_referral_bu` |
| `lab_result.is_abnormal` | `value_num` against `lab_test.ref_low/ref_high` | A range revised next year must not un-flag a result the doctor was already shown as abnormal | Set by `trg_lab_result_bi` at the moment of reporting |
| `access_log.is_break_glass` | `basis = 'break_glass'` | Indexed for the review queue (`ix_log_unreviewed`) | `CHECK ck_log_basis_flag`: the two must agree |

Two other things look like redundancy and are not:

- **`appointment.active_slot`** is a generated column: MySQL computes it from `status` and
  `slot_start`, and nothing can write it. It exists so a cancelled booking (`active_slot` NULL)
  frees its slot in the unique index.
- **Derived values that are not stored at all:** patient age (from `dob`), ward occupancy
  percentage (`v_ward_occupancy`), a doctor's free slots (`doctor_availability()`), days in
  hospital (`v_bed_board`). Each is computed when it is read.

---

## 7. Summary: prototype field to table

| Prototype field | Where it lives now | Normal form that moved it |
|---|---|---|
| `patient.uhid, name, dob, sex, blood, phone, nid` | `patient` | already atomic |
| `patient.district` | `patient.district_id` → `district` → `division` | 3NF |
| `patient.kin` | `kin_name`, `kin_relation`, `kin_phone` | 1NF (atomic) |
| `patient.allergies[]` | `patient_allergy` → `allergen` | 1NF (repeating group), then 2NF |
| `patient.encounters[]` | `encounter` | 1NF (repeating group) |
| `encounter.hospitalId, doctor, dept` | `encounter.posting_id` → `doctor_posting` → `doctor`, `hospital`, `department` | 3NF |
| `encounter.type` | `encounter.type_id` → `encounter_type` | lookup table |
| `encounter.dx` | `encounter_diagnosis` → `diagnosis` | 1NF (atomic), then 2NF |
| `encounter.rx[]` | `prescription` → `prescription_item` → `medicine` | 1NF (repeating group and atomic), then 2NF |
| `hospital.div, dist, tier` | `hospital.district_id`, `tier_id` | 3NF |
| `doctor.hospitalId, dept, fee` | `doctor_posting` | 3NF |
| `doctor.qual` | `doctor.qualifications`, one text column | deliberately left (§5) |
| `ACCOUNTS`, `ROLES` | `user_account`, `role`, `permission`, `role_permission` | 2NF |
| `ACCESS_LOG` | `access_log` | coded `basis`, FKs instead of names |

The API joins these back into the prototype's nested shape on the way out
(`get_patient_record()` and the views). That's why the screens in `public/` don't change when they
switch from the built-in sample data to the database.

## `web_session.data` is JSON — a deliberate exception (7 November 2026)

`web_session.data` holds the whole session object as one JSON value, which is not atomic and so
not 1NF in the strict sense. It is allowed because the database never queries inside it: it is
express-session's private state, read and written whole by the session store, like a file. The one
fact SQL does need — whose session it is — is stored separately in `account_id`, so ending an
account's sessions is a plain `DELETE … WHERE account_id = ?`. Splitting the JSON into columns would
tie the schema to the internals of a library.
