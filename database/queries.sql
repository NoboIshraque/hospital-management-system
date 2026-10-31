-- =====================================================================
-- UHID National Hospital Management System — demonstration queries
-- Run any one in the mysql prompt, or the whole file:
--   npm run db:run -- ../database/queries.sql      (from server/)
--
-- Each query answers a question the system should be able to answer, and
-- says which SQL feature it shows and which design decision it serves. The
-- point of normalizing the prototype's free text into coded tables is that
-- questions like these become one query each instead of a manual search.
--
-- Run them as root (or any user with SELECT on the tables). The application
-- user uhid_app cannot: it has no SELECT on clinical tables (grants.sql).
-- =====================================================================

USE uhid;


-- ---------------------------------------------------------------------
-- 1. ONE PATIENT, EVERY HOSPITAL                    multi-table JOIN · decision 5, 6
-- Md. Rahim Uddin's whole history, from four hospitals in two divisions,
-- as one list. This is the national record the project exists for.
-- ---------------------------------------------------------------------
SELECT DATE(e.started_at) AS date, h.name AS hospital, dv.name AS division,
       t.code AS type, d.name AS doctor, dept.name AS department,
       dg.icd10_code AS icd10, dg.term AS diagnosis
  FROM encounter e
  JOIN patient p         ON p.patient_id = e.patient_id
  JOIN hospital h        ON h.hospital_id = e.hospital_id
  JOIN district ds       ON ds.district_id = h.district_id
  JOIN division dv       ON dv.division_id = ds.division_id
  JOIN encounter_type t  ON t.type_id = e.type_id
  JOIN doctor_posting dp ON dp.posting_id = e.posting_id
  JOIN doctor d          ON d.doctor_id = dp.doctor_id
  JOIN department dept   ON dept.department_id = e.department_id
  LEFT JOIN encounter_diagnosis ed ON ed.encounter_id = e.encounter_id AND ed.is_primary
  LEFT JOIN diagnosis dg           ON dg.diagnosis_id = ed.diagnosis_id
 WHERE p.uhid = 'BD-2019-04821-5'
 ORDER BY e.started_at DESC;


-- ---------------------------------------------------------------------
-- 2. PATIENTS TREATED AT MORE THAN ONE HOSPITAL     GROUP BY · HAVING · decision 6
-- ---------------------------------------------------------------------
SELECT p.uhid, p.name,
       COUNT(DISTINCT e.hospital_id) AS hospitals,
       COUNT(*)                      AS encounters
  FROM patient p
  JOIN encounter e ON e.patient_id = p.patient_id
 GROUP BY p.patient_id, p.uhid, p.name
HAVING COUNT(DISTINCT e.hospital_id) > 1
 ORDER BY hospitals DESC;


-- ---------------------------------------------------------------------
-- 3. HOW MANY HYPERTENSIVE PATIENTS ARE THERE?      COUNT(DISTINCT) over a code
-- The question er-design.md §4.3 says free text could never answer. With
-- diagnoses coded to ICD-10 it is an equality test on one column.
-- ---------------------------------------------------------------------
SELECT dg.icd10_code, dg.term, COUNT(DISTINCT e.patient_id) AS patients
  FROM encounter_diagnosis ed
  JOIN diagnosis dg ON dg.diagnosis_id = ed.diagnosis_id
  JOIN encounter e  ON e.encounter_id  = ed.encounter_id
 WHERE dg.icd10_code = 'I10';


-- ---------------------------------------------------------------------
-- 4. DISEASE BURDEN BY DIVISION AND CATEGORY        GROUP BY … WITH ROLLUP
-- Encounters per diagnosis category in each division, with a subtotal per
-- division and a grand total (the NULL rows ROLLUP adds).
-- ---------------------------------------------------------------------
SELECT COALESCE(dv.name, '— all divisions —') AS division,
       COALESCE(dg.category, '— all categories —') AS category,
       COUNT(*) AS encounters
  FROM encounter e
  JOIN encounter_diagnosis ed ON ed.encounter_id = e.encounter_id AND ed.is_primary
  JOIN diagnosis dg           ON dg.diagnosis_id = ed.diagnosis_id
  JOIN hospital h             ON h.hospital_id = e.hospital_id
  JOIN district ds            ON ds.district_id = h.district_id
  JOIN division dv            ON dv.division_id = ds.division_id
 GROUP BY dv.name, dg.category WITH ROLLUP;


