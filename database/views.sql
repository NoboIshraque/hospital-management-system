-- =====================================================================
-- UHID National Hospital Management System — views
-- Run after procedures.sql.  `npm run db:reset` (in server/) does it.
--
-- A view is a saved SELECT. These are the READ side of the API: each one
-- returns rows in exactly the shape a screen in public/ already expects, so
-- the route handler is one line — SELECT * FROM v_whatever WHERE ...
--
-- This is the sentence from er-design.md §4.3 made concrete: the frontend's
-- shape is a view, the database's shape is normalized, and the view is where
-- one becomes the other. Column aliases like hospitalId are camelCase on
-- purpose — they are the JSON keys js/data.js uses.
--
-- Security: a view runs with its DEFINER's rights (SQL SECURITY DEFINER is
-- the default). So the application user can SELECT from v_doctor_directory
-- without having SELECT on doctor_posting. grants.sql relies on this.
--
-- Clinical content is deliberately NOT in any view. It is only reachable
-- through get_patient_record(), which logs the read.
-- =====================================================================

USE uhid;

-- js/data.js HOSPITALS: { id, name, div, dist, tier }
-- `div` needs backticks: DIV is MySQL's integer-division operator.
CREATE OR REPLACE VIEW v_hospital_directory AS
SELECT h.hospital_id AS id,
       h.name,
       dv.name       AS `div`,
       ds.name       AS dist,
       t.name        AS tier,
       h.address,
       h.phone
  FROM hospital h
  JOIN district ds     ON ds.district_id = h.district_id
  JOIN division dv     ON dv.division_id = ds.division_id
  JOIN hospital_tier t ON t.tier_id      = h.tier_id
 WHERE h.is_active;

-- js/data.js DOCTORS: { id, name, dept, qual, hospitalId, fee, bmdc }
-- One row per CURRENT POSTING, not per doctor (er-design.md §4.2): id is the
-- posting id, so a consultant with two practices appears twice — once per
-- hospital, each with its own fee — and a booking is always for a posting.
CREATE OR REPLACE VIEW v_doctor_directory AS
SELECT dp.posting_id        AS id,
       d.name,
       dept.name            AS dept,
       d.qualifications     AS qual,
       dp.hospital_id       AS hospitalId,
       dp.consultation_fee  AS fee,
       d.bmdc_reg           AS bmdc,
       d.doctor_id          AS doctorId
  FROM doctor_posting dp
  JOIN doctor d        ON d.doctor_id = dp.doctor_id
  JOIN department dept ON dept.department_id = dp.department_id
  JOIN hospital h      ON h.hospital_id = dp.hospital_id
 WHERE d.is_active AND h.is_active
   AND dp.valid_from <= CURDATE()
   AND (dp.valid_to IS NULL OR dp.valid_to >= CURDATE());

-- The patient search list and the registration duplicate check. Demographics
-- only — the shape of js/seed.js without allergies[] and encounters[], plus
-- a count of encounters for the search card. A record that has been merged
-- away is left out: searching finds the surviving record, and the old UHID
-- still opens it through resolve_patient().
CREATE OR REPLACE VIEW v_patient_directory AS
SELECT p.uhid,
       p.name,
       p.dob,
       p.sex,
       p.blood_group AS blood,
       COALESCE(p.phone, '') AS phone,
       COALESCE(p.nid, '')   AS nid,
       COALESCE(d.name, '')  AS district,
       p.registered_at       AS registeredAt,
       p.registered_hospital_id AS registeredHospitalId,
       p.identity_verified   AS identityVerified,
       (SELECT COUNT(*) FROM encounter e WHERE e.patient_id = p.patient_id) AS encounterCount
  FROM patient p
  LEFT JOIN district d ON d.district_id = p.district_id
 WHERE NOT EXISTS (SELECT 1 FROM patient_merge m WHERE m.losing_patient_id = p.patient_id);

