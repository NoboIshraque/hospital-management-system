-- =====================================================================
-- UHID National Hospital Management System — triggers
-- Run after schema.sql.  `npm run db:reset` (in server/) does it for you.
--
-- Every trigger here enforces a rule from the foot of schema.sql that a
-- CHECK constraint cannot express, because the rule needs another table or
-- another row. Each one says which rule it is.
--
-- How a trigger refuses: SIGNAL SQLSTATE '45000' with a sentence a human
-- can read. '45000' means "unhandled user-defined exception"; the Express
-- API turns it into an HTTP 409 and the message goes straight to the toast
-- on screen. So the message text is user-facing — write it that way.
--
-- Naming: trg_<table>_<b|a><i|u|d>  =  Before/After  Insert/Update/Delete.
-- =====================================================================

USE uhid;

DELIMITER $$


-- =====================================================================
-- 1. user_account — the role decides which links are set
--    (schema.sql foot, item 1; er-design.md §4.2)
--
--    Role            hospital_id  patient_id  doctor_id  staff_name
--    patient         null         set         null       null
--    doctor          set          null        set        null
--    staff (3 roles) set          null        null       set
--    system_admin    null         null        null       set
--
-- A CHECK cannot do this because the role's CODE lives in `role`. The
-- check is a procedure so the INSERT and UPDATE triggers share one copy.
-- =====================================================================

