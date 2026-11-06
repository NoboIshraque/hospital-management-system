-- =====================================================================
-- UHID National Hospital Management System — functions and procedures
-- Run after triggers.sql.  `npm run db:reset` (in server/) does it for you.
--
-- Every write the application makes goes through a procedure in this file.
-- The application's database user (grants.sql) has EXECUTE on these and
-- SELECT on the views — and NO direct INSERT/UPDATE/DELETE on any table.
-- So the rules written here cannot be skipped by a careless route handler:
-- there is no other door.
--
-- How errors come out
--   SIGNAL SQLSTATE '45000' always. MYSQL_ERRNO says what kind of error, and
--   server/db/errors.js maps it to an HTTP status:
--     1644 (MySQL's default for SIGNAL) → 409  a business rule said no
--     5403                               → 403  your role may not do this
--     5404                               → 404  no such patient / thing
--     5423                               → 423  no access basis; break-glass
--                                               is possible
--
-- Two kinds of procedure — read this before changing one
--   ATOMIC procedures run their own START TRANSACTION ... COMMIT, because
--   they are one complete operation: register_patient, book_appointment,
--   admit_patient, transfer_patient, discharge_patient, refer_patient,
--   merge_patients.
--   STEP procedures do NOT, because they are pieces of a larger operation
--   that the API wraps in one transaction: start_encounter, add_diagnosis,
--   prescribe, record_vitals, order_lab. MySQL has no nested transactions —
--   a START TRANSACTION inside a step would silently COMMIT the API's
--   transaction half-way through. That is why steps must never start one.
-- =====================================================================

USE uhid;

DELIMITER $$


-- =====================================================================
-- 1. SMALL FUNCTIONS
-- =====================================================================

-- The UHID check digit: the serial's five digits summed, mod 10.
-- '13052' → 1+3+0+5+2 = 11 → 1. Same rule as ck_patient_uhid_check_digit
-- in schema.sql and uhidCheckDigit() in public/js/util.js.
DROP FUNCTION IF EXISTS uhid_check_digit $$
CREATE FUNCTION uhid_check_digit(p_serial CHAR(5))
RETURNS TINYINT UNSIGNED
DETERMINISTIC NO SQL
BEGIN
  RETURN ( CAST(SUBSTRING(p_serial, 1, 1) AS UNSIGNED)
         + CAST(SUBSTRING(p_serial, 2, 1) AS UNSIGNED)
         + CAST(SUBSTRING(p_serial, 3, 1) AS UNSIGNED)
         + CAST(SUBSTRING(p_serial, 4, 1) AS UNSIGNED)
         + CAST(SUBSTRING(p_serial, 5, 1) AS UNSIGNED) ) % 10;
END $$

-- May this account do this? Role → role_permission → permission.
-- "Receptionist admits, doctor discharges" is two rows of role_permission,
-- and this function is where those rows take effect.
DROP FUNCTION IF EXISTS has_permission $$
CREATE FUNCTION has_permission(p_account_id INT UNSIGNED, p_code VARCHAR(60))
RETURNS BOOLEAN
READS SQL DATA
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM user_account ua
      JOIN role_permission rp ON rp.role_id = ua.role_id
      JOIN permission p       ON p.permission_id = rp.permission_id
     WHERE ua.account_id = p_account_id
       AND ua.is_active
       AND p.code = p_code
       -- A deactivated hospital or doctor takes its accounts' rights with it
       -- (stress test H3.1): switching off a hospital must switch off its staff.
       AND (ua.hospital_id IS NULL OR EXISTS (SELECT 1 FROM hospital h
                                               WHERE h.hospital_id = ua.hospital_id AND h.is_active))
       AND (ua.doctor_id IS NULL OR EXISTS (SELECT 1 FROM doctor d
                                             WHERE d.doctor_id = ua.doctor_id AND d.is_active))
  );
END $$

-- A UHID → the patient_id that now answers to it. If the UHID belongs to a
-- record that was merged away, this returns the SURVIVING patient, so an old
-- card still finds the patient. NULL if no patient holds this UHID.
DROP FUNCTION IF EXISTS resolve_patient $$
CREATE FUNCTION resolve_patient(p_uhid VARCHAR(20))
RETURNS INT UNSIGNED
READS SQL DATA
BEGIN
  DECLARE v_id    INT UNSIGNED;
  DECLARE v_surv  INT UNSIGNED;
  DECLARE v_hops  TINYINT UNSIGNED DEFAULT 0;
  SELECT patient_id INTO v_id FROM patient WHERE uhid = p_uhid;
  -- Follow the WHOLE chain (stress test H1.2): A merged into B, then B into
  -- C, must lead from A to C, not stop at the empty B. A record can be the
  -- losing side of only one merge (patient_merge's key), so the chain cannot
  -- branch; the hop limit only guards against a loop that the merge rules
  -- already make impossible.
  WHILE v_id IS NOT NULL AND v_hops < 50 DO
    SET v_surv = NULL;
    SELECT surviving_patient_id INTO v_surv FROM patient_merge WHERE losing_patient_id = v_id;
    IF v_surv IS NULL THEN
      RETURN v_id;
    END IF;
    SET v_id = v_surv, v_hops = v_hops + 1;
  END WHILE;
  RETURN v_id;
END $$

-- A Bangladeshi mobile number as its 11 local digits: '01711-482031',
-- '+880 1711 482031' and '8801711482031' all become '01711482031'.
-- Searches and the registration check compare numbers in this form, so a
-- country code or spacing never hides a duplicate (stress test H3.1).
DROP FUNCTION IF EXISTS local_phone $$
CREATE FUNCTION local_phone(p_phone VARCHAR(30))
RETURNS VARCHAR(30)
DETERMINISTIC NO SQL
BEGIN
  DECLARE v_d VARCHAR(30) DEFAULT REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '');
  IF CHAR_LENGTH(v_d) = 13 AND LEFT(v_d, 3) = '880' THEN
    RETURN CONCAT('0', SUBSTRING(v_d, 4));
  END IF;
  RETURN v_d;
END $$

-- Does a clinician have a reason, already in the database, to be seeing this
-- patient at this hospital? Used before an encounter is opened and before
-- an admission (decision 2: an encounter or an admission makes a doctor
-- 'treating', so neither may be a quiet way in).
--   an appointment today, with this doctor (or, for an admission, any doctor
--     here), booked by the patient or by staff of this hospital
--   a referral to this hospital whose consent grant is still live
--   a live consent grant to this hospital (and to this doctor, if it names one)
--   an open admission here
--   for an admission only: a visit at this hospital that began today
-- p_doctor NULL = the question is asked for the hospital (an admission).
DROP FUNCTION IF EXISTS care_basis $$
CREATE FUNCTION care_basis(p_patient INT UNSIGNED, p_hospital SMALLINT UNSIGNED, p_doctor SMALLINT UNSIGNED)
RETURNS BOOLEAN
READS SQL DATA
BEGIN
  RETURN
       EXISTS (SELECT 1 FROM appointment a
                 JOIN doctor_posting dp ON dp.posting_id = a.posting_id
                 JOIN user_account bk   ON bk.account_id = a.booked_by
                WHERE a.patient_id = p_patient AND a.status = 'booked'
                  AND DATE(a.slot_start) = CURDATE()
                  AND dp.hospital_id = p_hospital
                  AND (p_doctor IS NULL OR a.doctor_id = p_doctor)
                  -- Stress test H2.9: a booking made by a receptionist at some
                  -- other hospital is not a reason to be seeing the patient here.
                  AND (bk.patient_id <=> p_patient OR bk.hospital_id <=> p_hospital))
    OR EXISTS (SELECT 1 FROM referral r
                 JOIN consent_grant g ON g.referral_id = r.referral_id
                WHERE r.patient_id = p_patient AND r.to_hospital_id = p_hospital
                  AND r.status = 'issued'
                  -- Stress test H1.4: the referral counts only while the consent
                  -- it carried is live. A patient who revokes it closes this door too.
                  AND g.revoked_at IS NULL AND NOW() BETWEEN g.granted_at AND g.expires_at)
    OR EXISTS (SELECT 1 FROM consent_grant g
                WHERE g.patient_id = p_patient AND g.to_hospital_id = p_hospital
                  AND (g.to_doctor_id IS NULL OR g.to_doctor_id <=> p_doctor)
                  AND g.scope IN ('clinical', 'full') AND g.revoked_at IS NULL
                  AND NOW() BETWEEN g.granted_at AND g.expires_at)
    OR EXISTS (SELECT 1 FROM admission a JOIN encounter e ON e.encounter_id = a.encounter_id
                WHERE e.patient_id = p_patient AND e.hospital_id = p_hospital
                  AND a.discharged_at IS NULL)
    OR (p_doctor IS NULL AND EXISTS (SELECT 1 FROM encounter e
                WHERE e.patient_id = p_patient AND e.hospital_id = p_hospital
                  AND e.started_at >= CURDATE()));
END $$

-- The name to show for an account: the patient's or doctor's own name, or
-- the staff_name for everyone else.
DROP FUNCTION IF EXISTS account_name $$
CREATE FUNCTION account_name(p_account_id INT UNSIGNED)
RETURNS VARCHAR(100)
READS SQL DATA
BEGIN
  DECLARE v_name VARCHAR(100);
  SELECT COALESCE(d.name, p.name, ua.staff_name)
    INTO v_name
    FROM user_account ua
    LEFT JOIN doctor d  ON d.doctor_id  = ua.doctor_id
    LEFT JOIN patient p ON p.patient_id = ua.patient_id
   WHERE ua.account_id = p_account_id;
  RETURN v_name;
END $$


-- =====================================================================
-- 2. GUARDS — procedures that either return quietly or SIGNAL
-- =====================================================================

DROP PROCEDURE IF EXISTS require_permission $$
CREATE PROCEDURE require_permission(IN p_account_id INT UNSIGNED, IN p_code VARCHAR(60))
BEGIN
  DECLARE v_msg VARCHAR(200);
  IF NOT has_permission(p_account_id, p_code) THEN
    SET v_msg = CONCAT('Your role is not allowed to do this (it needs the ', p_code, ' permission).');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg, MYSQL_ERRNO = 5403;
  END IF;
END $$

