/* ============================================================
   UHID — seed patients
   One shape for every patient — the same shape the API will return
   and the same shape the `patient` table will hold.
   Rows 1 and 3 are deliberately the same human with two UHIDs.
   ============================================================ */

const SEED_PATIENTS = [
  {
    uhid: 'BD-2019-04821-5', name: 'Md. Rahim Uddin', dob: '1978-04-12', sex: 'Male', blood: 'B+',
    phone: '01711-482031', nid: '1978419923041', district: 'Dhaka',
    address: 'House 42, Road 7, Mirpur-2, Dhaka', kin: 'Salma Rahim (wife) · 01911-330218',
    registeredAt: '2019-02-11', registeredHospitalId: 1, identityVerified: true,
    allergies: [
      { agent: 'Penicillin',  severity: 'Severe',   note: 'Anaphylaxis, 2019' },
      { agent: 'Sulfa drugs', severity: 'Moderate', note: 'Rash' }
    ],
    encounters: [
      { date: '2026-08-08', hospitalId: 7, type: 'OPD', doctor: 'Dr. Tahmina Akter', dept: 'Cardiology',
        dx: 'Essential hypertension — review',
        notes: 'BP 148/94. Advised salt restriction and weight loss. Review in 3 months.',
        rx: ['Amlodipine 5 mg — 1 tablet at night — 90 days', 'Atorvastatin 10 mg — 1 tablet at night — 90 days'] },
      { date: '2025-06-19', hospitalId: 3, type: 'OPD', doctor: 'Dr. Shamsul Alam', dept: 'Orthopaedics',
        dx: 'Chronic low back pain',
        notes: 'X-ray L-S spine shows mild degenerative change. Physiotherapy advised.',
        rx: ['Naproxen 500 mg — twice daily after meals — 10 days'] },
      { date: '2024-11-02', hospitalId: 1, type: 'Emergency', doctor: 'Dr. Shamsul Alam', dept: 'Emergency',
        dx: 'Closed fracture, left radius (distal)',
        notes: 'Fall from motorcycle. Below-elbow cast applied. Follow-up at 6 weeks.',
        rx: ['Paracetamol 500 mg — as required, max 8 daily — 7 days', 'Calcium + Vitamin D3 — once daily — 60 days'] },
      { date: '2024-03-14', hospitalId: 2, type: 'OPD', doctor: 'Dr. Kamrul Hasan', dept: 'Medicine',
        dx: 'Acute gastroenteritis',
        notes: 'Mild dehydration. Oral rehydration advised. Recovered on review.',
        rx: ['ORS sachet — after each loose stool — 3 days', 'Metronidazole 400 mg — three times daily — 5 days'] }
    ]
  },
  {
    uhid: 'BD-2021-11904-5', name: 'Fatema Begum', dob: '1991-09-30', sex: 'Female', blood: 'O+',
    phone: '01819-330442', nid: '1991773310448', district: 'Chattogram',
    address: 'Flat 3B, Nasirabad, Chattogram', kin: 'Nurul Islam (husband) · 01712-884410',
    registeredAt: '2021-05-04', registeredHospitalId: 3, identityVerified: true,
    allergies: [],
    encounters: [
      { date: '2026-05-22', hospitalId: 3, type: 'OPD', doctor: 'Dr. Farzana Haque', dept: 'Gynae & Obstetrics',
        dx: 'Antenatal check — 28 weeks',
        notes: 'Singleton pregnancy, growth appropriate. Haemoglobin 10.4 g/dL.',
        rx: ['Ferrous sulphate + folic acid — once daily — 90 days', 'Calcium 500 mg — twice daily — 90 days'] },
      { date: '2024-01-09', hospitalId: 3, type: 'OPD', doctor: 'Dr. Sabrina Chowdhury', dept: 'Dermatology',
        dx: 'Contact dermatitis',
        notes: 'Localised to both hands. Likely detergent exposure. Barrier cream advised.',
        rx: ['Hydrocortisone 1% cream — twice daily — 14 days'] }
    ]
  },
  {
    uhid: 'BD-2018-00723-2', name: 'Md. Rahim Uddin', dob: '1978-04-12', sex: 'Male', blood: 'B+',
    phone: '01552-908114', nid: '', district: 'Manikganj',
    address: 'Village Baliati, Saturia, Manikganj', kin: 'Abdul Uddin (father) · —',
    registeredAt: '2018-08-30', registeredHospitalId: 2, identityVerified: false,
    allergies: [],
    encounters: [
      { date: '2018-08-30', hospitalId: 2, type: 'OPD', doctor: 'Dr. Kamrul Hasan', dept: 'Medicine',
        dx: 'Enteric fever',
        notes: 'Registered without NID. Treated as outpatient, recovered.',
        rx: ['Ciprofloxacin 500 mg — twice daily — 10 days'] }
    ]
  },
  {
    uhid: 'BD-2023-38104-6', name: 'Abdul Karim Mia', dob: '1965-01-22', sex: 'Male', blood: 'A-',
    phone: '01922-771030', nid: '1965110220317', district: 'Rangpur',
    address: 'Ward 4, Mithapukur, Rangpur', kin: 'Rehana Karim (daughter) · 01755-201933',
    registeredAt: '2023-03-17', registeredHospitalId: 8, identityVerified: true,
    allergies: [{ agent: 'Aspirin', severity: 'Moderate', note: 'Gastric bleeding, 2022' }],
    encounters: [
      { date: '2026-02-14', hospitalId: 5, type: 'OPD', doctor: 'Dr. Rafiqul Islam', dept: 'Nephrology',
        dx: 'Chronic kidney disease, stage 3',
        notes: 'eGFR 42. Blood pressure control emphasised. Six-monthly review.',
        rx: ['Losartan 50 mg — once daily — 180 days'] },
      { date: '2023-03-17', hospitalId: 8, type: 'Emergency', doctor: 'Dr. Ayesha Siddika', dept: 'Emergency',
        dx: 'Acute gastritis',
        notes: 'Following aspirin use. Aspirin stopped and recorded as an allergy.',
        rx: ['Omeprazole 20 mg — once daily before food — 28 days'] }
    ]
  },
  {
    uhid: 'BD-2020-27615-1', name: 'Shirin Akter', dob: '1996-11-05', sex: 'Female', blood: 'AB+',
    phone: '01733-119284', nid: '1996884411052', district: 'Sylhet',
    address: 'Shibganj, Sylhet', kin: 'Mokbul Hossain (father) · 01717-443021',
    registeredAt: '2020-12-01', registeredHospitalId: 4, identityVerified: true,
    allergies: [],
    encounters: [
      { date: '2025-10-03', hospitalId: 4, type: 'OPD', doctor: 'Dr. Mizanur Rahman', dept: 'Neurology',
        dx: 'Migraine without aura',
        notes: 'Two to three episodes monthly. Trigger diary advised.',
        rx: ['Propranolol 40 mg — twice daily — 60 days'] }
    ]
  }
];