-- ---------------------------------------------------------------------
-- 5. POSSIBLE DUPLICATE PATIENTS                    self-JOIN · decision 1
-- Pairs of records that might be one human: same name and date of birth,
-- or the same phone number. p1.patient_id < p2.patient_id lists each pair
-- once instead of twice. The seed data's deliberate duplicate shows up here.
-- ---------------------------------------------------------------------
SELECT p1.uhid AS record_a, p2.uhid AS record_b, p1.name,
       CONCAT_WS(' + ',
         IF(p1.name = p2.name AND p1.dob = p2.dob, 'name & DOB', NULL),
         IF(p1.phone = p2.phone, 'phone', NULL)) AS matched_on,
       p1.nid IS NULL OR p2.nid IS NULL AS one_has_no_nid
  FROM patient p1
  JOIN patient p2 ON p1.patient_id < p2.patient_id
                 AND ((p1.name = p2.name AND p1.dob = p2.dob) OR p1.phone = p2.phone)
 WHERE NOT EXISTS (SELECT 1 FROM patient_merge m
                    WHERE m.losing_patient_id IN (p1.patient_id, p2.patient_id));


-- ---------------------------------------------------------------------
-- 6. PROOF: NO PRESCRIPTION CONFLICTS WITH AN ALLERGY     anti-join · catalogue rule
-- Every drug line whose class matches one of the patient's allergies. This
-- returns NO ROWS, because trg_prescription_item_bi refuses such a line.
-- An empty result from a query designed to find violations is the proof.
-- ---------------------------------------------------------------------
SELECT p.uhid, p.name, a.name AS allergy, m.generic_name AS prescribed
  FROM prescription_item pi
  JOIN prescription pr    ON pr.prescription_id = pi.prescription_id
  JOIN encounter e        ON e.encounter_id = pr.encounter_id
  JOIN patient p          ON p.patient_id = e.patient_id
  JOIN medicine m         ON m.medicine_id = pi.medicine_id
  JOIN patient_allergy pa ON pa.patient_id = p.patient_id
  JOIN allergen a         ON a.allergen_id = pa.allergen_id
 WHERE a.class = m.drug_class OR a.name = m.generic_name;


-- ---------------------------------------------------------------------
-- 7. BUSIEST DEPARTMENTS, RANKED                    window function RANK()
-- RANK() leaves gaps after ties (1, 2, 2, 4); DENSE_RANK() would not.
-- ---------------------------------------------------------------------
SELECT dept.name AS department,
       COUNT(*) AS encounters,
       RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_by_volume,
       ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct_of_all
  FROM encounter e
  JOIN department dept ON dept.department_id = e.department_id
 GROUP BY dept.department_id, dept.name
 ORDER BY rank_by_volume;


-- ---------------------------------------------------------------------
-- 8. REGISTRATIONS PER YEAR, WITH A RUNNING TOTAL   window SUM() OVER (ORDER BY)
-- ---------------------------------------------------------------------
SELECT YEAR(registered_at) AS year,
       COUNT(*) AS registered,
       SUM(COUNT(*)) OVER (ORDER BY YEAR(registered_at)) AS running_total
  FROM patient
 GROUP BY YEAR(registered_at)
 ORDER BY year;


-- ---------------------------------------------------------------------
-- 9. TIME BETWEEN A PATIENT'S VISITS                window LAG()
-- LAG() reads the previous row in the window: here, the same patient's
-- previous encounter, so the gap needs no self-join.
-- ---------------------------------------------------------------------
SELECT p.name, DATE(e.started_at) AS visit, h.name AS hospital,
       DATEDIFF(e.started_at,
                LAG(e.started_at) OVER (PARTITION BY e.patient_id ORDER BY e.started_at)) AS days_since_previous
  FROM encounter e
  JOIN patient p  ON p.patient_id = e.patient_id
  JOIN hospital h ON h.hospital_id = e.hospital_id
 WHERE p.patient_id IN (SELECT patient_id FROM encounter GROUP BY patient_id HAVING COUNT(*) > 1)
 ORDER BY p.name, e.started_at;