DROP PROCEDURE IF EXISTS require_patient $$
CREATE PROCEDURE require_patient(IN p_uhid VARCHAR(20), OUT p_patient_id INT UNSIGNED)
BEGIN
  DECLARE v_msg VARCHAR(200);
  SET p_patient_id = resolve_patient(p_uhid);
  IF p_patient_id IS NULL THEN
    SET v_msg = CONCAT('No patient holds UHID ', COALESCE(p_uhid, '(blank)'), '.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg, MYSQL_ERRNO = 5404;
  END IF;
END $$

-- A patient recorded as having died is not booked, seen or admitted again
-- (stress test H2.11). The record stays readable; it just takes no new care.
DROP PROCEDURE IF EXISTS require_alive $$
CREATE PROCEDURE require_alive(IN p_patient_id INT UNSIGNED)
BEGIN
  IF EXISTS (SELECT 1 FROM admission a JOIN encounter e ON e.encounter_id = a.encounter_id
              WHERE e.patient_id = p_patient_id AND a.outcome = 'died') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This patient is recorded as having died.';
  END IF;
END $$

-- The encounter must exist and be at the caller's own hospital: a doctor at
-- Dhaka Medical cannot add a diagnosis to an encounter at Square.
DROP PROCEDURE IF EXISTS require_own_encounter $$
CREATE PROCEDURE require_own_encounter(IN p_account_id INT UNSIGNED, IN p_encounter_id INT UNSIGNED)
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM encounter e JOIN user_account ua ON ua.hospital_id = e.hospital_id
        WHERE e.encounter_id = p_encounter_id AND ua.account_id = p_account_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That encounter does not exist at your hospital.', MYSQL_ERRNO = 5404;
  END IF;
END $$

-- Stricter than require_own_encounter, for everything written INTO an
-- encounter (diagnoses, vitals, drug lines, lab orders, closing it). Being a
-- doctor at the same hospital is not enough (security review A5): it must be
-- the encounter's own doctor — or, for an inpatient stay, a doctor of the
-- admitting department at that hospital, because a ward is run by a team.
-- p_allow_closed: a closed encounter accepts only a prescription amendment
-- (prescribe() stamps it) and the no-op of closing it again.
DROP PROCEDURE IF EXISTS require_encounter_author $$
CREATE PROCEDURE require_encounter_author(
  IN p_account_id   INT UNSIGNED,
  IN p_encounter_id INT UNSIGNED,
  IN p_allow_closed BOOLEAN
)
BEGIN
  DECLARE v_author BOOLEAN;
  DECLARE v_ended  DATETIME;

  CALL require_own_encounter(p_account_id, p_encounter_id);

  SELECT dp.doctor_id <=> ua.doctor_id
         OR (t.code = 'Inpatient' AND EXISTS (
               SELECT 1 FROM doctor_posting mine
                WHERE mine.doctor_id = ua.doctor_id AND mine.hospital_id = e.hospital_id
                  AND mine.department_id = e.department_id
                  AND CURDATE() >= mine.valid_from
                  AND (mine.valid_to IS NULL OR CURDATE() <= mine.valid_to))),
         e.ended_at
    INTO v_author, v_ended
    FROM encounter e
    JOIN doctor_posting dp  ON dp.posting_id = e.posting_id
    JOIN encounter_type t   ON t.type_id = e.type_id
    JOIN user_account ua    ON ua.account_id = p_account_id
   WHERE e.encounter_id = p_encounter_id;

  IF NOT v_author THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only the doctor who opened this encounter (or, for an inpatient, the admitting department) may write to it.',
          MYSQL_ERRNO = 5403;
  END IF;
  IF v_ended IS NOT NULL AND NOT p_allow_closed THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This encounter is closed. Record a new encounter instead of adding to a finished one.';
  END IF;
END $$

-- The admission must be at the caller's hospital (security review A3).
-- Without this, a doctor anywhere could discharge any inpatient in the
-- country by trying admission numbers. "Not at your hospital" and "no such
-- admission" are one answer on purpose: the error does not tell an outsider
-- which numbers exist.
DROP PROCEDURE IF EXISTS require_own_admission $$
CREATE PROCEDURE require_own_admission(IN p_account_id INT UNSIGNED, IN p_admission_id INT UNSIGNED)
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM admission a
         JOIN encounter e     ON e.encounter_id = a.encounter_id
         JOIN user_account ua ON ua.hospital_id = e.hospital_id
        WHERE a.admission_id = p_admission_id AND ua.account_id = p_account_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That admission does not exist at your hospital.', MYSQL_ERRNO = 5404;
  END IF;
END $$


-- =====================================================================
-- 3. LOGIN
-- The password check itself happens in Node (bcrypt.compare), because
-- bcrypt is not a MySQL function. The database hands over the hash and
-- records the login; it never sees the plaintext password.
-- =====================================================================

DROP PROCEDURE IF EXISTS get_login $$
CREATE PROCEDURE get_login(IN p_username VARCHAR(40))
BEGIN
  SELECT ua.account_id, ua.username, ua.password_hash, r.code AS role,
         r.label AS role_label, ua.hospital_id, ua.doctor_id,
         p.uhid AS patient_uhid, account_name(ua.account_id) AS name,
         ua.must_change_password AS must_change
    FROM user_account ua
    JOIN role r ON r.role_id = ua.role_id
    LEFT JOIN patient p ON p.patient_id = ua.patient_id
   WHERE ua.username = p_username AND ua.is_active;
END $$

-- =====================================================================
-- 3b. ACCOUNTS AND PASSWORDS (checklist I1, 7 November 2026)
--
-- Passwords are hashed with bcrypt in Node; the database only ever sees the
-- 60-character hash. A password set by someone else (a new account, a
-- reset) is a one-time password: must_change_password forces its owner to
-- choose their own at the next sign-in.
--
-- Who manages whom: the system admin, any account; a hospital admin, the
-- receptionist, doctor and lab technician accounts of their own hospital.
-- A patient's portal login is issued by reception, in person.
-- =====================================================================

DROP PROCEDURE IF EXISTS require_hash $$
CREATE PROCEDURE require_hash(IN p_hash VARCHAR(100))
BEGIN
  IF p_hash IS NULL OR NOT REGEXP_LIKE(p_hash, '^[$]2[aby][$][0-9]{2}[$].{53}$', 'c') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That is not a bcrypt password hash.';
  END IF;
END $$

-- May this administrator manage an account of this role at this hospital?
DROP PROCEDURE IF EXISTS require_account_scope $$
CREATE PROCEDURE require_account_scope(
  IN p_admin       INT UNSIGNED,
  IN p_role_code   VARCHAR(30),
  IN p_hospital_id SMALLINT UNSIGNED,
  IN p_patient_reg SMALLINT UNSIGNED
)
BEGIN
  DECLARE v_admin_hosp SMALLINT UNSIGNED;
  CALL require_permission(p_admin, 'account.manage');
  SELECT hospital_id INTO v_admin_hosp FROM user_account WHERE account_id = p_admin;
  IF v_admin_hosp IS NOT NULL AND NOT (
       (p_role_code IN ('receptionist', 'doctor', 'lab_technician') AND p_hospital_id <=> v_admin_hosp)
    OR (p_role_code = 'patient' AND p_patient_reg <=> v_admin_hosp)) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A hospital admin manages receptionist, doctor and lab accounts at their own hospital only.',
          MYSQL_ERRNO = 5403;
  END IF;
END $$

-- The caller changes their own password (Node has checked the current one).
DROP PROCEDURE IF EXISTS change_password $$
CREATE PROCEDURE change_password(IN p_account_id INT UNSIGNED, IN p_hash VARCHAR(100))
BEGIN
  CALL require_hash(p_hash);
  UPDATE user_account
     SET password_hash = p_hash, must_change_password = FALSE, password_changed_at = NOW()
   WHERE account_id = p_account_id AND is_active;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such active account.', MYSQL_ERRNO = 5404;
  END IF;
END $$

DROP PROCEDURE IF EXISTS create_staff_account $$
CREATE PROCEDURE create_staff_account(
  IN p_admin       INT UNSIGNED,
  IN p_username    VARCHAR(40),
  IN p_hash        VARCHAR(100),
  IN p_role_code   VARCHAR(30),
  IN p_hospital_id SMALLINT UNSIGNED,
  IN p_doctor_id   SMALLINT UNSIGNED,
  IN p_staff_name  VARCHAR(100)
)
BEGIN
  DECLARE v_role TINYINT UNSIGNED;
  DECLARE v_user VARCHAR(40) DEFAULT LOWER(TRIM(p_username));

  SELECT role_id INTO v_role FROM role WHERE code = p_role_code AND code <> 'patient';
  IF v_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a staff role. Patients get their login from reception.';
  END IF;
  CALL require_account_scope(p_admin, p_role_code, p_hospital_id, NULL);
  CALL require_hash(p_hash);
  IF NOT REGEXP_LIKE(COALESCE(v_user, ''), '^[a-z0-9._-]{3,40}$', 'c') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A username is 3 to 40 letters a-z, digits, dots, dashes or underscores.';
  END IF;
  IF EXISTS (SELECT 1 FROM user_account WHERE username = v_user) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That username is taken.';
  END IF;
  IF p_role_code = 'system_admin' AND p_hospital_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A system admin belongs to no hospital.';
  END IF;
  IF p_role_code <> 'system_admin' AND NOT EXISTS (SELECT 1 FROM hospital WHERE hospital_id = p_hospital_id AND is_active) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose the hospital this account works at.';
  END IF;
  IF p_role_code = 'doctor' THEN
    IF NOT EXISTS (SELECT 1 FROM doctor_posting
                    WHERE doctor_id = p_doctor_id AND hospital_id = p_hospital_id
                      AND CURDATE() >= valid_from AND (valid_to IS NULL OR CURDATE() <= valid_to)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That doctor holds no current posting at this hospital.';
    END IF;
    IF EXISTS (SELECT 1 FROM user_account WHERE doctor_id = p_doctor_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That doctor already has an account. Reset its password instead.';
    END IF;
  END IF;

  -- trg_user_account_bi checks the account's shape (doctor link, staff name).
  INSERT INTO user_account (username, password_hash, role_id, hospital_id, doctor_id, staff_name,
                            must_change_password)
  VALUES (v_user, p_hash, v_role, p_hospital_id, IF(p_role_code = 'doctor', p_doctor_id, NULL),
          IF(p_role_code = 'doctor', NULL, NULLIF(TRIM(p_staff_name), '')), TRUE);
  SELECT LAST_INSERT_ID() AS account_id;
END $$

-- The details an administrator needs to decide whether they may touch an account.
DROP PROCEDURE IF EXISTS require_managed_account $$
CREATE PROCEDURE require_managed_account(IN p_admin INT UNSIGNED, IN p_account_id INT UNSIGNED)
BEGIN
  DECLARE v_role VARCHAR(30);
  DECLARE v_hosp SMALLINT UNSIGNED;
  DECLARE v_reg  SMALLINT UNSIGNED;
  SELECT r.code, ua.hospital_id, p.registered_hospital_id INTO v_role, v_hosp, v_reg
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
    LEFT JOIN patient p ON p.patient_id = ua.patient_id
   WHERE ua.account_id = p_account_id;
  IF v_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such account.', MYSQL_ERRNO = 5404;
  END IF;
  CALL require_account_scope(p_admin, v_role, v_hosp, v_reg);
END $$

-- An administrator sets a one-time password, to be changed at next sign-in.
DROP PROCEDURE IF EXISTS reset_password $$
CREATE PROCEDURE reset_password(IN p_admin INT UNSIGNED, IN p_account_id INT UNSIGNED, IN p_hash VARCHAR(100))
BEGIN
  CALL require_managed_account(p_admin, p_account_id);
  CALL require_hash(p_hash);
  UPDATE user_account SET password_hash = p_hash, must_change_password = TRUE, password_changed_at = NOW()
   WHERE account_id = p_account_id;
END $$

DROP PROCEDURE IF EXISTS set_account_active $$
CREATE PROCEDURE set_account_active(IN p_admin INT UNSIGNED, IN p_account_id INT UNSIGNED, IN p_active BOOLEAN)
BEGIN
  IF p_admin = p_account_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot switch off your own account.';
  END IF;
  CALL require_managed_account(p_admin, p_account_id);
  UPDATE user_account SET is_active = COALESCE(p_active, FALSE) WHERE account_id = p_account_id;
END $$

-- The staff accounts an administrator manages. No hashes leave the database.
DROP PROCEDURE IF EXISTS list_accounts $$
CREATE PROCEDURE list_accounts(IN p_admin INT UNSIGNED)
BEGIN
  DECLARE v_hosp SMALLINT UNSIGNED;
  CALL require_permission(p_admin, 'account.manage');
  SELECT hospital_id INTO v_hosp FROM user_account WHERE account_id = p_admin;
  SELECT ua.account_id AS id, ua.username, r.code AS role, r.label AS roleLabel,
         account_name(ua.account_id) AS name, ua.hospital_id AS hospitalId,
         ua.doctor_id AS doctorId, ua.is_active AS active,
         ua.must_change_password AS mustChange, ua.last_login_at AS lastLoginAt,
         ua.account_id = p_admin AS isYou
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE r.code <> 'patient'
     AND (v_hosp IS NULL OR (ua.hospital_id = v_hosp AND r.code IN ('receptionist', 'doctor', 'lab_technician', 'hospital_admin')))
   ORDER BY ua.hospital_id IS NULL DESC, ua.hospital_id, r.code, ua.username;
END $$

-- Reception gives a patient their portal login, in person, with a one-time
-- password — or a new one-time password if they already have a login.
-- Logged, like any other look at a patient's details.
DROP PROCEDURE IF EXISTS issue_patient_login $$
CREATE PROCEDURE issue_patient_login(
  IN p_account_id INT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_username   VARCHAR(40),
  IN p_hash       VARCHAR(100),
  IN p_ip         VARCHAR(45)
)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_existing INT UNSIGNED;
  DECLARE v_user VARCHAR(40) DEFAULT LOWER(TRIM(p_username));

  CALL require_permission(p_account_id, 'patient.register');
  CALL require_patient(p_uhid, v_patient);
  CALL require_hash(p_hash);
  SELECT account_id INTO v_existing FROM user_account WHERE patient_id = v_patient;

  IF v_existing IS NULL THEN
    IF NOT REGEXP_LIKE(COALESCE(v_user, ''), '^[a-z0-9._-]{3,40}$', 'c') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A username is 3 to 40 letters a-z, digits, dots, dashes or underscores.';
    END IF;
    IF EXISTS (SELECT 1 FROM user_account WHERE username = v_user) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That username is taken.';
    END IF;
    INSERT INTO user_account (username, password_hash, role_id, patient_id, must_change_password)
    VALUES (v_user, p_hash, (SELECT role_id FROM role WHERE code = 'patient'), v_patient, TRUE);
  ELSE
    UPDATE user_account SET password_hash = p_hash, must_change_password = TRUE,
                            password_changed_at = NOW(), is_active = TRUE
     WHERE account_id = v_existing;
  END IF;

  INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis, ip_address)
  SELECT v_patient, p_account_id, ua.hospital_id, 'login.issued', 'demographics_only', p_ip
    FROM user_account ua WHERE ua.account_id = p_account_id;

  SELECT username FROM user_account WHERE patient_id = v_patient;
END $$

DROP PROCEDURE IF EXISTS record_login $$
CREATE PROCEDURE record_login(IN p_account_id INT UNSIGNED)
BEGIN
  UPDATE user_account SET last_login_at = NOW() WHERE account_id = p_account_id;
END $$


-- =====================================================================
-- 4. REGISTRATION — decision 1, the UHID is issued in one place
--
-- register_patient() is the only way a patient row is created. It
--   1. refuses a second UHID for an NID that already has one,
--   2. takes the next serial from uhid_sequence UNDER A ROW LOCK,
--   3. builds BD-<year>-<serial>-<check>, which the CHECK constraints on
--      patient then verify independently,
--   4. records any allergies named at registration against the catalogue.
-- All in one transaction: a registration either happens completely or not
-- at all, and a serial is never consumed by a registration that failed.
-- =====================================================================

DROP PROCEDURE IF EXISTS register_patient $$
CREATE PROCEDURE register_patient(
  IN p_account_id   INT UNSIGNED,
  IN p_name         VARCHAR(100),
  IN p_dob          DATE,
  IN p_sex          VARCHAR(10),
  IN p_blood        VARCHAR(8),
  IN p_phone        VARCHAR(20),
  IN p_nid          VARCHAR(17),
  IN p_district     VARCHAR(60),
  IN p_address      VARCHAR(200),
  IN p_kin_name     VARCHAR(100),
  IN p_kin_relation VARCHAR(30),
  IN p_kin_phone    VARCHAR(20),
  IN p_allergies    VARCHAR(500)    -- comma-separated allergen names, or NULL
)
BEGIN
  DECLARE v_hospital  SMALLINT UNSIGNED;
  DECLARE v_district  SMALLINT UNSIGNED;
  DECLARE v_existing  CHAR(15);
  DECLARE v_year      SMALLINT UNSIGNED DEFAULT YEAR(CURDATE());
  DECLARE v_serial    MEDIUMINT UNSIGNED;
  DECLARE v_serial5   CHAR(5);
  DECLARE v_uhid      CHAR(15);
  DECLARE v_patient   INT UNSIGNED;
  -- Spaces and dashes typed in an NID are dropped, so '1978 4199 2304 1'
  -- and '1978419923041' are one NID, not two (stress test H2.7).
  DECLARE v_nid       VARCHAR(17) DEFAULT NULLIF(REGEXP_REPLACE(COALESCE(p_nid, ''), '[ -]', ''), '');
  DECLARE v_list      VARCHAR(500) DEFAULT NULLIF(TRIM(p_allergies), '');
  DECLARE v_item      VARCHAR(80);
  DECLARE v_allergen  SMALLINT UNSIGNED;
  DECLARE v_msg       VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'patient.register');

  SELECT hospital_id INTO v_hospital FROM user_account WHERE account_id = p_account_id;

  IF NULLIF(TRIM(p_name), '') IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enter the full name before issuing a UHID.';
  END IF;
  IF p_dob IS NULL OR p_dob > CURDATE() OR p_dob < '1900-01-01' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enter a real date of birth: not in the future, not before 1900.';
  END IF;
  IF v_nid IS NOT NULL AND NOT REGEXP_LIKE(v_nid, '^([0-9]{10}|[0-9]{13}|[0-9]{17})$') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A national ID has 10, 13 or 17 digits.';
  END IF;
  IF NULLIF(TRIM(p_phone), '') IS NOT NULL AND NOT REGEXP_LIKE(TRIM(p_phone), '^[+]?[0-9][0-9 -]{6,18}[0-9]$') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enter the mobile number as digits, e.g. 01711-482031.';
  END IF;

  IF NULLIF(TRIM(p_district), '') IS NOT NULL THEN
    SELECT district_id INTO v_district FROM district WHERE name = TRIM(p_district);
    IF v_district IS NULL THEN
      SET v_msg = CONCAT('Unknown district "', p_district, '". Choose one of the 64 districts.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
  END IF;

  START TRANSACTION;

  -- Decision 1. uq_patient_nid would refuse this anyway; checking first is
  -- what lets the message name the UHID the patient already has.
  IF v_nid IS NOT NULL THEN
    SELECT uhid INTO v_existing FROM patient WHERE nid = v_nid;
    IF v_existing IS NOT NULL THEN
      SET v_msg = CONCAT('This NID already holds UHID ', v_existing,
                         '. Open the existing record instead of creating a second one.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
  END IF;

  -- The lock. INSERT IGNORE makes sure this year's counter row exists;
  -- SELECT ... FOR UPDATE then takes it. A second registration arriving now
  -- waits on this line until we COMMIT, then reads the serial we wrote.
  INSERT IGNORE INTO uhid_sequence (year, last_serial) VALUES (v_year, 0);
  SELECT last_serial + 1 INTO v_serial FROM uhid_sequence WHERE year = v_year FOR UPDATE;
  UPDATE uhid_sequence SET last_serial = v_serial WHERE year = v_year;

  SET v_serial5 = LPAD(v_serial, 5, '0');
  SET v_uhid    = CONCAT('BD-', v_year, '-', v_serial5, '-', uhid_check_digit(v_serial5));

  INSERT INTO patient
    (uhid, name, dob, sex, blood_group, phone, nid, district_id, address,
     kin_name, kin_relation, kin_phone, registered_at, registered_hospital_id,
     identity_verified, verified_by, verified_at)
  VALUES
    (v_uhid, TRIM(p_name), p_dob, p_sex, COALESCE(NULLIF(p_blood, ''), 'Unknown'),
     NULLIF(TRIM(p_phone), ''), v_nid, v_district, NULLIF(TRIM(p_address), ''),
     NULLIF(TRIM(p_kin_name), ''), NULLIF(TRIM(p_kin_relation), ''), NULLIF(TRIM(p_kin_phone), ''),
     CURDATE(), v_hospital,
     v_nid IS NOT NULL,
     IF(v_nid IS NOT NULL, p_account_id, NULL),
     IF(v_nid IS NOT NULL, NOW(), NULL));

  SET v_patient = LAST_INSERT_ID();

  -- 'Penicillin, Aspirin' → one patient_allergy row each. Walk the list
  -- with SUBSTRING_INDEX: take everything before the first comma, then cut
  -- it off, until nothing is left.
  WHILE v_list IS NOT NULL DO
    SET v_item = TRIM(SUBSTRING_INDEX(v_list, ',', 1));
    SET v_list = IF(LOCATE(',', v_list) > 0,
                    NULLIF(TRIM(SUBSTRING(v_list, LOCATE(',', v_list) + 1)), ''),
                    NULL);
    IF v_item <> '' THEN
      SET v_allergen = NULL;
      SELECT allergen_id INTO v_allergen FROM allergen WHERE name = v_item;
      IF v_allergen IS NULL THEN
        SET v_msg = CONCAT('"', v_item, '" is not in the allergen catalogue. Use the catalogue name, e.g. Penicillin.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
      END IF;
      INSERT IGNORE INTO patient_allergy (patient_id, allergen_id, severity, note)
      VALUES (v_patient, v_allergen, 'Moderate', 'Reported by the patient at registration; severity not yet assessed');
    END IF;
  END WHILE;

  COMMIT;

  -- The new patient in the search-list shape, so the API can answer without
  -- a SELECT of its own (uhid_app has no SELECT on v_patient_directory).
  SELECT v.*, v_patient AS patient_id FROM v_patient_directory v WHERE v.uhid = v_uhid;
END $$


-- =====================================================================
-- 4b. FINDING A PATIENT — security review L1
--
-- There is no national patient list. Before 6 November 2026 the API read
-- v_patient_directory whole: every staff account could download every
-- patient's name, date of birth, phone and NID in one request, unlogged.
-- Now a search must be specific, returns at most 20 people, masks the NID
-- and phone, and logs every person it returns ('search.match' in
-- access_log), so a patient can see who looked them up.
--
-- Both procedures fill a temporary table with the matching patient_ids and
-- hand it to search_results(), which does the logging and the masking in
-- one place.
-- =====================================================================

DROP PROCEDURE IF EXISTS search_results $$
CREATE PROCEDURE search_results(IN p_account_id INT UNSIGNED, IN p_ip VARCHAR(45))
BEGIN
  INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis, ip_address)
  SELECT s.patient_id, p_account_id, ua.hospital_id, 'search.match', 'demographics_only', p_ip
    FROM tmp_search s JOIN user_account ua ON ua.account_id = p_account_id;

  SELECT p.uhid, p.name, p.dob, p.sex, p.blood_group AS blood,
         -- 01711-482031 → 017•••••031 ; 1978419923041 → •••••••••3041
         IF(p.phone IS NULL, '', CONCAT(LEFT(p.phone, 3), '•••••', RIGHT(p.phone, 3))) AS phone,
         IF(p.nid IS NULL, '', CONCAT(REPEAT('•', CHAR_LENGTH(p.nid) - 4), RIGHT(p.nid, 4))) AS nid,
         COALESCE(d.name, '') AS district,
         p.registered_at AS registeredAt, p.registered_hospital_id AS registeredHospitalId,
         p.identity_verified AS identityVerified,
         (SELECT COUNT(*) FROM encounter e WHERE e.patient_id = p.patient_id) AS encounterCount,
         s.matched_on AS matchedOn
    FROM tmp_search s
    JOIN patient p       ON p.patient_id = s.patient_id
    LEFT JOIN district d ON d.district_id = p.district_id
   ORDER BY p.name, p.uhid;

  DROP TEMPORARY TABLE IF EXISTS tmp_search;
END $$

-- The search box. The query must say WHO, not "everyone":
--   a UHID (an old merged-away one finds the surviving record),
--   an NID (10, 13 or 17 digits), a mobile number (11 digits),
--   or at least 3 letters of the name.
DROP PROCEDURE IF EXISTS search_patients $$
CREATE PROCEDURE search_patients(IN p_account_id INT UNSIGNED, IN p_query VARCHAR(100), IN p_ip VARCHAR(45))
BEGIN
  DECLARE v_q      VARCHAR(100) DEFAULT TRIM(COALESCE(p_query, ''));
  DECLARE v_digits VARCHAR(100);
  DECLARE v_like   VARCHAR(220);

  CALL require_permission(p_account_id, 'patient.read_demographics');

  SET v_digits = REGEXP_REPLACE(v_q, '[^0-9]', '');
  DROP TEMPORARY TABLE IF EXISTS tmp_search;
  CREATE TEMPORARY TABLE tmp_search (patient_id INT UNSIGNED PRIMARY KEY, matched_on VARCHAR(40));

  IF REGEXP_LIKE(UPPER(v_q), '^BD-[0-9]{4}-[0-9]{5}-[0-9]$') THEN
    INSERT INTO tmp_search
    SELECT resolve_patient(UPPER(v_q)), 'UHID' FROM DUAL WHERE resolve_patient(UPPER(v_q)) IS NOT NULL;

  ELSEIF NOT REGEXP_LIKE(v_q, '[[:alpha:]]') AND LEFT(v_q, 1) <> '+' AND CHAR_LENGTH(v_digits) IN (10, 13, 17) THEN
    INSERT INTO tmp_search
    SELECT p.patient_id, 'NID' FROM patient p
     WHERE p.nid = v_digits
       AND NOT EXISTS (SELECT 1 FROM patient_merge m WHERE m.losing_patient_id = p.patient_id);

  ELSEIF NOT REGEXP_LIKE(v_q, '[[:alpha:]]') AND CHAR_LENGTH(local_phone(v_q)) = 11 THEN
    INSERT INTO tmp_search
    SELECT p.patient_id, 'mobile number' FROM patient p
     WHERE local_phone(p.phone) = local_phone(v_q)
       AND NOT EXISTS (SELECT 1 FROM patient_merge m WHERE m.losing_patient_id = p.patient_id)
     ORDER BY p.name LIMIT 20;

  ELSEIF CHAR_LENGTH(REGEXP_REPLACE(v_q, '[^[:alpha:]]', '')) >= 3 THEN
    -- % and _ typed in the box are letters to find, not wildcards.
    SET v_like = CONCAT('%', REPLACE(REPLACE(REPLACE(v_q, '\\', '\\\\'), '%', '\\%'), '_', '\\_'), '%');
    INSERT INTO tmp_search
    SELECT p.patient_id, 'name' FROM patient p
     WHERE p.name LIKE v_like
       AND NOT EXISTS (SELECT 1 FROM patient_merge m WHERE m.losing_patient_id = p.patient_id)
     ORDER BY p.name LIMIT 20;

  ELSE
    DROP TEMPORARY TABLE IF EXISTS tmp_search;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Search by UHID, NID, an 11-digit mobile number, or at least 3 letters of the name.';
  END IF;

  CALL search_results(p_account_id, p_ip);
END $$

-- Decision 1 at the registration desk: before a UHID is issued, does this
-- person already have one? Same NID, same name and date of birth, or same
-- mobile number. register_patient() refuses a repeated NID outright; the
-- other two are only warnings (twins share a birthday, families share a
-- phone), so the screen shows them and a person decides.
DROP PROCEDURE IF EXISTS registration_matches $$
CREATE PROCEDURE registration_matches(
  IN p_account_id INT UNSIGNED,
  IN p_name       VARCHAR(100),
  IN p_dob        DATE,
  IN p_phone      VARCHAR(20),
  IN p_nid        VARCHAR(17),
  IN p_ip         VARCHAR(45)
)
BEGIN
  DECLARE v_nid    VARCHAR(17)  DEFAULT NULLIF(REGEXP_REPLACE(COALESCE(p_nid, ''), '[ -]', ''), '');
  DECLARE v_name   VARCHAR(100) DEFAULT NULLIF(TRIM(p_name), '');
  DECLARE v_digits VARCHAR(30)  DEFAULT local_phone(p_phone);
  DECLARE v_like   VARCHAR(220);

  CALL require_permission(p_account_id, 'patient.register');

  -- The name need not be typed in full: "Md. Rahim" with the right date of
  -- birth already finds "Md. Rahim Uddin". At least 3 letters, and % or _
  -- typed in the box are letters, not wildcards.
  IF CHAR_LENGTH(REGEXP_REPLACE(COALESCE(v_name, ''), '[^[:alpha:]]', '')) >= 3 THEN
    SET v_like = CONCAT('%', REPLACE(REPLACE(REPLACE(v_name, '\\', '\\\\'), '%', '\\%'), '_', '\\_'), '%');
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_search;
  CREATE TEMPORARY TABLE tmp_search (patient_id INT UNSIGNED PRIMARY KEY, matched_on VARCHAR(40));

  INSERT INTO tmp_search
  SELECT p.patient_id,
         CASE WHEN p.nid = v_nid THEN 'same NID'
              WHEN p.name LIKE v_like AND p.dob = p_dob THEN 'same name and date of birth'
              ELSE 'same mobile number' END
    FROM patient p
   WHERE (p.nid = v_nid
          OR (p.name LIKE v_like AND p.dob = p_dob)
          OR (CHAR_LENGTH(v_digits) >= 11 AND local_phone(p.phone) = v_digits))
     AND NOT EXISTS (SELECT 1 FROM patient_merge m WHERE m.losing_patient_id = p.patient_id)
   ORDER BY p.name
   LIMIT 10;

  CALL search_results(p_account_id, p_ip);
END $$


-- =====================================================================
-- 5. AVAILABILITY — decision 3, computed, never stored
--
--   available = slots generated from doctor_schedule
--             − slots overlapping doctor_leave
--             − slots already booked
--
-- A recursive CTE generates the slots. Read it in four parts:
--   days      one row per date in the window       (recursive)
--   sessions  the schedule rows that apply to each date
--   slots     each session cut into slot_minutes pieces   (recursive)
--   final     subtract leave, mark booked slots as taken
--
-- p_posting_id NULL = every current posting at once, which is how the
-- doctor directory finds each doctor's next free slot in one call.
-- =====================================================================

DROP PROCEDURE IF EXISTS doctor_availability $$
CREATE PROCEDURE doctor_availability(
  IN p_posting_id MEDIUMINT UNSIGNED,
  IN p_from       DATE,
  IN p_days       TINYINT UNSIGNED
)
BEGIN
  WITH RECURSIVE
  days AS (
    SELECT p_from AS d
    UNION ALL
    SELECT d + INTERVAL 1 DAY FROM days WHERE d < p_from + INTERVAL (p_days - 1) DAY
  ),
  sessions AS (
    SELECT dp.posting_id, dp.doctor_id, days.d, s.start_time, s.end_time, s.slot_minutes
      FROM days
      JOIN doctor_schedule s ON s.weekday = DAYOFWEEK(days.d) - 1   -- DAYOFWEEK: 1 = Sunday
                            AND days.d >= s.valid_from
                            AND (s.valid_to IS NULL OR days.d <= s.valid_to)
      JOIN doctor_posting dp ON dp.posting_id = s.posting_id
                            AND days.d >= dp.valid_from
                            AND (dp.valid_to IS NULL OR days.d <= dp.valid_to)
     WHERE p_posting_id IS NULL OR dp.posting_id = p_posting_id
  ),
  slots AS (
    SELECT posting_id, doctor_id, d, slot_minutes,
           TIMESTAMP(d, end_time)   AS session_end,
           TIMESTAMP(d, start_time) AS slot_start
      FROM sessions
    UNION ALL
    SELECT posting_id, doctor_id, d, slot_minutes, session_end,
           slot_start + INTERVAL slot_minutes MINUTE
      FROM slots
     WHERE slot_start + INTERVAL (2 * slot_minutes) MINUTE <= session_end
  )
  SELECT sl.posting_id,
         sl.slot_start,
         sl.slot_start + INTERVAL sl.slot_minutes MINUTE AS slot_end,
         EXISTS (
           SELECT 1 FROM appointment a
            WHERE a.doctor_id = sl.doctor_id
              AND a.status <> 'cancelled'
              AND a.slot_start < sl.slot_start + INTERVAL sl.slot_minutes MINUTE
              AND a.slot_end   > sl.slot_start
         ) AS taken
    FROM slots sl
   WHERE sl.slot_start > NOW()
     AND NOT EXISTS (
           SELECT 1 FROM doctor_leave l
            WHERE l.doctor_id = sl.doctor_id
              AND l.from_at < sl.slot_start + INTERVAL sl.slot_minutes MINUTE
              AND l.to_at   > sl.slot_start
         )
   ORDER BY sl.posting_id, sl.slot_start;
END $$


-- =====================================================================
-- 6. BOOKING — decision 4, two patients can never take one slot
--
-- The UNIQUE key uq_doctor_slot is the real guard. This procedure exists so
-- that the loser of a race is told "that slot has just gone" instead of
-- seeing a duplicate-key error, and so that a slot outside the doctor's
-- schedule or inside their leave is refused.
--
-- Why FOR UPDATE on the doctor row: two bookings for the same doctor now
-- queue on that one row. The second waits until the first COMMITs, then
-- runs its checks against what the first wrote.
--
-- Why the "already taken" check is ALSO a locking read: MySQL's default
-- isolation level is REPEATABLE READ, where a plain SELECT reads a snapshot
-- of the database taken at the transaction's first plain read. A locking
-- read (FOR UPDATE / FOR SHARE) always reads the latest committed rows. The
-- check has to see the booking the other session just committed, so it
-- locks. Get this wrong and both sessions pass the check and one hits the
-- UNIQUE key — still safe, but the user gets an ugly error.
-- =====================================================================

DROP PROCEDURE IF EXISTS book_appointment $$
CREATE PROCEDURE book_appointment(
  IN p_account_id INT UNSIGNED,
  IN p_posting_id MEDIUMINT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_slot_start DATETIME
)
BEGIN
  DECLARE v_patient   INT UNSIGNED;
  DECLARE v_role      VARCHAR(30);
  DECLARE v_own       INT UNSIGNED;
  DECLARE v_doctor    SMALLINT UNSIGNED;
  DECLARE v_minutes   TINYINT UNSIGNED;
  DECLARE v_slot_end  DATETIME;
  DECLARE v_clash     INT;
  DECLARE v_appt      INT UNSIGNED;

  -- Most specific handler wins: 1062 (duplicate key) before SQLEXCEPTION.
  DECLARE EXIT HANDLER FOR 1062
  BEGIN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That slot has just been taken by another booking. Please choose another.';
  END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'appointment.book');
  CALL require_patient(p_uhid, v_patient);
  CALL require_alive(v_patient);

  -- A patient may book only for themselves.
  SELECT r.code, ua.patient_id INTO v_role, v_own
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id;
  IF v_role = 'patient' AND v_own <> v_patient THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient can only book appointments for themselves.', MYSQL_ERRNO = 5403;
  END IF;

  IF p_slot_start <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That slot is in the past.';
  END IF;

  START TRANSACTION;

  SELECT dp.doctor_id INTO v_doctor
    FROM doctor_posting dp
   WHERE dp.posting_id = p_posting_id
     AND DATE(p_slot_start) >= dp.valid_from
     AND (dp.valid_to IS NULL OR DATE(p_slot_start) <= dp.valid_to);
  IF v_doctor IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That doctor does not hold this posting on that date.', MYSQL_ERRNO = 5404;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM doctor_posting dp
                   JOIN doctor d   ON d.doctor_id = dp.doctor_id
                   JOIN hospital h ON h.hospital_id = dp.hospital_id
                  WHERE dp.posting_id = p_posting_id AND d.is_active AND h.is_active) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That doctor or hospital is not taking bookings.', MYSQL_ERRNO = 5404;
  END IF;

  -- Serialise on the DOCTOR, not the posting: one human, one diary, however
  -- many hospitals they work at.
  SELECT doctor_id INTO v_doctor FROM doctor WHERE doctor_id = v_doctor FOR UPDATE;

  -- The slot must start exactly on a slot boundary inside a schedule session.
  SELECT s.slot_minutes INTO v_minutes
    FROM doctor_schedule s
   WHERE s.posting_id = p_posting_id
     AND s.weekday = DAYOFWEEK(p_slot_start) - 1
     AND DATE(p_slot_start) >= s.valid_from
     AND (s.valid_to IS NULL OR DATE(p_slot_start) <= s.valid_to)
     AND TIME(p_slot_start) >= s.start_time
     AND ADDTIME(TIME(p_slot_start), SEC_TO_TIME(s.slot_minutes * 60)) <= s.end_time
     AND MOD(TIMESTAMPDIFF(MINUTE, TIMESTAMP(DATE(p_slot_start), s.start_time), p_slot_start),
             s.slot_minutes) = 0
   LIMIT 1;
  IF v_minutes IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That time is not one of the doctor''s scheduled slots.';
  END IF;
  SET v_slot_end = p_slot_start + INTERVAL v_minutes MINUTE;

  IF EXISTS (SELECT 1 FROM doctor_leave
              WHERE doctor_id = v_doctor AND from_at < v_slot_end AND to_at > p_slot_start) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The doctor is on leave at that time.';
  END IF;

  -- Overlap, not just equal start: a 15-minute slot at one hospital and a
  -- 20-minute slot at another can collide without starting together.
  SELECT COUNT(*) INTO v_clash
    FROM appointment
   WHERE doctor_id = v_doctor AND status <> 'cancelled'
     AND slot_start < v_slot_end AND slot_end > p_slot_start
     FOR UPDATE;
  IF v_clash > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That slot has just been taken by another booking. Please choose another.';
  END IF;

  INSERT INTO appointment (posting_id, doctor_id, patient_id, slot_start, slot_end, booked_by)
  VALUES (p_posting_id, v_doctor, v_patient, p_slot_start, v_slot_end, p_account_id);
  SET v_appt = LAST_INSERT_ID();

  COMMIT;

  SELECT v_appt AS appointment_id, p_slot_start AS slot_start, v_slot_end AS slot_end;
END $$

DROP PROCEDURE IF EXISTS cancel_appointment $$
CREATE PROCEDURE cancel_appointment(IN p_account_id INT UNSIGNED, IN p_appointment_id INT UNSIGNED)
BEGIN
  DECLARE v_role VARCHAR(30);
  DECLARE v_own  INT UNSIGNED;
  DECLARE v_pat  INT UNSIGNED;
  DECLARE v_st   VARCHAR(20);
  DECLARE v_appt_hosp SMALLINT UNSIGNED;
  DECLARE v_my_hosp   SMALLINT UNSIGNED;
  DECLARE v_booked_by INT UNSIGNED;

  CALL require_permission(p_account_id, 'appointment.cancel');

  SELECT a.patient_id, a.status, dp.hospital_id, a.booked_by
    INTO v_pat, v_st, v_appt_hosp, v_booked_by
    FROM appointment a JOIN doctor_posting dp ON dp.posting_id = a.posting_id
   WHERE a.appointment_id = p_appointment_id;
  IF v_pat IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such appointment.', MYSQL_ERRNO = 5404;
  END IF;

  SELECT r.code, ua.patient_id, ua.hospital_id INTO v_role, v_own, v_my_hosp
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id;
  IF v_role = 'patient' AND v_own <> v_pat THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient can only cancel their own appointments.', MYSQL_ERRNO = 5403;
  END IF;
  -- Staff cancel at their own hospital, or a booking they made themselves
  -- (booking is national, so a receptionist may have booked it elsewhere).
  -- Security review A4: appointment numbers count up from 1, and without
  -- this any receptionist could cancel any appointment in the country.
  IF v_role <> 'patient' AND NOT (v_appt_hosp <=> v_my_hosp) AND v_booked_by <> p_account_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'You can cancel only appointments at your own hospital, or ones you booked yourself.', MYSQL_ERRNO = 5403;
  END IF;
  IF v_st <> 'booked' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a booked appointment can be cancelled.';
  END IF;
  -- Checklist I2: a slot that has already started is attended or missed,
  -- not cancelled — cancelling it would erase that the patient did not come.
  IF (SELECT slot_start FROM appointment WHERE appointment_id = p_appointment_id) <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This appointment has already started. Mark it as missed instead.';
  END IF;

  -- active_slot becomes NULL with this UPDATE, which frees the slot in
  -- uq_doctor_slot for the next patient.
  UPDATE appointment SET status = 'cancelled' WHERE appointment_id = p_appointment_id;
END $$

-- The appointment lists (checklist I2, 7 November 2026). Who sees what is
-- decided here, by role, never by the screen:
--   patient                      their own appointments, at every hospital
--   doctor                       their own list (all their postings)
--   receptionist, hospital admin the appointments at their own hospital
-- Anyone without appointment.book (lab technician, system admin) is refused.
-- No clinical content: who, when, with which doctor — what the front desk
-- already sees when it books. canCancel / canNoShow apply the same rules as
-- cancel_appointment() and mark_no_show(), so the screen offers only what
-- those will allow; the procedures check again when they are called.
DROP PROCEDURE IF EXISTS list_appointments $$
CREATE PROCEDURE list_appointments(IN p_account_id INT UNSIGNED, IN p_from DATE, IN p_days SMALLINT)
BEGIN
  DECLARE v_role VARCHAR(30);
  DECLARE v_pat  INT UNSIGNED;
  DECLARE v_hosp SMALLINT UNSIGNED;
  DECLARE v_doc  SMALLINT UNSIGNED;

  CALL require_permission(p_account_id, 'appointment.book');
  IF p_from IS NULL OR p_days IS NULL OR p_days < 1 OR p_days > 62 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Give a start date and between 1 and 62 days.';
  END IF;

  SELECT r.code, ua.patient_id, ua.hospital_id, ua.doctor_id INTO v_role, v_pat, v_hosp, v_doc
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id;

  SELECT a.appointment_id AS id,
         a.slot_start     AS slotStart,
         a.slot_end       AS slotEnd,
         a.status,
         p.uhid,
         p.name           AS patientName,
         d.name           AS doctorName,
         dept.name        AS dept,
         dp.hospital_id   AS hospitalId,
         a.posting_id     AS postingId,
         a.encounter_id   AS encounterId,
         a.booked_at      AS bookedAt,
         -- the same rules as cancel_appointment()
         (a.status = 'booked' AND a.slot_start > NOW()
           AND (v_role = 'patient' OR dp.hospital_id <=> v_hosp OR a.booked_by = p_account_id)
           AND has_permission(p_account_id, 'appointment.cancel')) AS canCancel,
         -- the same rules as mark_no_show()
         (a.status = 'booked' AND a.slot_start <= NOW() AND v_role <> 'patient'
           AND dp.hospital_id <=> v_hosp
           AND has_permission(p_account_id, 'appointment.cancel')) AS canNoShow
    FROM appointment a
    JOIN doctor_posting dp ON dp.posting_id = a.posting_id
    JOIN doctor d          ON d.doctor_id = a.doctor_id
    JOIN department dept   ON dept.department_id = dp.department_id
    JOIN patient p         ON p.patient_id = a.patient_id
   WHERE a.slot_start >= p_from
     AND a.slot_start <  p_from + INTERVAL p_days DAY
     AND CASE v_role
           WHEN 'patient' THEN a.patient_id = v_pat
           WHEN 'doctor'  THEN a.doctor_id = v_doc
           ELSE dp.hospital_id <=> v_hosp
         END
   ORDER BY a.slot_start, d.name;
END $$

-- The patient did not come. Only after the slot has started, only by staff
-- at the appointment's own hospital, only for a booking still 'booked'.
-- The slot stays taken (active_slot is not NULL for 'no_show'): the time
-- has passed, and the record of the missed visit is kept.
DROP PROCEDURE IF EXISTS mark_no_show $$
CREATE PROCEDURE mark_no_show(IN p_account_id INT UNSIGNED, IN p_appointment_id INT UNSIGNED)
BEGIN
  DECLARE v_role  VARCHAR(30);
  DECLARE v_mine  SMALLINT UNSIGNED;
  DECLARE v_hosp  SMALLINT UNSIGNED;
  DECLARE v_st    VARCHAR(20);
  DECLARE v_start DATETIME;

  CALL require_permission(p_account_id, 'appointment.cancel');
  SELECT r.code, ua.hospital_id INTO v_role, v_mine
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id;
  IF v_role = 'patient' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only hospital staff record a missed appointment.', MYSQL_ERRNO = 5403;
  END IF;

  SELECT dp.hospital_id, a.status, a.slot_start INTO v_hosp, v_st, v_start
    FROM appointment a JOIN doctor_posting dp ON dp.posting_id = a.posting_id
   WHERE a.appointment_id = p_appointment_id;
  IF v_st IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such appointment.', MYSQL_ERRNO = 5404;
  END IF;
  IF NOT (v_hosp <=> v_mine) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can mark only appointments at your own hospital.', MYSQL_ERRNO = 5403;
  END IF;
  IF v_st <> 'booked' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a booked appointment can be marked as missed.';
  END IF;
  IF v_start > NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An appointment cannot be missed before it starts.';
  END IF;

  -- AND status = 'booked' again: if the doctor opened the visit a moment
  -- ago, this changes nothing rather than overwrite 'attended'.
  UPDATE appointment SET status = 'no_show' WHERE appointment_id = p_appointment_id AND status = 'booked';
END $$


-- =====================================================================
-- 7. THE CLINICAL RECORD — decision 2, access is granted, not assumed
--
-- MySQL has no SELECT trigger, so "a trigger logs every read" cannot be
-- literally true. This procedure IS the read: it decides on what basis the
-- caller may see the record, writes that to access_log, and only then
-- returns the rows. The application user has no SELECT on encounter,
-- prescription or the other clinical tables, so there is no way to read a
-- record without passing through here and leaving a log row behind.
--
-- The basis, checked in this order:
--   own_record        a patient reading their own record
--   treating          a clinician at a hospital with an OPEN encounter for
--                     this patient
--   consent           a live consent_grant to the reader's hospital (and to
--                     the reader, if the grant names a doctor)
--   break_glass       none of the above, the reader asked for break-glass and
--                     gave a reason. Allowed, flagged, and queued for review.
--   demographics_only reception and admin roles: name, age, phone — no
--                     clinical content at all
-- A clinician with none of these is refused with errno 5423, which the
-- record screen answers with the break-glass prompt.
--
-- Returns eight result sets, always all eight (empty when not permitted):
--   1 patient + basis   2 allergies   3 encounters   4 prescription lines
--   5 lab results       6 vitals      7 referrals    8 who has read this
-- =====================================================================

