-- =====================================================================
-- UHID National Hospital Management System — seed data
-- Run after views.sql.  `npm run db:reset` (in server/) does it for you.
--
-- Everything in public/js/data.js and public/js/seed.js, decomposed into
-- the normalized tables: the free-text strings in seed.js ('Amlodipine 5 mg
-- — 1 tablet at night — 90 days') become catalogue rows plus columns here.
-- Compare the two files side by side; that comparison IS the normalization
-- write-up in miniature.
--
-- Added beyond the JS files, because the screens need them once they read
-- real data: all 64 districts, 13 inpatients so the bed board has genuine
-- admissions behind it, weekly schedules so availability can be computed,
-- lab results, vitals, referrals, consent grants and access-log history.
--
-- Times relative to NOW(). Some rows — today's referral, the inpatients'
-- admission dates, next week's appointments — are written relative to the
-- moment this file runs, so the demo always looks current. Re-run
-- `npm run db:reset` on the morning of a demonstration: the referral's
-- consent grant lasts 24 hours (§8 decision 5), and after that Dr. Anisur
-- reads Md. Rahim Uddin's record under break-glass instead of consent.
--
-- Every demo login's password is demo1234. password_hash is its bcrypt
-- hash, generated with bcryptjs (cost 10). The plaintext is never stored.
-- =====================================================================

USE uhid;

SET @now = NOW();
-- Next Sunday strictly after today: the start of next week's appointments.
-- DAYOFWEEK() is 1 for Sunday … 7 for Saturday.
SET @sun = CURDATE() + INTERVAL (8 - DAYOFWEEK(CURDATE())) DAY;
SET @pw  = '$2a$10$Ri1jUMV5vb3X5UiO7bjaGuEeMkc6q58NH8Qe/YQIz6W3Pv73Ivboy';


-- =====================================================================
-- 1. GEOGRAPHY — 8 divisions, 64 districts
-- =====================================================================

INSERT INTO division (division_id, name) VALUES
  (1, 'Dhaka'), (2, 'Chattogram'), (3, 'Sylhet'), (4, 'Rajshahi'),
  (5, 'Khulna'), (6, 'Rangpur'), (7, 'Barishal'), (8, 'Mymensingh');

INSERT INTO district (division_id, name) VALUES
  (1,'Dhaka'), (1,'Faridpur'), (1,'Gazipur'), (1,'Gopalganj'), (1,'Kishoreganj'),
  (1,'Madaripur'), (1,'Manikganj'), (1,'Munshiganj'), (1,'Narayanganj'), (1,'Narsingdi'),
  (1,'Rajbari'), (1,'Shariatpur'), (1,'Tangail'),
  (2,'Bandarban'), (2,'Brahmanbaria'), (2,'Chandpur'), (2,'Chattogram'), (2,'Cox''s Bazar'),
  (2,'Cumilla'), (2,'Feni'), (2,'Khagrachhari'), (2,'Lakshmipur'), (2,'Noakhali'), (2,'Rangamati'),
  (3,'Habiganj'), (3,'Moulvibazar'), (3,'Sunamganj'), (3,'Sylhet'),
  (4,'Bogura'), (4,'Chapainawabganj'), (4,'Joypurhat'), (4,'Naogaon'), (4,'Natore'),
  (4,'Pabna'), (4,'Rajshahi'), (4,'Sirajganj'),
  (5,'Bagerhat'), (5,'Chuadanga'), (5,'Jashore'), (5,'Jhenaidah'), (5,'Khulna'),
  (5,'Kushtia'), (5,'Magura'), (5,'Meherpur'), (5,'Narail'), (5,'Satkhira'),
  (6,'Dinajpur'), (6,'Gaibandha'), (6,'Kurigram'), (6,'Lalmonirhat'), (6,'Nilphamari'),
  (6,'Panchagarh'), (6,'Rangpur'), (6,'Thakurgaon'),
  (7,'Barguna'), (7,'Barishal'), (7,'Bhola'), (7,'Jhalokati'), (7,'Patuakhali'), (7,'Pirojpur'),
  (8,'Jamalpur'), (8,'Mymensingh'), (8,'Netrokona'), (8,'Sherpur');


-- =====================================================================
-- 2. INSTITUTIONS — js/data.js HOSPITALS and DEPARTMENTS
-- =====================================================================

INSERT INTO hospital_tier (tier_id, name) VALUES
  (1, 'Medical College'), (2, 'District'), (3, 'Upazila'), (4, 'Specialised'), (5, 'Private');

-- Same ids as js/data.js, so hospitalId: 3 means the same hospital on both
-- sides while the frontend still has its built-in fallback copy.
INSERT INTO hospital (hospital_id, name, district_id, tier_id) VALUES
  (1, 'Dhaka Medical College Hospital',      (SELECT district_id FROM district WHERE name = 'Dhaka'),      1),
  (2, 'Upazila Health Complex, Savar',       (SELECT district_id FROM district WHERE name = 'Dhaka'),      3),
  (3, 'Chattogram Medical College Hospital', (SELECT district_id FROM district WHERE name = 'Chattogram'), 1),
  (4, 'Sylhet MAG Osmani Medical College',   (SELECT district_id FROM district WHERE name = 'Sylhet'),     1),
  (5, 'Rajshahi Medical College Hospital',   (SELECT district_id FROM district WHERE name = 'Rajshahi'),   1),
  (6, 'Khulna Medical College Hospital',     (SELECT district_id FROM district WHERE name = 'Khulna'),     1),
  (7, 'Square Hospital, Dhaka',              (SELECT district_id FROM district WHERE name = 'Dhaka'),      5),
  (8, 'Rangpur Medical College Hospital',    (SELECT district_id FROM district WHERE name = 'Rangpur'),    1);

INSERT INTO department (department_id, name) VALUES
  (1, 'Cardiology'), (2, 'Medicine'), (3, 'Orthopaedics'), (4, 'Paediatrics'),
  (5, 'Gynae & Obstetrics'), (6, 'Neurology'), (7, 'Nephrology'), (8, 'ENT'),
  (9, 'Dermatology'), (10, 'Emergency');


-- =====================================================================
-- 3. ROLES AND PERMISSIONS
-- "Receptionist admits, doctor discharges" (CLAUDE.md) is the difference
-- between the bed.admit and bed.discharge rows below — nothing else.
-- =====================================================================

INSERT INTO role (role_id, code, label) VALUES
  (1, 'patient',        'Patient'),
  (2, 'receptionist',   'Receptionist'),
  (3, 'doctor',         'Doctor'),
  (4, 'hospital_admin', 'Hospital Admin'),
  (5, 'system_admin',   'System Admin'),
  (6, 'lab_technician', 'Lab Technician');

INSERT INTO permission (code, description) VALUES
  ('patient.register',          'Register a patient and issue a UHID'),
  ('patient.read_demographics', 'See name, age, contact and allergies — no clinical content'),
  ('patient.read_clinical',     'Read the clinical record, subject to an access basis'),
  ('patient.merge',             'Merge two UHIDs that turned out to be one person'),
  ('appointment.book',          'Book an appointment'),
  ('appointment.cancel',        'Cancel an appointment'),
  ('encounter.write',           'Open an encounter and record diagnoses, vitals and notes'),
  ('prescription.write',        'Prescribe medicine'),
  ('lab.order',                 'Order a lab test'),
  ('lab.report',                'Enter a lab result'),
  ('bed.admit',                 'Admit a patient to a bed'),
  ('bed.transfer',              'Move an inpatient to another bed'),
  ('bed.discharge',             'Discharge an inpatient'),
  ('bed.clean',                 'Mark a bed clean and ready'),
  ('referral.create',           'Refer a patient to another hospital'),
  ('audit.review',              'Review break-glass access');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM role r JOIN permission p
    ON (r.code, p.code) IN (
      ('patient',        'appointment.book'),
      ('patient',        'appointment.cancel'),
      ('receptionist',   'patient.register'),
      ('receptionist',   'patient.read_demographics'),
      ('receptionist',   'appointment.book'),
      ('receptionist',   'appointment.cancel'),
      ('receptionist',   'bed.admit'),
      ('receptionist',   'bed.transfer'),
      ('receptionist',   'bed.clean'),
      ('doctor',         'patient.read_demographics'),
      ('doctor',         'patient.read_clinical'),
      ('doctor',         'appointment.book'),
      ('doctor',         'encounter.write'),
      ('doctor',         'prescription.write'),
      ('doctor',         'lab.order'),
      ('doctor',         'bed.transfer'),
      ('doctor',         'bed.discharge'),
      ('doctor',         'referral.create'),
      ('hospital_admin', 'patient.read_demographics'),
      ('hospital_admin', 'patient.merge'),
      ('hospital_admin', 'appointment.book'),
      ('hospital_admin', 'appointment.cancel'),
      ('hospital_admin', 'bed.clean'),
      ('hospital_admin', 'audit.review'),
      ('system_admin',   'patient.read_demographics'),
      ('system_admin',   'patient.merge'),
      ('system_admin',   'audit.review'),
      ('lab_technician', 'patient.read_demographics'),
      ('lab_technician', 'lab.report')
    );


-- =====================================================================
-- 4. DOCTORS AND POSTINGS — js/data.js DOCTORS
--
-- Postings 1–10 are exactly the ten DOCTORS rows, with the same ids, so
-- DOCTORS[i].id is a posting id on both sides. Then:
--   11  Dr. Anisur Rahman's private chamber at Square — the case
--       doctor_posting exists for: one doctor, two hospitals, two fees.
--   12–14  past postings, needed because the encounters in js/seed.js put
--       three doctors at hospitals they no longer work at.
--   15  a DMCH Medicine consultant, who the inpatients are admitted under.
-- =====================================================================

INSERT INTO doctor (doctor_id, name, bmdc_reg, qualifications) VALUES
  (1,  'Dr. Anisur Rahman',     'A-42817', 'MBBS, FCPS (Medicine), MD (Cardiology)'),
  (2,  'Dr. Farzana Haque',     'A-51902', 'MBBS, FCPS (Gynae & Obs)'),
  (3,  'Dr. Shamsul Alam',      'A-38104', 'MBBS, MS (Orthopaedics)'),
  (4,  'Dr. Nusrat Jahan',      'A-60233', 'MBBS, DCH, FCPS (Paediatrics)'),
  (5,  'Dr. Kamrul Hasan',      'A-47755', 'MBBS, FCPS (Medicine)'),
  (6,  'Dr. Tahmina Akter',     'A-52611', 'MBBS, MD (Cardiology)'),
  (7,  'Dr. Mizanur Rahman',    'A-40988', 'MBBS, FCPS, MD (Neurology)'),
  (8,  'Dr. Sabrina Chowdhury', 'A-58420', 'MBBS, DDV'),
  (9,  'Dr. Rafiqul Islam',     'A-44301', 'MBBS, FCPS (Medicine), MD (Nephrology)'),
  (10, 'Dr. Ayesha Siddika',    'A-63177', 'MBBS, FCPS (Medicine)'),
  (11, 'Dr. Mahbubur Rahman',   'A-55012', 'MBBS, FCPS (Medicine)');

INSERT INTO doctor_posting (posting_id, doctor_id, hospital_id, department_id, consultation_fee, valid_from, valid_to) VALUES
  (1,  1,  1, 1,  800, '2016-01-01', NULL),
  (2,  2,  1, 5,  700, '2016-01-01', NULL),
  (3,  3,  3, 3,  900, '2016-01-01', NULL),
  (4,  4,  1, 4,  600, '2016-01-01', NULL),
  (5,  5,  2, 2,  400, '2016-01-01', NULL),
  (6,  6,  7, 1, 1500, '2016-01-01', NULL),
  (7,  7,  4, 6, 1000, '2016-01-01', NULL),
  (8,  8,  3, 9,  650, '2016-01-01', NULL),
  (9,  9,  5, 7,  850, '2016-01-01', NULL),
  (10, 10, 6, 2,  500, '2016-01-01', NULL),
  (11, 1,  7, 1, 1200, '2020-01-01', NULL),
  (12, 3,  1, 10, 300, '2022-01-01', '2024-12-31'),
  (13, 2,  3, 5,  700, '2026-01-01', '2026-06-30'),
  (14, 10, 8, 10, 300, '2021-01-01', '2023-12-31'),
  (15, 11, 1, 2,  700, '2018-01-01', NULL);

INSERT INTO hospital_department (hospital_id, department_id, head_doctor_id, opd_room) VALUES
  (1, 1, 1, 'OPD-2, Room 14'), (1, 2, 11, 'OPD-1, Room 3'), (1, 4, 4, 'OPD-3, Room 22'),
  (1, 5, 2, 'OPD-3, Room 18'), (1, 10, NULL, 'Emergency block'),
  (2, 2, 5, 'Room 2'),
  (3, 3, 3, 'OPD-2, Room 9'), (3, 5, NULL, 'OPD-3, Room 11'), (3, 9, 8, 'OPD-4, Room 6'),
  (4, 6, 7, 'OPD-2, Room 5'),
  (5, 7, 9, 'OPD-1, Room 12'),
  (6, 2, 10, 'OPD-1, Room 4'),
  (7, 1, 6, 'Level 3, Suite 4'),
  (8, 2, NULL, 'OPD-1, Room 2'), (8, 10, NULL, 'Emergency block');

-- Weekly clinics. weekday 0 = Sunday. The Bangladeshi working week runs
-- Sunday to Thursday; Square's private clinics run on Saturday evenings too.
INSERT INTO doctor_schedule (posting_id, weekday, start_time, end_time, slot_minutes, valid_from) VALUES
  (1, 0, '09:00', '12:00', 20, '2026-01-01'), (1, 2, '09:00', '12:00', 20, '2026-01-01'),
  (1, 4, '09:00', '12:00', 20, '2026-01-01'),
  (2, 0, '10:00', '13:00', 20, '2026-01-01'), (2, 1, '10:00', '13:00', 20, '2026-01-01'),
  (2, 3, '10:00', '13:00', 20, '2026-01-01'),
  (3, 0, '09:00', '12:00', 20, '2026-01-01'), (3, 1, '09:00', '12:00', 20, '2026-01-01'),
  (3, 2, '09:00', '12:00', 20, '2026-01-01'), (3, 3, '09:00', '12:00', 20, '2026-01-01'),
  (3, 4, '09:00', '12:00', 20, '2026-01-01'),
  (4, 0, '09:00', '11:00', 15, '2026-01-01'), (4, 1, '09:00', '11:00', 15, '2026-01-01'),
  (4, 2, '09:00', '11:00', 15, '2026-01-01'), (4, 3, '09:00', '11:00', 15, '2026-01-01'),
  (4, 4, '09:00', '11:00', 15, '2026-01-01'),
  (5, 0, '09:00', '13:00', 20, '2026-01-01'), (5, 1, '09:00', '13:00', 20, '2026-01-01'),
  (5, 2, '09:00', '13:00', 20, '2026-01-01'), (5, 3, '09:00', '13:00', 20, '2026-01-01'),
  (5, 4, '09:00', '13:00', 20, '2026-01-01'),
  (6, 6, '16:00', '19:00', 20, '2026-01-01'), (6, 1, '16:00', '19:00', 20, '2026-01-01'),
  (6, 3, '16:00', '19:00', 20, '2026-01-01'),
  (7, 0, '10:00', '13:00', 20, '2026-01-01'), (7, 2, '10:00', '13:00', 20, '2026-01-01'),
  (7, 4, '10:00', '13:00', 20, '2026-01-01'),
  (8, 1, '09:00', '12:00', 15, '2026-01-01'), (8, 3, '09:00', '12:00', 15, '2026-01-01'),
  (9, 0, '09:00', '12:00', 20, '2026-01-01'), (9, 2, '09:00', '12:00', 20, '2026-01-01'),
  (10, 0, '09:00', '12:00', 20, '2026-01-01'), (10, 1, '09:00', '12:00', 20, '2026-01-01'),
  (10, 2, '09:00', '12:00', 20, '2026-01-01'), (10, 3, '09:00', '12:00', 20, '2026-01-01'),
  (10, 4, '09:00', '12:00', 20, '2026-01-01'),
  (11, 1, '17:00', '20:00', 15, '2026-01-01'), (11, 3, '17:00', '20:00', 15, '2026-01-01'),
  (15, 0, '09:00', '12:00', 20, '2026-01-01'), (15, 1, '09:00', '12:00', 20, '2026-01-01'),
  (15, 2, '09:00', '12:00', 20, '2026-01-01'), (15, 3, '09:00', '12:00', 20, '2026-01-01'),
  (15, 4, '09:00', '12:00', 20, '2026-01-01');

-- Dr. Mizanur Rahman is away Tuesday to Thursday next week. His Tuesday and
-- Thursday clinics vanish from the availability grid — no slot row was
-- deleted, because no slot row ever existed (decision 3).
INSERT INTO doctor_leave (doctor_id, from_at, to_at, reason) VALUES
  (7, TIMESTAMP(@sun + INTERVAL 2 DAY, '00:00'), TIMESTAMP(@sun + INTERVAL 4 DAY, '23:59'), 'Neurology conference');


-- =====================================================================
-- 5. STAFF AND DOCTOR LOGINS
-- The four demo accounts from js/data.js are rezaul, anisur, rahim and
-- nasima. rahim is created after the patients (section 6), because a
-- patient account points at a patient row that must exist first.
-- =====================================================================

INSERT INTO user_account (account_id, username, password_hash, role_id, hospital_id, doctor_id, staff_name) VALUES
  (1,  'rezaul',   @pw, 2, 1,    NULL, 'Rezaul Karim'),
  (2,  'nasima',   @pw, 4, 1,    NULL, 'Nasima Sultana'),
  (3,  'jahanara', @pw, 2, 3,    NULL, 'Jahanara Begum'),
  (4,  'rumana',   @pw, 6, 1,    NULL, 'Rumana Parvin'),
  (5,  'sysadmin', @pw, 5, NULL, NULL, 'System Administrator'),
  (6,  'anisur',   @pw, 3, 1,    1,    NULL),
  (7,  'farzana',  @pw, 3, 1,    2,    NULL),
  (8,  'shamsul',  @pw, 3, 3,    3,    NULL),
  (9,  'nusrat',   @pw, 3, 1,    4,    NULL),
  (10, 'kamrul',   @pw, 3, 2,    5,    NULL),
  (11, 'tahmina',  @pw, 3, 7,    6,    NULL),
  (12, 'mizanur',  @pw, 3, 4,    7,    NULL),
  (13, 'sabrina',  @pw, 3, 3,    8,    NULL),
  (14, 'rafiqul',  @pw, 3, 5,    9,    NULL),
  (15, 'ayesha',   @pw, 3, 6,    10,   NULL),
  (16, 'mahbub',   @pw, 3, 1,    11,   NULL);


-- =====================================================================
-- 6. PATIENTS — js/seed.js, then the inpatients
--
-- Patients 1 and 3 are deliberately the same man with two UHIDs (decision
-- 1's failure case, kept so merge_patients() has something to merge).
-- Patient 3's nid is '' exactly as in seed.js; trg_patient_bi stores NULL.
-- The kin string 'Salma Rahim (wife) · 01911-330218' becomes three columns.
-- Seeded identities were verified by the national NID import, so
-- verified_by is the system admin account.
-- =====================================================================

INSERT INTO patient (patient_id, uhid, name, dob, sex, blood_group, phone, nid, district_id, address,
                     kin_name, kin_relation, kin_phone, registered_at, registered_hospital_id,
                     identity_verified, verified_by, verified_at) VALUES
  (1, 'BD-2019-04821-5', 'Md. Rahim Uddin', '1978-04-12', 'Male', 'B+', '01711-482031', '1978419923041',
      (SELECT district_id FROM district WHERE name = 'Dhaka'), 'House 42, Road 7, Mirpur-2, Dhaka',
      'Salma Rahim', 'wife', '01911-330218', '2019-02-11', 1, TRUE, 5, '2019-02-11 10:00'),
  (2, 'BD-2021-11904-5', 'Fatema Begum', '1991-09-30', 'Female', 'O+', '01819-330442', '1991773310448',
      (SELECT district_id FROM district WHERE name = 'Chattogram'), 'Flat 3B, Nasirabad, Chattogram',
      'Nurul Islam', 'husband', '01712-884410', '2021-05-04', 3, TRUE, 3, '2021-05-04 11:20'),
  (3, 'BD-2018-00723-2', 'Md. Rahim Uddin', '1978-04-12', 'Male', 'B+', '01552-908114', '',
      (SELECT district_id FROM district WHERE name = 'Manikganj'), 'Village Baliati, Saturia, Manikganj',
      'Abdul Uddin', 'father', NULL, '2018-08-30', 2, FALSE, NULL, NULL),
  (4, 'BD-2023-38104-6', 'Abdul Karim Mia', '1965-01-22', 'Male', 'A-', '01922-771030', '1965110220317',
      (SELECT district_id FROM district WHERE name = 'Rangpur'), 'Ward 4, Mithapukur, Rangpur',
      'Rehana Karim', 'daughter', '01755-201933', '2023-03-17', 8, TRUE, 5, '2023-03-17 21:30'),
  (5, 'BD-2020-27615-1', 'Shirin Akter', '1996-11-05', 'Female', 'AB+', '01733-119284', '1996884411052',
      (SELECT district_id FROM district WHERE name = 'Sylhet'), 'Shibganj, Sylhet',
      'Mokbul Hossain', 'father', '01717-443021', '2020-12-01', 4, TRUE, 5, '2020-12-01 09:45'),

  -- The inpatients on the Dhaka Medical bed board. Names follow the list in
  -- pages/wards.js. The two children have no NID, so they are unverified.
  (6,  'BD-2022-15734-0', 'Jashim Uddin',   '1959-06-14', 'Male',   'O+',  '01713-550912', '1959261473015',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Lalbagh, Dhaka', 'Rahela Begum', 'wife', '01815-220341', '2022-07-03', 1, TRUE, 1, '2022-07-03 10:00'),
  (7,  'BD-2023-40218-5', 'Sujon Mia',      '1994-02-27', 'Male',   'B+',  '01922-604117', '1994261038552',
       (SELECT district_id FROM district WHERE name = 'Gazipur'),     'Tongi, Gazipur', 'Hasan Mia', 'brother', '01633-918204', '2023-09-11', 1, TRUE, 1, '2023-09-11 12:10'),
  (8,  'BD-2021-30655-9', 'Habibur Rahman', '1962-11-03', 'Male',   'A+',  '01711-903216', '1962331194427',
       (SELECT district_id FROM district WHERE name = 'Narayanganj'), 'Fatullah, Narayanganj', 'Selina Rahman', 'wife', '01911-447320', '2021-04-19', 1, TRUE, 1, '2021-04-19 09:30'),
  (9,  'BD-2024-51207-5', 'Rafiq Hossain',  '1981-08-09', 'Male',   'AB-', '01819-227045', '1981261770348',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Jatrabari, Dhaka', 'Shilpi Akter', 'wife', '01712-330985', '2024-02-02', 1, TRUE, 1, '2024-02-02 15:40'),
  (10, 'BD-2019-22841-7', 'Babul Mia',      '1955-01-30', 'Male',   'O-',  '01552-118360', '1955261190774',
       (SELECT district_id FROM district WHERE name = 'Munshiganj'),  'Sreenagar, Munshiganj', 'Kamal Mia', 'son', '01744-562019', '2019-12-18', 1, TRUE, 1, '2019-12-18 11:05'),
  (11, 'BD-2020-18306-8', 'Rokeya Khatun',  '1968-05-22', 'Female', 'B-',  '01716-338409', '1968261552093',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Mohammadpur, Dhaka', 'Anwar Hossain', 'husband', '01817-204466', '2020-03-08', 1, TRUE, 1, '2020-03-08 10:25'),
  (12, 'BD-2024-47712-1', 'Nasrin Sultana', '1999-12-12', 'Female', 'A+',  '01957-610238', '1999261125530',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Uttara, Dhaka', 'Mahmuda Sultana', 'mother', '01711-905517', '2024-08-21', 1, TRUE, 1, '2024-08-21 16:00'),
  (13, 'BD-2017-09935-6', 'Momena Begum',   '1960-03-17', 'Female', 'O+',  '01811-474902', '1960261317804',
       (SELECT district_id FROM district WHERE name = 'Narsingdi'),   'Palash, Narsingdi', 'Jamal Uddin', 'son', '01633-201845', '2017-10-05', 1, TRUE, 1, '2017-10-05 09:50'),
  (14, 'BD-2025-60148-9', 'Kulsum Akter',   '1988-07-01', 'Female', 'B+',  '01923-845071', '1988261701639',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Keraniganj, Dhaka', 'Sohel Rana', 'husband', '01716-662314', '2025-01-27', 1, TRUE, 1, '2025-01-27 13:15'),
  (15, 'BD-2022-23590-9', 'Tanvir Ahmed',   '1971-10-25', 'Male',   'A+',  '01712-389506', '1971261025481',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Dhanmondi, Dhaka', 'Farhana Ahmed', 'wife', '01819-552710', '2022-11-30', 1, TRUE, 1, '2022-11-30 08:40'),
  (16, 'BD-2016-07741-9', 'Mariam Begum',   '1949-04-08', 'Female', 'O+',  '01556-904123', '1949261408257',
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Old Dhaka', 'Shafiq Ahmed', 'son', '01711-330764', '2016-06-14', 1, TRUE, 1, '2016-06-14 10:10'),
  (17, 'BD-2019-30017-1', 'Rifat Hasan',    '2019-03-21', 'Male',   'B+',  '01714-226590', NULL,
       (SELECT district_id FROM district WHERE name = 'Dhaka'),       'Rampura, Dhaka', 'Mahmudul Hasan', 'father', '01714-226590', '2019-03-28', 1, FALSE, NULL, NULL),
  (18, 'BD-2021-41662-9', 'Sumaiya Islam',  '2021-08-15', 'Female', 'A+',  '01815-773402', NULL,
       (SELECT district_id FROM district WHERE name = 'Gazipur'),     'Board Bazar, Gazipur', 'Nazrul Islam', 'father', '01815-773402', '2021-08-22', 1, FALSE, NULL, NULL);

-- The patient login. Created now that patient 1 exists.
INSERT INTO user_account (account_id, username, password_hash, role_id, patient_id) VALUES
  (17, 'rahim', @pw, 1, 1);

-- Start each year's UHID counter after the highest serial already issued in
-- that year, so register_patient() can never re-issue one. Reads the year
-- and serial straight out of the UHID strings.
INSERT INTO uhid_sequence (year, last_serial)
SELECT CAST(SUBSTRING(uhid, 4, 4) AS UNSIGNED), MAX(CAST(SUBSTRING(uhid, 9, 5) AS UNSIGNED))
  FROM patient
 GROUP BY CAST(SUBSTRING(uhid, 4, 4) AS UNSIGNED);


-- =====================================================================
-- 7. CATALOGUES — diagnoses (ICD-10), medicines, allergens, lab tests
-- This is where the free text in js/seed.js goes to become queryable.
-- =====================================================================

INSERT INTO diagnosis (diagnosis_id, icd10_code, term, category) VALUES
  (1,  'A01.0', 'Typhoid (enteric) fever',         'Infectious'),
  (2,  'A09',   'Acute gastroenteritis',           'Infectious'),
  (3,  'A90',   'Dengue fever',                    'Infectious'),
  (4,  'D50.9', 'Iron deficiency anaemia',         'Blood'),
  (5,  'E11.9', 'Type 2 diabetes mellitus',        'Endocrine'),
  (6,  'G43.0', 'Migraine without aura',           'Nervous system'),
  (7,  'I10',   'Essential hypertension',          'Circulatory'),
  (8,  'I21.9', 'Acute myocardial infarction',     'Circulatory'),
  (9,  'J18.9', 'Pneumonia',                       'Respiratory'),
  (10, 'J44.1', 'COPD with acute exacerbation',    'Respiratory'),
  (11, 'J45.9', 'Asthma',                          'Respiratory'),
  (12, 'K29.1', 'Acute gastritis',                 'Digestive'),
  (13, 'L03.9', 'Cellulitis',                      'Skin'),
  (14, 'L25.9', 'Contact dermatitis',              'Skin'),
  (15, 'M54.5', 'Low back pain',                   'Musculoskeletal'),
  (16, 'N18.3', 'Chronic kidney disease, stage 3', 'Genitourinary'),
  (17, 'N18.4', 'Chronic kidney disease, stage 4', 'Genitourinary'),
  (18, 'S52.5', 'Fracture of distal radius',       'Injury'),
  (19, 'Z34.9', 'Supervision of normal pregnancy', 'Pregnancy'),
  (20, 'Z48.8', 'Post-operative care',             'Follow-up');

-- drug_class is what trg_prescription_item_bi compares with allergen.class.
INSERT INTO medicine (medicine_id, generic_name, form, strength, drug_class) VALUES
  (1,  'Amlodipine',                'tablet',    '5 mg',             'calcium channel blocker'),
  (2,  'Atorvastatin',              'tablet',    '10 mg',            'statin'),
  (3,  'Naproxen',                  'tablet',    '500 mg',           'NSAID'),
  (4,  'Paracetamol',               'tablet',    '500 mg',           'analgesic'),
  (5,  'Calcium + Vitamin D3',      'tablet',    '500 mg + 200 IU',  'supplement'),
  (6,  'Oral rehydration salts',    'sachet',    '20.5 g',           'rehydration'),
  (7,  'Metronidazole',             'tablet',    '400 mg',           'nitroimidazole'),
  (8,  'Ferrous sulphate + folic acid', 'tablet', '200 mg + 0.4 mg', 'haematinic'),
  (9,  'Calcium carbonate',         'tablet',    '500 mg',           'supplement'),
  (10, 'Hydrocortisone',            'cream',     '1%',               'corticosteroid'),
  (11, 'Ciprofloxacin',             'tablet',    '500 mg',           'fluoroquinolone'),
  (12, 'Losartan',                  'tablet',    '50 mg',            'angiotensin receptor blocker'),
  (13, 'Omeprazole',                'capsule',   '20 mg',            'proton pump inhibitor'),
  (14, 'Propranolol',               'tablet',    '40 mg',            'beta blocker'),
  (15, 'Amoxicillin',               'capsule',   '500 mg',           'penicillin'),
  (16, 'Aspirin',                   'tablet',    '75 mg',            'NSAID'),
  (17, 'Ibuprofen',                 'tablet',    '400 mg',           'NSAID'),
  (18, 'Ceftriaxone',               'injection', '1 g',              'cephalosporin'),
  (19, 'Co-trimoxazole',            'tablet',    '960 mg',           'sulfonamide'),
  (20, 'Salbutamol',                'inhaler',   '100 mcg',          'bronchodilator'),
  (21, 'Metformin',                 'tablet',    '500 mg',           'biguanide');

INSERT INTO allergen (allergen_id, name, class) VALUES
  (1, 'Penicillin',          'penicillin'),
  (2, 'Sulfa drugs',         'sulfonamide'),
  (3, 'Aspirin',             'NSAID'),
  (4, 'Cephalosporins',      'cephalosporin'),
  (5, 'Latex',               NULL),
  (6, 'Iodinated contrast',  NULL);

INSERT INTO lab_test (test_id, name, specimen, unit, ref_low, ref_high) VALUES
  (1, 'Haemoglobin',           'Blood', 'g/dL',      12.0, 15.5),
  (2, 'Serum creatinine',      'Blood', 'mg/dL',      0.6,  1.2),
  (3, 'eGFR',                  'Blood', 'mL/min',    90.0, NULL),
  (4, 'Fasting blood glucose', 'Blood', 'mmol/L',     3.9,  5.5),
  (5, 'HbA1c',                 'Blood', '%',          4.0,  5.6),
  (6, 'Total cholesterol',     'Blood', 'mmol/L',    NULL,  5.2),
  (7, 'Serum potassium',       'Blood', 'mmol/L',     3.5,  5.0),
  (8, 'Dengue NS1 antigen',    'Blood', NULL,        NULL, NULL),
  (9, 'Troponin I',            'Blood', 'ng/mL',     NULL,  0.04);

INSERT INTO encounter_type (type_id, code, label) VALUES
  (1, 'OPD', 'Outpatient'), (2, 'Emergency', 'Emergency'), (3, 'Inpatient', 'Inpatient');


-- =====================================================================
-- 8. ENCOUNTERS — js/seed.js encounters[], oldest first
--
-- hospital_id, department_id and consultation_fee are NOT in these
-- INSERTs: trg_encounter_bi copies them from the posting. That is decision
-- 1 at work — try adding hospital_id = 5 to one of these rows and see the
-- trigger overwrite it.
-- =====================================================================

INSERT INTO encounter (encounter_id, patient_id, type_id, posting_id, started_at, ended_at, chief_complaint, notes, created_by) VALUES
  (1,  3, 1, 5,  '2018-08-30 10:15', '2018-08-30 10:40', 'Fever for 8 days',
       'Registered without NID. Treated as outpatient, recovered.', 10),
  (2,  4, 2, 14, '2023-03-17 21:40', '2023-03-18 02:10', 'Epigastric pain and vomiting',
       'Following aspirin use. Aspirin stopped and recorded as an allergy.', 15),
  (3,  2, 1, 8,  '2024-01-09 11:00', '2024-01-09 11:20', 'Itchy rash on both hands',
       'Localised to both hands. Likely detergent exposure. Barrier cream advised.', 13),
  (4,  1, 1, 5,  '2024-03-14 10:30', '2024-03-14 10:55', 'Loose stools for 2 days',
       'Mild dehydration. Oral rehydration advised. Recovered on review.', 10),
  (5,  1, 2, 12, '2024-11-02 23:00', '2024-11-03 01:30', 'Fall from motorcycle',
       'Fall from motorcycle. Below-elbow cast applied. Follow-up at 6 weeks.', 8),
  (6,  1, 1, 3,  '2025-06-19 16:00', '2025-06-19 16:25', 'Low back pain for 3 months',
       'X-ray L-S spine shows mild degenerative change. Physiotherapy advised.', 8),
  (7,  5, 1, 7,  '2025-10-03 12:00', '2025-10-03 12:30', 'Recurrent headaches',
       'Two to three episodes monthly. Trigger diary advised.', 12),
  (8,  4, 1, 9,  '2026-02-14 10:00', '2026-02-14 10:35', 'Referred: raised creatinine',
       'eGFR 42. Blood pressure control emphasised. Six-monthly review.', 14),
  (9,  2, 1, 13, '2026-05-22 09:30', '2026-05-22 09:55', 'Antenatal visit',
       'Singleton pregnancy, growth appropriate. Haemoglobin 10.4 g/dL.', 7),
  (10, 1, 1, 6,  '2026-08-08 09:00', '2026-08-08 09:25', 'Hypertension review',
       'BP 148/94. Advised salt restriction and weight loss. Review in 3 months.', 11),
  -- This morning, at Square: blood pressure still high, so Dr. Tahmina refers
  -- him to Dhaka Medical's cardiology department (referral 2, section 11).
  (11, 1, 1, 6,  @now - INTERVAL 3 HOUR, @now - INTERVAL 150 MINUTE, 'Hypertension review',
       'BP 162/98 despite amlodipine. Losartan added. Referred to Dhaka Medical College Hospital cardiology for specialist review and echocardiogram.', 11);

INSERT INTO encounter_diagnosis (encounter_id, diagnosis_id, is_primary, certainty, note) VALUES
  (1,  1,  TRUE,  'confirmed',   NULL),
  (2,  12, TRUE,  'confirmed',   'following aspirin use'),
  (3,  14, TRUE,  'confirmed',   NULL),
  (4,  2,  TRUE,  'confirmed',   NULL),
  (5,  18, TRUE,  'confirmed',   'closed, left'),
  (6,  15, TRUE,  'confirmed',   'chronic'),
  (7,  6,  TRUE,  'confirmed',   NULL),
  (8,  16, TRUE,  'confirmed',   NULL),
  (9,  19, TRUE,  'confirmed',   '28 weeks'),
  (9,  4,  FALSE, 'provisional', 'Hb 10.4 g/dL'),
  (10, 7,  TRUE,  'confirmed',   'review'),
  (11, 7,  TRUE,  'confirmed',   'uncontrolled');

-- Allergies go in before the prescriptions, so trg_prescription_item_bi
-- checks every historical prescription against them as it is loaded.
INSERT INTO patient_allergy (patient_id, allergen_id, severity, note, first_recorded_encounter_id, recorded_at) VALUES
  (1, 1, 'Severe',   'Anaphylaxis, 2019', NULL, '2019-02-11 10:00'),
  (1, 2, 'Moderate', 'Rash',              NULL, '2019-02-11 10:00'),
  (4, 3, 'Moderate', 'Gastric bleeding, 2022', 2, '2023-03-18 01:00'),
  (11, 4, 'Mild',    'Itching after ceftriaxone, 2020', NULL, '2020-03-08 10:25');

-- 'Amlodipine 5 mg — 1 tablet at night — 90 days'
--   → medicine 1 + dose '1 tablet' + frequency 'at night' + 90 days.
INSERT INTO prescription (prescription_id, encounter_id, prescribed_by, prescribed_at) VALUES
  (1, 1, 10, '2018-08-30 10:35'), (2, 2, 15, '2023-03-17 22:30'), (3, 3, 13, '2024-01-09 11:15'),
  (4, 4, 10, '2024-03-14 10:50'), (5, 5, 8, '2024-11-03 01:00'),  (6, 6, 8, '2025-06-19 16:20'),
  (7, 7, 12, '2025-10-03 12:25'), (8, 8, 14, '2026-02-14 10:30'), (9, 9, 7, '2026-05-22 09:50'),
  (10, 10, 11, '2026-08-08 09:20'), (11, 11, 11, @now - INTERVAL 155 MINUTE);

INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency, duration_days, instruction) VALUES
  (1, 1, 11, '1 tablet',    'twice daily',            10,  NULL),
  (2, 1, 13, '1 capsule',   'once daily',             28,  'before food'),
  (3, 1, 10, 'thin layer',  'twice daily',            14,  NULL),
  (4, 1, 6,  '1 sachet',    'after each loose stool', 3,   NULL),
  (4, 2, 7,  '1 tablet',    'three times daily',      5,   NULL),
  (5, 1, 4,  '1–2 tablets', 'as required',            7,   'max 8 tablets daily'),
  (5, 2, 5,  '1 tablet',    'once daily',             60,  NULL),
  (6, 1, 3,  '1 tablet',    'twice daily',            10,  'after meals'),
  (7, 1, 14, '1 tablet',    'twice daily',            60,  NULL),
  (8, 1, 12, '1 tablet',    'once daily',             180, NULL),
  (9, 1, 8,  '1 tablet',    'once daily',             90,  NULL),
  (9, 2, 9,  '1 tablet',    'twice daily',            90,  NULL),
  (10, 1, 1, '1 tablet',    'at night',               90,  NULL),
  (10, 2, 2, '1 tablet',    'at night',               90,  NULL),
  (11, 1, 12, '1 tablet',   'once daily',             30,  NULL);

INSERT INTO encounter_vitals (encounter_id, recorded_at, bp_systolic, bp_diastolic, pulse, temp_c, spo2, weight_kg, height_cm, recorded_by) VALUES
  (9,  '2026-05-22 09:35', 110, 70, 90, 36.8, 99, 64.5, 155.0, 7),
  (10, '2026-08-08 09:05', 148, 94, 82, 36.7, 98, 78.0, 168.0, 11),
  (11, @now - INTERVAL 175 MINUTE, 162, 98, 88, 36.9, 98, 77.5, NULL, 11);

INSERT INTO lab_order (order_id, encounter_id, test_id, ordered_by, ordered_at) VALUES
  (1, 8,  2, 14, '2026-02-14 10:20'),
  (2, 8,  3, 14, '2026-02-14 10:20'),
  (3, 9,  1, 7,  '2026-05-22 09:40'),
  (4, 11, 6, 11, @now - INTERVAL 170 MINUTE),
  (5, 11, 4, 11, @now - INTERVAL 170 MINUTE);

-- is_abnormal is left out: trg_lab_result_bi works it out from the test's
-- reference range, and trg_lab_result_ai marks each order 'reported'.
INSERT INTO lab_result (order_id, value_num, reported_by, reported_at) VALUES
  (1, 1.70, 14, '2026-02-14 13:00'),
  (2, 42,   14, '2026-02-14 13:00'),
  (3, 10.4, 7,  '2026-05-22 12:00'),
  (4, 6.1,  11, @now - INTERVAL 160 MINUTE),
  (5, 5.2,  11, @now - INTERVAL 160 MINUTE);


-- =====================================================================
-- 9. APPOINTMENTS — next week, relative to today (@sun = next Sunday)
-- Struck-through slots on the booking screen are these rows.
-- =====================================================================

INSERT INTO appointment (posting_id, doctor_id, patient_id, slot_start, slot_end, status, booked_by, booked_at, encounter_id) VALUES
  -- The visit that became encounter 10.
  (6, 6, 1, '2026-08-08 09:00', '2026-08-08 09:20', 'attended', 1, '2026-08-01 10:00', 10),
  -- Rahim's referral appointment with Dr. Anisur, booked by DMCH reception.
  (1, 1, 1, TIMESTAMP(@sun, '09:00'), TIMESTAMP(@sun, '09:20'), 'booked', 1, @now - INTERVAL 1 HOUR, NULL),
  (1, 1, 5, TIMESTAMP(@sun, '10:00'), TIMESTAMP(@sun, '10:20'), 'booked', 1, @now, NULL),
  (1, 1, 4, TIMESTAMP(@sun, '10:40'), TIMESTAMP(@sun, '11:00'), 'booked', 1, @now, NULL),
  -- Cancelled: active_slot is NULL, so 09:40 is free to book again.
  (1, 1, 3, TIMESTAMP(@sun, '09:40'), TIMESTAMP(@sun, '10:00'), 'cancelled', 1, @now, NULL),
  (1, 1, 2, TIMESTAMP(@sun + INTERVAL 2 DAY, '09:00'), TIMESTAMP(@sun + INTERVAL 2 DAY, '09:20'), 'booked', 1, @now, NULL),
  (1, 1, 3, TIMESTAMP(@sun + INTERVAL 2 DAY, '11:00'), TIMESTAMP(@sun + INTERVAL 2 DAY, '11:20'), 'booked', 1, @now, NULL),
  -- The same doctor's private chamber: uq_doctor_slot is on doctor_id, so
  -- these share one diary with posting 1.
  (11, 1, 2, TIMESTAMP(@sun + INTERVAL 1 DAY, '17:00'), TIMESTAMP(@sun + INTERVAL 1 DAY, '17:15'), 'booked', 1, @now, NULL),
  (6, 6, 4, TIMESTAMP(@sun + INTERVAL 1 DAY, '16:20'), TIMESTAMP(@sun + INTERVAL 1 DAY, '16:40'), 'booked', 1, @now, NULL),
  (15, 11, 7, TIMESTAMP(@sun, '09:00'), TIMESTAMP(@sun, '09:20'), 'booked', 1, @now, NULL),
  (4, 4, 17, TIMESTAMP(@sun, '09:15'), TIMESTAMP(@sun, '09:30'), 'booked', 1, @now, NULL);


-- =====================================================================
-- 10. WARDS AND BEDS — Dhaka Medical College Hospital
--
-- Beds are created free, cleaning, reserved or out of service. NONE is
-- created occupied: a bed becomes occupied only when a bed_occupancy row is
-- opened on it, and trg_bed_occupancy_ai makes that change (decision 7).
-- =====================================================================

INSERT INTO ward_type (ward_type_id, code, label) VALUES
  (1, 'General', 'General ward'), (2, 'ICU', 'Intensive care'),
  (3, 'Paeds', 'Paediatric'), (4, 'Isolation', 'Isolation');

INSERT INTO ward (ward_id, hospital_id, name, ward_type_id, sex_restriction) VALUES
  (1, 1, 'General Medicine — Male',   1, 'Male'),
  (2, 1, 'General Medicine — Female', 1, 'Female'),
  (3, 1, 'Intensive Care Unit',       2, NULL),
  (4, 1, 'Paediatric Ward',           3, NULL);

INSERT INTO bed_status (status_id, code, label) VALUES
  (1, 'free', 'Free'), (2, 'occupied', 'Occupied'), (3, 'reserved', 'Reserved'), (4, 'cleaning', 'Cleaning');

INSERT INTO bed (ward_id, bed_no, status_id, is_out_of_service) VALUES
  (1,'GM-01',1,0),(1,'GM-02',1,0),(1,'GM-03',1,0),(1,'GM-04',1,0),(1,'GM-05',1,0),(1,'GM-06',1,0),
  (1,'GM-07',4,0),(1,'GM-08',1,0),(1,'GM-09',1,0),(1,'GM-10',1,0),(1,'GM-11',3,0),(1,'GM-12',1,0),
  (2,'GF-01',1,0),(2,'GF-02',1,0),(2,'GF-03',1,0),(2,'GF-04',1,0),(2,'GF-05',1,0),
  (2,'GF-06',1,0),(2,'GF-07',1,0),(2,'GF-08',1,0),(2,'GF-09',3,0),(2,'GF-10',4,0),
  (3,'ICU-01',1,0),(3,'ICU-02',1,0),(3,'ICU-03',1,0),(3,'ICU-04',1,0),(3,'ICU-05',1,0),(3,'ICU-06',4,0),
  (4,'PD-01',1,0),(4,'PD-02',1,0),(4,'PD-03',1,0),(4,'PD-04',1,0),(4,'PD-05',1,0),
  (4,'PD-06',1,0),(4,'PD-07',1,0),(4,'PD-08',1,1);

-- The inpatients' encounters. Inpatient type, under DMCH postings: 15 is
-- Medicine, 1 Cardiology, 2 Gynae & Obstetrics, 4 Paediatrics.
INSERT INTO encounter (encounter_id, patient_id, type_id, posting_id, started_at, chief_complaint, created_by) VALUES
  (12, 6,  3, 15, @now - INTERVAL 4 DAY, 'Fever and productive cough',     1),
  (13, 7,  3, 15, @now - INTERVAL 2 DAY, 'High fever for 10 days',         1),
  (14, 8,  3, 15, @now - INTERVAL 6 DAY, 'Breathlessness and leg swelling', 1),
  (15, 9,  3, 15, @now - INTERVAL 3 DAY, 'Red, hot, swollen left leg',     1),
  (16, 10, 3, 15, @now - INTERVAL 8 DAY, 'Severe breathlessness',          1),
  (17, 11, 3, 15, @now - INTERVAL 5 DAY, 'Fever and cough',                1),
  (18, 12, 3, 15, @now - INTERVAL 2 DAY, 'High fever and body aches',      1),
  (19, 13, 3, 15, @now - INTERVAL 7 DAY, 'Very high blood sugar',          1),
  (20, 14, 3, 2,  @now - INTERVAL 1 DAY, 'Post-operative recovery',        1),
  (21, 15, 3, 1,  @now - INTERVAL 3 DAY, 'Central chest pain',             1),
  (22, 16, 3, 15, @now - INTERVAL 2 DAY, 'Confusion and low oxygen',       1),
  (23, 17, 3, 4,  @now - INTERVAL 2 DAY, 'Wheeze and breathlessness',      1),
  (24, 18, 3, 4,  @now - INTERVAL 3 DAY, 'High fever and rash',            1);

INSERT INTO encounter_diagnosis (encounter_id, diagnosis_id, is_primary, certainty) VALUES
  (12, 9, TRUE, 'confirmed'), (13, 1, TRUE, 'confirmed'), (14, 17, TRUE, 'confirmed'),
  (15, 13, TRUE, 'confirmed'), (16, 10, TRUE, 'confirmed'), (17, 9, TRUE, 'confirmed'),
  (18, 3, TRUE, 'confirmed'), (19, 5, TRUE, 'confirmed'), (20, 20, TRUE, 'confirmed'),
  (21, 8, TRUE, 'confirmed'), (22, 9, TRUE, 'provisional'), (23, 11, TRUE, 'confirmed'),
  (24, 3, TRUE, 'provisional');

-- trg_admission_bi checks every one of these is an Inpatient encounter.
INSERT INTO admission (admission_id, encounter_id, admitted_at, admitted_by) VALUES
  (1, 12, @now - INTERVAL 4 DAY, 1), (2, 13, @now - INTERVAL 2 DAY, 1),
  (3, 14, @now - INTERVAL 6 DAY, 1), (4, 15, @now - INTERVAL 3 DAY, 1),
  (5, 16, @now - INTERVAL 8 DAY, 1), (6, 17, @now - INTERVAL 5 DAY, 1),
  (7, 18, @now - INTERVAL 2 DAY, 1), (8, 19, @now - INTERVAL 7 DAY, 1),
  (9, 20, @now - INTERVAL 1 DAY, 1), (10, 21, @now - INTERVAL 3 DAY, 1),
  (11, 22, @now - INTERVAL 2 DAY, 1), (12, 23, @now - INTERVAL 2 DAY, 1),
  (13, 24, @now - INTERVAL 3 DAY, 1);

-- Each open row (to_at NULL) passes trg_bed_occupancy_bi's checks — bed
-- free, right hospital, right sex, children in paeds — and then
-- trg_bed_occupancy_ai turns the bed occupied.
--
-- Admission 5, Babul Mia, shows a transfer: three days in ICU-05, then moved
-- to GM-06. The closed ICU row is history, so it changes no bed's status.
INSERT INTO bed_occupancy (admission_id, ward_id, bed_no, from_at, to_at) VALUES
  (5, 3, 'ICU-05', @now - INTERVAL 8 DAY, @now - INTERVAL 5 DAY);

INSERT INTO bed_occupancy (admission_id, ward_id, bed_no, from_at) VALUES
  (1,  1, 'GM-01',  @now - INTERVAL 4 DAY),
  (2,  1, 'GM-02',  @now - INTERVAL 2 DAY),
  (3,  1, 'GM-03',  @now - INTERVAL 6 DAY),
  (4,  1, 'GM-05',  @now - INTERVAL 3 DAY),
  (5,  1, 'GM-06',  @now - INTERVAL 5 DAY),
  (6,  2, 'GF-01',  @now - INTERVAL 5 DAY),
  (7,  2, 'GF-02',  @now - INTERVAL 2 DAY),
  (8,  2, 'GF-04',  @now - INTERVAL 7 DAY),
  (9,  2, 'GF-05',  @now - INTERVAL 1 DAY),
  (10, 3, 'ICU-01', @now - INTERVAL 3 DAY),
  (11, 3, 'ICU-02', @now - INTERVAL 2 DAY),
  (12, 4, 'PD-01',  @now - INTERVAL 2 DAY),
  (13, 4, 'PD-02',  @now - INTERVAL 3 DAY);

-- Two inpatient investigations: one reported, one still waiting for the
-- lab technician (sign in as rumana to report it).
INSERT INTO lab_order (order_id, encounter_id, test_id, ordered_by, ordered_at) VALUES
  (6, 18, 8, 16, @now - INTERVAL 2 DAY),
  (7, 14, 2, 16, @now - INTERVAL 3 HOUR),
  (8, 21, 9, 6,  @now - INTERVAL 3 DAY);
INSERT INTO lab_result (order_id, value_num, value_text, is_abnormal, reported_by, reported_at) VALUES
  (6, NULL, 'Positive', TRUE, 4, @now - INTERVAL 46 HOUR),
  (8, 2.80, NULL, FALSE, 4, @now - INTERVAL 70 HOUR);

INSERT INTO encounter_vitals (encounter_id, recorded_at, bp_systolic, bp_diastolic, pulse, temp_c, spo2, recorded_by) VALUES
  (21, @now - INTERVAL 1 HOUR, 100, 60, 104, 37.2, 93, 6);

INSERT INTO prescription (prescription_id, encounter_id, prescribed_by, prescribed_at) VALUES
  (12, 12, 16, @now - INTERVAL 4 DAY), (13, 21, 6, @now - INTERVAL 3 DAY);
INSERT INTO prescription_item (prescription_id, line_no, medicine_id, dose, frequency, duration_days, instruction) VALUES
  (12, 1, 18, '1 g IV',   'once daily', 7,    NULL),
  (12, 2, 4,  '1 tablet', 'as required', 5,   'for fever'),
  (13, 1, 16, '1 tablet', 'once daily', NULL, NULL),
  (13, 2, 2,  '1 tablet', 'at night',   NULL, NULL);


-- =====================================================================
-- 11. REFERRALS AND CONSENT — decisions 6 and 2
-- =====================================================================

-- Referral 1: completed. Abdul Karim Mia, sent from Rangpur's emergency
-- department to Rajshahi nephrology; to_encounter_id is filled, so he
-- arrived. from_hospital_id is filled in by trg_referral_bi.
INSERT INTO referral (referral_id, patient_id, from_hospital_id, to_hospital_id, to_department_id,
                      from_encounter_id, to_encounter_id, reason, urgency, referred_by, referred_at, status) VALUES
  (1, 4, 0, 5, 7, 2, 8, 'Raised creatinine on admission bloods; needs nephrology follow-up', 'routine', 15,
      '2023-03-18 01:45', 'completed'),
  -- Referral 2: issued this morning and not yet arrived — to_encounter_id
  -- is NULL. It appears in Dhaka Medical's referral inbox.
  (2, 1, 0, 1, 1, 11, NULL, 'Uncontrolled hypertension on amlodipine — specialist review and echocardiogram', 'urgent', 11,
      @now - INTERVAL 150 MINUTE, 'issued');

-- Grants. The one that matters for the demo is the first: the referral gave
-- Dhaka Medical 24 hours to read Rahim's record (expires_at defaults to
-- granted_at + 24 hours), which is the basis Dr. Anisur reads it under.
INSERT INTO consent_grant (patient_id, to_hospital_id, scope, granted_at, granted_via, referral_id) VALUES
  (1, 1, 'clinical', @now - INTERVAL 150 MINUTE, 'referral', 2),
  (4, 5, 'clinical', '2023-03-18 01:45', 'referral', 1);
INSERT INTO consent_grant (patient_id, to_hospital_id, to_doctor_id, scope, granted_at, granted_via) VALUES
  (1, 7, 6,    'full',     '2026-08-08 08:55', 'in_person'),
  (2, 3, NULL, 'clinical', '2026-05-22 09:20', 'otp');


-- =====================================================================
-- 12. ACCESS LOG HISTORY — js/data.js ACCESS_LOG, coded
-- =====================================================================

INSERT INTO access_log (log_id, patient_id, account_id, hospital_id, action, basis, is_break_glass, justification, at) VALUES
  (1, 1, 8,  1, 'record.read',         'break_glass',       TRUE,  'Unconscious after a motorcycle accident; no consent possible', '2024-11-02 23:07'),
  (2, 1, 3,  3, 'record.demographics', 'demographics_only', FALSE, NULL, '2025-06-19 16:30'),
  (3, 2, 7,  3, 'record.read',         'treating',          FALSE, NULL, '2026-05-22 09:31'),
  (4, 1, 11, 7, 'record.read',         'consent',           FALSE, NULL, '2026-08-08 09:02'),
  (5, 5, 13, 3, 'record.read',         'break_glass',       TRUE,  'Collapsed in the OPD waiting area; unable to give a history', '2026-10-20 14:12'),
  (6, 1, 11, 7, 'record.read',         'treating',          FALSE, NULL, @now - INTERVAL 175 MINUTE);

-- The 2024 break-glass was reviewed the next morning. A row cannot be
-- inserted already reviewed (trg_access_log_bi); this one UPDATE is the
-- only change trg_access_log_bu permits. Row 5 is left unreviewed: it is
-- the item waiting in the break-glass review queue.
UPDATE access_log SET reviewed_by = 2, reviewed_at = '2024-11-03 10:15' WHERE log_id = 1;