-- ---------------------------------------------------------------------
-- 10. CHRONIC PATIENTS OVERDUE FOR REVIEW           NOT EXISTS with a date window
-- Anyone with hypertension or chronic kidney disease on record who has had
-- no encounter anywhere in the last six months.
-- ---------------------------------------------------------------------
SELECT DISTINCT p.uhid, p.name, dg.term AS condition_on_record,
       (SELECT DATE(MAX(started_at)) FROM encounter WHERE patient_id = p.patient_id) AS last_seen
  FROM patient p
  JOIN encounter e            ON e.patient_id = p.patient_id
  JOIN encounter_diagnosis ed ON ed.encounter_id = e.encounter_id
  JOIN diagnosis dg           ON dg.diagnosis_id = ed.diagnosis_id
 WHERE dg.icd10_code IN ('I10', 'N18.3', 'N18.4')
   AND NOT EXISTS (SELECT 1 FROM encounter e2
                    WHERE e2.patient_id = p.patient_id
                      AND e2.started_at >= NOW() - INTERVAL 6 MONTH);


-- ---------------------------------------------------------------------
-- 11. THE NEXT 14 DAYS, DAY BY DAY                  recursive CTE · LEFT JOIN · decision 3
-- A calendar generated by a recursive CTE, with the number of live
-- bookings each day. Days with none still appear, because the calendar
-- comes from the CTE, not from the appointment table.
-- ---------------------------------------------------------------------
WITH RECURSIVE calendar AS (
  SELECT CURDATE() AS d
  UNION ALL
  SELECT d + INTERVAL 1 DAY FROM calendar WHERE d < CURDATE() + INTERVAL 13 DAY
)
SELECT c.d AS date, DAYNAME(c.d) AS day, COUNT(a.appointment_id) AS booked
  FROM calendar c
  LEFT JOIN appointment a ON DATE(a.slot_start) = c.d AND a.status = 'booked'
 GROUP BY c.d
 ORDER BY c.d;


-- ---------------------------------------------------------------------
-- 12. ONE DOCTOR, TWO HOSPITALS, ONE DIARY          GROUP BY over a denormalized key · decision 4
-- Dr. Anisur Rahman's bookings split by posting. uq_doctor_slot is on
-- doctor_id, so these share one diary however many hospitals he works at.
-- ---------------------------------------------------------------------
SELECT d.name, h.name AS hospital, dp.consultation_fee AS fee,
       COUNT(a.appointment_id) AS live_bookings
  FROM doctor d
  JOIN doctor_posting dp ON dp.doctor_id = d.doctor_id AND dp.valid_to IS NULL
  JOIN hospital h        ON h.hospital_id = dp.hospital_id
  LEFT JOIN appointment a ON a.posting_id = dp.posting_id AND a.status = 'booked'
 WHERE d.bmdc_reg = 'A-42817'
 GROUP BY d.name, h.name, dp.consultation_fee;


-- ---------------------------------------------------------------------
-- 13. INPATIENTS: WHO, WHERE, HOW LONG             reading a view · decision 7
-- v_bed_board joins bed → open occupancy → admission → encounter → patient.
-- ---------------------------------------------------------------------
SELECT ward, no AS bed, patient, uhid, dx, days AS day_of_stay
  FROM v_bed_board
 WHERE status = 'occupied'
 ORDER BY days DESC, ward, no;


-- ---------------------------------------------------------------------
-- 14. A STAY THAT MOVED BETWEEN BEDS                history in bed_occupancy · decision 7
-- Admission 5 (Babul Mia) was in ICU, then transferred. admission has no
-- bed_id; the whole path is here.
-- ---------------------------------------------------------------------
SELECT p.name, w.name AS ward, o.bed_no, o.from_at, COALESCE(o.to_at, 'now') AS to_at
  FROM bed_occupancy o
  JOIN ward w      ON w.ward_id = o.ward_id
  JOIN admission a ON a.admission_id = o.admission_id
  JOIN encounter e ON e.encounter_id = a.encounter_id
  JOIN patient p   ON p.patient_id = e.patient_id
 WHERE a.admission_id IN (SELECT admission_id FROM bed_occupancy GROUP BY admission_id HAVING COUNT(*) > 1)
 ORDER BY o.from_at;