DROP PROCEDURE IF EXISTS get_patient_record $$
CREATE PROCEDURE get_patient_record(
  IN p_account_id    INT UNSIGNED,
  IN p_uhid          VARCHAR(20),
  IN p_break_glass   BOOLEAN,
  IN p_justification VARCHAR(300),
  IN p_ip            VARCHAR(45)
)
BEGIN
  DECLARE v_patient   INT UNSIGNED;
  DECLARE v_role      VARCHAR(30);
  DECLARE v_hospital  SMALLINT UNSIGNED;
  DECLARE v_doctor    SMALLINT UNSIGNED;
  DECLARE v_own       INT UNSIGNED;
  DECLARE v_basis     VARCHAR(20);
  DECLARE v_grant_exp DATETIME;
  DECLARE v_clinical  BOOLEAN;

  SELECT r.code, ua.hospital_id, ua.doctor_id, ua.patient_id
    INTO v_role, v_hospital, v_doctor, v_own
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id AND ua.is_active;

  -- A patient gets the same answer for someone else's UHID and for one that
  -- does not exist, so the record screen cannot be used to discover which
  -- UHIDs are real (stress test H3.2).
  IF v_role = 'patient' AND NOT (resolve_patient(p_uhid) <=> v_own) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient can only open their own record.', MYSQL_ERRNO = 5403;
  END IF;

  CALL require_patient(p_uhid, v_patient);

  IF v_role = 'patient' THEN
    IF v_own <> v_patient THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient can only open their own record.', MYSQL_ERRNO = 5403;
    END IF;
    SET v_basis = 'own_record';

  ELSEIF has_permission(p_account_id, 'patient.read_clinical') THEN
    SELECT MAX(g.expires_at) INTO v_grant_exp
      FROM consent_grant g
     WHERE g.patient_id = v_patient
       AND g.to_hospital_id = v_hospital
       AND (g.to_doctor_id IS NULL OR g.to_doctor_id = v_doctor)
       AND g.scope IN ('clinical','full')
       AND g.revoked_at IS NULL
       AND NOW() BETWEEN g.granted_at AND g.expires_at;

    -- 'treating' (security review A2): an open encounter at this hospital
    -- that is the reader's own, or in a department the reader is posted to.
    -- Not "any open encounter at my hospital", which let every doctor there
    -- read every inpatient. And an OPD visit counts only on the day it began:
    -- an outpatient encounter left open does not grant access for ever.
    IF EXISTS (SELECT 1
                 FROM encounter e
                 JOIN doctor_posting dp ON dp.posting_id = e.posting_id
                 JOIN encounter_type t  ON t.type_id = e.type_id
                WHERE e.patient_id = v_patient AND e.hospital_id = v_hospital
                  AND e.ended_at IS NULL
                  AND (t.code <> 'OPD' OR e.started_at >= CURDATE())
                  AND (dp.doctor_id = v_doctor
                       OR e.department_id IN (
                            SELECT mine.department_id FROM doctor_posting mine
                             WHERE mine.doctor_id = v_doctor AND mine.hospital_id = v_hospital
                               AND CURDATE() >= mine.valid_from
                               AND (mine.valid_to IS NULL OR CURDATE() <= mine.valid_to)))) THEN
      SET v_basis = 'treating';
    ELSEIF v_grant_exp IS NOT NULL THEN
      SET v_basis = 'consent';
    ELSEIF p_break_glass AND CHAR_LENGTH(TRIM(COALESCE(p_justification, ''))) >= 8 THEN
      SET v_basis = 'break_glass';
    ELSEIF p_break_glass THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Break-glass needs a written reason of at least 8 characters.';
    ELSE
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'You have no consent grant or open encounter for this patient. Use break-glass only in an emergency.',
            MYSQL_ERRNO = 5423;
    END IF;

  ELSEIF has_permission(p_account_id, 'patient.read_demographics') THEN
    SET v_basis = 'demographics_only';

  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your role cannot open patient records.', MYSQL_ERRNO = 5403;
  END IF;

  SET v_clinical = v_basis <> 'demographics_only';

  -- The log row is written BEFORE any data is returned. If this INSERT
  -- fails, the procedure stops here and nothing is read.
  INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis,
                          is_break_glass, justification, ip_address)
  VALUES (v_patient, p_account_id, v_hospital,
          IF(v_clinical, 'record.read', 'record.demographics'),
          v_basis, v_basis = 'break_glass',
          IF(v_basis = 'break_glass', TRIM(p_justification), NULL), p_ip);

  -- 1. The patient, in the shape public/js/seed.js uses, plus the basis.
  --    A demographics-only read (reception, admin) shows the NID masked to
  --    its last 4 digits (security review A7): enough to confirm the card in
  --    front of you, not enough to copy someone's national ID.
  SELECT p.uhid, p.name, p.dob, p.sex, p.blood_group AS blood, p.phone,
         IF(v_basis = 'demographics_only' AND p.nid IS NOT NULL,
            CONCAT(REPEAT('•', CHAR_LENGTH(p.nid) - 4), RIGHT(p.nid, 4)), p.nid) AS nid,
         d.name AS district, p.address,
         CONCAT_WS(' · ',
           CONCAT(p.kin_name, IF(p.kin_relation IS NULL, '', CONCAT(' (', p.kin_relation, ')'))),
           p.kin_phone) AS kin,
         p.registered_at AS registeredAt, p.registered_hospital_id AS registeredHospitalId,
         p.identity_verified AS identityVerified,
         v_basis AS basis, v_grant_exp AS consentExpires,
         (SELECT GROUP_CONCAT(lp.uhid) FROM patient_merge m JOIN patient lp ON lp.patient_id = m.losing_patient_id
           WHERE m.surviving_patient_id = p.patient_id) AS mergedUhids
    FROM patient p
    LEFT JOIN district d ON d.district_id = p.district_id
   WHERE p.patient_id = v_patient;

  -- 2. Allergies. Shown even on a demographics-only read: reception must
  --    be able to see "allergic to Penicillin" on the front of the file.
  SELECT a.name AS agent, pa.severity, pa.note
    FROM patient_allergy pa JOIN allergen a ON a.allergen_id = pa.allergen_id
   WHERE pa.patient_id = v_patient
   ORDER BY FIELD(pa.severity, 'Severe', 'Moderate', 'Mild'), a.name;

  -- 3. Encounters, newest first (ix_encounter_patient serves this).
  SELECT e.encounter_id AS id, DATE(e.started_at) AS date, e.hospital_id AS hospitalId,
         t.code AS type, doc.name AS doctor, dept.name AS dept,
         COALESCE(
           (SELECT CONCAT(dg.term, IF(ed.note IS NULL, '', CONCAT(' — ', ed.note)))
              FROM encounter_diagnosis ed JOIN diagnosis dg ON dg.diagnosis_id = ed.diagnosis_id
             WHERE ed.encounter_id = e.encounter_id
             ORDER BY ed.is_primary DESC, dg.term LIMIT 1),
           e.chief_complaint, 'No diagnosis recorded') AS dx,
         COALESCE(e.notes, '') AS notes,
         e.ended_at IS NULL AS isOpen
    FROM encounter e
    JOIN encounter_type t   ON t.type_id = e.type_id
    JOIN doctor_posting dp  ON dp.posting_id = e.posting_id
    JOIN doctor doc         ON doc.doctor_id = dp.doctor_id
    JOIN department dept    ON dept.department_id = e.department_id
   WHERE e.patient_id = v_patient AND v_clinical
   ORDER BY e.started_at DESC;

  -- 4. Prescription lines, rebuilt into the one-line form the screen shows:
  --    'Amlodipine 5 mg — 1 tablet at night — 90 days'
  SELECT pr.encounter_id,
         CONCAT(m.generic_name, ' ', m.strength, ' — ',
                pi.dose, ' ', pi.frequency,
                IF(pi.instruction IS NULL, '', CONCAT(' ', pi.instruction)), ' — ',
                IF(pi.duration_days IS NULL, 'continuing', CONCAT(pi.duration_days, ' days'))) AS line
    FROM prescription pr
    JOIN encounter e          ON e.encounter_id = pr.encounter_id
    JOIN prescription_item pi ON pi.prescription_id = pr.prescription_id
    JOIN medicine m           ON m.medicine_id = pi.medicine_id
   WHERE e.patient_id = v_patient AND v_clinical
   ORDER BY pr.encounter_id, pi.line_no;

  -- 5. Lab results.
  SELECT o.encounter_id, t.name AS test, o.status,
         COALESCE(CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM r.value_num)),
                         IF(t.unit IS NULL, '', CONCAT(' ', t.unit))),
                  r.value_text) AS value,
         r.is_abnormal AS abnormal,
         CONCAT_WS('–', TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM t.ref_low)),
                        TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM t.ref_high))) AS ref
    FROM lab_order o
    JOIN encounter e  ON e.encounter_id = o.encounter_id
    JOIN lab_test t   ON t.test_id = o.test_id
    LEFT JOIN lab_result r ON r.order_id = o.order_id
   WHERE e.patient_id = v_patient AND v_clinical
   ORDER BY o.encounter_id, t.name;

  -- 6. Vitals.
  SELECT v.encounter_id, v.recorded_at AS recordedAt,
         IF(v.bp_systolic IS NULL, NULL, CONCAT(v.bp_systolic, '/', v.bp_diastolic)) AS bp,
         v.pulse, v.temp_c AS temp, v.spo2, v.weight_kg AS weight
    FROM encounter_vitals v
    JOIN encounter e ON e.encounter_id = v.encounter_id
   WHERE e.patient_id = v_patient AND v_clinical
   ORDER BY v.recorded_at;

  -- 7. Referrals: where this patient was sent, and whether they arrived.
  SELECT r.referral_id AS id, r.referred_at AS referredAt,
         r.from_hospital_id AS fromHospitalId, r.to_hospital_id AS toHospitalId,
         dept.name AS dept, r.reason, r.urgency, r.status,
         account_name(r.referred_by) AS referredBy
    FROM referral r
    LEFT JOIN department dept ON dept.department_id = r.to_department_id
   WHERE r.patient_id = v_patient AND v_clinical
   ORDER BY r.referred_at DESC;

  -- 8. Who has read this record — including the read that just happened.
  SELECT l.at AS `when`,
         CONCAT(account_name(l.account_id),
                CASE r.code WHEN 'receptionist'   THEN ' (Reception)'
                            WHEN 'hospital_admin' THEN ' (Hospital admin)'
                            WHEN 'lab_technician' THEN ' (Laboratory)'
                            WHEN 'system_admin'   THEN ' (System admin)'
                            WHEN 'patient'        THEN ' (the patient)'
                            ELSE '' END) AS who,
         COALESCE(h.name, 'Patient portal') AS `where`,
         CASE l.basis WHEN 'own_record'        THEN 'Own record'
                      WHEN 'treating'          THEN 'Treating clinician'
                      WHEN 'consent'           THEN 'Consent'
                      WHEN 'break_glass'       THEN 'Break-glass — emergency'
                      WHEN 'demographics_only' THEN 'Demographics only' END AS basis,
         CASE l.basis WHEN 'break_glass' THEN 'crit'
                      WHEN 'demographics_only' THEN 'info'
                      ELSE 'ok' END AS kind,
         l.justification,
         l.reviewed_by IS NOT NULL AS reviewed
    FROM access_log l
    JOIN user_account ua ON ua.account_id = l.account_id
    JOIN role r          ON r.role_id = ua.role_id
    LEFT JOIN hospital h ON h.hospital_id = l.hospital_id
   WHERE l.patient_id = v_patient
   ORDER BY l.at DESC, l.log_id DESC
   LIMIT 25;
