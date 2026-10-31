-- =====================================================================
-- UHID National Hospital Management System — the application's database user
-- Run last, after seed.sql.  `npm run db:reset` (in server/) does it for you,
-- and it sets @uhid_app_password from APP_DB_PASSWORD in server/.env first.
-- The password is never written in this file, because this file is committed.
--
-- Least privilege. The Express API connects as uhid_app, not as root, and
-- uhid_app can do exactly three things:
--
--   EXECUTE  every procedure and function. All writes, and every clinical
--            read, go through procedures.sql, which checks permissions,
--            enforces the rules, and writes the access log.
--   SELECT   the views in views.sql: the read models the screens use.
--   SELECT   the small lookup tables the screens fill drop-downs from.
--
-- What it cannot do is the point:
--   - no SELECT on patient, encounter, prescription, access_log, … : the
--     only way to read a clinical record is get_patient_record(), which logs
--     the read first (decision 2);
--   - no INSERT/UPDATE/DELETE on any table: in particular no UPDATE on bed,
--     so bed status really is written only by the triggers (decision 7), and
--     no DELETE or TRUNCATE on access_log, which triggers cannot prevent;
--   - no CREATE, DROP or ALTER.
--
-- How a procedure can do what its caller cannot: procedures and views run
-- with their DEFINER's rights (SQL SECURITY DEFINER, MySQL's default). They
-- were created by root, so they may touch the tables; uhid_app may only run
-- them. The procedure is the door, and it decides who gets through.
--
-- Host 'localhost' only: the server listens on 127.0.0.1, and this account
-- cannot be used from any other machine.
-- =====================================================================

DROP USER IF EXISTS 'uhid_app'@'localhost';

-- CREATE USER cannot take a variable directly, so the statement is built as
-- text and run as a prepared statement. QUOTE() escapes the password safely.
SET @create_app_user = CONCAT('CREATE USER ''uhid_app''@''localhost'' IDENTIFIED BY ',
                              QUOTE(@uhid_app_password));
PREPARE create_app_user FROM @create_app_user;
EXECUTE create_app_user;
DEALLOCATE PREPARE create_app_user;
SET @create_app_user = NULL;

GRANT EXECUTE ON uhid.* TO 'uhid_app'@'localhost';

GRANT SELECT ON uhid.v_hospital_directory TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_doctor_directory   TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_patient_directory  TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_bed_board          TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_ward_occupancy     TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_break_glass_queue  TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_referral_inbox     TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_district_list      TO 'uhid_app'@'localhost';

-- Lookup tables: catalogues with no personal data in them.
GRANT SELECT ON uhid.division       TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.district       TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.department     TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.hospital_tier  TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.encounter_type TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.diagnosis      TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.medicine       TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.allergen       TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.lab_test       TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.ward_type      TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.bed_status     TO 'uhid_app'@'localhost';
