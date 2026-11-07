/* ============================================================
   npm run first-day:test — a real hospital's first day, from nothing.

   Proves the app runs without anyone editing SQL (checklist I5, I7):
     1. npm run db:install --replace   (backs the current database up first)
     2. through the API only, exactly as the screens do it:
        the first system admin signs in with the one-time password and
        chooses their own → adds a hospital → creates its admin → that
        admin posts a doctor, gives them a weekly session, adds a ward with
        beds, creates a receptionist → the receptionist registers a patient
        and books them into the doctor's first free slot
     3. restores the database that was there before.
   ============================================================ */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : ''));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

const node = args => spawnSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8' });

(async () => {
  console.log('Installing an empty network…');
  const inst = node(['db/install.js', '--replace', '--admin', 'first.admin']);
  if (inst.status !== 0) throw new Error('db:install failed: ' + inst.stderr + inst.stdout);
  const otp = (inst.stdout.match(/One-time password\s+(\S+)/) || [])[1];
  const saved = (inst.stdout.match(/saved in (\S+\.sql)/) || [])[1];
  check('db:install creates the first administrator with a one-time password', Boolean(otp));

  try {
    const app = require('../app');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const client = () => {
      let cookie = '';
      return async (method, url, body) => {
        const res = await fetch(base + url, {
          method, headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0];
        let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
        return { status: res.status, body: data };
      };
    };

    let r;
    r = await client()('GET', '/api/hospitals');
    check('The new network has no hospitals', r.status === 200 && r.body.length === 0);

    const sys = client();
    r = await sys('POST', '/api/login', { username: 'first.admin', password: otp });
    check('The first admin signs in with the one-time password…', r.status === 200 && r.body.mustChange === true);
    r = await sys('POST', '/api/me/password', { current: otp, next: 'river stone lantern' });
    check('…and chooses their own', r.status === 200);
    r = await sys('POST', '/api/setup/hospitals', { name: 'Kaliakair Upazila Health Complex', district: 'Gazipur', tier: 'Upazila' });
    check('They add the first hospital', r.status === 201, JSON.stringify(r.body));
    const hosp = r.body.hospitalId;
    r = await sys('POST', '/api/accounts', { username: 'kaliakair.admin', role: 'hospital_admin', hospitalId: hosp, staffName: 'Shirin Akter' });
    check('…and its administrator', r.status === 201, JSON.stringify(r.body));
    const adminOtp = r.body.oneTimePassword;

    const adm = client();
    await adm('POST', '/api/login', { username: 'kaliakair.admin', password: adminOtp });
    r = await adm('POST', '/api/me/password', { current: adminOtp, next: 'mango monsoon ferry' });
    check('The hospital admin signs in and sets a password', r.status === 200);
    r = await adm('POST', `/api/setup/${hosp}/postings`, { bmdc: 'A-70001', name: 'Dr. Habibur Rahman', qual: 'MBBS, FCPS (Medicine)', dept: 'Medicine', fee: 300 });
    check('They post a doctor', r.status === 201, JSON.stringify(r.body));
    const posting = r.body.postingId;
    const tomorrow = (new Date().getDay() + 1) % 7;
    r = await adm('POST', `/api/setup/postings/${posting}/schedules`, { weekday: tomorrow, start: '09:00', end: '12:00', slot: 15 });
    check('…give them a weekly session', r.status === 201, JSON.stringify(r.body));
    r = await adm('POST', `/api/setup/${hosp}/wards`, { name: 'General — Male', type: 'General', sex: 'Male' });
    check('…add a ward', r.status === 201, JSON.stringify(r.body));
    r = await adm('POST', `/api/setup/wards/${r.body.wardId}/beds`, { prefix: 'GM', count: 10 });
    check('…with ten beds', r.status === 201 && r.body.lastBed === 'GM-10', JSON.stringify(r.body));
    r = await adm('POST', '/api/accounts', { username: 'kaliakair.desk', role: 'receptionist', hospitalId: hosp, staffName: 'Rahim Desk' });
    check('…and create a receptionist', r.status === 201);
    const deskOtp = r.body.oneTimePassword;

    const desk = client();
    await desk('POST', '/api/login', { username: 'kaliakair.desk', password: deskOtp });
    r = await desk('POST', '/api/me/password', { current: deskOtp, next: 'tea garden morning' });
    check('The receptionist signs in and sets a password', r.status === 200);
    r = await desk('POST', '/api/patients', { name: 'Abdul Kader', dob: '1970-03-14', sex: 'Male', blood: 'O+', phone: '01711-000001',
      nid: '1970261100001', district: 'Gazipur', address: 'Kaliakair', kinName: 'Rokeya Kader', kinRelation: 'wife', kinPhone: '01711-000002' });
    check('…registers the hospital’s first patient, who gets a UHID', r.status === 201 && /^BD-\d{4}-\d{5}-\d$/.test(r.body.uhid), JSON.stringify(r.body));
    const uhid = r.body.uhid;
    r = await desk('GET', `/api/doctors/${posting}/availability?days=8`);
    const slot = r.body.flatMap(d => d.slots).find(s => !s.taken);
    check('The new doctor’s slots are offered', Boolean(slot));
    r = await desk('POST', '/api/appointments', { postingId: posting, uhid, slotStart: slot.start });
    check('…and the patient is booked into the first one', r.status === 201, JSON.stringify(r.body));
    r = await desk('GET', '/api/appointments?days=8');
    check('It is on the hospital’s appointment list', r.status === 200 && r.body.some(a => a.uhid === uhid));

    server.close();
  } finally {
    if (saved) {
      console.log(`\nRestoring the database from before the test (${saved})…`);
      const rs = node(['db/restore.js', saved]);
      if (rs.status !== 0) console.error('RESTORE FAILED — ' + rs.stderr + '\nRestore it by hand:  npm run db:restore -- ' + saved);
      else console.log(rs.stdout.trim().split('\n').pop());
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed.`);
  if (failures.length) { failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