END $$


-- =====================================================================
-- 8. RECORDING AN ENCOUNTER — decision 5, the encounter is the hub
--    STEP procedures: no transactions here. See the header of this file.
-- =====================================================================

-- Opens an encounter for the calling doctor at their hospital, then:
--   - marks today's booked appointment with this doctor as attended and
--     links it, and
--   - if the patient was referred to this hospital and has not yet arrived,
--     links the referral and marks it arrived (decision 6: the null in
--     referral.to_encounter_id is filled in at exactly this moment).
--
-- Decision 2 applies here too (security review A1). Opening an encounter
-- makes the doctor the treating clinician, and 'treating' opens the whole
-- national record. So the doctor needs a reason to be seeing this patient
-- that already exists in the database:
--   an appointment with them today · a referral to this hospital that has
--   not arrived yet · a live consent grant to this hospital (or to them) ·
--   an open admission at this hospital
-- Without one — a walk-in, an emergency — they must write a reason
-- (p_reason). The encounter is then opened, and an access_log row is written
-- exactly as for a break-glass read: flagged, with the reason, waiting in the
-- review queue. With neither, errno 5423, the same "no basis" answer the
-- record read gives.
DROP PROCEDURE IF EXISTS start_encounter $$
CREATE PROCEDURE start_encounter(
  IN p_account_id INT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_type_code  VARCHAR(20),
  IN p_complaint  VARCHAR(200),
  IN p_notes      TEXT,
  IN p_reason     VARCHAR(300)
)
BEGIN
  DECLARE v_patient  INT UNSIGNED;
  DECLARE v_posting  MEDIUMINT UNSIGNED;
  DECLARE v_doctor   SMALLINT UNSIGNED;
  DECLARE v_hospital SMALLINT UNSIGNED;
  DECLARE v_type     TINYINT UNSIGNED;
  DECLARE v_enc      INT UNSIGNED;
  DECLARE v_basis    BOOLEAN;
  DECLARE v_reason   VARCHAR(300) DEFAULT NULLIF(TRIM(p_reason), '');

  CALL require_permission(p_account_id, 'encounter.write');

  -- Without a reason, an unknown UHID gets the same answer as a real patient
  -- the doctor has no basis for, so UHIDs cannot be probed unlogged
  -- (stress test H3.2). With a reason, a real UHID leaves a reviewed log row.
  SET v_patient = resolve_patient(p_uhid);
  IF v_patient IS NULL AND v_reason IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No appointment today, referral, consent or admission for this patient. Give a reason: it is logged and reviewed.', MYSQL_ERRNO = 5423;
  END IF;
  CALL require_patient(p_uhid, v_patient);
  CALL require_alive(v_patient);
  IF v_reason IS NOT NULL AND CHAR_LENGTH(v_reason) < 8 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Write the reason in at least 8 characters.';
  END IF;

  SELECT type_id INTO v_type FROM encounter_type WHERE code = p_type_code;
  IF v_type IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encounter type must be OPD, Emergency or Inpatient.';
  END IF;

  -- The caller's current posting at the hospital they are signed in to.
  SELECT dp.posting_id, dp.doctor_id, dp.hospital_id INTO v_posting, v_doctor, v_hospital
    FROM user_account ua
    JOIN doctor_posting dp ON dp.doctor_id = ua.doctor_id AND dp.hospital_id = ua.hospital_id
   WHERE ua.account_id = p_account_id
     AND CURDATE() >= dp.valid_from AND (dp.valid_to IS NULL OR CURDATE() <= dp.valid_to)
   ORDER BY dp.valid_from DESC
   LIMIT 1;
  IF v_posting IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You hold no current posting at this hospital.', MYSQL_ERRNO = 5403;
  END IF;

  -- The basis check (A1). Each line is one reason the doctor may already be
  -- seeing this patient.
  SET v_basis = care_basis(v_patient, v_hospital, v_doctor);

  -- One open visit per doctor and patient (stress test H3.1): a second one
  -- would split the visit's diagnoses and drugs across two encounters.
  IF EXISTS (SELECT 1 FROM encounter e JOIN encounter_type t ON t.type_id = e.type_id
              WHERE e.patient_id = v_patient AND e.posting_id = v_posting
                AND e.ended_at IS NULL AND t.code <> 'Inpatient') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'You already have an open visit for this patient. Close it before starting another.';
  END IF;

  IF NOT v_basis AND v_reason IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No appointment today, referral, consent or admission for this patient. Give a reason: it is logged and reviewed.',
          MYSQL_ERRNO = 5423;
  END IF;

  -- hospital_id, department_id and consultation_fee are left out on
  -- purpose: trg_encounter_bi copies them from the posting.
  INSERT INTO encounter (patient_id, type_id, posting_id, started_at, chief_complaint, notes, created_by)
  VALUES (v_patient, v_type, v_posting, NOW(), NULLIF(TRIM(p_complaint), ''), NULLIF(TRIM(p_notes), ''), p_account_id);
  SET v_enc = LAST_INSERT_ID();

  -- No basis, but a reason: flagged and queued for review, like break-glass.
  -- A reason given when a basis exists is not needed and not logged.
  IF NOT v_basis THEN
    INSERT INTO access_log (patient_id, account_id, hospital_id, encounter_id, action, basis,
                            is_break_glass, justification)
    VALUES (v_patient, p_account_id, v_hospital, v_enc, 'encounter.open', 'break_glass', TRUE, v_reason);
  END IF;

  UPDATE appointment
     SET status = 'attended', encounter_id = v_enc
   WHERE patient_id = v_patient AND doctor_id = v_doctor
     AND status = 'booked' AND DATE(slot_start) = CURDATE()
   ORDER BY slot_start
   LIMIT 1;

  UPDATE referral r
     SET r.to_encounter_id = v_enc, r.status = 'arrived'
   WHERE r.patient_id = v_patient
     AND r.to_hospital_id = (SELECT hospital_id FROM encounter WHERE encounter_id = v_enc)
     AND r.status = 'issued'
   ORDER BY r.referred_at
   LIMIT 1;

  SELECT v_enc AS encounter_id;