DROP PROCEDURE IF EXISTS assert_account_shape $$
CREATE PROCEDURE assert_account_shape(
  IN p_role_id     TINYINT UNSIGNED,
  IN p_hospital_id SMALLINT UNSIGNED,
  IN p_patient_id  INT UNSIGNED,
  IN p_doctor_id   SMALLINT UNSIGNED,
  IN p_staff_name  VARCHAR(100)
)
BEGIN
  DECLARE v_code VARCHAR(30);
  SELECT code INTO v_code FROM role WHERE role_id = p_role_id;

  IF v_code = 'patient' AND NOT (p_patient_id IS NOT NULL AND p_hospital_id IS NULL AND p_doctor_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient account must link to a patient and to no hospital or doctor.';
  ELSEIF v_code = 'doctor' AND NOT (p_doctor_id IS NOT NULL AND p_hospital_id IS NOT NULL AND p_patient_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A doctor account must link to a doctor and a hospital, and to no patient.';
  ELSEIF v_code IN ('receptionist','hospital_admin','lab_technician')
         AND NOT (p_hospital_id IS NOT NULL AND p_patient_id IS NULL AND p_doctor_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A hospital staff account must link to a hospital and to no patient or doctor.';
  ELSEIF v_code = 'system_admin' AND NOT (p_hospital_id IS NULL AND p_patient_id IS NULL AND p_doctor_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A system admin account must not link to a hospital, patient or doctor.';
  END IF;

  -- A patient or doctor already has a name, on their own row. Staff do not.
  IF v_code IN ('patient','doctor') AND p_staff_name IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient or doctor account takes its name from the linked record; staff_name must be empty.';
  ELSEIF v_code NOT IN ('patient','doctor') AND NULLIF(TRIM(p_staff_name), '') IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A staff account needs a staff_name.';
  END IF;
END $$

CREATE TRIGGER trg_user_account_bi BEFORE INSERT ON user_account
FOR EACH ROW
BEGIN
  CALL assert_account_shape(NEW.role_id, NEW.hospital_id, NEW.patient_id, NEW.doctor_id, NEW.staff_name);
END $$

CREATE TRIGGER trg_user_account_bu BEFORE UPDATE ON user_account
FOR EACH ROW
BEGIN
  CALL assert_account_shape(NEW.role_id, NEW.hospital_id, NEW.patient_id, NEW.doctor_id, NEW.staff_name);
END $$


-- =====================================================================
-- 2. patient — an empty NID is no NID
--
-- js/seed.js stores nid: '' for the unverified patient, and a form sends ''
-- for a blank field. '' is a VALUE: two patients with '' would collide on
-- uq_patient_nid. NULL is the absence of a value, and any number of NULLs
-- may share a unique index. So '' is turned into NULL before it is stored.
-- =====================================================================

CREATE TRIGGER trg_patient_bi BEFORE INSERT ON patient
FOR EACH ROW
BEGIN
  SET NEW.nid   = NULLIF(TRIM(NEW.nid), '');
  SET NEW.phone = NULLIF(TRIM(NEW.phone), '');
END $$

CREATE TRIGGER trg_patient_bu BEFORE UPDATE ON patient
FOR EACH ROW
BEGIN
  SET NEW.nid   = NULLIF(TRIM(NEW.nid), '');
  SET NEW.phone = NULLIF(TRIM(NEW.phone), '');
END $$


-- =====================================================================
-- 3. encounter — hospital, department and fee come from the posting
--    (schema.sql foot, item 8; er-design.md §8 decision 1)
--
-- An encounter is "this doctor, at this hospital, in this speciality". All
-- three facts already live on the posting, so letting the application type
-- them again would let it type them WRONG — an encounter at Hospital 1 under
-- a posting at Hospital 3. The trigger copies them instead, whatever the
-- INSERT said. The fee is copied once and then frozen: decision 1 is that a
-- fee rise next year must not restate what this patient was charged.
-- =====================================================================

CREATE TRIGGER trg_encounter_bi BEFORE INSERT ON encounter
FOR EACH ROW
BEGIN
  DECLARE v_hospital SMALLINT UNSIGNED;
  DECLARE v_dept     SMALLINT UNSIGNED;
  DECLARE v_fee      DECIMAL(8,2);
  DECLARE v_from     DATE;
  DECLARE v_to       DATE;

  SELECT hospital_id, department_id, consultation_fee, valid_from, valid_to
    INTO v_hospital, v_dept, v_fee, v_from, v_to
    FROM doctor_posting
   WHERE posting_id = NEW.posting_id;

  -- No such posting: leave the columns alone and let fk_encounter_posting
  -- produce the error, which is the more accurate one.
  IF v_hospital IS NOT NULL THEN
    IF DATE(NEW.started_at) < v_from OR (v_to IS NOT NULL AND DATE(NEW.started_at) > v_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'That doctor did not hold this posting on the date of the encounter.';
    END IF;
    SET NEW.hospital_id      = v_hospital;
    SET NEW.department_id    = v_dept;
    SET NEW.consultation_fee = v_fee;
  END IF;
END $$

CREATE TRIGGER trg_encounter_bu BEFORE UPDATE ON encounter
FOR EACH ROW
BEGIN
  IF NEW.posting_id <> OLD.posting_id
     OR NEW.consultation_fee <> OLD.consultation_fee
     OR NEW.hospital_id <> OLD.hospital_id
     OR NEW.department_id <> OLD.department_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'An encounter''s doctor, hospital, department and fee are fixed once it is recorded.';
  END IF;
END $$


-- =====================================================================
-- 4. prescription_item — no drug the patient is allergic to
--    (schema.sql foot, item 9; er-design.md §4.3 "the catalogue rule")
--
-- This is the trigger that justifies coding allergies and medicines as
-- catalogues instead of strings. The allergy says 'Penicillin'; the drug
-- is 'Amoxicillin'. As text they have nothing in common. As rows, both carry
-- class 'penicillin', and the join below finds the conflict.
--
-- A real system would let a senior clinician override with a reason. That
-- override is out of scope; say so if asked.
-- =====================================================================

DROP PROCEDURE IF EXISTS assert_no_allergy_conflict $$
CREATE PROCEDURE assert_no_allergy_conflict(
  IN p_prescription_id INT UNSIGNED,
  IN p_medicine_id     MEDIUMINT UNSIGNED
)
BEGIN
  DECLARE v_allergen VARCHAR(80);
  DECLARE v_drug     VARCHAR(100);
  DECLARE v_msg      VARCHAR(255);

  SELECT a.name, m.generic_name
    INTO v_allergen, v_drug
    FROM prescription pr
    JOIN encounter e        ON e.encounter_id = pr.encounter_id
    JOIN patient_allergy pa ON pa.patient_id  = e.patient_id
    JOIN allergen a         ON a.allergen_id  = pa.allergen_id
    JOIN medicine m         ON m.medicine_id  = p_medicine_id
   WHERE pr.prescription_id = p_prescription_id
     AND (a.class = m.drug_class OR a.name = m.generic_name)
   LIMIT 1;

  IF v_allergen IS NOT NULL THEN
    SET v_msg = CONCAT('Allergy conflict: this patient has a recorded allergy to ',
                       v_allergen, ', and ', v_drug, ' belongs to the same class.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
END $$

CREATE TRIGGER trg_prescription_item_bi BEFORE INSERT ON prescription_item
FOR EACH ROW
BEGIN
  CALL assert_no_allergy_conflict(NEW.prescription_id, NEW.medicine_id);
END $$

CREATE TRIGGER trg_prescription_item_bu BEFORE UPDATE ON prescription_item
FOR EACH ROW
BEGIN
  IF NEW.medicine_id <> OLD.medicine_id THEN
    CALL assert_no_allergy_conflict(NEW.prescription_id, NEW.medicine_id);
  END IF;
END $$


-- =====================================================================
-- 5. admission — only an Inpatient encounter is admitted
--    (schema.sql foot, item 6)
-- =====================================================================

CREATE TRIGGER trg_admission_bi BEFORE INSERT ON admission
FOR EACH ROW
BEGIN
  IF (SELECT t.code
        FROM encounter e JOIN encounter_type t ON t.type_id = e.type_id
       WHERE e.encounter_id = NEW.encounter_id) <> 'Inpatient' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only an Inpatient encounter can have an admission.';
  END IF;
END $$


-- =====================================================================
-- 6. bed_occupancy and bed — decision 7, bed state changes by trigger
--    (schema.sql foot, items 2, 3 and 10; er-design.md §4.4)
--
-- Admit, transfer and discharge are all operations on bed_occupancy:
--   admit      INSERT a row with to_at = NULL      → bed becomes occupied
--   transfer   close the open row, INSERT a new one → old bed cleaning,
--                                                     new bed occupied
--   discharge  close the open row                   → bed becomes cleaning
-- The application never writes bed.status_id. These triggers do, and
-- mark_bed_clean() moves a bed from cleaning back to free.
--
-- How "never written by the application" is enforced: the app's database
-- user has no UPDATE on `bed` at all (grants.sql) — that is the real guard.
-- trg_bed_bu below is the second guard, for anyone connected as root: it
-- refuses a status change unless @uhid_bed_writer has been set, which only
-- these triggers and mark_bed_clean() do. A determined root user can set the
-- variable too; the point is that nobody changes a bed's status by accident.
-- =====================================================================

CREATE TRIGGER trg_bed_occupancy_bi BEFORE INSERT ON bed_occupancy
FOR EACH ROW
BEGIN
  DECLARE v_status    VARCHAR(20);
  DECLARE v_oos       BOOLEAN;
  DECLARE v_bed_hosp  SMALLINT UNSIGNED;
  DECLARE v_adm_hosp  SMALLINT UNSIGNED;
  DECLARE v_discharged DATETIME;

  -- History rows (to_at already set) are imports of past stays. The rules
  -- below are about the present, so they apply only to an OPEN row.
  IF NEW.to_at IS NULL THEN

    -- Item 2: exactly one open row per admission.
    IF EXISTS (SELECT 1 FROM bed_occupancy
                WHERE admission_id = NEW.admission_id AND to_at IS NULL) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This patient already has a bed. Transfer them instead of admitting twice.';
    END IF;

    SELECT e.hospital_id, a.discharged_at
      INTO v_adm_hosp, v_discharged
      FROM admission a JOIN encounter e ON e.encounter_id = a.encounter_id
     WHERE a.admission_id = NEW.admission_id;

    IF v_discharged IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This admission has been discharged; it cannot be given a bed.';
    END IF;

    -- Item 10: the bed must be free (or reserved for this admission) and in
    -- service, and in the hospital the patient was admitted to.
    --
    -- FOR UPDATE locks the bed row while it is checked (stress test H1.1).
    -- Without it, two admissions to one bed at the same instant both read
    -- 'free' from their own snapshot and both got in. With it, the second
    -- waits until the first commits, then reads the bed as it now is —
    -- 'occupied' — and is refused. Transfers come through here too.
    SELECT s.code, b.is_out_of_service, w.hospital_id
      INTO v_status, v_oos, v_bed_hosp
      FROM bed b
      JOIN bed_status s ON s.status_id = b.status_id
      JOIN ward w       ON w.ward_id   = b.ward_id
     WHERE b.ward_id = NEW.ward_id AND b.bed_no = NEW.bed_no
       FOR UPDATE;

    IF v_oos THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That bed is out of service.';
    ELSEIF v_status NOT IN ('free','reserved') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That bed is not free.';
    ELSEIF v_bed_hosp <> v_adm_hosp THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'That bed is in a different hospital from the admission. Refer the patient instead.';
    END IF;

    -- The ward's own rules: ward.sex_restriction, and a paediatric ward is
    -- for patients under 18. Both read the patient through the admission.
    IF EXISTS (
         SELECT 1
           FROM ward w, admission a
           JOIN encounter e ON e.encounter_id = a.encounter_id
           JOIN patient p   ON p.patient_id   = e.patient_id
          WHERE w.ward_id = NEW.ward_id AND a.admission_id = NEW.admission_id
            AND w.sex_restriction IS NOT NULL AND w.sex_restriction <> p.sex) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That ward is restricted to the other sex.';
    END IF;
    IF EXISTS (
         SELECT 1
           FROM ward w
           JOIN ward_type wt ON wt.ward_type_id = w.ward_type_id, admission a
           JOIN encounter e ON e.encounter_id = a.encounter_id
           JOIN patient p   ON p.patient_id   = e.patient_id
          WHERE w.ward_id = NEW.ward_id AND a.admission_id = NEW.admission_id
            AND wt.code = 'Paeds' AND TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) >= 18) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The paediatric ward is for patients under 18.';
    END IF;
  END IF;
END $$

CREATE TRIGGER trg_bed_occupancy_ai AFTER INSERT ON bed_occupancy
FOR EACH ROW
BEGIN
  IF NEW.to_at IS NULL THEN
    SET @uhid_bed_writer = 'trg_bed_occupancy_ai';
    UPDATE bed
       SET status_id = (SELECT status_id FROM bed_status WHERE code = 'occupied')
     WHERE ward_id = NEW.ward_id AND bed_no = NEW.bed_no;
    SET @uhid_bed_writer = NULL;
  END IF;
END $$

-- A row is opened once and closed once. After that it is history, and
-- history is not edited: the only change allowed is to_at going from NULL
-- to a time.
CREATE TRIGGER trg_bed_occupancy_bu BEFORE UPDATE ON bed_occupancy
FOR EACH ROW
BEGIN
  IF NEW.admission_id <> OLD.admission_id OR NEW.ward_id <> OLD.ward_id
     OR NEW.bed_no <> OLD.bed_no OR NEW.from_at <> OLD.from_at THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Bed history cannot be rewritten. Close this stay and open a new one.';
  END IF;
  IF OLD.to_at IS NOT NULL AND (NEW.to_at IS NULL OR NEW.to_at <> OLD.to_at) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A closed bed stay cannot be reopened or changed.';
  END IF;
END $$

CREATE TRIGGER trg_bed_occupancy_au AFTER UPDATE ON bed_occupancy
FOR EACH ROW
BEGIN
  IF OLD.to_at IS NULL AND NEW.to_at IS NOT NULL THEN
    SET @uhid_bed_writer = 'trg_bed_occupancy_au';
    UPDATE bed
       SET status_id = (SELECT status_id FROM bed_status WHERE code = 'cleaning')
     WHERE ward_id = NEW.ward_id AND bed_no = NEW.bed_no;
    SET @uhid_bed_writer = NULL;
  END IF;
END $$

CREATE TRIGGER trg_bed_bu BEFORE UPDATE ON bed
FOR EACH ROW
BEGIN
  IF NEW.status_id <> OLD.status_id AND @uhid_bed_writer IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Bed status is maintained by the database. Admit, transfer or discharge instead.';
  END IF;
END $$


-- =====================================================================
-- 7. referral — the encounters must belong to the patient and the hospitals
--    (decision 6)
--
-- from_hospital_id is copied from the sending encounter, for the same reason
-- the encounter copies its hospital from the posting: a fact stored twice
-- must not be typed twice. The receiving encounter, once set, must be the
-- same patient at the hospital the referral was addressed to.
-- =====================================================================

DROP PROCEDURE IF EXISTS assert_referral_encounters $$
CREATE PROCEDURE assert_referral_encounters(
  IN p_patient_id        INT UNSIGNED,
  IN p_to_hospital_id    SMALLINT UNSIGNED,
  IN p_from_encounter_id INT UNSIGNED,
  IN p_to_encounter_id   INT UNSIGNED
)
BEGIN
  IF (SELECT patient_id FROM encounter WHERE encounter_id = p_from_encounter_id) <> p_patient_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The referring encounter belongs to a different patient.';
  END IF;
  IF p_to_encounter_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM encounter
        WHERE encounter_id = p_to_encounter_id
          AND patient_id = p_patient_id AND hospital_id = p_to_hospital_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The arrival encounter must be this patient, at the hospital they were referred to.';
  END IF;
END $$

CREATE TRIGGER trg_referral_bi BEFORE INSERT ON referral
FOR EACH ROW
BEGIN
  DECLARE v_from SMALLINT UNSIGNED;
  SELECT hospital_id INTO v_from FROM encounter WHERE encounter_id = NEW.from_encounter_id;
  IF v_from IS NOT NULL THEN
    SET NEW.from_hospital_id = v_from;
  END IF;
  CALL assert_referral_encounters(NEW.patient_id, NEW.to_hospital_id,
                                  NEW.from_encounter_id, NEW.to_encounter_id);
END $$

CREATE TRIGGER trg_referral_bu BEFORE UPDATE ON referral
FOR EACH ROW
BEGIN
  IF NEW.from_encounter_id <> OLD.from_encounter_id OR NEW.patient_id <> OLD.patient_id
     OR NEW.from_hospital_id <> OLD.from_hospital_id OR NEW.to_hospital_id <> OLD.to_hospital_id THEN
    -- patient_id may change in one case: merge_patients() repointing a
    -- duplicate's history. It sets this flag for exactly that statement.
    IF NOT (@uhid_merging = 1 AND NEW.from_encounter_id = OLD.from_encounter_id
            AND NEW.from_hospital_id = OLD.from_hospital_id
            AND NEW.to_hospital_id = OLD.to_hospital_id) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Who was referred, and from where to where, cannot be changed. Issue a new referral.';
    END IF;
  END IF;
  CALL assert_referral_encounters(NEW.patient_id, NEW.to_hospital_id,
                                  NEW.from_encounter_id, NEW.to_encounter_id);
END $$


-- =====================================================================
-- 8. lab_result — flag abnormal values, and close the order
--
-- is_abnormal is derived from value_num and the test's reference range at
-- the moment of reporting. It is stored rather than computed later on
-- purpose: if the laboratory revises a reference range next year, a result
-- that was flagged abnormal when the doctor read it must stay flagged.
-- Same reasoning as the fee snapshot on encounter.
-- =====================================================================

CREATE TRIGGER trg_lab_result_bi BEFORE INSERT ON lab_result
FOR EACH ROW
BEGIN
  DECLARE v_low  DECIMAL(10,2);
  DECLARE v_high DECIMAL(10,2);
  DECLARE v_status VARCHAR(20);

  SELECT t.ref_low, t.ref_high, o.status
    INTO v_low, v_high, v_status
    FROM lab_order o JOIN lab_test t ON t.test_id = o.test_id
   WHERE o.order_id = NEW.order_id;

  IF v_status = 'cancelled' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That lab order was cancelled; it cannot have a result.';
  END IF;

  IF NEW.value_num IS NOT NULL THEN
    SET NEW.is_abnormal = (v_low IS NOT NULL AND NEW.value_num < v_low)
                       OR (v_high IS NOT NULL AND NEW.value_num > v_high);
  END IF;
END $$

CREATE TRIGGER trg_lab_result_ai AFTER INSERT ON lab_result
FOR EACH ROW
BEGIN
  UPDATE lab_order SET status = 'reported' WHERE order_id = NEW.order_id;
END $$


-- =====================================================================
-- 9. access_log — append-only (schema.sql foot, item 7; decision 2)
--
-- One UPDATE is allowed, once: stamping a break-glass row as reviewed.
-- That is the review queue working (reviewed_by IS NULL = still to review),
-- not history being edited. Everything else about a row is fixed forever,
-- and no row is ever deleted.
--
-- And a break-glass row cannot arrive already reviewed — it always lands in
-- the queue. That is the "flag for review" er-design.md §4.5 asks for.
--
-- Note what triggers cannot stop: TRUNCATE and DROP do not fire triggers.
-- That is why grants.sql gives the application user INSERT and SELECT on
-- this table and nothing else.
-- =====================================================================

CREATE TRIGGER trg_access_log_bi BEFORE INSERT ON access_log
FOR EACH ROW
BEGIN
  IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'An access-log row cannot be written already reviewed.';
  END IF;
  IF NEW.at > NOW() + INTERVAL 1 MINUTE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An access-log row cannot be dated in the future.';
  END IF;
END $$

CREATE TRIGGER trg_access_log_bu BEFORE UPDATE ON access_log
FOR EACH ROW
BEGIN
  IF NOT (NEW.log_id <=> OLD.log_id AND NEW.patient_id <=> OLD.patient_id
          AND NEW.account_id <=> OLD.account_id AND NEW.hospital_id <=> OLD.hospital_id
          AND NEW.encounter_id <=> OLD.encounter_id AND NEW.action <=> OLD.action
          AND NEW.basis <=> OLD.basis AND NEW.is_break_glass <=> OLD.is_break_glass
          AND NEW.justification <=> OLD.justification AND NEW.at <=> OLD.at
          AND NEW.ip_address <=> OLD.ip_address) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The access log is append-only.';
  END IF;
  IF OLD.reviewed_by IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This access has already been reviewed.';
  END IF;
  IF NOT OLD.is_break_glass THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only break-glass access is reviewed.';
  END IF;
END $$

CREATE TRIGGER trg_access_log_bd BEFORE DELETE ON access_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The access log is append-only.';
END $$

DELIMITER ;