-- ---------------------------------------------------------------------
-- 15. REFERRALS: SENT, ARRIVED, STILL WAITING      conditional aggregation · decision 6
-- ---------------------------------------------------------------------
SELECT h.name AS receiving_hospital,
       COUNT(*)                                        AS referred,
       SUM(r.to_encounter_id IS NOT NULL)              AS arrived,
       SUM(r.to_encounter_id IS NULL AND r.status = 'issued') AS still_waiting
  FROM referral r
  JOIN hospital h ON h.hospital_id = r.to_hospital_id
 GROUP BY h.hospital_id, h.name;


-- ---------------------------------------------------------------------
-- 16. WHO READ WHOSE RECORD, AND ON WHAT AUTHORITY      the audit trail · decision 2
-- Break-glass reads per hospital, reviewed and still pending.
-- ---------------------------------------------------------------------
SELECT COALESCE(h.name, 'Patient portal') AS hospital,
       l.basis,
       COUNT(*) AS read_count,
       SUM(l.is_break_glass AND l.reviewed_by IS NULL) AS break_glass_unreviewed
  FROM access_log l
  LEFT JOIN hospital h ON h.hospital_id = l.hospital_id
 GROUP BY h.name, l.basis
 ORDER BY hospital, read_count DESC;


-- ---------------------------------------------------------------------
-- 17. ABNORMAL LAB RESULTS                          JOIN + derived flag
-- ---------------------------------------------------------------------
SELECT p.name, t.name AS test,
       COALESCE(CONCAT(r.value_num, ' ', COALESCE(t.unit, '')), r.value_text) AS result,
       CONCAT_WS(' – ', t.ref_low, t.ref_high) AS reference_range,
       DATE(r.reported_at) AS reported
  FROM lab_result r
  JOIN lab_order o ON o.order_id = r.order_id
  JOIN lab_test t  ON t.test_id  = o.test_id
  JOIN encounter e ON e.encounter_id = o.encounter_id
  JOIN patient p   ON p.patient_id = e.patient_id
 WHERE r.is_abnormal
 ORDER BY r.reported_at DESC;


-- ---------------------------------------------------------------------
-- 18. MOST PRESCRIBED MEDICINES, BY CLASS           GROUP BY two levels
-- ---------------------------------------------------------------------
SELECT m.drug_class, m.generic_name, COUNT(*) AS times_prescribed
  FROM prescription_item pi
  JOIN medicine m ON m.medicine_id = pi.medicine_id
 GROUP BY m.drug_class, m.generic_name
 ORDER BY times_prescribed DESC, m.drug_class
 LIMIT 10;


-- ---------------------------------------------------------------------
-- 19. SEEN AT BOTH DHAKA MEDICAL AND SQUARE         INTERSECT (MySQL 8.0.31+)
-- ---------------------------------------------------------------------
SELECT p.uhid, p.name FROM patient p JOIN encounter e ON e.patient_id = p.patient_id WHERE e.hospital_id = 1
INTERSECT
SELECT p.uhid, p.name FROM patient p JOIN encounter e ON e.patient_id = p.patient_id WHERE e.hospital_id = 7;


-- ---------------------------------------------------------------------
-- 20. A FEE CHARGED THEN VS THE FEE NOW             snapshot column · §8 decision 1
-- encounter.consultation_fee is what was charged at the time; the posting
-- holds today's fee. Empty until a fee changes. To see it work:
--   UPDATE doctor_posting SET consultation_fee = 1700 WHERE posting_id = 6;
-- and run this again. Dr. Tahmina's past encounters still show 1500.
-- ---------------------------------------------------------------------
SELECT p.name, DATE(e.started_at) AS date, d.name AS doctor,
       e.consultation_fee AS charged_then, dp.consultation_fee AS fee_now
  FROM encounter e
  JOIN doctor_posting dp ON dp.posting_id = e.posting_id
  JOIN doctor d          ON d.doctor_id = dp.doctor_id
  JOIN patient p         ON p.patient_id = e.patient_id
 WHERE e.consultation_fee <> dp.consultation_fee;