END $$

-- A visit refused half-way is rolled back whole — including the flagged
-- access_log row start_encounter wrote for a doctor with no basis. But the
-- refusal itself may have told the doctor something clinical ("Allergy
-- conflict: … Penicillin"). So the route calls this AFTER the rollback,
-- outside the transaction: it writes the same flagged row again, and that
-- one stays (stress test H2.2). With a basis, or no reason, nothing is
-- written — there was nothing to review.
DROP PROCEDURE IF EXISTS log_unsaved_encounter $$
CREATE PROCEDURE log_unsaved_encounter(IN p_account_id INT UNSIGNED, IN p_uhid VARCHAR(20), IN p_reason VARCHAR(300))
BEGIN
  DECLARE v_patient  INT UNSIGNED DEFAULT resolve_patient(p_uhid);
  DECLARE v_doctor   SMALLINT UNSIGNED;
  DECLARE v_hospital SMALLINT UNSIGNED;
  DECLARE v_reason   VARCHAR(300) DEFAULT NULLIF(TRIM(p_reason), '');

  CALL require_permission(p_account_id, 'encounter.write');
  SELECT doctor_id, hospital_id INTO v_doctor, v_hospital FROM user_account WHERE account_id = p_account_id;
  IF v_patient IS NOT NULL AND v_reason IS NOT NULL AND NOT care_basis(v_patient, v_hospital, v_doctor) THEN
    INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis, is_break_glass, justification)
    VALUES (v_patient, p_account_id, v_hospital, 'encounter.attempt', 'break_glass', TRUE, v_reason);
  END IF;
