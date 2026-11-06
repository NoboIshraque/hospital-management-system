-- =====================================================================
-- UHID National Hospital Management System — database tests
--
--   npm run db:test        (in server/)
--
-- That command rebuilds the database, runs this file, prints the results,
-- and rebuilds again, so the tests always start from the seed data and
-- never leave their changes behind. The tests CHANGE data (they book, admit,
-- merge), which is why they must not run against a database you care about.
--
-- Two kinds of test:
--   t_expect(name, statement, errno)  runs the statement and records which
--       MySQL error number it raised: 0 = it succeeded. A rule that should
--       refuse something is tested by expecting its exact error number.
--   t_value(name, query, expected)    runs a one-value query and compares
--       the answer, as text, with what it should be.
--
-- Statements are written in "double quotes" so that the 'single quotes'
-- inside them need no escaping. That works because the server's sql_mode
-- does not include ANSI_QUOTES.
--
-- Error numbers used:  1644 a SIGNAL (business rule) · 5403 not allowed ·
--   5404 not found · 5423 no access basis · 3819 CHECK violated ·
--   1062 duplicate key · 1451 parent row in use · 1452 no such parent row
--
-- Accounts used (seed.sql §5): 1 rezaul (receptionist, DMCH) · 2 nasima
-- (hospital admin, DMCH) · 4 rumana (lab technician, DMCH) · 5 sysadmin
-- (system admin, no hospital) · 6 anisur (doctor, DMCH) · 11 tahmina
-- (doctor, Square) · 16 mahbub (doctor, DMCH Medicine) · 17 rahim (patient)
-- =====================================================================

USE uhid;

DROP TABLE IF EXISTS t_result;
CREATE TABLE t_result (
  test_no   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(120) NOT NULL,
  expected  VARCHAR(200) NOT NULL,
  got       VARCHAR(200) NOT NULL,
  passed    BOOLEAN      NOT NULL,
  message   VARCHAR(300) NULL,
  PRIMARY KEY (test_no)
) ENGINE = InnoDB;

DROP PROCEDURE IF EXISTS t_expect;
DROP PROCEDURE IF EXISTS t_value;
DROP PROCEDURE IF EXISTS t_finish;

DELIMITER $$

CREATE PROCEDURE t_expect(IN p_name VARCHAR(120), IN p_sql TEXT, IN p_errno INT)
BEGIN
  DECLARE v_errno INT DEFAULT 0;
  DECLARE v_msg   VARCHAR(300) DEFAULT NULL;
  -- CONTINUE: record the error and carry on, instead of stopping the run.
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    GET DIAGNOSTICS CONDITION 1 v_errno = MYSQL_ERRNO, v_msg = MESSAGE_TEXT;

  SET @t_sql = p_sql;
  PREPARE t_stmt FROM @t_sql;
  EXECUTE t_stmt;
  DEALLOCATE PREPARE t_stmt;

  INSERT INTO t_result (name, expected, got, passed, message)
  VALUES (p_name, IF(p_errno = 0, 'succeeds', CONCAT('error ', p_errno)),
          IF(v_errno = 0, 'succeeded', CONCAT('error ', v_errno)),
          v_errno = p_errno, v_msg);
END $$

-- Until 6 November 2026 this procedure recorded nothing at all, silently:
-- its error handler covered the INSERT too, and the INSERT failed on an
-- "illegal mix of collations" (the value read into @t_val carries the
-- connection's collation, p_expected the database's). The handler swallowed
-- that, so every t_value check vanished from the results instead of
-- failing. Now the handler covers only the query under test, the comparison
-- names one collation, and anything that goes wrong while recording a
-- result stops the run.
CREATE PROCEDURE t_value(IN p_name VARCHAR(120), IN p_query TEXT, IN p_expected VARCHAR(200))
BEGIN
  DECLARE v_errno INT DEFAULT 0;
  DECLARE v_msg   VARCHAR(300) DEFAULT NULL;
  DECLARE v_got   VARCHAR(200);

  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
      GET DIAGNOSTICS CONDITION 1 v_errno = MYSQL_ERRNO, v_msg = MESSAGE_TEXT;
    SET @t_val = NULL;
    SET @t_sql = CONCAT('SELECT (', p_query, ') INTO @t_val');
    PREPARE t_stmt FROM @t_sql;
    EXECUTE t_stmt;
    DEALLOCATE PREPARE t_stmt;
  END;

  SET v_got = IF(v_errno = 0,
                 CONVERT(COALESCE(CAST(@t_val AS CHAR), 'NULL') USING utf8mb4) COLLATE utf8mb4_0900_ai_ci,
                 CONCAT('error ', v_errno));

  INSERT INTO t_result (name, expected, got, passed, message)
  VALUES (p_name, p_expected, v_got,
          v_errno = 0 AND v_got = CONVERT(p_expected USING utf8mb4) COLLATE utf8mb4_0900_ai_ci, v_msg);
