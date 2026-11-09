import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE } from './demo.mjs';

// The console scenes play back real output saved by capture-terminal.mjs.
export const CARD_URL = pathToFileURL(path.join(HERE, 'card.html')).href;
export const TERM_URL = pathToFileURL(path.join(HERE, 'terminal.html')).href;
export const termFile = (f) => readFileSync(path.join(HERE, 'out', 'term', f), 'utf8').replace(/\r/g, '');
export const PS = 'PS E:\\hospital-management-system\\server> ';

function raceSteps() {
  const lines = termFile('race.txt').trimEnd().split('\n');
  const split = lines.findIndex((l) => l.startsWith('Dhaka Medical, General Medicine'));
  return [
    { title: 'Windows PowerShell', clear: true },
    { prompt: PS, type: 'npm run race', after: 600 },
    { out: lines.slice(0, split), gap: 110, blank: 260 },
    { wait: 1500 },
    { out: lines.slice(split), gap: 110, blank: 260 },
    { prompt: PS, type: '', after: 2500 },
  ];
}

function sqlSteps() {
  const statements = termFile('session.sql').trim().split('\n');
  const errors = termFile('sql.txt').split('---STDERR---')[1].trim().split('\n')
    .map((l) => l.replace(/ at line \d+:/, ':'));            // the interactive client prints no line number
  const steps = [{ title: 'MySQL 8.4 Command Line Client — root@localhost, database uhid', clear: true }];
  const notes = ['-- Decision 7: nobody writes a bed status by hand', '-- Decision 2: the access log is append-only',
    '-- Amoxicillin for a patient allergic to Penicillin', '-- Decision 1: a UHID with a wrong check digit'];
  statements.forEach((s, i) => {
    steps.push({ out: [notes[i]], cls: 'dim', gap: 300 });
    steps.push({ prompt: 'mysql> ', type: s, cps: 34, before: 500, after: 500 });
    steps.push({ out: [errors[i], ''], gap: 2600 });
  });
  steps.push({ prompt: 'mysql> ', type: '', after: 1500 });
  return steps;
}

