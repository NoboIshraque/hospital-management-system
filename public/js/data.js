/* ============================================================
   UHID — reference data
   Becomes lookup tables in MySQL. In week 4 this file is one of only
   two that change: these consts become fetch('/api/hospitals') etc.
   Nothing that renders them has to change.
   ============================================================ */

const HOSPITALS = [
  { id: 1, name: 'Dhaka Medical College Hospital',      div: 'Dhaka',      dist: 'Dhaka',      tier: 'Medical College' },
  { id: 2, name: 'Upazila Health Complex, Savar',       div: 'Dhaka',      dist: 'Dhaka',      tier: 'Upazila' },
  { id: 3, name: 'Chattogram Medical College Hospital', div: 'Chattogram', dist: 'Chattogram', tier: 'Medical College' },
  { id: 4, name: 'Sylhet MAG Osmani Medical College',   div: 'Sylhet',     dist: 'Sylhet',     tier: 'Medical College' },
  { id: 5, name: 'Rajshahi Medical College Hospital',   div: 'Rajshahi',   dist: 'Rajshahi',   tier: 'Medical College' },
  { id: 6, name: 'Khulna Medical College Hospital',     div: 'Khulna',     dist: 'Khulna',     tier: 'Medical College' },
  { id: 7, name: 'Square Hospital, Dhaka',              div: 'Dhaka',      dist: 'Dhaka',      tier: 'Private' },
  { id: 8, name: 'Rangpur Medical College Hospital',    div: 'Rangpur',    dist: 'Rangpur',    tier: 'Medical College' }
];

const DEPARTMENTS = ['Cardiology','Medicine','Orthopaedics','Paediatrics','Gynae & Obstetrics','Neurology','Nephrology','ENT','Dermatology','Emergency'];
const DIVISIONS   = ['Dhaka','Chattogram','Sylhet','Rajshahi','Khulna','Rangpur','Barishal','Mymensingh'];
const BLOODS      = ['Unknown','A+','A-','B+','B-','AB+','AB-','O+','O-'];

const DOCTORS = [
  { id: 1,  name: 'Dr. Anisur Rahman',    dept: 'Cardiology',         qual: 'MBBS, FCPS (Medicine), MD (Cardiology)',  hospitalId: 1, fee: 800,  bmdc: 'A-42817' },
  { id: 2,  name: 'Dr. Farzana Haque',    dept: 'Gynae & Obstetrics', qual: 'MBBS, FCPS (Gynae & Obs)',                hospitalId: 1, fee: 700,  bmdc: 'A-51902' },
  { id: 3,  name: 'Dr. Shamsul Alam',     dept: 'Orthopaedics',       qual: 'MBBS, MS (Orthopaedics)',                 hospitalId: 3, fee: 900,  bmdc: 'A-38104' },
  { id: 4,  name: 'Dr. Nusrat Jahan',     dept: 'Paediatrics',        qual: 'MBBS, DCH, FCPS (Paediatrics)',           hospitalId: 1, fee: 600,  bmdc: 'A-60233' },
  { id: 5,  name: 'Dr. Kamrul Hasan',     dept: 'Medicine',           qual: 'MBBS, FCPS (Medicine)',                   hospitalId: 2, fee: 400,  bmdc: 'A-47755' },
  { id: 6,  name: 'Dr. Tahmina Akter',    dept: 'Cardiology',         qual: 'MBBS, MD (Cardiology)',                   hospitalId: 7, fee: 1500, bmdc: 'A-52611' },
  { id: 7,  name: 'Dr. Mizanur Rahman',   dept: 'Neurology',          qual: 'MBBS, FCPS, MD (Neurology)',              hospitalId: 4, fee: 1000, bmdc: 'A-40988' },
  { id: 8,  name: 'Dr. Sabrina Chowdhury',dept: 'Dermatology',        qual: 'MBBS, DDV',                               hospitalId: 3, fee: 650,  bmdc: 'A-58420' },
  { id: 9,  name: 'Dr. Rafiqul Islam',    dept: 'Nephrology',         qual: 'MBBS, FCPS (Medicine), MD (Nephrology)',  hospitalId: 5, fee: 850,  bmdc: 'A-44301' },
  { id: 10, name: 'Dr. Ayesha Siddika',   dept: 'Medicine',           qual: 'MBBS, FCPS (Medicine)',                   hospitalId: 6, fee: 500,  bmdc: 'A-63177' }
];

/* Staff logins. In week 4 these live in `user_account`, the
   password is a bcrypt hash, and the check happens on the SERVER —
   never in JavaScript the user can read. This is a prototype
   stand-in, and you should say so if anyone asks. */
const ACCOUNTS = [
  { user: 'rezaul', pass: 'demo1234', role: 'receptionist' },
  { user: 'anisur', pass: 'demo1234', role: 'doctor' },
  { user: 'rahim',  pass: 'demo1234', role: 'patient' },
  { user: 'nasima', pass: 'demo1234', role: 'admin' }
];

const ROLES = {
  receptionist: {
    label: 'Receptionist', who: 'Rezaul Karim', hospital: 1,
    blurb: 'Registers patients, issues UHIDs, books appointments, admits to beds.',
    nav: [['register','Register patient'], ['search','Find patient'], ['book','Book appointment'], ['wards','Wards &amp; beds']]
  },
  doctor: {
    label: 'Doctor', who: 'Dr. Anisur Rahman', hospital: 1,
    blurb: 'Reads the national record, records encounters, prescribes, refers, discharges.',
    nav: [['search','Find patient'], ['record','Patient record'], ['wards','Wards &amp; beds']]
  },
  patient: {
    label: 'Patient', who: 'Md. Rahim Uddin', hospital: null,
    blurb: 'Books appointments at any connected hospital, views their own history.',
    nav: [['book','Find a doctor'], ['record','My health record']]
  },
  admin: {
    label: 'Hospital Admin', who: 'Nasima Sultana', hospital: 1,
    blurb: 'Manages doctors, departments, schedules, wards and beds.',
    nav: [['wards','Wards &amp; beds'], ['search','Find patient'], ['book','Appointments']]
  }
};

const ACCESS_LOG = [
  { when: '30 Aug 2026 · 11:42', who: 'Dr. Anisur Rahman',        where: 'Dhaka Medical College Hospital',      basis: 'Consent',                 kind: 'ok' },
  { when: '08 Aug 2026 · 09:15', who: 'Dr. Tahmina Akter',        where: 'Square Hospital, Dhaka',              basis: 'Consent',                 kind: 'ok' },
  { when: '02 Nov 2024 · 23:07', who: 'Dr. Shamsul Alam',         where: 'Dhaka Medical College Hospital',      basis: 'Break-glass — emergency', kind: 'crit' },
  { when: '19 Jun 2025 · 16:30', who: 'Rezaul Karim (Reception)', where: 'Chattogram Medical College Hospital', basis: 'Demographics only',       kind: 'info' }
];