END $$

-- Fail loudly if anything failed, so that npm run db:test exits with an
-- error code a script or a person notices. The results are printed by a
-- plain SELECT just before this is called: an error raised in the same
-- statement as the SELECT would stop the runner before it printed them.
CREATE PROCEDURE t_finish()
BEGIN
  DECLARE v_failed INT;
  DECLARE v_msg    VARCHAR(100);
  SELECT COUNT(*) INTO v_failed FROM t_result WHERE NOT passed;
  IF v_failed > 0 THEN
    SET v_msg = CONCAT(v_failed, ' test(s) FAILED — see the FAIL rows above.');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
END $$

DELIMITER ;

-- Next Sunday strictly after today: the same week seed.sql booked into.
SET @sun = CURDATE() + INTERVAL (8 - DAYOFWEEK(CURDATE())) DAY;


-- =====================================================================
-- 1. CONSTRAINTS IN schema.sql
-- =====================================================================

CALL t_expect('UHID with a wrong check digit is refused',
  "INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id)
   VALUES ('BD-2026-70413-4', 'T', '2000-01-01', 'Male', CURDATE(), 1)", 3819);

CALL t_expect('UHID in lower case is refused (binary collation)',
  "INSERT INTO patient (uhid, name, dob, sex, registered_at, registered_hospital_id)
   VALUES ('bd-2026-70412-4', 'T', '2000-01-01', 'Male', CURDATE(), 1)", 3819);

CALL t_expect('A second patient with an existing NID is refused',
  "INSERT INTO patient (uhid, name, dob, sex, nid, registered_at, registered_hospital_id)
   VALUES ('BD-2026-70412-4', 'T', '2000-01-01', 'Male', '1978419923041', CURDATE(), 1)", 1062);

CALL t_expect('An empty NID is stored as NULL, so it never collides',
  "INSERT INTO patient (uhid, name, dob, sex, nid, registered_at, registered_hospital_id)
   VALUES ('BD-2026-70412-4', 'No NID', '2000-01-01', 'Male', '', CURDATE(), 1)", 0);
CALL t_value('…and its nid really is NULL',
  "SELECT nid IS NULL FROM patient WHERE uhid = 'BD-2026-70412-4'", '1');

CALL t_expect('Implausible blood pressure is refused',
  "INSERT INTO encounter_vitals (encounter_id, recorded_at, bp_systolic, bp_diastolic, recorded_by)
   VALUES (10, NOW(), 80, 120, 11)", 3819);

CALL t_expect('A referral to the same hospital is refused',
  "INSERT INTO referral (patient_id, from_hospital_id, to_hospital_id, from_encounter_id, reason, referred_by)
   VALUES (1, 7, 7, 10, 'x', 11)", 3819);

CALL t_value('A consent grant expires 24 hours after it is granted, by default',
  "SELECT TIMESTAMPDIFF(HOUR, granted_at, expires_at) FROM consent_grant WHERE referral_id = 2", '24');

CALL t_expect('Break-glass without a justification is refused',
  "INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis, is_break_glass)
   VALUES (1, 6, 1, 'record.read', 'break_glass', TRUE)", 3819);

CALL t_expect('A hospital that patients and postings point at cannot be deleted',
  "DELETE FROM hospital WHERE hospital_id = 1", 1451);

CALL t_expect('A posting for a doctor who does not exist is refused',
  "INSERT INTO doctor_posting (doctor_id, hospital_id, department_id, consultation_fee, valid_from)
   VALUES (999, 1, 1, 500, '2026-01-01')", 1452);


-- =====================================================================
-- 2. TRIGGERS IN triggers.sql
-- =====================================================================

CALL t_expect('A patient account linked to a hospital is refused',
  "INSERT INTO user_account (username, password_hash, role_id, hospital_id, patient_id)
   VALUES ('t1', REPEAT('x', 60), 1, 1, 2)", 1644);

CALL t_expect('A staff account without a staff_name is refused',
  "INSERT INTO user_account (username, password_hash, role_id, hospital_id)
   VALUES ('t2', REPEAT('x', 60), 2, 1)", 1644);

CALL t_expect('An encounter typed with a wrong hospital and fee is accepted…',
  "INSERT INTO encounter (encounter_id, patient_id, type_id, posting_id, hospital_id, department_id,
                          consultation_fee, started_at, ended_at, created_by)
   VALUES (900, 2, 1, 1, 5, 7, 1, '2026-09-01 10:00', '2026-09-01 10:20', 6)", 0);
CALL t_value('…but the trigger stored the posting''s fee, not the typed one',
  "SELECT consultation_fee = 800.00 FROM encounter WHERE encounter_id = 900", '1');
CALL t_value('…and the posting''s hospital, not the typed one',
  "SELECT hospital_id FROM encounter WHERE encounter_id = 900", '1');

CALL t_expect('An encounter''s fee cannot be changed afterwards (decision 1)',
  "UPDATE encounter SET consultation_fee = 999 WHERE encounter_id = 10", 1644);

CALL t_expect('An encounter outside the posting''s dates is refused',
  "INSERT INTO encounter (patient_id, type_id, posting_id, started_at, created_by)
   VALUES (2, 2, 12, '2026-03-01 10:00', 8)", 1644);

CALL t_expect('Amoxicillin for a patient with a Penicillin allergy is refused',
  "INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency)
   VALUES (10, 9, 15, '1 capsule', 'three times daily')", 1644);

CALL t_expect('Ibuprofen for a patient with an Aspirin allergy is refused (same class)',
  "INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency)
   VALUES (8, 9, 17, '1 tablet', 'twice daily')", 1644);

CALL t_expect('An admission on an OPD encounter is refused',
  "INSERT INTO admission (encounter_id, admitted_at, admitted_by) VALUES (10, NOW(), 1)", 1644);

CALL t_expect('Writing a bed''s status directly is refused (decision 7)',
  "UPDATE bed SET status_id = 1 WHERE ward_id = 1 AND bed_no = 'GM-01'", 1644);

CALL t_expect('Rewriting a closed bed stay is refused',
  "UPDATE bed_occupancy SET bed_no = 'ICU-04' WHERE admission_id = 5 AND to_at IS NOT NULL", 1644);

CALL t_expect('Deleting an access-log row is refused',
  "DELETE FROM access_log WHERE log_id = 2", 1644);

CALL t_expect('Editing an access-log row is refused',
  "UPDATE access_log SET basis = 'consent' WHERE log_id = 2", 1644);

CALL t_expect('An access-log row cannot be inserted already reviewed',
  "INSERT INTO access_log (patient_id, account_id, hospital_id, action, basis, is_break_glass,
                           justification, reviewed_by, reviewed_at)
   VALUES (1, 6, 1, 'record.read', 'break_glass', TRUE, 'x', 2, NOW())", 1644);

CALL t_expect('A referral from another patient''s encounter is refused',
  "INSERT INTO referral (patient_id, from_hospital_id, to_hospital_id, from_encounter_id, reason, referred_by)
   VALUES (2, 0, 1, 10, 'x', 11)", 1644);

CALL t_expect('A lab result is accepted for a waiting order…',
  "INSERT INTO lab_result (order_id, value_num, reported_by) VALUES (7, 1.9, 4)", 0);
CALL t_value('…flagged abnormal from the reference range',
  "SELECT is_abnormal FROM lab_result WHERE order_id = 7", '1');
CALL t_value('…and its order marked reported',
  "SELECT status FROM lab_order WHERE order_id = 7", 'reported');


-- =====================================================================
-- 3. REGISTRATION — register_patient()
-- =====================================================================

CALL t_expect('A receptionist registers a patient',
  "CALL register_patient(1, 'Test Patient', '1990-01-01', 'Female', 'A+', '01700-000001',
                         '1990000000001', 'Dhaka', NULL, NULL, NULL, NULL, 'Penicillin')", 0);
CALL t_value('…and gets the year''s first serial with a correct check digit',
  "SELECT uhid FROM patient WHERE nid = '1990000000001'",
  CONCAT('BD-', YEAR(CURDATE()), '-00001-1'));
CALL t_value('…with the allergy recorded against the catalogue',
  "SELECT COUNT(*) FROM patient_allergy pa JOIN patient p ON p.patient_id = pa.patient_id
    WHERE p.nid = '1990000000001'", '1');

CALL t_expect('Registering an NID that already has a UHID is refused',
  "CALL register_patient(1, 'Other', '1990-01-01', 'Female', NULL, NULL,
                         '1990000000001', 'Dhaka', NULL, NULL, NULL, NULL, NULL)", 1644);

CALL t_expect('A doctor may not register patients',
  "CALL register_patient(6, 'Other', '1990-01-01', 'Female', NULL, NULL,
                         NULL, 'Dhaka', NULL, NULL, NULL, NULL, NULL)", 5403);

CALL t_expect('An allergen not in the catalogue is refused…',
  "CALL register_patient(1, 'Other', '1990-01-01', 'Female', NULL, NULL,
                         NULL, 'Dhaka', NULL, NULL, NULL, NULL, 'Peanuts')", 1644);
CALL t_value('…and the failed registration left no patient behind',
  "SELECT COUNT(*) FROM patient WHERE name = 'Other'", '0');
CALL t_expect('The next registration succeeds…',
  "CALL register_patient(1, 'Second Test', '1991-01-01', 'Male', NULL, NULL,
                         NULL, 'Gazipur', NULL, NULL, NULL, NULL, NULL)", 0);
CALL t_value('…and gets serial 00002: the rolled-back attempts consumed none',
  "SELECT uhid FROM patient WHERE name = 'Second Test'",
  CONCAT('BD-', YEAR(CURDATE()), '-00002-2'));


-- =====================================================================
-- 4. BOOKING — book_appointment(), cancel_appointment()   (decisions 3, 4)
-- =====================================================================

SET @slot_free      = TIMESTAMP(@sun, '11:40');
SET @slot_taken     = TIMESTAMP(@sun, '09:00');
SET @slot_cancelled = TIMESTAMP(@sun, '09:40');

CALL t_expect('A free slot can be booked',
  CONCAT("CALL book_appointment(1, 1, 'BD-2020-27615-1', '", @slot_free, "')"), 0);
CALL t_expect('The same slot cannot be booked twice',
  CONCAT("CALL book_appointment(1, 1, 'BD-2023-38104-6', '", @slot_free, "')"), 1644);
CALL t_expect('A slot already booked in the seed data is refused',
  CONCAT("CALL book_appointment(1, 1, 'BD-2023-38104-6', '", @slot_taken, "')"), 1644);
CALL t_expect('A slot freed by a cancellation can be booked again',
  CONCAT("CALL book_appointment(1, 1, 'BD-2023-38104-6', '", @slot_cancelled, "')"), 0);
CALL t_expect('A time between slot boundaries is refused',
  CONCAT("CALL book_appointment(1, 1, 'BD-2023-38104-6', '", TIMESTAMP(@sun, '09:07'), "')"), 1644);
CALL t_expect('A slot while the doctor is on leave is refused',
  CONCAT("CALL book_appointment(1, 7, 'BD-2023-38104-6', '", TIMESTAMP(@sun + INTERVAL 2 DAY, '10:00'), "')"), 1644);
CALL t_expect('A slot in the past is refused',
  "CALL book_appointment(1, 1, 'BD-2023-38104-6', '2025-01-05 09:00:00')", 1644);
CALL t_expect('A patient cannot book for someone else',
  CONCAT("CALL book_appointment(17, 1, 'BD-2021-11904-5', '", TIMESTAMP(@sun, '11:20'), "')"), 5403);
CALL t_expect('A patient can book for themselves',
  CONCAT("CALL book_appointment(17, 1, 'BD-2019-04821-5', '", TIMESTAMP(@sun, '11:20'), "')"), 0);
CALL t_expect('A patient cannot cancel someone else''s appointment',
  "CALL cancel_appointment(17, (SELECT MIN(appointment_id) FROM appointment WHERE patient_id = 5 AND status = 'booked'))", 5403);
CALL t_value('The availability grid marks a booked slot as taken',
  CONCAT("SELECT COUNT(*) FROM appointment WHERE doctor_id = 1 AND status = 'booked' AND slot_start = '", @slot_free, "'"), '1');


-- =====================================================================
-- 5. THE LOGGED READ — get_patient_record()   (decision 2)
-- =====================================================================

SET @log_before = (SELECT COUNT(*) FROM access_log);

CALL t_expect('A doctor with a live consent grant can read the record',
  "CALL get_patient_record(6, 'BD-2019-04821-5', FALSE, NULL, NULL)", 0);
CALL t_value('…and the read is logged under basis consent',
  "SELECT basis FROM access_log ORDER BY log_id DESC LIMIT 1", 'consent');
CALL t_expect('A doctor with no basis is refused with the break-glass error',
  "CALL get_patient_record(6, 'BD-2021-11904-5', FALSE, NULL, NULL)", 5423);
CALL t_value('…and a refused read writes no log row',
  "SELECT COUNT(*) FROM access_log", CAST(@log_before + 1 AS CHAR));
CALL t_expect('Break-glass without a reason is refused',
  "CALL get_patient_record(6, 'BD-2021-11904-5', TRUE, '  ', NULL)", 1644);
CALL t_expect('Break-glass with a reason is allowed…',
  "CALL get_patient_record(6, 'BD-2021-11904-5', TRUE, 'Unconscious in emergency', NULL)", 0);
CALL t_value('…and waits in the review queue',
  "SELECT COUNT(*) FROM v_break_glass_queue WHERE uhid = 'BD-2021-11904-5'", '1');
CALL t_expect('A hospital admin reviews it once…',
  "CALL review_break_glass(2, (SELECT MAX(log_id) FROM access_log))", 0);
CALL t_expect('…but not twice',
  "CALL review_break_glass(2, (SELECT MAX(log_id) FROM access_log))", 1644);
CALL t_expect('A receptionist can open a record…',
  "CALL get_patient_record(1, 'BD-2019-04821-5', FALSE, NULL, NULL)", 0);
CALL t_value('…but only demographics, and that is what is logged',
  "SELECT basis FROM access_log ORDER BY log_id DESC LIMIT 1", 'demographics_only');
CALL t_expect('A patient can read their own record',
  "CALL get_patient_record(17, 'BD-2019-04821-5', FALSE, NULL, NULL)", 0);
CALL t_expect('A patient cannot read anyone else''s',
  "CALL get_patient_record(17, 'BD-2021-11904-5', FALSE, NULL, NULL)", 5403);
CALL t_expect('An unknown UHID is reported as not found',
  "CALL get_patient_record(6, 'BD-2026-99999-5', FALSE, NULL, NULL)", 5404);


-- =====================================================================
-- 6. WARDS — admit, transfer, discharge, clean   (decision 7)
-- =====================================================================

CALL t_expect('A receptionist admits a patient to a free bed',
  "CALL admit_patient(1, 'BD-2023-38104-6', 15, 1, 'GM-04', 'Chest infection')", 0);
CALL t_value('…and the trigger marks the bed occupied',
  "SELECT status FROM v_bed_board WHERE ward_id = 1 AND no = 'GM-04'", 'occupied');
CALL t_expect('Admitting someone who is already an inpatient is refused',
  "CALL admit_patient(1, 'BD-2023-38104-6', 15, 1, 'GM-08', 'x')", 1644);
CALL t_expect('Admitting to an occupied bed is refused',
  "CALL admit_patient(1, 'BD-2020-27615-1', 15, 2, 'GF-01', 'x')", 1644);
CALL t_expect('Admitting a man to the female ward is refused',
  "CALL admit_patient(1, 'BD-2019-04821-5', 15, 2, 'GF-03', 'x')", 1644);
CALL t_expect('Admitting an adult to the paediatric ward is refused',
  "CALL admit_patient(1, 'BD-2019-04821-5', 4, 4, 'PD-03', 'x')", 1644);
CALL t_value('Every refused admission was rolled back: no stray open admissions',
  "SELECT COUNT(*) FROM admission WHERE discharged_at IS NULL", '14');

SET @adm = (SELECT a.admission_id FROM admission a JOIN encounter e ON e.encounter_id = a.encounter_id
             WHERE e.patient_id = 4 AND a.discharged_at IS NULL);

CALL t_expect('A transfer to an occupied bed is refused…',
  CONCAT("CALL transfer_patient(1, ", @adm, ", 1, 'GM-01')"), 1644);
CALL t_value('…and the patient is still in their original bed',
  "SELECT status FROM v_bed_board WHERE ward_id = 1 AND no = 'GM-04'", 'occupied');
CALL t_expect('A transfer to a free bed, in the same second as the admission, succeeds',
  CONCAT("CALL transfer_patient(1, ", @adm, ", 1, 'GM-08')"), 0);
CALL t_value('…the old bed goes for cleaning',
  "SELECT status FROM v_bed_board WHERE ward_id = 1 AND no = 'GM-04'", 'cleaning');
CALL t_value('…the new bed is occupied',
  "SELECT status FROM v_bed_board WHERE ward_id = 1 AND no = 'GM-08'", 'occupied');
CALL t_expect('A receptionist cannot discharge',
  CONCAT("CALL discharge_patient(1, ", @adm, ", 'x', 'recovered')"), 5403);
CALL t_expect('A doctor discharges',
  CONCAT("CALL discharge_patient(16, ", @adm, ", 'Recovered well', 'recovered')"), 0);
CALL t_value('…and the trigger sends the bed for cleaning',
  "SELECT status FROM v_bed_board WHERE ward_id = 1 AND no = 'GM-08'", 'cleaning');
CALL t_expect('Housekeeping marks it clean',
  "CALL mark_bed_clean(1, 1, 'GM-08')", 0);
CALL t_value('…and it is free again',
  "SELECT status FROM v_bed_board WHERE ward_id = 1 AND no = 'GM-08'", 'free');


-- =====================================================================
-- 7. REFERRAL ARRIVAL AND MERGE   (decisions 6 and 1)
-- =====================================================================

CALL t_expect('A referred patient is seen at the receiving hospital',
  "CALL start_encounter(6, 'BD-2019-04821-5', 'OPD', 'Referral review', NULL, NULL)", 0);
CALL t_value('…and the referral is now marked arrived',
  "SELECT status FROM referral WHERE referral_id = 2", 'arrived');
CALL t_expect('A doctor refers from an encounter at their hospital',
  "CALL refer_patient(11, 10, 3, 'Cardiology', 'Second opinion', 'routine')", 0);
CALL t_value('…and the receiving hospital gets a consent grant with it',
  "SELECT COUNT(*) FROM consent_grant WHERE patient_id = 1 AND to_hospital_id = 3 AND granted_via = 'referral'", '1');

CALL t_value('The database flags the two Md. Rahim Uddin records as possible duplicates',
  "SELECT matchedOn FROM v_possible_duplicates WHERE uhidA = 'BD-2019-04821-5' AND uhidB = 'BD-2018-00723-2'",
  'same name and date of birth');
CALL t_expect('A receptionist may not merge records',
  "CALL merge_patients(1, 'BD-2018-00723-2', 'BD-2019-04821-5', 'x')", 5403);
CALL t_expect('A hospital admin merges the two Md. Rahim Uddin records',
  "CALL merge_patients(2, 'BD-2018-00723-2', 'BD-2019-04821-5', 'Same person: confirmed with the patient')", 0);
CALL t_value('…the old UHID now opens the surviving record',
  "SELECT resolve_patient('BD-2018-00723-2')", '1');
CALL t_value('…his 2018 encounter moved to the surviving record',
  "SELECT patient_id FROM encounter WHERE encounter_id = 1", '1');
CALL t_value('…and the merged-away record no longer appears in search',
  "SELECT COUNT(*) FROM v_patient_directory WHERE uhid = 'BD-2018-00723-2'", '0');
CALL t_value('…nor as a possible duplicate',
  "SELECT COUNT(*) FROM v_possible_duplicates WHERE 'BD-2018-00723-2' IN (uhidA, uhidB)", '0');
CALL t_expect('A record cannot be merged away twice',
  "CALL merge_patients(2, 'BD-2018-00723-2', 'BD-2019-04821-5', 'again')", 1644);


-- =====================================================================
-- 8. THE LAB WORKLIST AND THE BREAK-GLASS SCOPE   (decisions 5 and 2)
-- =====================================================================

CALL t_expect('A receptionist may not open the lab worklist',
  "CALL lab_worklist(1)", 5403);
CALL t_expect('A lab technician opens their hospital''s worklist',
  "CALL lab_worklist(4)", 0);
CALL t_expect('A doctor at Square opens an encounter (no basis there, so with a reason)…',
  "CALL start_encounter(11, 'BD-2019-04821-5', 'OPD', 'Pre-op bloods', NULL, 'Seen at the patient''s request')", 0);
SET @sq_enc = (SELECT MAX(encounter_id) FROM encounter);
CALL t_expect('…and orders a test on it…',
  CONCAT("CALL order_lab(11, ", @sq_enc, ", 'Haemoglobin')"), 0);
CALL t_expect('…which a lab technician at Dhaka Medical may not report',
  "CALL report_lab_result(4, (SELECT MAX(order_id) FROM lab_order), 12.5, NULL)", 5404);
CALL t_expect('A hospital admin may not review a break-glass read made at another hospital',
  "CALL review_break_glass(2, 5)", 5403);
CALL t_value('…so it stays in the queue',
  "SELECT COUNT(*) FROM v_break_glass_queue WHERE id = 5", '1');
CALL t_expect('The system admin reviews break-glass reads at any hospital',
  "CALL review_break_glass(5, 5)", 0);
CALL t_expect('Reviewing an entry that does not exist is not found',
  "CALL review_break_glass(5, 999999)", 5404);


-- =====================================================================
-- 9. SCOPE — the security review's group 1 (6 November 2026)
--    Each rule below checks not only the caller's role but WHICH hospital
--    or patient the action touches.
-- =====================================================================

-- A3 · ward actions belong to the hospital the ward is in.
CALL t_expect('A3: a doctor at Square may not discharge a Dhaka Medical inpatient',
  "CALL discharge_patient(11, 1, 'x', 'recovered')", 5404);
CALL t_expect('A3: a receptionist at another hospital may not transfer one',
  "CALL transfer_patient(3, 1, 1, 'GM-04')", 5404);
CALL t_expect('A3: …nor mark a Dhaka Medical bed clean',
  "CALL mark_bed_clean(3, 1, 'GM-04')", 5404);
CALL t_value('A3: …and admission 1 is still open',
  "SELECT discharged_at IS NULL FROM admission WHERE admission_id = 1", '1');

-- A1 · opening an encounter needs a basis, or a reason that is reviewed.
SET @fatema_enc_before = (SELECT COUNT(*) FROM encounter WHERE patient_id = 2);
CALL t_expect('A1: a doctor with no basis may not open an encounter without a reason',
  "CALL start_encounter(6, 'BD-2021-11904-5', 'OPD', 'Chest pain', NULL, NULL)", 5423);
CALL t_value('A1: …and no encounter was written',
  "SELECT COUNT(*) FROM encounter WHERE patient_id = 2", CAST(@fatema_enc_before AS CHAR));
CALL t_expect('A1: with a written reason the encounter opens…',
  "CALL start_encounter(6, 'BD-2021-11904-5', 'OPD', 'Chest pain', NULL, 'Walk-in with chest pain')", 0);
CALL t_value('A1: …and waits in the break-glass review queue with that reason',
  "SELECT COUNT(*) FROM v_break_glass_queue WHERE uhid = 'BD-2021-11904-5' AND justification = 'Walk-in with chest pain'", '1');
SET @fatema_enc = (SELECT MAX(encounter_id) FROM encounter WHERE patient_id = 2);
CALL t_expect('A1: a doctor with a basis needs no reason (Rahim, referred to Dhaka Medical)',
  "CALL start_encounter(16, 'BD-2019-04821-5', 'OPD', 'Review', NULL, NULL)", 0);

-- A2 · 'treating' is the encounter's own doctor or department, not the hospital.
CALL t_expect('A2: the doctor who opened the encounter reads as treating…',
  "CALL get_patient_record(6, 'BD-2021-11904-5', FALSE, NULL, NULL)", 0);
CALL t_value('A2: …logged under basis treating',
  "SELECT basis FROM access_log ORDER BY log_id DESC LIMIT 1", 'treating');
CALL t_expect('A2: a doctor in another department of the same hospital has no basis',
  "CALL get_patient_record(7, 'BD-2021-11904-5', FALSE, NULL, NULL)", 5423);
CALL t_expect('A2: an inpatient''s own consultant reads as treating',
  "CALL get_patient_record(16, (SELECT uhid FROM patient WHERE patient_id = 6), FALSE, NULL, NULL)", 0);
CALL t_expect('A2: a doctor from another department of that hospital does not',
  "CALL get_patient_record(6, (SELECT uhid FROM patient WHERE patient_id = 6), FALSE, NULL, NULL)", 5423);

-- A5 · only the encounter's own doctor writes into it.
CALL t_expect('A5: a colleague at the same hospital may not add a diagnosis',
  CONCAT("CALL add_diagnosis(7, ", @fatema_enc, ", 'I10', TRUE, 'provisional', NULL)"), 5403);
CALL t_expect('A5: the encounter''s own doctor may',
  CONCAT("CALL add_diagnosis(6, ", @fatema_enc, ", 'I10', TRUE, 'provisional', NULL)"), 0);
CALL t_expect('A5: …and closes it',
  CONCAT("CALL end_encounter(6, ", @fatema_enc, ")"), 0);
CALL t_expect('A5: a closed encounter takes no new diagnosis',
  CONCAT("CALL add_diagnosis(6, ", @fatema_enc, ", 'I10', FALSE, 'provisional', NULL)"), 1644);
CALL t_expect('A5: …nor a lab order',
  CONCAT("CALL order_lab(6, ", @fatema_enc, ", 'Haemoglobin')"), 1644);
CALL t_expect('A5: a doctor outside the admitting department may not record an inpatient''s vitals',
  "CALL record_vitals(6, 12, 120, 80, 72, NULL, NULL, NULL)", 5403);
CALL t_expect('A5: the admitting department''s doctor may',
  "CALL record_vitals(16, 12, 120, 80, 72, NULL, NULL, NULL)", 0);

-- A4 · staff cancel at their own hospital, or what they booked themselves.
SET @dmch_appt = (SELECT MIN(a.appointment_id) FROM appointment a
                    JOIN doctor_posting dp ON dp.posting_id = a.posting_id
                   WHERE dp.hospital_id = 1 AND a.status = 'booked' AND a.booked_by <> 3);
CALL t_expect('A4: a receptionist at another hospital may not cancel a Dhaka Medical appointment',
  CONCAT("CALL cancel_appointment(3, ", @dmch_appt, ")"), 5403);
CALL t_expect('A4: a Dhaka Medical receptionist may',
  CONCAT("CALL cancel_appointment(1, ", @dmch_appt, ")"), 0);

-- A6 · a hospital admin merges only records registered at their hospital.
CALL t_expect('A6: a Dhaka Medical admin may not merge two records registered elsewhere',
  "CALL merge_patients(2, 'BD-2023-38104-6', 'BD-2020-27615-1', 'x')", 5403);

-- L1 · no national list: a specific, limited, masked, logged search.
CALL t_expect('L1: a doctor searches by 3 letters of a name',
  "CALL search_patients(6, 'rahim', NULL)", 0);
CALL t_value('L1: …and each person returned is logged as a search match',
  "SELECT COUNT(*) FROM access_log WHERE account_id = 6 AND action = 'search.match'", '1');
CALL t_expect('L1: two letters are not a search',
  "CALL search_patients(6, 'ra', NULL)", 1644);
CALL t_expect('L1: a patient may not search',
  "CALL search_patients(17, 'rahim', NULL)", 5403);
CALL t_expect('L1: a merged-away UHID finds the surviving record',
  "CALL search_patients(1, 'bd-2018-00723-2', NULL)", 0);
CALL t_value('L1: …logged against the survivor',
  "SELECT patient_id FROM access_log WHERE account_id = 1 AND action = 'search.match' ORDER BY log_id DESC LIMIT 1", '1');
CALL t_expect('L1: the registration desk checks name and date of birth before issuing',
  "CALL registration_matches(1, 'Md. Rahim', '1978-04-12', NULL, NULL, NULL)", 0);
CALL t_value('L1: …a partial name with the right birth date finds him, and the match is logged',
  "SELECT COUNT(*) FROM access_log WHERE account_id = 1 AND action = 'search.match'", '2');
CALL t_value('L1: the web server''s account cannot read the national directory view',
  "SELECT COUNT(*) FROM information_schema.TABLE_PRIVILEGES
    WHERE GRANTEE LIKE '%uhid_app%' AND TABLE_NAME = 'v_patient_directory'", '0');


SELECT test_no, IF(passed, 'PASS', 'FAIL') AS result, name, expected, got, message
  FROM t_result ORDER BY test_no;

CALL t_finish();