END $$

DROP PROCEDURE IF EXISTS add_diagnosis $$
CREATE PROCEDURE add_diagnosis(
  IN p_account_id   INT UNSIGNED,
  IN p_encounter_id INT UNSIGNED,
  IN p_icd10        VARCHAR(10),
  IN p_is_primary   BOOLEAN,
  IN p_certainty    VARCHAR(12),
  IN p_note         VARCHAR(200)
)
BEGIN
  DECLARE v_dx  SMALLINT UNSIGNED;
  DECLARE v_msg VARCHAR(200);

  CALL require_permission(p_account_id, 'encounter.write');
  CALL require_encounter_author(p_account_id, p_encounter_id, FALSE);

  SELECT diagnosis_id INTO v_dx FROM diagnosis WHERE icd10_code = p_icd10;
  IF v_dx IS NULL THEN
    SET v_msg = CONCAT('ICD-10 code ', COALESCE(p_icd10, '(blank)'), ' is not in the diagnosis catalogue.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  -- Checked first, so a refused repeat never leaves the visit without a
  -- primary diagnosis (stress test H3.1).
  IF EXISTS (SELECT 1 FROM encounter_diagnosis WHERE encounter_id = p_encounter_id AND diagnosis_id = v_dx) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That diagnosis is already recorded on this visit.';
  END IF;

  -- One primary diagnosis per encounter: making this one primary demotes
  -- whichever was primary before.
  IF p_is_primary THEN
    UPDATE encounter_diagnosis SET is_primary = FALSE WHERE encounter_id = p_encounter_id;
  END IF;

  INSERT INTO encounter_diagnosis (encounter_id, diagnosis_id, is_primary, certainty, note)
  VALUES (p_encounter_id, v_dx, COALESCE(p_is_primary, FALSE),
          COALESCE(NULLIF(p_certainty, ''), 'provisional'), NULLIF(TRIM(p_note), ''));
END $$

-- Adds one drug line. Creates the encounter's prescription the first time
-- (decision 2: one prescription per encounter). Adding to a prescription
-- whose encounter has already ended counts as an amendment and is stamped.
-- trg_prescription_item_bi refuses a drug the patient is allergic to.
DROP PROCEDURE IF EXISTS prescribe $$
CREATE PROCEDURE prescribe(
  IN p_account_id   INT UNSIGNED,
  IN p_encounter_id INT UNSIGNED,
  IN p_medicine_id  MEDIUMINT UNSIGNED,
  IN p_dose         VARCHAR(40),
  IN p_frequency    VARCHAR(40),
  IN p_days         SMALLINT UNSIGNED,
  IN p_instruction  VARCHAR(120)
)
BEGIN
  DECLARE v_rx    INT UNSIGNED;
  DECLARE v_ended DATETIME;
  DECLARE v_line  TINYINT UNSIGNED;

  CALL require_permission(p_account_id, 'prescription.write');
  CALL require_encounter_author(p_account_id, p_encounter_id, TRUE);

  IF NULLIF(TRIM(p_dose), '') IS NULL OR NULLIF(TRIM(p_frequency), '') IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A drug line needs a dose and a frequency.';
  END IF;
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 365) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Days must be 1 to 365, or empty for a medicine that continues.';
  END IF;

  SELECT ended_at INTO v_ended FROM encounter WHERE encounter_id = p_encounter_id;
  SELECT prescription_id INTO v_rx FROM prescription WHERE encounter_id = p_encounter_id;
  IF v_rx IS NOT NULL AND EXISTS (SELECT 1 FROM prescription_item
                                   WHERE prescription_id = v_rx AND medicine_id = p_medicine_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That medicine is already on this prescription.';
  END IF;

  IF v_rx IS NULL THEN
    INSERT INTO prescription (encounter_id, prescribed_by) VALUES (p_encounter_id, p_account_id);
    SET v_rx = LAST_INSERT_ID();
  ELSEIF v_ended IS NOT NULL THEN
    UPDATE prescription SET amended_at = NOW(), amended_by = p_account_id WHERE prescription_id = v_rx;
  END IF;

  SELECT COALESCE(MAX(line_no), 0) + 1 INTO v_line FROM prescription_item WHERE prescription_id = v_rx;

  INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency, duration_days, instruction)
  VALUES (v_rx, v_line, p_medicine_id, p_dose, p_frequency, p_days, NULLIF(TRIM(p_instruction), ''));
END $$

DROP PROCEDURE IF EXISTS record_vitals $$
CREATE PROCEDURE record_vitals(
  IN p_account_id   INT UNSIGNED,
  IN p_encounter_id INT UNSIGNED,
  IN p_systolic     SMALLINT UNSIGNED,
  IN p_diastolic    SMALLINT UNSIGNED,
  IN p_pulse        SMALLINT UNSIGNED,
  IN p_temp         DECIMAL(4,1),
  IN p_spo2         TINYINT UNSIGNED,
  IN p_weight       DECIMAL(5,1)
)
BEGIN
  CALL require_permission(p_account_id, 'encounter.write');
  CALL require_encounter_author(p_account_id, p_encounter_id, FALSE);
  INSERT INTO encounter_vitals (encounter_id, recorded_at, bp_systolic, bp_diastolic,
                                pulse, temp_c, spo2, weight_kg, recorded_by)
  VALUES (p_encounter_id, NOW(), p_systolic, p_diastolic, p_pulse, p_temp, p_spo2, p_weight, p_account_id);
END $$

