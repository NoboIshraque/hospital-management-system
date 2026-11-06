/* ============================================================
   npm run api:test — check every API endpoint end to end.

   Rebuilds the database, starts the server inside this process on a
   free port, signs in as the demo accounts and calls each route,
   checking the HTTP status and the important parts of each answer.
   Rebuilds the database again at the end, because the checks book,
   admit and discharge.

   Exits with code 1 if any check fails.
   ============================================================ */

const { execSync } = require('child_process');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
const reset = () => execSync('node db/reset.js', { cwd: SERVER_DIR, stdio: 'ignore' });

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

/* A tiny client that keeps its own session cookie, like one browser. */
function client(base) {
  let cookie = '';
  return async function request(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* a page, not JSON */ }
    return { status: res.status, body: json, text };
  };
}

async function signIn(base, username) {
  const req = client(base);
  const r = await req('POST', '/api/login', { username, password: 'demo1234' });
  if (r.status !== 200) throw new Error(`could not sign in as ${username}: ${r.status}`);
  return req;
}

(async () => {
  console.log('Rebuilding the database…');
  reset();

  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { pool } = require('../db/pool');

  try {
    // ---------- public and auth ----------
    const anon = client(base);
    let r = await anon('GET', '/api/hospitals');
    check('GET /api/hospitals is public and returns the 8 hospitals', r.status === 200 && r.body.length === 8);
    check('…in the js/data.js shape', r.body[0] && ['id', 'name', 'div', 'dist', 'tier'].every(k => k in r.body[0]));
    r = await anon('GET', '/api/doctors');
    check('GET /api/doctors returns one row per current posting', r.status === 200 && r.body.length === 12);
    check('…with a numeric fee and a next free slot', typeof r.body[0].fee === 'number' && typeof r.body[0].nextFree === 'string');
    // 8 days, not 7: seed.sql puts the bookings on "the coming Sunday", which
    // on a Sunday is a week away — one day past a 7-day window.
    r = await anon('GET', '/api/doctors/1/availability?days=8');
    check('GET /api/doctors/1/availability returns days of slots',
      r.status === 200 && r.body.length > 0 && r.body[0].slots.length > 0 && 'taken' in r.body[0].slots[0]);
    const freeSlot = r.body.flatMap(d => d.slots).find(s => !s.taken);
    const takenSlot = r.body.flatMap(d => d.slots).find(s => s.taken);
    r = await anon('GET', '/api/departments');
    check('GET /api/departments returns the 10 names', r.status === 200 && r.body.length === 10 && r.body[0] === 'Cardiology');
    r = await anon('POST', '/api/patients/search', { q: 'rahim' });
    check('Searching for a patient without signing in is 401', r.status === 401);
    r = await anon('POST', '/api/login', { username: 'anisur', password: 'wrong' });
    check('A wrong password is 401', r.status === 401);
    r = await anon('GET', '/api/nothing-here');
    check('An unknown API route is a JSON 404', r.status === 404 && r.body && r.body.error);
    r = await anon('GET', '/index.html');
    check('The static site is served too', r.status === 200 && r.text.includes('<html'));

    // ---------- web-layer protections (security.js) ----------
    let raw = await fetch(base + '/index.html');
    check('Pages carry a Content-Security-Policy that forbids framing (W3)',
      /frame-ancestors 'none'/.test(raw.headers.get('content-security-policy') || '') &&
      raw.headers.get('x-content-type-options') === 'nosniff');
    raw = await fetch(base + '/api/patients/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{"q":"rahim"}' });
    check('A write started by another website is refused (W2)', raw.status === 403);
    for (let i = 0; i < 5; i++) await anon('POST', '/api/login', { username: 'nosuchuser', password: 'guess' + i });
    r = await anon('POST', '/api/login', { username: 'nosuchuser', password: 'guess5' });
    check('After 5 failed sign-ins for one username, the next is refused with 429 (S1)', r.status === 429);
    const burst = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      anon('POST', '/api/login', { username: 'burstuser', password: 'guess' + i })));
    check('A parallel burst of guesses is still limited to 5 (H1.6)', burst.filter(x => x.status === 401).length === 5);
    r = await anon('POST', '/api/login', { username: '\uff53\uff59\uff53\uff41\uff44\uff4d\uff49\uff4e', password: 'demo1234' });
    check('A full-width spelling of a username does not sign in (H1.6)', r.status === 401);
    r = await anon('GET', '/api/districts');
    check('GET /api/districts lists the 64 districts', r.status === 200 && r.body.length === 64);

    const rezaul = await signIn(base, 'rezaul');
    const anisur = await signIn(base, 'anisur');
    const rahim  = await signIn(base, 'rahim');
    const nasima = await signIn(base, 'nasima');
    const mahbub = await signIn(base, 'mahbub');

    r = await rezaul('GET', '/api/me');
    check('GET /api/me returns the session account', r.status === 200 && r.body.name === 'Rezaul Karim' && r.body.role === 'receptionist');
    r = await nasima('GET', '/api/me');
    check('hospital_admin is mapped to the frontend role "admin"', r.body.role === 'admin');
    r = await rahim('GET', '/api/me');
    check('A patient account carries its own UHID', r.body.patientUhid === 'BD-2019-04821-5');

    // ---------- patients ----------
    /* Opening a record is a POST (security review W1). */
    const read = (who, uhid, body) => who('POST', `/api/patients/${uhid}/read`, body || {});

    r = await rezaul('GET', '/api/patients');
    check('There is no national patient list any more (L1)', r.status === 404);
    r = await rezaul('POST', '/api/patients/search', { q: 'rahim' });
    check('A receptionist searches by name', r.status === 200 && r.body.length === 2 && typeof r.body[0].identityVerified === 'boolean');
    check('…and NID and phone come back masked',
      r.body.every(p => (!p.nid || /^•+[0-9]{4}$/.test(p.nid)) && /^[0-9]{3}•+[0-9]{3}$/.test(p.phone)), JSON.stringify(r.body[0]));
    r = await rezaul('POST', '/api/patients/search', { q: '01711-482031' });
    check('…or by mobile number', r.status === 200 && r.body.length === 1 && r.body[0].uhid === 'BD-2019-04821-5');
    r = await rezaul('POST', '/api/patients/search', { q: 'ra' });
    check('Two letters are too vague a search (409)', r.status === 409);
    r = await rahim('POST', '/api/patients/search', { q: 'rahim' });
    check('A patient cannot search (403, checked by has_permission)', r.status === 403);
    r = await rezaul('POST', '/api/patients/matches', { name: 'Md. Rahim Uddin', dob: '1978-04-12' });
    check('The registration desk finds both records with this name and date of birth',
      r.status === 200 && r.body.length === 2 && r.body.every(p => p.matchedOn === 'same name and date of birth'));

    r = await rezaul('POST', '/api/patients', {
      name: 'Api Test', dob: '1995-05-05', sex: 'Female', blood: 'O+', phone: '01700-555000',
      nid: '1995000000005', district: 'Dhaka', address: 'Test Road', kinName: 'Kin', kinRelation: 'sister',
      kinPhone: '01800-000000', allergies: ['Penicillin']
    });
    const year = new Date().getFullYear();
    check('POST /api/patients issues the next UHID', r.status === 201 && r.body.uhid === `BD-${year}-00001-1` && r.body.district === 'Dhaka', JSON.stringify(r.body));
    r = await rezaul('POST', '/api/patients', { name: 'Dup', dob: '1995-05-05', sex: 'Female', nid: '1995000000005' });
    check('Registering an NID twice is 409 with the existing UHID named',
      r.status === 409 && r.body.error.includes(`BD-${year}-00001-1`));
    r = await anisur('POST', '/api/patients', { name: 'X', dob: '1995-05-05', sex: 'Male' });
    check('A doctor registering a patient is 403', r.status === 403);
    r = await rezaul('POST', '/api/patients', { name: ['a', 'b'], dob: '1995-05-05', sex: 'Male' });
    check('A list where one value belongs is 400, not shifted into other parameters (H2.6)', r.status === 400);
    r = await rezaul('POST', '/api/patients', { name: 'Bad Date', dob: 'notadate', sex: 'Male' });
    check('A date that is not a date is 400, not 500 (H2.5)', r.status === 400);
    r = await rezaul('POST', '/api/patients', { name: 'Bad Nid', dob: '1990-01-01', sex: 'Male', nid: 'abc' });
    check('An NID that is not 10, 13 or 17 digits is refused (H2.7)', r.status === 409);
    r = await rezaul('GET', '/api/catalogue');
    check('GET /api/catalogue returns the four catalogues', r.status === 200 && r.body.allergens.length > 0 && r.body.medicines.length > 0);

    r = await anisur('GET', '/api/patients/BD-2019-04821-5');
    check('A link (a GET) cannot open a record (W1)', r.status === 404);
    r = await read(anisur, 'BD-2019-04821-5');
    check('A doctor with consent reads the record', r.status === 200 && r.body.access.basis === 'consent');
    check('…in the js/seed.js shape, with rx[] nested in each encounter',
      Array.isArray(r.body.encounters) && r.body.encounters.length === 5 && Array.isArray(r.body.encounters[0].rx));
    check('…with allergies, labs and the access log',
      r.body.allergies.length === 2 && r.body.encounters.some(e => e.labs.length) && r.body.accessLog.length > 0);
    check('…and this read is the newest access-log entry', r.body.accessLog[0].who === 'Dr. Anisur Rahman');
    r = await read(anisur, 'BD-2021-11904-5');
    check('No basis is 423 with breakGlassAvailable', r.status === 423 && r.body.breakGlassAvailable === true);
    r = await read(anisur, 'BD-2021-11904-5', { breakGlass: true, reason: 'Unconscious in emergency' });
    check('Break-glass with a reason is allowed and flagged', r.status === 200 && r.body.access.breakGlass === true);
    r = await read(rezaul, 'BD-2019-04821-5');
    check('A receptionist gets demographics only', r.status === 200 && r.body.access.basis === 'demographics_only' && r.body.encounters.length === 0);
    check('…with the NID masked to its last 4 digits (A7)', r.body.nid === '•••••••••3041', r.body.nid);
    r = await read(rahim, 'BD-2019-04821-5');
    check('A patient reads their own record', r.status === 200 && r.body.access.basis === 'own_record');
    r = await read(rahim, 'BD-2021-11904-5');
    check('A patient reading someone else is 403', r.status === 403);
    r = await read(anisur, 'BD-2026-99999-5');
    check('An unknown UHID is 404', r.status === 404);

    // ---------- appointments ----------
    r = await rezaul('POST', '/api/appointments', { postingId: 1, uhid: 'BD-2020-27615-1', slotStart: freeSlot.start });
    check('Booking a free slot is 201', r.status === 201 && r.body.appointmentId > 0, JSON.stringify(r.body));
    const apptId = r.body.appointmentId;
    r = await rezaul('POST', '/api/appointments', { postingId: 1, uhid: 'BD-2023-38104-6', slotStart: freeSlot.start });
    check('Booking it again is 409 "just been taken"', r.status === 409 && /taken/.test(r.body.error));
    r = await rezaul('POST', '/api/appointments', { postingId: 1, uhid: 'BD-2023-38104-6', slotStart: takenSlot.start });
    check('A slot the grid shows as taken is refused', r.status === 409);
    r = await anon('GET', '/api/doctors/1/availability?days=8');
    check('The grid now shows the new booking as taken',
      r.body.flatMap(d => d.slots).find(s => s.start === freeSlot.start).taken === true);
    r = await rahim('DELETE', `/api/appointments/${apptId}`);
    check('A patient cancelling someone else\'s appointment is 403', r.status === 403);
    r = await rezaul('DELETE', '/api/appointments/abc');
    check('An id that is not a whole number is 400 (I3)', r.status === 400);
    r = await rezaul('DELETE', `/api/appointments/${apptId}`);
    check('Reception cancels it', r.status === 200);
    r = await anon('GET', '/api/doctors/1/availability?days=8');
    check('…and the slot is free again', r.body.flatMap(d => d.slots).find(s => s.start === freeSlot.start).taken === false);

    // ---------- wards ----------
    r = await rezaul('GET', '/api/wards');
    check('GET /api/wards returns the 4 DMCH wards in the WARDS shape',
      r.status === 200 && r.body.length === 4 && r.body[0].beds.length === 12 && 'status' in r.body[0].beds[0]);
    r = await rezaul('POST', '/api/admissions', { uhid: 'BD-2023-38104-6', postingId: 15, wardId: 1, bedNo: 'GM-04', complaint: 'Chest infection' });
    check('A receptionist admits to a free bed', r.status === 201, JSON.stringify(r.body));
    const admissionId = r.body.admissionId;
    const bedStatus = async (no) => {
      const w = (await rezaul('GET', '/api/wards')).body;
      return w.flatMap(x => x.beds).find(b => b.no === no).status;
    };
    check('…and the bed board shows it occupied', await bedStatus('GM-04') === 'occupied');
    r = await rezaul('POST', '/api/admissions', { uhid: 'BD-2020-27615-1', postingId: 15, wardId: 2, bedNo: 'GF-03' });
    check('Admitting with no basis and no reason is 423 (H1.5)', r.status === 423);
    r = await rezaul('POST', '/api/admissions', { uhid: 'BD-2020-27615-1', postingId: 15, wardId: 2, bedNo: 'GF-01', complaint: 'Chest infection' });
    check('Admitting to an occupied bed is 409', r.status === 409);
    r = await (await signIn(base, 'rumana'))('GET', '/api/wards');
    check('A lab technician has no bed board (403, H2.3)', r.status === 403);
    r = await rezaul('POST', `/api/admissions/${admissionId}/transfer`, { wardId: 1, bedNo: 'GM-08' });
    check('A transfer moves the patient', r.status === 200 && await bedStatus('GM-04') === 'cleaning' && await bedStatus('GM-08') === 'occupied');
    r = await rezaul('POST', `/api/admissions/${admissionId}/discharge`, { summary: 'x' });
    check('A receptionist discharging is 403', r.status === 403);
    r = await mahbub('POST', `/api/admissions/${admissionId}/discharge`, { summary: 'Recovered', outcome: 'recovered' });
    check('A doctor discharges, and the bed goes for cleaning', r.status === 200 && await bedStatus('GM-08') === 'cleaning');
    const tahmina = await signIn(base, 'tahmina');
    r = await tahmina('POST', '/api/admissions/1/discharge', { summary: 'x' });
    check('A doctor at another hospital cannot discharge a Dhaka Medical inpatient (A3)', r.status === 404);
    r = await rezaul('POST', '/api/beds/clean', { wardId: 1, bedNo: 'GM-08' });
    check('Marking it clean frees it', r.status === 200 && await bedStatus('GM-08') === 'free');
    r = await rahim('GET', '/api/wards');
    check('A patient has no bed board (400)', r.status === 400);

    // ---------- encounters: one transaction ----------
    const count = async () => (await read(anisur, 'BD-2019-04821-5')).body.encounters.length;
    const before = await count();
    r = await anisur('POST', '/api/encounters', {
      uhid: 'BD-2019-04821-5', complaint: 'Sore throat',
      diagnoses: [{ icd10: 'J18.9' }],
      prescriptions: [{ medicineId: 4, dose: '1 tablet', frequency: 'as required', days: 5 },
                      { medicineId: 15, dose: '1 capsule', frequency: 'three times daily', days: 7 }],
      end: true
    });
    check('An encounter prescribing Amoxicillin to a Penicillin allergy is 409', r.status === 409 && /Allergy conflict/.test(r.body.error));
    check('…and the whole visit was rolled back, the first drug line included', await count() === before);
    r = await anisur('POST', '/api/encounters', {
      uhid: 'BD-2019-04821-5', complaint: 'Fever', diagnoses: [{ icd10: 'J18.9' }],
      vitals: { systolic: 130, diastolic: 85, pulse: 90 },
      prescriptions: [{ medicineId: 4, dose: '1 tablet', frequency: 'as required', days: 5 }],
      labTests: ['Haemoglobin'], end: true
    });
    check('A valid encounter is saved whole', r.status === 201 && await count() === before + 1);
    r = await anisur('POST', '/api/encounters', { uhid: 'BD-2019-04821-5' });
    check('An encounter with no diagnosis is 400', r.status === 400);
    r = await anisur('POST', '/api/encounters', { uhid: 'BD-2019-04821-5', diagnoses: [{ icd10: 'I10' }],
      prescriptions: Array.from({ length: 21 }, () => ({ medicineId: 4, dose: '1', frequency: 'once daily' })) });
    check('More than 20 drug lines in one visit is 400 (I3)', r.status === 400);
    r = await anisur('POST', '/api/encounters', { uhid: 'BD-2019-04821-5', diagnoses: [null] });
    check('A diagnosis that is not an object is 400, not a crash (H2.5)', r.status === 400);
    r = await anisur('POST', '/api/encounters', { uhid: 'BD-2019-04821-5', diagnoses: [{ icd10: 'I10' }],
      vitals: { systolic: 80, diastolic: 120 } });
    check('A CHECK refusal comes back as a plain sentence, not a constraint name (W4)',
      r.status === 409 && !/ck_|constraint/i.test(r.body.error), r.body && r.body.error);
    const visit = { uhid: 'BD-2021-11904-5', complaint: 'Chest pain', diagnoses: [{ icd10: 'I10' }], end: true };
    r = await anisur('POST', '/api/encounters', visit);
    check('An encounter with no basis and no reason is 423 (A1)', r.status === 423);
    r = await anisur('POST', '/api/encounters', { ...visit, reason: 'Walk-in with chest pain' });
    check('…with a reason it is saved', r.status === 201);
    r = await nasima('GET', '/api/audit/break-glass');
    check('…and the reason waits in the hospital admin review queue',
      r.status === 200 && r.body.some(x => x.justification === 'Walk-in with chest pain'));
    r = await anisur('POST', '/api/encounters', { uhid: 'BD-2019-04821-5', complaint: 'Rash after a new soap', diagnoses: [{ icd10: 'L25.9' }], end: false });
    check('A doctor keeps a visit open…', r.status === 201);
    r = await anisur('POST', '/api/allergies', { uhid: 'BD-2019-04821-5', allergen: 'Latex', severity: 'Moderate', note: 'Rash with gloves' });
    check('…and records an allergy from it (H2.10)', r.status === 201);
    r = await read(anisur, 'BD-2019-04821-5');
    check('…which then shows on the record', r.body.allergies.some(a => a.agent === 'Latex'));
    const tahminaProbe = await signIn(base, 'tahmina');
    r = await tahminaProbe('POST', '/api/encounters', { uhid: 'BD-2019-04821-5', reason: 'Walked in asking for a refill',
      diagnoses: [{ icd10: 'I10' }], prescriptions: [{ medicineId: 15, dose: '1 capsule', frequency: 'three times daily', days: 5 }] });
    check('A visit refused half-way (allergy) is still 409…', r.status === 409 && /Allergy/.test(r.body.error));
    r = await (await signIn(base, 'sysadmin'))('GET', '/api/audit/break-glass');
    check('…but its reason is kept in the review queue (H2.2)',
      r.body.some(x => x.action === 'encounter.attempt' && x.justification === 'Walked in asking for a refill'));

    // ---------- labs, referrals, audit, merge ----------
    const rumana = await signIn(base, 'rumana');
    r = await rumana('GET', '/api/lab-orders');
    check('The lab technician\'s worklist has the waiting orders at their hospital',
      r.status === 200 && r.body.some(o => o.id === 7) && r.body.some(o => o.test === 'Haemoglobin' && o.uhid === 'BD-2019-04821-5'));
    r = await rumana('POST', '/api/lab-results', { orderId: 7, valueNum: 1.9 });
    check('The lab technician reports a result, and the database says it is abnormal', r.status === 201 && r.body.abnormal === true);
    r = await rumana('GET', '/api/lab-orders');
    check('…and it leaves the worklist', r.status === 200 && !r.body.some(o => o.id === 7));
    r = await rezaul('GET', '/api/lab-orders');
    check('A receptionist has no lab worklist (403)', r.status === 403);
    r = await anisur('POST', '/api/referrals', { encounterId: 21, toHospitalId: 7, dept: 'Cardiology', reason: 'Angiography', urgency: 'urgent' });
    check('A doctor refers a patient to another hospital', r.status === 201 && r.body.referralId > 0);
    r = await tahmina('GET', '/api/referrals/inbox');
    check('The receiving hospital sees it in its inbox', r.status === 200 && r.body.some(x => x.reason === 'Angiography'));
    r = await read(tahmina, 'BD-2022-23590-9');
    check('…and can read that patient under consent from the referral', r.status === 200 && r.body.access.basis === 'consent');
    r = await nasima('GET', '/api/audit/break-glass');
    check('The hospital admin sees their own hospital\'s break-glass queue, and only that',
      r.status === 200 && r.body.length >= 1 && r.body.every(x => x.hospitalId === 1));
    const logId = r.body[0].id;
    r = await nasima('POST', `/api/audit/break-glass/${logId}/review`);
    check('…and reviews one', r.status === 200);
    r = await nasima('POST', '/api/audit/break-glass/5/review');
    check('…but not one made at another hospital (403)', r.status === 403);
    const sysadmin = await signIn(base, 'sysadmin');
    r = await sysadmin('GET', '/api/audit/break-glass');
    check('The system admin sees the whole country\'s queue', r.status === 200 && r.body.some(x => x.id === 5));
    r = await rezaul('GET', '/api/audit/break-glass');
    check('A receptionist cannot see the queue (403)', r.status === 403);
    r = await nasima('GET', '/api/audit/duplicates');
    check('The admin sees the two Md. Rahim Uddin records flagged as possible duplicates',
      r.status === 200 && r.body.some(d => d.uhidA === 'BD-2019-04821-5' && d.uhidB === 'BD-2018-00723-2'));
    r = await rezaul('GET', '/api/audit/duplicates');
    check('A receptionist cannot list possible duplicates (403)', r.status === 403);
    r = await nasima('POST', '/api/patients/merge', { losingUhid: 'BD-2018-00723-2', survivingUhid: 'BD-2019-04821-5', reason: 'Confirmed same person' });
    check('The admin merges the duplicate Rahim records', r.status === 200);
    r = await read(anisur, 'BD-2018-00723-2');
    check('…and the old UHID now opens the surviving record', r.status === 200 && r.body.uhid === 'BD-2019-04821-5');

    // ---------- consent, the patient's side (A9) ----------
    r = await rahim('GET', '/api/consents');
    const live = r.body && r.body.find(g => g.status === 'active' && g.hospital === 'Dhaka Medical College Hospital');
    check('A patient lists their consent grants', r.status === 200 && Boolean(live), JSON.stringify(r.body));
    r = await anisur('GET', '/api/consents');
    check('A doctor has no consents to list (403)', r.status === 403);
    r = await anisur('POST', `/api/consents/${live.id}/revoke`);
    check('A doctor cannot revoke a patient\'s consent (403)', r.status === 403);
    r = await rahim('POST', `/api/consents/${live.id}/revoke`);
    check('The patient revokes it', r.status === 200);
    r = await rahim('GET', '/api/consents');
    check('…and it now shows as revoked', r.body.find(g => g.id === live.id).status === 'revoked');

    // ---------- accounts and passwords (I1) ----------
    r = await anon('GET', '/api/config');
    check('GET /api/config says whether this is a demo installation', r.status === 200 && typeof r.body.demo === 'boolean');
    const admin = await signIn(base, 'nasima');
    r = await admin('POST', '/api/accounts', { username: 'desk.two', role: 'receptionist', hospitalId: 1, staffName: 'Desk Two' });
    check('An admin creates a receptionist and gets a one-time password', r.status === 201 && r.body.oneTimePassword.length === 12);
    const otp = r.body.oneTimePassword;
    const fresh = client(base);
    r = await fresh('POST', '/api/login', { username: 'desk.two', password: otp });
    check('The new account signs in with it, flagged to change it', r.status === 200 && r.body.mustChange === true);
    r = await fresh('POST', '/api/patients/search', { q: 'rahim' });
    check('…and can do nothing else until it does (403)', r.status === 403 && r.body.mustChangePassword === true);
    r = await fresh('POST', '/api/me/password', { current: otp, next: 'short' });
    check('A password under 10 characters is refused', r.status === 400);
    r = await fresh('POST', '/api/me/password', { current: otp, next: 'demo1234' });
    check('The old shared demo password is refused', r.status === 400);
    r = await fresh('POST', '/api/me/password', { current: 'wrong-current', next: 'a long new passphrase' });
    check('The current password must be right', r.status === 400);
    r = await fresh('POST', '/api/me/password', { current: otp, next: 'a long new passphrase' });
    check('A good new password is accepted…', r.status === 200);
    r = await fresh('POST', '/api/patients/search', { q: 'rahim' });
    check('…and the account works', r.status === 200);
    r = await admin('GET', '/api/accounts');
    const deskTwo = r.body.find(a => a.username === 'desk.two');
    check('The admin sees the account in their list', r.status === 200 && Boolean(deskTwo) && deskTwo.active === true);
    r = await admin('POST', `/api/accounts/${deskTwo.id}/active`, { active: false });
    check('…switches it off', r.status === 200);
    r = await client(base)('POST', '/api/login', { username: 'desk.two', password: 'a long new passphrase' });
    check('…and it can no longer sign in', r.status === 401);
    r = await rezaul('POST', '/api/accounts', { username: 'sneaky', role: 'receptionist', hospitalId: 1, staffName: 'S' });
    check('A receptionist cannot create accounts (403)', r.status === 403);
    r = await rezaul('POST', '/api/patients/BD-2020-27615-1/login', { username: 'shirin' });
    check('Reception issues a patient her portal login', r.status === 201 && r.body.username === 'shirin' && r.body.oneTimePassword.length === 12);

    // ---------- least privilege ----------
    let denied = false;
    try { await pool.query('SELECT * FROM patient'); } catch (e) { denied = e.errno === 1142; }
    check('The API\'s own database user cannot SELECT the patient table', denied);

    r = await rezaul('POST', '/api/logout');
    r = await rezaul('GET', '/api/me');
    check('After logout the session is gone', r.status === 401);
  } catch (err) {
    failures.push('the test script itself crashed: ' + err.stack);
  } finally {
    server.close();
    await pool.end();
    console.log('\nRebuilding the database…');
    reset();
  }

  console.log(`\n${passed} passed, ${failures.length} failed.`);
  if (failures.length) {
    console.log('\nFailures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
})();
