-- =====================================================================
-- UHID National Hospital Management System — reference data
-- Loaded after views.sql, before seed.sql (db:reset) or grants.sql (db:install).
--
-- Checklist I7, 7 November 2026. This is the data EVERY installation needs,
-- a real one included: the country's geography, the kinds of hospital, the
-- departments, the six roles and what each may do, and the clinical
-- catalogues (ICD-10 diagnoses, medicines, allergens, lab tests). None of it
-- is about a particular hospital or person.
--
-- Everything else — the eight demo hospitals, their doctors, wards and
-- patients, the demo accounts — is in seed.sql, which a real installation
-- (npm run db:install) never loads.
-- =====================================================================

USE uhid;

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

INSERT INTO hospital_tier (tier_id, name) VALUES
  (1, 'Medical College'), (2, 'District'), (3, 'Upazila'), (4, 'Specialised'), (5, 'Private');

INSERT INTO department (department_id, name) VALUES
  (1, 'Cardiology'), (2, 'Medicine'), (3, 'Orthopaedics'), (4, 'Paediatrics'),
  (5, 'Gynae & Obstetrics'), (6, 'Neurology'), (7, 'Nephrology'), (8, 'ENT'),
  (9, 'Dermatology'), (10, 'Emergency');

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
  ('bed.view',                  'See the bed board of their own hospital, with each inpatient''s diagnosis'),
  ('referral.create',           'Refer a patient to another hospital'),
  ('audit.review',              'Review break-glass access'),
  ('account.manage',            'Create staff accounts, reset passwords, switch accounts off'),
  ('org.manage',                'Set up a hospital: doctors, postings, fees, schedules, leave, wards and beds');

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
      ('receptionist',   'bed.view'),
      ('doctor',         'patient.read_demographics'),
      ('doctor',         'patient.read_clinical'),
      ('doctor',         'appointment.book'),
      ('doctor',         'encounter.write'),
      ('doctor',         'prescription.write'),
      ('doctor',         'lab.order'),
      ('doctor',         'bed.transfer'),
      ('doctor',         'bed.discharge'),
      ('doctor',         'bed.view'),
      ('doctor',         'referral.create'),
      ('hospital_admin', 'patient.read_demographics'),
      ('hospital_admin', 'patient.merge'),
      ('hospital_admin', 'appointment.book'),
      ('hospital_admin', 'appointment.cancel'),
      ('hospital_admin', 'bed.clean'),
      ('hospital_admin', 'bed.view'),
      ('hospital_admin', 'audit.review'),
      ('hospital_admin', 'account.manage'),
      ('hospital_admin', 'org.manage'),
      ('system_admin',   'patient.read_demographics'),
      ('system_admin',   'patient.merge'),
      ('system_admin',   'audit.review'),
      ('system_admin',   'account.manage'),
      ('system_admin',   'org.manage'),
      ('lab_technician', 'patient.read_demographics'),
      ('lab_technician', 'lab.report')
    );

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

INSERT INTO ward_type (ward_type_id, code, label) VALUES
  (1, 'General', 'General ward'), (2, 'ICU', 'Intensive care'),
  (3, 'Paeds', 'Paediatric'), (4, 'Isolation', 'Isolation');

INSERT INTO bed_status (status_id, code, label) VALUES
  (1, 'free', 'Free'), (2, 'occupied', 'Occupied'), (3, 'reserved', 'Reserved'), (4, 'cleaning', 'Cleaning');
