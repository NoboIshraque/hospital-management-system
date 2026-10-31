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
  DECLARE v_id   INT UNSIGNED;
  DECLARE v_surv INT UNSIGNED;
  SELECT patient_id INTO v_id FROM patient WHERE uhid = p_uhid;
  SELECT surviving_patient_id INTO v_surv FROM patient_merge WHERE losing_patient_id = v_id;
  RETURN COALESCE(v_surv, v_id);
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
         p.uhid AS patient_uhid, account_name(ua.account_id) AS name
    FROM user_account ua
    JOIN role r ON r.role_id = ua.role_id
    LEFT JOIN patient p ON p.patient_id = ua.patient_id
   WHERE ua.username = p_username AND ua.is_active;
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
  DECLARE v_nid       VARCHAR(17) DEFAULT NULLIF(TRIM(p_nid), '');
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
  IF p_dob IS NULL OR p_dob > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enter a date of birth that is not in the future.';
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
     p_phone, v_nid, v_district, NULLIF(TRIM(p_address), ''),
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

  SELECT v_uhid AS uhid, v_patient AS patient_id;
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

  CALL require_permission(p_account_id, 'appointment.cancel');

  SELECT patient_id, status INTO v_pat, v_st FROM appointment WHERE appointment_id = p_appointment_id;
  IF v_pat IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such appointment.', MYSQL_ERRNO = 5404;
  END IF;

  SELECT r.code, ua.patient_id INTO v_role, v_own
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id;
  IF v_role = 'patient' AND v_own <> v_pat THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A patient can only cancel their own appointments.', MYSQL_ERRNO = 5403;
  END IF;
  IF v_st <> 'booked' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a booked appointment can be cancelled.';
  END IF;

  -- active_slot becomes NULL with this UPDATE, which frees the slot in
  -- uq_doctor_slot for the next patient.
  UPDATE appointment SET status = 'cancelled' WHERE appointment_id = p_appointment_id;
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

  CALL require_patient(p_uhid, v_patient);

  SELECT r.code, ua.hospital_id, ua.doctor_id, ua.patient_id
    INTO v_role, v_hospital, v_doctor, v_own
    FROM user_account ua JOIN role r ON r.role_id = ua.role_id
   WHERE ua.account_id = p_account_id AND ua.is_active;

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

    IF EXISTS (SELECT 1 FROM encounter
                WHERE patient_id = v_patient AND hospital_id = v_hospital AND ended_at IS NULL) THEN
      SET v_basis = 'treating';
    ELSEIF v_grant_exp IS NOT NULL THEN
      SET v_basis = 'consent';
    ELSEIF p_break_glass AND NULLIF(TRIM(p_justification), '') IS NOT NULL THEN
      SET v_basis = 'break_glass';
    ELSEIF p_break_glass THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Break-glass access needs a written reason.';
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
  SELECT p.uhid, p.name, p.dob, p.sex, p.blood_group AS blood, p.phone, p.nid,
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
DROP PROCEDURE IF EXISTS start_encounter $$
CREATE PROCEDURE start_encounter(
  IN p_account_id INT UNSIGNED,
  IN p_uhid       VARCHAR(20),
  IN p_type_code  VARCHAR(20),
  IN p_complaint  VARCHAR(200),
  IN p_notes      TEXT
)
BEGIN
  DECLARE v_patient  INT UNSIGNED;
  DECLARE v_posting  MEDIUMINT UNSIGNED;
  DECLARE v_doctor   SMALLINT UNSIGNED;
  DECLARE v_type     TINYINT UNSIGNED;
  DECLARE v_enc      INT UNSIGNED;

  CALL require_permission(p_account_id, 'encounter.write');
  CALL require_patient(p_uhid, v_patient);

  SELECT type_id INTO v_type FROM encounter_type WHERE code = p_type_code;
  IF v_type IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Encounter type must be OPD, Emergency or Inpatient.';
  END IF;

  -- The caller's current posting at the hospital they are signed in to.
  SELECT dp.posting_id, dp.doctor_id INTO v_posting, v_doctor
    FROM user_account ua
    JOIN doctor_posting dp ON dp.doctor_id = ua.doctor_id AND dp.hospital_id = ua.hospital_id
   WHERE ua.account_id = p_account_id
     AND CURDATE() >= dp.valid_from AND (dp.valid_to IS NULL OR CURDATE() <= dp.valid_to)
   ORDER BY dp.valid_from DESC
   LIMIT 1;
  IF v_posting IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You hold no current posting at this hospital.', MYSQL_ERRNO = 5403;
  END IF;

  -- hospital_id, department_id and consultation_fee are left out on
  -- purpose: trg_encounter_bi copies them from the posting.
  INSERT INTO encounter (patient_id, type_id, posting_id, started_at, chief_complaint, notes, created_by)
  VALUES (v_patient, v_type, v_posting, NOW(), NULLIF(TRIM(p_complaint), ''), NULLIF(TRIM(p_notes), ''), p_account_id);
  SET v_enc = LAST_INSERT_ID();

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
  CALL require_own_encounter(p_account_id, p_encounter_id);

  SELECT diagnosis_id INTO v_dx FROM diagnosis WHERE icd10_code = p_icd10;
  IF v_dx IS NULL THEN
    SET v_msg = CONCAT('ICD-10 code ', COALESCE(p_icd10, '(blank)'), ' is not in the diagnosis catalogue.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
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
  CALL require_own_encounter(p_account_id, p_encounter_id);

  SELECT ended_at INTO v_ended FROM encounter WHERE encounter_id = p_encounter_id;
  SELECT prescription_id INTO v_rx FROM prescription WHERE encounter_id = p_encounter_id;

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
  CALL require_own_encounter(p_account_id, p_encounter_id);
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
  CALL require_own_encounter(p_account_id, p_encounter_id);
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
  INSERT INTO lab_result (order_id, value_num, value_text, reported_by)
  VALUES (p_order_id, p_value_num, NULLIF(TRIM(p_value_text), ''), p_account_id);
END $$

DROP PROCEDURE IF EXISTS end_encounter $$
CREATE PROCEDURE end_encounter(IN p_account_id INT UNSIGNED, IN p_encounter_id INT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'encounter.write');
  CALL require_own_encounter(p_account_id, p_encounter_id);
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
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  CALL require_permission(p_account_id, 'bed.transfer');

  START TRANSACTION;
  -- Close first, then open: trg_bed_occupancy_bi refuses a second open row,
  -- so the order matters. If the new bed is not free, the close is rolled
  -- back with it and the patient stays where they were.
  UPDATE bed_occupancy SET to_at = NOW()
   WHERE admission_id = p_admission_id AND to_at IS NULL;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That admission has no current bed to transfer from.';
  END IF;
  INSERT INTO bed_occupancy (admission_id, ward_id, bed_no, from_at)
  VALUES (p_admission_id, p_ward_id, p_bed_no, NOW() + INTERVAL 1 SECOND);
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
  CALL require_own_encounter(p_account_id, p_encounter_id);

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A referral needs a reason.';
  END IF;

  SELECT patient_id INTO v_patient FROM encounter WHERE encounter_id = p_encounter_id;
  IF NULLIF(p_to_dept, '') IS NOT NULL THEN
    SELECT department_id INTO v_dept FROM department WHERE name = p_to_dept;
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

  START TRANSACTION;
  SET @uhid_merging = 1;

  UPDATE encounter     SET patient_id = v_keep WHERE patient_id = v_lose;
  UPDATE appointment   SET patient_id = v_keep WHERE patient_id = v_lose;
  UPDATE referral      SET patient_id = v_keep WHERE patient_id = v_lose;
  UPDATE consent_grant SET patient_id = v_keep WHERE patient_id = v_lose;

  -- An allergy recorded on both keeps the surviving record's row.
  INSERT IGNORE INTO patient_allergy (patient_id, allergen_id, severity, note, first_recorded_encounter_id, recorded_at)
  SELECT v_keep, allergen_id, severity, note, first_recorded_encounter_id, recorded_at
    FROM patient_allergy WHERE patient_id = v_lose;
  DELETE FROM patient_allergy WHERE patient_id = v_lose;

  -- A login moves only if the survivor has none (one account per person).
  IF NOT EXISTS (SELECT 1 FROM user_account WHERE patient_id = v_keep) THEN
    UPDATE user_account SET patient_id = v_keep WHERE patient_id = v_lose;
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
-- 12. AUDIT
-- =====================================================================

DROP PROCEDURE IF EXISTS review_break_glass $$
CREATE PROCEDURE review_break_glass(IN p_account_id INT UNSIGNED, IN p_log_id BIGINT UNSIGNED)
BEGIN
  CALL require_permission(p_account_id, 'audit.review');
  -- trg_access_log_bu allows exactly this change, once, on a break-glass row.
  UPDATE access_log SET reviewed_by = p_account_id, reviewed_at = NOW() WHERE log_id = p_log_id;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No such access-log entry.', MYSQL_ERRNO = 5404;
  END IF;
END $$

DELIMITER ;