-- The bed board in pages/wards.js: every bed, its status, and — when it is
-- occupied — who is in it. The patient columns come from the OPEN
-- bed_occupancy row (to_at IS NULL), which is exactly one row per occupied
-- bed because trg_bed_occupancy_bi allows no other state.
CREATE OR REPLACE VIEW v_bed_board AS
SELECT w.hospital_id,
       w.ward_id,
       w.name        AS ward,
       wt.code       AS wardType,
       b.bed_no      AS no,
       IF(b.is_out_of_service, 'out of service', s.code) AS status,
       a.admission_id AS admissionId,
       p.name        AS patient,
       p.uhid,
       COALESCE(
         (SELECT dg.term FROM encounter_diagnosis ed JOIN diagnosis dg ON dg.diagnosis_id = ed.diagnosis_id
           WHERE ed.encounter_id = a.encounter_id ORDER BY ed.is_primary DESC LIMIT 1),
         e.chief_complaint) AS dx,
       IF(a.admission_id IS NULL, NULL, DATEDIFF(CURDATE(), DATE(a.admitted_at)) + 1) AS days
  FROM bed b
  JOIN ward w        ON w.ward_id = b.ward_id
  JOIN ward_type wt  ON wt.ward_type_id = w.ward_type_id
  JOIN bed_status s  ON s.status_id = b.status_id
  LEFT JOIN bed_occupancy o ON o.ward_id = b.ward_id AND o.bed_no = b.bed_no AND o.to_at IS NULL
  LEFT JOIN admission a     ON a.admission_id = o.admission_id
  LEFT JOIN encounter e     ON e.encounter_id = a.encounter_id
  LEFT JOIN patient p       ON p.patient_id = e.patient_id;

-- Occupancy per ward. A derived attribute (er-design.md §6.3) — computed
-- here on every read, never stored.
CREATE OR REPLACE VIEW v_ward_occupancy AS
SELECT w.hospital_id,
       w.ward_id,
       w.name AS ward,
       wt.code AS wardType,
       COUNT(*)                                AS beds,
       SUM(s.code = 'occupied')                AS occupied,
       SUM(s.code = 'free' AND NOT b.is_out_of_service) AS free,
       SUM(s.code = 'reserved')                AS reserved,
       SUM(s.code = 'cleaning')                AS cleaning,
       ROUND(100 * SUM(s.code = 'occupied') / COUNT(*)) AS pct
  FROM ward w
  JOIN ward_type wt ON wt.ward_type_id = w.ward_type_id
  JOIN bed b        ON b.ward_id = w.ward_id
  JOIN bed_status s ON s.status_id = b.status_id
 GROUP BY w.hospital_id, w.ward_id, w.name, wt.code;

-- Decision 2's work queue: every break-glass read nobody has reviewed yet.
CREATE OR REPLACE VIEW v_break_glass_queue AS
SELECT l.log_id     AS id,
       l.at,
       account_name(l.account_id) AS reader,
       h.name       AS hospital,
       l.hospital_id AS hospitalId,
       p.uhid,
       p.name       AS patient,
       l.justification,
       TIMESTAMPDIFF(HOUR, l.at, NOW()) AS hoursWaiting
  FROM access_log l
  JOIN patient p       ON p.patient_id = l.patient_id
  LEFT JOIN hospital h ON h.hospital_id = l.hospital_id
 WHERE l.is_break_glass AND l.reviewed_by IS NULL;

-- Decision 6's question that used to be a phone call: who was referred to
-- this hospital and has not arrived? to_encounter_id IS NULL is the answer.
CREATE OR REPLACE VIEW v_referral_inbox AS
SELECT r.referral_id     AS id,
       r.to_hospital_id  AS toHospitalId,
       p.uhid,
       p.name            AS patient,
       hf.name           AS fromHospital,
       dept.name         AS dept,
       r.reason,
       r.urgency,
       r.referred_at     AS referredAt,
       DATEDIFF(CURDATE(), DATE(r.referred_at)) AS daysWaiting
  FROM referral r
  JOIN patient p         ON p.patient_id = r.patient_id
  JOIN hospital hf       ON hf.hospital_id = r.from_hospital_id
  LEFT JOIN department dept ON dept.department_id = r.to_department_id
 WHERE r.status = 'issued' AND r.to_encounter_id IS NULL;

-- The 64 districts with their division, for the registration form.
CREATE OR REPLACE VIEW v_district_list AS
SELECT ds.name AS district, dv.name AS `div`
  FROM district ds JOIN division dv ON dv.division_id = ds.division_id;