DROP PROCEDURE IF EXISTS order_lab $$
CREATE PROCEDURE order_lab(IN p_account_id INT UNSIGNED, IN p_encounter_id INT UNSIGNED, IN p_test VARCHAR(80))
BEGIN
  DECLARE v_test SMALLINT UNSIGNED;
  DECLARE v_msg  VARCHAR(200);
  CALL require_permission(p_account_id, 'lab.order');
  CALL require_encounter_author(p_account_id, p_encounter_id, FALSE);
  SELECT test_id INTO v_test FROM lab_test WHERE name = p_test;
  IF v_test IS NULL THEN
    SET v_msg = CONCAT('"', COALESCE(p_test, ''), '" is not in the lab test catalogue.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
  INSERT INTO lab_order (encounter_id, test_id, ordered_by) VALUES (p_encounter_id, v_test, p_account_id);
  SELECT LAST_INSERT_ID() AS order_id;
END $$

-- The lab technician's one job. trg_lab_result_bi works out is_abnormal
-- from the reference range; trg_lab_result_ai marks the order reported.
DROP PROCEDURE IF EXISTS report_lab_result $$
CREATE PROCEDURE report_lab_result(
  IN p_account_id INT UNSIGNED,
  IN p_order_id   INT UNSIGNED,
  IN p_value_num  DECIMAL(10,2),
  IN p_value_text VARCHAR(200)
)
BEGIN
  CALL require_permission(p_account_id, 'lab.report');
  IF NOT EXISTS (SELECT 1 FROM lab_order o JOIN encounter e ON e.encounter_id = o.encounter_id
                  JOIN user_account ua ON ua.hospital_id = e.hospital_id
                 WHERE o.order_id = p_order_id AND ua.account_id = p_account_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That lab order does not exist at your hospital.', MYSQL_ERRNO = 5404;
  END IF;
  -- A value 50 times the top of the normal range is a typing or units
  -- mistake, not a result (stress test H3.1).
  IF p_value_num IS NOT NULL AND (p_value_num < 0 OR p_value_num > 50 * COALESCE(
       (SELECT t.ref_high FROM lab_order o JOIN lab_test t ON t.test_id = o.test_id WHERE o.order_id = p_order_id),
       p_value_num)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That value is not plausible for this test. Check the number and the units.';
  END IF;
  INSERT INTO lab_result (order_id, value_num, value_text, reported_by)
  VALUES (p_order_id, p_value_num, NULLIF(TRIM(p_value_text), ''), p_account_id);
  -- Hand back what the trigger decided, so the screen can say "abnormal"
  -- without the application ever comparing a value to a range itself.
  SELECT is_abnormal AS abnormal FROM lab_result WHERE order_id = p_order_id;
END $$

-- The lab technician's worklist: tests ordered at their hospital and not
-- yet reported. A procedure, not a view, because a test name is clinical
-- content and views.sql keeps clinical content out of every view: a view
-- cannot check who is asking. This checks lab.report and limits the rows to
-- the caller's own hospital, in the database. It returns only what is needed
-- to collect and run the sample — who, which test, which bed — and no
-- diagnosis or history, so it is not a record read and writes no access_log.
DROP PROCEDURE IF EXISTS lab_worklist $$
CREATE PROCEDURE lab_worklist(IN p_account_id INT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'lab.report');
  SELECT o.order_id   AS id,
         o.ordered_at AS orderedAt,
         o.status,
         t.name       AS test,
         t.specimen,
         t.unit,
         t.ref_low    AS refLow,
         t.ref_high   AS refHigh,
         p.uhid,
         p.name       AS patient,
         p.sex,
         p.dob,
         et.code      AS encounterType,
         account_name(o.ordered_by) AS orderedBy,
         CONCAT(w.name, ' · ', bo.bed_no) AS bed,
         TIMESTAMPDIFF(HOUR, o.ordered_at, NOW()) AS hoursWaiting
    FROM user_account ua
    JOIN encounter e       ON e.hospital_id = ua.hospital_id
    JOIN lab_order o       ON o.encounter_id = e.encounter_id
    JOIN lab_test t        ON t.test_id = o.test_id
    JOIN patient p         ON p.patient_id = e.patient_id
    JOIN encounter_type et ON et.type_id = e.type_id
    LEFT JOIN admission a      ON a.encounter_id = e.encounter_id AND a.discharged_at IS NULL
    LEFT JOIN bed_occupancy bo ON bo.admission_id = a.admission_id AND bo.to_at IS NULL
    LEFT JOIN ward w           ON w.ward_id = bo.ward_id
   WHERE ua.account_id = p_account_id
     AND o.status IN ('ordered', 'collected')
   ORDER BY o.ordered_at;
END $$

DROP PROCEDURE IF EXISTS end_encounter $$
CREATE PROCEDURE end_encounter(IN p_account_id INT UNSIGNED, IN p_encounter_id INT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'encounter.write');
  CALL require_encounter_author(p_account_id, p_encounter_id, TRUE);
  IF EXISTS (SELECT 1 FROM admission WHERE encounter_id = p_encounter_id AND discharged_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This patient is still admitted. Discharge them to end the encounter.';
  END IF;
  UPDATE encounter SET ended_at = NOW() WHERE encounter_id = p_encounter_id AND ended_at IS NULL;
END $$


-- =====================================================================
-- 9. WARDS — decision 7: these procedures write bed_occupancy and
--    admission. They never write bed.status_id; the triggers do.
-- =====================================================================

-- Receptionist admits. Opens an Inpatient encounter under the chosen
-- consultant's posting, the admission, and the first bed stay — three
-- inserts, one transaction: the bed and the admission both exist, or
-- neither does.
DROP PROCEDURE IF EXISTS admit_patient $$
CREATE PROCEDURE admit_patient(
  IN p_account_id INT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_posting_id MEDIUMINT UNSIGNED,
  IN p_ward_id    SMALLINT UNSIGNED,
  IN p_bed_no     VARCHAR(12),
  IN p_complaint  VARCHAR(200)
)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_hosp    SMALLINT UNSIGNED;
  DECLARE v_basis   BOOLEAN;
  DECLARE v_where   VARCHAR(120);
  DECLARE v_enc     INT UNSIGNED;
  DECLARE v_adm     INT UNSIGNED;
  DECLARE v_msg     VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'bed.admit');
  CALL require_patient(p_uhid, v_patient);

  SELECT hospital_id INTO v_hosp FROM user_account WHERE account_id = p_account_id;
  IF NOT EXISTS (SELECT 1 FROM doctor_posting
                  WHERE posting_id = p_posting_id AND hospital_id = v_hosp
                    AND CURDATE() >= valid_from AND (valid_to IS NULL OR CURDATE() <= valid_to)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a consultant who currently works at this hospital.';
  END IF;
  CALL require_alive(v_patient);

  -- Stress test H1.5: an admission opens an Inpatient encounter, which makes
  -- the admitting department 'treating'. So an admission needs the same kind
  -- of reason an encounter does: a visit here today, an appointment, a live
  -- referral or consent, or — for a patient with none of these — the
  -- written reason for admission, logged and reviewed like break-glass.
  SET v_basis = care_basis(v_patient, v_hosp, NULL);
  IF NOT v_basis AND CHAR_LENGTH(TRIM(COALESCE(p_complaint, ''))) < 8 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No visit, appointment or consent here for this patient. Write the reason for admission; it is reviewed.',
          MYSQL_ERRNO = 5423;
  END IF;

  START TRANSACTION;

  SELECT h.name INTO v_where
    FROM admission a
    JOIN encounter e ON e.encounter_id = a.encounter_id
    JOIN hospital h  ON h.hospital_id = e.hospital_id
   WHERE e.patient_id = v_patient AND a.discharged_at IS NULL
   LIMIT 1
   FOR UPDATE;
  IF v_where IS NOT NULL THEN
    SET v_msg = CONCAT('This patient is already an inpatient at ', v_where, '.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  INSERT INTO encounter (patient_id, type_id, posting_id, started_at, chief_complaint, created_by)
  VALUES (v_patient, (SELECT type_id FROM encounter_type WHERE code = 'Inpatient'),
          p_posting_id, NOW(), NULLIF(TRIM(p_complaint), ''), p_account_id);
  SET v_enc = LAST_INSERT_ID();

  INSERT INTO admission (encounter_id, admitted_at, admitted_by)
  VALUES (v_enc, NOW(), p_account_id);
  SET v_adm = LAST_INSERT_ID();

  IF NOT v_basis THEN
    INSERT INTO access_log (patient_id, account_id, hospital_id, encounter_id, action, basis,
                            is_break_glass, justification)
    VALUES (v_patient, p_account_id, v_hosp, v_enc, 'admission.open', 'break_glass', TRUE, TRIM(p_complaint));
  END IF;

  -- trg_bed_occupancy_bi checks the bed is free, in service and in this
  -- hospital; trg_bed_occupancy_ai then marks it occupied.
  INSERT INTO bed_occupancy (admission_id, ward_id, bed_no, from_at)
  VALUES (v_adm, p_ward_id, p_bed_no, NOW());

  COMMIT;

  SELECT v_adm AS admission_id, v_enc AS encounter_id;
END $$

DROP PROCEDURE IF EXISTS transfer_patient $$
CREATE PROCEDURE transfer_patient(
  IN p_account_id   INT UNSIGNED,
  IN p_admission_id INT UNSIGNED,
  IN p_ward_id      SMALLINT UNSIGNED,
  IN p_bed_no       VARCHAR(12)
)
BEGIN
  DECLARE v_at DATETIME;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'bed.transfer');
  CALL require_own_admission(p_account_id, p_admission_id);

  START TRANSACTION;

  -- The moment of the move. Normally NOW(); but ck_occupancy_dates needs the
  -- old stay to end strictly after it began, and DATETIME has one-second
  -- precision, so a transfer in the same second as the admission would be
  -- refused. GREATEST() moves it to one second after the stay began. (Found
  -- by tests.sql: admit-then-transfer within a second failed the CHECK.)
  SELECT GREATEST(NOW(), from_at + INTERVAL 1 SECOND) INTO v_at
    FROM bed_occupancy
   WHERE admission_id = p_admission_id AND to_at IS NULL
     FOR UPDATE;
  IF v_at IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That admission has no current bed to transfer from.';
  END IF;

  -- Close first, then open: trg_bed_occupancy_bi refuses a second open row,
  -- so the order matters. If the new bed is not free, the close is rolled
  -- back with it and the patient stays where they were.
  UPDATE bed_occupancy SET to_at = v_at
   WHERE admission_id = p_admission_id AND to_at IS NULL;
  INSERT INTO bed_occupancy (admission_id, ward_id, bed_no, from_at)
  VALUES (p_admission_id, p_ward_id, p_bed_no, v_at);
  COMMIT;
END $$

-- Doctor discharges.
DROP PROCEDURE IF EXISTS discharge_patient $$
CREATE PROCEDURE discharge_patient(
  IN p_account_id   INT UNSIGNED,
  IN p_admission_id INT UNSIGNED,
  IN p_summary      TEXT,
  IN p_outcome      VARCHAR(12)
)
BEGIN
  DECLARE v_enc INT UNSIGNED;
  DECLARE v_at  DATETIME DEFAULT NOW();

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'bed.discharge');
  CALL require_own_admission(p_account_id, p_admission_id);

  START TRANSACTION;

  SELECT encounter_id INTO v_enc FROM admission
   WHERE admission_id = p_admission_id AND discharged_at IS NULL
   FOR UPDATE;
  IF v_enc IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That patient is not currently admitted.', MYSQL_ERRNO = 5404;
  END IF;

  -- Closing the stay is what frees the bed: trg_bed_occupancy_au sets it to
  -- 'cleaning'. Nothing here touches bed.
  UPDATE bed_occupancy SET to_at = GREATEST(v_at, from_at + INTERVAL 1 SECOND)
   WHERE admission_id = p_admission_id AND to_at IS NULL;

  UPDATE admission
     SET discharged_at = v_at, discharged_by = p_account_id,
         discharge_summary = NULLIF(TRIM(p_summary), ''),
         outcome = COALESCE(NULLIF(p_outcome, ''), 'recovered')
   WHERE admission_id = p_admission_id;

  UPDATE encounter SET ended_at = v_at WHERE encounter_id = v_enc;

  COMMIT;
END $$

-- Housekeeping: cleaning → free. The only status change not caused by a
-- bed_occupancy row, so it identifies itself to trg_bed_bu the same way the
-- occupancy triggers do.
DROP PROCEDURE IF EXISTS mark_bed_clean $$
CREATE PROCEDURE mark_bed_clean(IN p_account_id INT UNSIGNED, IN p_ward_id SMALLINT UNSIGNED, IN p_bed_no VARCHAR(12))
BEGIN
  CALL require_permission(p_account_id, 'bed.clean');
  -- Security review A3: only a bed in a ward of the caller's own hospital.
  IF NOT EXISTS (SELECT 1 FROM ward w JOIN user_account ua ON ua.hospital_id = w.hospital_id
                  WHERE w.ward_id = p_ward_id AND ua.account_id = p_account_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That ward does not exist at your hospital.', MYSQL_ERRNO = 5404;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bed b JOIN bed_status s ON s.status_id = b.status_id
                  WHERE b.ward_id = p_ward_id AND b.bed_no = p_bed_no AND s.code = 'cleaning') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a bed that is being cleaned can be marked clean.';
  END IF;
  SET @uhid_bed_writer = 'mark_bed_clean';
  UPDATE bed SET status_id = (SELECT status_id FROM bed_status WHERE code = 'free')
   WHERE ward_id = p_ward_id AND bed_no = p_bed_no;
  SET @uhid_bed_writer = NULL;
END $$


-- =====================================================================
-- 10. REFERRAL — decision 6, what makes the system national
--
-- Writes the referral AND a consent grant to the receiving hospital, in one
-- transaction. That pairing is the seam between decisions 2 and 6: a
-- patient who agrees to be sent to Hospital B has agreed that Hospital B
-- may read the record. The grant lasts the default 24 hours; once the
-- patient arrives, start_encounter() opens an encounter at B and B reads
-- under basis 'treating' for as long as they are being treated.
-- =====================================================================

DROP PROCEDURE IF EXISTS refer_patient $$
CREATE PROCEDURE refer_patient(
  IN p_account_id   INT UNSIGNED,
  IN p_encounter_id INT UNSIGNED,
  IN p_to_hospital  SMALLINT UNSIGNED,
  IN p_to_dept      VARCHAR(60),
  IN p_reason       VARCHAR(300),
  IN p_urgency      VARCHAR(10)
)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_dept    SMALLINT UNSIGNED;
  DECLARE v_ref     INT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'referral.create');
  -- Only the visit's own doctor refers from it (stress test H2.8): a
  -- referral also grants the receiving hospital 24 hours of consent.
  CALL require_encounter_author(p_account_id, p_encounter_id, TRUE);

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A referral needs a reason.';
  END IF;

  SELECT patient_id INTO v_patient FROM encounter WHERE encounter_id = p_encounter_id;
  IF NULLIF(p_to_dept, '') IS NOT NULL THEN
    SELECT department_id INTO v_dept FROM department WHERE name = p_to_dept;
    IF v_dept IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown department. Choose one from the list, or leave it empty.';
    END IF;
  END IF;

  START TRANSACTION;
  -- from_hospital_id is filled in by trg_referral_bi from the encounter.
  INSERT INTO referral (patient_id, from_hospital_id, to_hospital_id, to_department_id,
                        from_encounter_id, reason, urgency, referred_by)
  VALUES (v_patient, 0, p_to_hospital, v_dept, p_encounter_id, TRIM(p_reason),
          COALESCE(NULLIF(p_urgency, ''), 'routine'), p_account_id);
  SET v_ref = LAST_INSERT_ID();

  INSERT INTO consent_grant (patient_id, to_hospital_id, scope, granted_via, referral_id)
  VALUES (v_patient, p_to_hospital, 'clinical', 'referral', v_ref);
  COMMIT;

  SELECT v_ref AS referral_id;
END $$


-- =====================================================================
-- 11. MERGE — decision 1's safety net
--
-- Two UHIDs turn out to be one human (js/seed.js ships exactly this case:
-- BD-2019-04821-5 and BD-2018-00723-2). The surviving record takes over
-- the losing record's history; the losing row stays, so its UHID still
-- resolves (resolve_patient() follows patient_merge).
--
-- What is NOT moved: access_log. Who read the old record, and when, is a
-- fact about the past, and the log is append-only anyway.
-- =====================================================================

DROP PROCEDURE IF EXISTS merge_patients $$
CREATE PROCEDURE merge_patients(
  IN p_account_id   INT UNSIGNED,
  IN p_losing_uhid  VARCHAR(20),
  IN p_surviving_uhid VARCHAR(20),
  IN p_reason       VARCHAR(300)
)
BEGIN
  DECLARE v_lose  INT UNSIGNED;
  DECLARE v_keep  INT UNSIGNED;
  DECLARE v_nid   VARCHAR(17);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    SET @uhid_merging = NULL;
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'patient.merge');

  SELECT patient_id INTO v_lose FROM patient WHERE uhid = p_losing_uhid;
  SELECT patient_id INTO v_keep FROM patient WHERE uhid = p_surviving_uhid;
  IF v_lose IS NULL OR v_keep IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both UHIDs must exist.', MYSQL_ERRNO = 5404;
  END IF;
  IF EXISTS (SELECT 1 FROM patient_merge WHERE losing_patient_id IN (v_lose, v_keep)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One of these records has already been merged away.';
  END IF;
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A merge needs a recorded reason.';
  END IF;

  -- Security review A6. A merge moves one person's whole history onto
  -- another, so it is not national for everyone: the system admin (no
  -- hospital) may merge any two records; a hospital admin only when one of
  -- the two was registered at their own hospital, where the patient can be
  -- asked in person.
  IF NOT EXISTS (SELECT 1 FROM user_account ua
                  WHERE ua.account_id = p_account_id
                    AND (ua.hospital_id IS NULL
                         OR ua.hospital_id IN (SELECT registered_hospital_id FROM patient
                                                WHERE patient_id IN (v_lose, v_keep)))) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Neither record was registered at your hospital. The system administrator merges these.',
          MYSQL_ERRNO = 5403;
  END IF;

  -- Stress test H1.3: two open admissions would leave one person in two beds.
  IF (SELECT COUNT(DISTINCT e.patient_id) FROM admission a JOIN encounter e ON e.encounter_id = a.encounter_id
       WHERE e.patient_id IN (v_lose, v_keep) AND a.discharged_at IS NULL) = 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Both records have an open admission. Discharge one of them before merging.';
  END IF;

  START TRANSACTION;
  SET @uhid_merging = 1;

  UPDATE encounter     SET patient_id = v_keep WHERE patient_id = v_lose;
  UPDATE appointment   SET patient_id = v_keep WHERE patient_id = v_lose;
  UPDATE referral      SET patient_id = v_keep WHERE patient_id = v_lose;
  UPDATE consent_grant SET patient_id = v_keep WHERE patient_id = v_lose;

  -- An allergy recorded on both keeps the surviving record's row, at the
  -- MORE severe of the two (stress test H2.10): a merge must never make a
  -- recorded reaction look milder.
  UPDATE patient_allergy k
    JOIN patient_allergy l ON l.allergen_id = k.allergen_id AND l.patient_id = v_lose
     SET k.severity = l.severity
   WHERE k.patient_id = v_keep
     AND FIELD(l.severity, 'Mild', 'Moderate', 'Severe') > FIELD(k.severity, 'Mild', 'Moderate', 'Severe');
  INSERT IGNORE INTO patient_allergy (patient_id, allergen_id, severity, note, first_recorded_encounter_id, recorded_at)
  SELECT v_keep, allergen_id, severity, note, first_recorded_encounter_id, recorded_at
    FROM patient_allergy WHERE patient_id = v_lose;
  DELETE FROM patient_allergy WHERE patient_id = v_lose;

  -- A login moves only if the survivor has none (one account per person).
  -- Otherwise the old login would point at a merged-away record and its
  -- owner could not open their own history; it is switched off instead, and
  -- they sign in with the survivor's login (stress test H2.10).
  IF NOT EXISTS (SELECT 1 FROM user_account WHERE patient_id = v_keep) THEN
    UPDATE user_account SET patient_id = v_keep WHERE patient_id = v_lose;
  ELSE
    UPDATE user_account SET is_active = FALSE WHERE patient_id = v_lose;
  END IF;

  -- The NID moves to the survivor if only the losing record had one.
  SELECT nid INTO v_nid FROM patient WHERE patient_id = v_lose;
  IF v_nid IS NOT NULL AND (SELECT nid FROM patient WHERE patient_id = v_keep) IS NULL THEN
    UPDATE patient SET nid = NULL WHERE patient_id = v_lose;
    UPDATE patient SET nid = v_nid WHERE patient_id = v_keep;
  END IF;

  INSERT INTO patient_merge (losing_patient_id, surviving_patient_id, merged_by, reason)
  VALUES (v_lose, v_keep, p_account_id, TRIM(p_reason));

  SET @uhid_merging = NULL;
  COMMIT;
END $$


-- =====================================================================
-- 10b. LISTS WITH CLINICAL CONTENT — read through procedures, not views
--
-- v_bed_board (diagnoses), v_referral_inbox (referral reasons) and
-- v_break_glass_queue (emergency reasons) hold clinical content. A view
-- cannot check who is asking, so the web server may not read them
-- directly (grants.sql); it calls these, which check the permission and
-- keep to the caller's own hospital in the database (stress test H2.3,
-- H2.4). The views stay, for these procedures and for queries as root.
-- =====================================================================

DROP PROCEDURE IF EXISTS bed_board $$
CREATE PROCEDURE bed_board(IN p_account_id INT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'bed.view');
  SELECT v.* FROM v_bed_board v JOIN user_account ua ON ua.hospital_id = v.hospital_id
   WHERE ua.account_id = p_account_id
   ORDER BY v.ward_id, v.no;
END $$

DROP PROCEDURE IF EXISTS referral_inbox $$
CREATE PROCEDURE referral_inbox(IN p_account_id INT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'patient.read_clinical');
  SELECT v.* FROM v_referral_inbox v JOIN user_account ua ON ua.hospital_id = v.toHospitalId
   WHERE ua.account_id = p_account_id
   ORDER BY v.referredAt;
END $$

DROP PROCEDURE IF EXISTS break_glass_queue $$
CREATE PROCEDURE break_glass_queue(IN p_account_id INT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'audit.review');
  -- A hospital admin sees their own hospital's queue; the system admin
  -- (no hospital) sees the country's.
  SELECT v.* FROM v_break_glass_queue v JOIN user_account ua ON ua.account_id = p_account_id
   WHERE ua.hospital_id IS NULL OR v.hospitalId = ua.hospital_id
   ORDER BY v.at DESC;
END $$

-- A doctor records an allergy found during a visit (stress test H2.10:
-- until now an allergy could be recorded only at registration). Only from
-- the doctor's own open visit — the same 'treating' rule as reading —
-- and the visit is kept as where it was first recorded. Recording it again
-- updates the severity and note.
DROP PROCEDURE IF EXISTS record_allergy $$
CREATE PROCEDURE record_allergy(
  IN p_account_id INT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_allergen   VARCHAR(80),
  IN p_severity   VARCHAR(10),
  IN p_note       VARCHAR(200)
)
BEGIN
  DECLARE v_patient  INT UNSIGNED;
  DECLARE v_doctor   SMALLINT UNSIGNED;
  DECLARE v_hospital SMALLINT UNSIGNED;
  DECLARE v_enc      INT UNSIGNED;
  DECLARE v_allergen SMALLINT UNSIGNED;
  DECLARE v_msg      VARCHAR(200);

  CALL require_permission(p_account_id, 'encounter.write');
  CALL require_patient(p_uhid, v_patient);
  SELECT doctor_id, hospital_id INTO v_doctor, v_hospital FROM user_account WHERE account_id = p_account_id;

  SELECT e.encounter_id INTO v_enc
    FROM encounter e
    JOIN doctor_posting dp ON dp.posting_id = e.posting_id
    JOIN encounter_type t  ON t.type_id = e.type_id
   WHERE e.patient_id = v_patient AND e.hospital_id = v_hospital AND e.ended_at IS NULL
     AND (t.code <> 'OPD' OR e.started_at >= CURDATE())
     AND (dp.doctor_id = v_doctor
          OR e.department_id IN (SELECT mine.department_id FROM doctor_posting mine
                                  WHERE mine.doctor_id = v_doctor AND mine.hospital_id = v_hospital
                                    AND CURDATE() >= mine.valid_from
                                    AND (mine.valid_to IS NULL OR CURDATE() <= mine.valid_to)))
   ORDER BY e.started_at DESC
   LIMIT 1;
  IF v_enc IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Record an allergy from an open visit: open one for this patient first.', MYSQL_ERRNO = 5423;
  END IF;

  SELECT allergen_id INTO v_allergen FROM allergen WHERE name = TRIM(p_allergen);
  IF v_allergen IS NULL THEN
    SET v_msg = CONCAT('"', COALESCE(p_allergen, ''), '" is not in the allergen catalogue.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
  IF p_severity NOT IN ('Mild', 'Moderate', 'Severe') OR p_severity IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Severity must be Mild, Moderate or Severe.';
  END IF;

  INSERT INTO patient_allergy (patient_id, allergen_id, severity, note, first_recorded_encounter_id, recorded_at)
  VALUES (v_patient, v_allergen, p_severity, NULLIF(TRIM(p_note), ''), v_enc, NOW()) AS n
  ON DUPLICATE KEY UPDATE severity = n.severity, note = COALESCE(n.note, patient_allergy.note);
END $$


-- =====================================================================
-- 11b. CONSENT — the patient's side (security review A9)
--
-- A consent grant is the patient's permission, so the patient must be able
-- to see every grant on their record and take one back. Revoking stamps
-- revoked_at; get_patient_record() and start_encounter() already ignore a
-- grant with revoked_at set, so the hospital loses access at once. The row
-- is kept: that a grant existed, and when it ended, is part of the record.
-- =====================================================================

DROP PROCEDURE IF EXISTS list_consents $$
CREATE PROCEDURE list_consents(IN p_account_id INT UNSIGNED)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  SELECT ua.patient_id INTO v_patient FROM user_account ua
   WHERE ua.account_id = p_account_id AND ua.is_active;
  IF v_patient IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a patient has consents to manage.', MYSQL_ERRNO = 5403;
  END IF;

  SELECT g.grant_id AS id, h.name AS hospital, d.name AS doctor, g.scope,
         g.granted_via AS via, g.granted_at AS grantedAt, g.expires_at AS expiresAt,
         g.revoked_at AS revokedAt,
         CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked'
              WHEN NOW() > g.expires_at    THEN 'expired'
              ELSE 'active' END AS status
    FROM consent_grant g
    JOIN hospital h    ON h.hospital_id = g.to_hospital_id
    LEFT JOIN doctor d ON d.doctor_id = g.to_doctor_id
   WHERE g.patient_id = v_patient
   ORDER BY g.granted_at DESC;
END $$

DROP PROCEDURE IF EXISTS revoke_consent $$
CREATE PROCEDURE revoke_consent(IN p_account_id INT UNSIGNED, IN p_grant_id INT UNSIGNED)
BEGIN
  DECLARE v_patient INT UNSIGNED;
  DECLARE v_owner   INT UNSIGNED;
  DECLARE v_live    BOOLEAN;

  SELECT ua.patient_id INTO v_patient FROM user_account ua
   WHERE ua.account_id = p_account_id AND ua.is_active;
  SELECT patient_id, revoked_at IS NULL AND NOW() <= expires_at
    INTO v_owner, v_live
    FROM consent_grant WHERE grant_id = p_grant_id;

  IF v_owner IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such consent grant.', MYSQL_ERRNO = 5404;
  END IF;
  IF v_patient IS NULL OR v_patient <> v_owner THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the patient can revoke their own consent.', MYSQL_ERRNO = 5403;
  END IF;
  IF NOT v_live THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That consent has already ended.';
  END IF;

  UPDATE consent_grant SET revoked_at = NOW() WHERE grant_id = p_grant_id;
END $$


-- =====================================================================
-- 12. AUDIT
-- =====================================================================

DROP PROCEDURE IF EXISTS review_break_glass $$
CREATE PROCEDURE review_break_glass(IN p_account_id INT UNSIGNED, IN p_log_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_mine BOOLEAN;

  CALL require_permission(p_account_id, 'audit.review');

  -- A hospital admin answers for reads made at their own hospital; the
  -- system admin (no hospital) answers for the whole country. Without this,
  -- an admin at one hospital could clear another hospital's emergency reads
  -- unseen by the admin who is meant to question them.
  SELECT ua.hospital_id IS NULL OR ua.hospital_id <=> l.hospital_id INTO v_mine
    FROM access_log l JOIN user_account ua ON ua.account_id = p_account_id
   WHERE l.log_id = p_log_id;
  IF v_mine IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such access-log entry.', MYSQL_ERRNO = 5404;
  END IF;
  IF NOT v_mine THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'That read was made at another hospital. Its own administrator reviews it.', MYSQL_ERRNO = 5403;
  END IF;

  -- trg_access_log_bu allows exactly this change, once, on a break-glass row.
  UPDATE access_log SET reviewed_by = p_account_id, reviewed_at = NOW() WHERE log_id = p_log_id;
END $$

DELIMITER ;
