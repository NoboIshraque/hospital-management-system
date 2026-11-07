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

-- EXECUTE on each procedure the server calls, by name — not on uhid.*
-- (stress test H3.3). The helpers inside them (require_permission,
-- resolve_patient, care_basis…) run with the definer's rights when a
-- procedure calls them, so the server needs no right to call them itself.
GRANT EXECUTE ON PROCEDURE uhid.add_diagnosis          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.admit_patient          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.book_appointment       TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.bed_board              TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.break_glass_queue      TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.cancel_appointment     TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.list_appointments      TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.mark_no_show           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.update_patient_details TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.verify_identity        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.collect_sample         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.access_log_page        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.org_setup              TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.post_doctor            TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.set_posting_fee        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.end_posting            TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.add_schedule           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.end_schedule           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.add_leave              TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.remove_leave           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.add_ward               TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.add_beds               TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.set_bed_service        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.add_hospital           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.set_hospital_active    TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.list_hospitals         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.change_password        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.create_staff_account   TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.issue_patient_login    TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.list_accounts          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.reset_password         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.set_account_active     TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.discharge_patient      TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.doctor_availability    TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.end_encounter          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.get_login              TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.get_patient_record     TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.lab_worklist           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.list_consents          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.log_unsaved_encounter  TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.mark_bed_clean         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.merge_patients         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.order_lab              TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.prescribe              TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.record_allergy         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.record_login           TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.record_vitals          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.refer_patient          TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.referral_inbox         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.register_patient       TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.registration_matches   TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.report_lab_result      TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.review_break_glass     TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.revoke_consent         TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.search_patients        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.start_encounter        TO 'uhid_app'@'localhost';
GRANT EXECUTE ON PROCEDURE uhid.transfer_patient       TO 'uhid_app'@'localhost';
GRANT EXECUTE ON FUNCTION  uhid.has_permission         TO 'uhid_app'@'localhost';

GRANT SELECT ON uhid.v_hospital_directory  TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_doctor_directory    TO 'uhid_app'@'localhost';
-- Not v_patient_directory: that view is every patient in the country, and
-- handing it to the web server was a bulk export (security review L1).
-- Patients are found through search_patients(), which needs a specific
-- query, returns at most 20, masks NID and phone, and logs each match.
GRANT SELECT ON uhid.v_ward_occupancy      TO 'uhid_app'@'localhost';
-- Not v_bed_board, v_break_glass_queue or v_referral_inbox: they hold
-- clinical content (diagnoses, reasons), so the server reads them only
-- through bed_board(), break_glass_queue() and referral_inbox(), which
-- check the permission and the hospital (stress test H2.4).
GRANT SELECT ON uhid.v_district_list       TO 'uhid_app'@'localhost';
GRANT SELECT ON uhid.v_possible_duplicates TO 'uhid_app'@'localhost';

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