function dbTestSteps() {
  const rows = termFile('dbtest.txt').split('\n').filter((l) => /'PASS'|'FAIL'/.test(l)).map((l) => {
    const c = l.split('│').map((x) => x.trim());
    // columns: (index) test_no result name expected got message
    const name = c[4].replace(/^['"]|['"]$/g, '');
    return `${c[3].replace(/'/g, '').padEnd(5)} ${c[2].padStart(3)}  ${name.length > 74 ? name.slice(0, 73) + '…' : name.padEnd(74)}  ${c[6].replace(/^'|'$/g, '')}`;
  });
  return [
    { title: 'Windows PowerShell', clear: true },
    { prompt: PS, type: 'npm run db:test', after: 600 },
    { out: ['', termFile('dbtest.txt').split('\n').find((l) => l.startsWith('Database rebuilt')), ''], cls: 'dim', gap: 300 },
    { out: rows, gap: 22, cls: 'ok' },
    { out: ['', 'tests.sql: 356 statements OK'], gap: 400 },
    { wait: 3000 },
  ];
}

// The scenes of the demo video, in order. Each follows a part of docs/demo-script.md.
// `setup` runs before the recorder starts (signing in, opening the page); `run` is what is filmed.
// The scenes depend on each other (the encounter in s7 feeds the lab in s8, the break-glass read in
// s7 feeds the review in s9), so a full take runs them all, in order, on a freshly reset database.

export const scenes = [
  {
    id: 's00-title',
    title: 'Opening card',
    async setup(d) { await d.goto(CARD_URL + '?blank#none'); await d.pause(300); },
    async run(d, shot) { await d.goto(CARD_URL + '?show#title'); await d.pause(2500); await shot('card'); await d.pause(4000); },
  },
  {
    id: 's01-public-site',
    caption: ['The public site', 'No sign-in needed: hospitals, doctors and next free slots, live from MySQL'],
    title: 'The public site',
    async setup(d) { await d.goto('/'); await d.pause(1200); },
    async run(d, shot) {
      await d.pause(2000);
      await shot('caption');
      await d.pause(500);
      await d.hover({ text: 'A Database Management System course project' }, 1800);
      await d.moveTo(760, 600, 700);
      await d.scrollTo({ text: 'Connected hospitals', sel: 'div, span, strong, p' }, 'center', 1400);
      await d.pause(1500);
      await d.scrollTo({ sel: '#doctors' }, 'start', 1500);
      await d.pause(3500);
    },
  },
  {
    id: 's02-registration',
    caption: ['Registration · decision 1', 'Duplicates checked on NID, name + date of birth and mobile before a UHID is issued'],
    title: 'Registration and the duplicate check',
    async setup(d) { await d.goto('/login.html'); await d.pause(800); },
    async run(d, shot) {
      await d.login('rezaul');
      await shot('caption-after-login');
      await d.waitFor({ sel: '#f-name' });
      await d.pause(800);
      await d.type({ sel: '#f-name' }, 'Md. Rahim');
      await d.keys({ sel: '#f-dob' }, '04121978');
      await d.pause(2500);
      await shot('duplicates');
      await d.hover({ text: 'Possible existing records' }, 2500);
      await d.click({ sel: '#clear-btn' }, { after: 800 });
      await d.type({ sel: '#f-nid' }, '1999000000009');
      await d.type({ sel: '#f-name' }, 'Nusrat Jahan');
      await d.keys({ sel: '#f-dob' }, '03151996');
      await d.choose({ sel: '#f-sex' }, 'Female');
      await d.type({ sel: '#f-phone' }, '01812-445566');
      await d.type({ sel: '#f-allergy' }, 'Penicillin');
      await d.click({ text: 'Issue UHID & create record', sel: 'button' }, { after: 2500 });
      await shot('issued');
      await d.hover({ sel: '.modal .uhid' }, 3000);
      await d.click({ text: 'Register another', sel: 'button' }, { after: 800 });
      await d.type({ sel: '#f-nid' }, '1999000000009');
      await d.type({ sel: '#f-name' }, 'Someone Else');
      await d.keys({ sel: '#f-dob' }, '01011990');
      await d.click({ text: 'Issue UHID & create record', sel: 'button' }, { after: 1200 });
      await shot('refused');
      await d.pause(3500);
    },
  },
  {
    id: 's03-reception-view',
    caption: ['What reception may see · decision 2', 'Demographics and allergies only: the database withholds clinical history'],
    title: 'What reception may see',
    async run(d, shot) {
      await d.click({ text: 'Find patient', sel: '#nav a' }, { after: 900 });
      await d.type({ sel: '#view input' }, 'Rahim', { after: 1500 });
      await d.click({ sel: '[data-open="BD-2019-04821-5"]' }, { after: 2200 });
      await shot('demographics');
      await d.hover({ text: 'Demographics only', sel: 'div, p, strong, span' }, 3000);
      await d.moveTo(700, 560, 700);
      await d.pause(2500);
    },
  },
  {
    id: 's04-booking',
    caption: ['Booking · decisions 3 and 4', 'Free slots computed from schedule, leave and bookings; booked in a locked transaction'],
    title: 'Booking from computed availability',
    async setup(d) { await d.goto('/pages/book.html?uhid=BD-2020-27615-1'); await d.pause(1500); },
    async run(d, shot) {
      await d.pause(1500);
      await d.click({ sel: '[data-doc]', within: { text: 'Anisur Rahman', sel: '.card.doc' } }, { after: 2000 });
      await shot('slots');
      await d.hover({ sel: 'button.slot[disabled]' }, 2500);
      await d.click({ sel: 'button.slot:not([disabled])', nth: 3 }, { after: 800 });
      await d.click({ sel: '#confirm' }, { after: 1000 });
      await shot('confirm');
      await d.click({ sel: '.modal [data-ok]' }, { after: 2500 });
      await shot('booked');
      await d.pause(1500);
    },
  },
  {
    id: 's05-race',
    caption: ['The double-booking race · decision 4', 'Two receptionists, one slot, the same instant: exactly one booking'],
    title: 'Two receptionists, one slot, the same instant',
    async setup(d) { await d.goto(TERM_URL); await d.pause(600); },
    async run(d, shot) {
      await d.tab.eval(`play(${JSON.stringify(raceSteps())})`);
      await shot('end');
    },
  },
  {
    id: 's06-wards',
    caption: ['Wards and beds · decision 7', 'Bed status is changed by triggers on admission, transfer and discharge'],
    title: 'Beds change state by trigger',
    async setup(d) { await d.goto('/pages/wards.html'); await d.pause(1500); },
    async run(d, shot) {
      await d.pause(2000);
      await d.click({ sel: 'button.bed', text: 'GM-04' }, { after: 900 });
      await d.type({ sel: '#ad-q' }, 'Karim');
      await d.click({ sel: '#ad-find' }, { after: 1500 });
      await shot('admit-form');
      await d.type({ sel: '#ad-dx' }, 'Community-acquired pneumonia');
      await d.click({ text: 'Admit patient', sel: '.modal button' }, { after: 2500 });
      await shot('admitted');
      await d.hover({ sel: 'button.bed', text: 'GM-04' }, 2000);
      await d.click({ sel: 'button.bed', text: 'GM-04' }, { after: 900 });
      await d.click({ sel: '[data-transfer]' }, { after: 900 });
      await d.choose({ sel: '#tr-bed' }, 'GF-03');
      await d.click({ text: 'Transfer', sel: '.modal button[data-ok]' }, { after: 2200 });
      await shot('refused');
      await d.pause(2500);
      await d.click({ sel: '.modal [data-close]' }, { after: 600 }).catch(() => {});
      await d.click({ sel: 'button.bed', text: 'GM-04' }, { after: 900 });
      await d.click({ sel: '[data-transfer]' }, { after: 900 });
      await d.choose({ sel: '#tr-bed' }, 'GM-08');
      await d.click({ text: 'Transfer', sel: '.modal button[data-ok]' }, { after: 2500 });
      await shot('transferred');
      await d.hover({ sel: 'button.bed', text: 'GM-08' }, 2500);
      await d.click({ sel: 'button.bed', text: 'GM-08' }, { after: 900 });
      await d.click({ sel: '[data-discharge]' }, { after: 900 });
      await d.type({ sel: '#dc-sum' }, 'Improving on antibiotics.', { after: 400 });
      await d.click({ sel: '.modal [data-ok]' }, { after: 2200 });
      await shot('discharge-refused');
      await d.pause(2500);
      await d.click({ sel: '.modal [data-close]' }, { after: 600 }).catch(() => {});
      await d.signout();
    },
  },
  {
    id: 's07-national-record',
    caption: ['The national record · decisions 2 and 6', 'Read under the consent a referral granted; every read is logged first'],
    title: 'A doctor opens the national record',
    async run(d, shot) {
      await d.login('anisur');
      await d.click({ sel: '#nav a', text: 'Find patient' }, { after: 900 });
      await d.type({ sel: '#view input' }, 'Rahim', { after: 1500 });
      await d.click({ sel: '[data-open="BD-2019-04821-5"]' }, { after: 2500 });
      await shot('record');
      await d.hover({ sel: '#consent-btn' }, 2200);
      await d.scrollBy(380, 1400);
      await d.pause(1500);
      await d.scrollBy(500, 1400);
      await d.pause(1500);
      await d.scrollBy(500, 1400);
      await d.pause(1200);
      await d.scrollTo({ sel: '[data-tab="access"]' }, 'start', 1200);
      await d.click({ sel: '[data-tab="access"]' }, { after: 1800 });
      await shot('access-log');
      await d.pause(2000);
    },
  },
  {
    id: 's08-encounter',
    caption: ['Recording a visit · decision 5', 'Seven procedure calls in one transaction: saved whole or not at all'],
    title: 'Recording a visit: saved whole or not at all',
    async run(d, shot) {
      await d.scrollBy(-3000, 1000);
      await d.click({ text: 'Record encounter', sel: 'a' }, { after: 2200 });
      await shot('form');
      await d.type({ sel: '#e-complaint' }, 'Hypertension follow-up');
      await d.type({ sel: '#v-sys' }, '150', { cps: 8 });
      await d.type({ sel: '#v-dia' }, '95', { cps: 8 });
      await d.type({ sel: '#dx-pick' }, 'I10');
      await d.click({ sel: '#dx-add' }, { after: 700 });
      await d.choose({ sel: '#rx-med' }, 'Amlodipine');
      if (!(await d.text({ sel: '#rx-dose' }))) await d.type({ sel: '#rx-dose' }, '1 tablet');
      await d.click({ sel: '#rx-add' }, { after: 700 });
      await d.choose({ sel: '#rx-med' }, 'Amoxicillin');
      await d.click({ sel: '#rx-add' }, { after: 700 });
      await d.click({ sel: 'label.chip', text: 'Haemoglobin' }, { after: 600 });
      await d.click({ sel: '#save-close' }, { after: 2500 });
      await shot('rolled-back');
      await d.hover({ sel: '#enc-err' }, 3500);
      await d.click({ sel: '[data-rx-del="1"]' }, { after: 800 });
      await d.click({ sel: '#save-close' }, { after: 3000 });
      await shot('saved');
      await d.pause(2500);
    },
  },
  {
    id: 's09-referral-breakglass',
    caption: ['Referral and break-glass · decisions 6 and 2', 'Emergency access is allowed, but never silent'],
    title: 'Referral, and break-glass access',
    async run(d, shot) {
      await d.click({ sel: '[data-refer]' }, { after: 900 });
      await d.choose({ sel: '#rf-to' }, 'Square');
      await d.choose({ sel: '#rf-dept' }, 'Cardiology');
      await d.choose({ sel: '#rf-urg' }, 'urgent');
      await d.type({ sel: '#rf-reason' }, 'Echocardiogram');
      await d.click({ sel: '#rf-agree' }, { after: 500 });
      await shot('refer-form');
      await d.click({ sel: '.modal [data-ok]' }, { after: 2500 });
      await shot('referred');
      await d.click({ sel: '#nav a', text: 'Find patient' }, { after: 900 });
      await d.type({ sel: '#view input' }, 'Fatema', { after: 1500 });
      await d.click({ sel: '[data-open="BD-2021-11904-5"]' }, { after: 2500 });
      await shot('refused');
      await d.pause(1500);
      await d.click({ sel: '#bg-open' }, { after: 900 });
      await d.type({ sel: '#bg-reason' }, 'Unconscious in emergency');
      await d.click({ sel: '.modal [data-ok]' }, { after: 2500 });
      await shot('break-glass');
      await d.pause(1500);
      await d.scrollTo({ sel: '[data-tab="access"]' }, 'start', 1200);
      await d.click({ sel: '[data-tab="access"]' }, { after: 2500 });
      await shot('access-log');
      await d.pause(1500);
    },
  },
  {
    id: 's10-discharge',
    caption: ['Discharge · decision 7', 'Only a doctor may discharge; a trigger sets the bed to cleaning'],
    title: 'A doctor discharges',
    async run(d, shot) {
      await d.click({ sel: '#nav a', text: 'Wards' }, { after: 1800 });
      await d.click({ sel: 'button.bed', text: 'GM-08' }, { after: 900 });
      await d.click({ sel: '[data-discharge]' }, { after: 900 });
      await d.choose({ sel: '#dc-out' }, 'Improved');
      await d.type({ sel: '#dc-sum' }, 'Pneumonia resolved on oral antibiotics. Review in clinic in two weeks.', { cps: 22 });
      await d.click({ sel: '.modal [data-ok]' }, { after: 2500 });
      await shot('discharged');
      await d.hover({ sel: 'button.bed', text: 'GM-08' }, 2500);
      await d.signout();
    },
  },
  {
    id: 's11-lab',
    caption: ['The lab worklist · decision 5', 'Abnormal is decided by a trigger from the test’s reference range'],
    title: 'The lab: abnormal decided by a trigger',
    async run(d, shot) {
      await d.login('rumana');
      await d.waitFor({ sel: '.qrow' });
      await d.pause(1500);
      const row = { sel: '.qrow', text: 'Md. Rahim Uddin', nth: -1 };
      await d.click({ sel: '[data-collect]', within: row }, { after: 2000 });
      await d.type({ sel: 'input', within: { sel: '.qrow', text: 'Md. Rahim Uddin', nth: -1 } }, '10.2', { cps: 6 });
      await d.click({ sel: 'button', text: 'Report', within: { sel: '.qrow', text: 'Md. Rahim Uddin', nth: -1 } }, { after: 2500 });
      await shot('reported');
      await d.scrollTo({ text: 'Abnormal', sel: 'span, b, strong, .pill' }, 'center', 1200);
      await d.pause(3000);
      await d.signout();
    },
  },
  {
    id: 's12-admin',
    caption: ['The administrator · decisions 2 and 1', 'Review emergency reads; merge a duplicate patient in one transaction'],
    title: 'The administrator: review and merge',
    async run(d, shot) {
      await d.login('nasima');
      await d.waitFor({ sel: '[data-review]' });
      await d.pause(2000);
      await shot('queue');
      await d.click({ sel: '[data-review]' }, { after: 900 });
      await d.choose({ sel: '#rv-verdict' }, 'Justified');
      await d.click({ sel: '.modal [data-ok]' }, { after: 2200 });
      await shot('reviewed');
      await d.click({ sel: '#nav a', text: 'Merge records' }, { after: 2000 });
      await shot('duplicates');
      await d.click({ sel: '[data-pair]', within: { sel: 'tr, li, .card, div', text: 'Md. Rahim Uddin' } }, { after: 1800 });
      await shot('compare');
      await d.pause(1500);
      await d.type({ sel: '#m-reason' }, 'Same person: NID checked');
      await d.click({ sel: '#m-go' }, { after: 1000 });
      await d.click({ sel: '.modal [data-ok]' }, { after: 2800 });
      await shot('merged');
      await d.pause(1500);
      await d.signout();
    },
  },
  {
    id: 's13-patient',
    caption: ['The patient’s own view', 'A patient sees their record, and everyone who has read it'],
    title: 'The patient sees who read their record',
    async run(d, shot) {
      await d.login('rahim');
      await d.waitFor({ sel: '.card.doc' });   // the landing page re-renders its nav once the doctors load
      await d.pause(2500);
      await d.click({ sel: '#nav a', text: 'My health record' }, { after: 2500 });
      await shot('record');
      await d.scrollBy(450, 1400);
      await d.pause(1500);
      await d.scrollTo({ sel: '[data-tab="access"]' }, 'start', 1200);
      await d.click({ sel: '[data-tab="access"]' }, { after: 2500 });
      await shot('access-log');
      await d.pause(3000);
      await d.signout();
    },
  },
  {
    id: 's14-database',
    caption: ['The database itself', 'The same rules, refused by MySQL with no web page involved'],
    title: 'The database refuses, with no web page involved',
    async setup(d) { await d.goto(TERM_URL); await d.pause(600); },
    async run(d, shot) {
      await d.tab.eval(`play(${JSON.stringify(sqlSteps())})`);
      await shot('sql');
    },
  },
  {
    id: 's15-tests',
    caption: ['309 tests', 'Every constraint, trigger and procedure rule, proved with its exact error number'],
    title: '309 tests, every one PASS',
    async setup(d) { await d.goto(TERM_URL); await d.pause(600); },
    async run(d, shot) {
      await d.tab.eval(`play(${JSON.stringify(dbTestSteps())})`);
      await shot('tests');
    },
  },
  {
    id: 's16-end',
    title: 'Closing card',
    async setup(d) { await d.goto(CARD_URL + '?blank#none'); await d.pause(300); },
    async run(d, shot) { await d.goto(CARD_URL + '?show#end'); await d.pause(2500); await shot('card'); await d.pause(4000); },
  },
];
