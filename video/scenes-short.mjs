// The 2-minute cut of the demo video (node record.mjs --short → video/out/clips-short/).
// Same flows as scenes.mjs and docs/demo-script.md, but only each part's key moment: sign-ins and
// page openings happen in `setup`, before the recorder runs, and the pointer and typing are quicker.
// Budget: about 115 s of clips, so the edit stays under 2:00.
import { CARD_URL, TERM_URL, termFile, PS } from './scenes.mjs';

const FAST = { move: 230, dwell: 70, cps: 38, keys: 26 };
const CAP_MS = 3300;

async function signInAs(d, user, page) {
  await d.goto('/login.html');
  // a signed-in session goes straight to its console; sign out first so each role starts clean
  if (await d.tab.eval(`location.pathname.includes('/pages/')`)) { await d.signout(); await d.goto('/login.html'); }
  await d.login(user);
  if (page) { await d.goto(page); await d.pause(1500); }
}

function raceSteps() {
  // the booking half only, so the clip ends on "5 of 5 rounds ended with exactly one booking."
  const lines = termFile('race.txt').trimEnd().split('\n');
  const split = lines.findIndex((l) => l.startsWith('Dhaka Medical, General Medicine'));
  return [
    { title: 'Windows PowerShell', clear: true },
    { prompt: PS, type: 'npm run race', cps: 30, before: 250, after: 250 },
    { out: lines.slice(0, split).join('\n').trimEnd().split('\n'), gap: 45, blank: 90 },
    { wait: 2200 },
  ];
}

function sqlSteps() {
  const statements = termFile('session.sql').trim().split('\n');
  const errors = termFile('sql.txt').split('---STDERR---')[1].trim().split('\n').map((l) => l.replace(/ at line \d+:/, ':'));
  const pick = [0, 1, 3];   // bed status, access log, wrong check digit
  const steps = [{ title: 'MySQL 8.4 Command Line Client — root@localhost, database uhid', clear: true }];
  for (const i of pick) {
    steps.push({ prompt: 'mysql> ', type: statements[i], cps: 90, before: 200, after: 200 });
    steps.push({ out: [errors[i], ''], gap: 1500 });
  }
  return steps;
}

const list = [
  {
    id: 'c00-title',
    pace: FAST,
    async setup(d) { await d.goto(CARD_URL + '?blank#none'); await d.pause(300); },
    async run(d) { await d.goto(CARD_URL + '?show#title'); await d.pause(4300); },
  },
  {
    id: 'c01-registration',
    caption: ['Registration · decision 1', 'Duplicates are checked before a UHID is issued'],
    captionMs: CAP_MS,
    async setup(d) { await signInAs(d, 'rezaul'); await d.waitFor({ sel: '#f-name' }); },
    async run(d) {
      await d.type({ sel: '#f-name' }, 'Md. Rahim');
      await d.keys({ sel: '#f-dob' }, '04121978');
      await d.hover({ text: 'Possible existing records' }, 1700);
      await d.click({ sel: '#clear-btn' }, { after: 400 });
      await d.type({ sel: '#f-nid' }, '1999000000009');
      await d.type({ sel: '#f-name' }, 'Nusrat Jahan');
      await d.keys({ sel: '#f-dob' }, '03151996');
      await d.click({ text: 'Issue UHID & create record', sel: 'button' }, { after: 1300 });
      await d.hover({ sel: '.modal .uhid' }, 1600);
    },
  },
  {
    id: 'c02-booking',
    caption: ['Booking · decisions 3 and 4', 'Free slots are computed live; booking runs in a locked transaction'],
    captionMs: CAP_MS,
    async setup(d) { await d.goto('/pages/book.html?uhid=BD-2020-27615-1'); await d.waitFor({ sel: '[data-doc]' }); await d.pause(800); },
    async run(d) {
      await d.click({ sel: '[data-doc]', within: { text: 'Anisur Rahman', sel: '.card.doc' } }, { after: 1300 });
      await d.hover({ sel: 'button.slot[disabled]' }, 600);
      await d.click({ sel: 'button.slot:not([disabled])', nth: 3 }, { after: 300 });
      await d.click({ sel: '#confirm' }, { after: 600 });
      await d.click({ sel: '.modal [data-ok]' }, { after: 1700 });
    },
  },
  {
    id: 'c03-race',
    caption: ['Race test · decision 4', 'Two receptionists, one slot, the same instant: exactly one booking'],
    captionMs: CAP_MS,
    async setup(d) { await d.goto(TERM_URL); await d.pause(400); },
    async run(d) { await d.tab.eval(`play(${JSON.stringify(raceSteps())})`); },
  },
  {
    id: 'c04-wards',
    caption: ['Wards · decision 7', 'Bed status is set by triggers; a wrong ward is refused'],
    captionMs: CAP_MS,
    async setup(d) { await d.goto('/pages/wards.html'); await d.waitFor({ sel: 'button.bed' }); await d.pause(800); },
    async run(d) {
      await d.click({ sel: 'button.bed', text: 'GM-04' }, { after: 500 });
      await d.type({ sel: '#ad-q' }, 'Karim', { after: 100 });
      await d.click({ sel: '#ad-find' }, { after: 900 });
      await d.type({ sel: '#ad-dx' }, 'Pneumonia', { after: 100 });
      await d.click({ text: 'Admit patient', sel: '.modal button' }, { after: 1100 });
      await d.hover({ sel: 'button.bed', text: 'GM-04' }, 400);
      await d.click({ sel: 'button.bed', text: 'GM-04' }, { after: 500 });
      await d.click({ sel: '[data-transfer]' }, { after: 500 });
      await d.choose({ sel: '#tr-bed' }, 'GF-03', { after: 200 });
      await d.click({ text: 'Transfer', sel: '.modal button[data-ok]' }, { after: 1900 });
    },
  },
  {
    id: 'c05-national-record',
    caption: ['The national record · decisions 2 and 6', 'Opened under the consent a referral granted; every read is logged'],
    captionMs: CAP_MS,
    async setup(d) {
      await signInAs(d, 'anisur', '/pages/search.html');
      await d.type({ sel: '#view input' }, 'Rahim', { after: 1200 });
      await d.click({ sel: '[data-open="BD-2019-04821-5"]' }, { after: 2200 });
    },
    async run(d) {
      await d.hover({ sel: '#consent-btn' }, 1400);
      await d.scrollBy(420, 1100);
      await d.pause(900);
      await d.scrollBy(520, 1100);
      await d.pause(1300);
    },
  },
  {
    id: 'c06-encounter',
    caption: ['Recording a visit · decision 5', 'One transaction: an allergy conflict rolls back every line'],
    captionMs: CAP_MS,
    async setup(d) { await d.scrollBy(-3000, 600); },
    async run(d) {
      await d.click({ text: 'Record encounter', sel: 'a' }, { after: 1000 });
      await d.type({ sel: '#e-complaint' }, 'Hypertension follow-up', { after: 100 });
      await d.type({ sel: '#dx-pick' }, 'I10', { after: 100 });
      await d.click({ sel: '#dx-add' }, { after: 300 });
      await d.choose({ sel: '#rx-med' }, 'Amlodipine', { after: 150 });
      if (!(await d.text({ sel: '#rx-dose' }))) await d.type({ sel: '#rx-dose' }, '1 tablet', { after: 100 });
      await d.click({ sel: '#rx-add' }, { after: 300 });
      await d.choose({ sel: '#rx-med' }, 'Amoxicillin', { after: 150 });
      await d.click({ sel: '#rx-add' }, { after: 300 });
      await d.click({ sel: 'label.chip', text: 'Haemoglobin' }, { after: 200 });
      await d.click({ sel: '#save-close' }, { after: 900 });
      await d.hover({ sel: '#enc-err' }, 1700);
      await d.click({ sel: '[data-rx-del="1"]' }, { after: 300 });
      await d.click({ sel: '#save-close' }, { after: 300 });
      await d.waitFor({ text: 'Arrived', sel: 'span, b, strong, .pill' }, 10000);   // the record has reloaded
      await d.pause(1700);
    },
  },
  {
    id: 'c07-break-glass',
    caption: ['Break-glass · decision 2', 'Emergency access is allowed, but never silent'],
    captionMs: CAP_MS,
    async setup(d) { await d.goto('/pages/search.html'); await d.waitFor({ sel: '#view input' }); await d.pause(600); },
    async run(d) {
      await d.type({ sel: '#view input' }, 'Fatema', { after: 900 });
      await d.click({ sel: '[data-open="BD-2021-11904-5"]' }, { after: 1300 });
      await d.click({ sel: '#bg-open' }, { after: 400 });
      await d.type({ sel: '#bg-reason' }, 'Unconscious in emergency', { after: 100 });
      await d.click({ sel: '.modal [data-ok]' }, { after: 1900 });
    },
  },
  {
    id: 'c08-lab',
    caption: ['Lab · decision 5', 'Abnormal is decided by a trigger, from the reference range'],
    captionMs: CAP_MS,
    async setup(d) { await signInAs(d, 'rumana'); await d.waitFor({ sel: '.qrow' }); await d.pause(600); },
    async run(d) {
      const row = { sel: '.qrow', text: 'Md. Rahim Uddin', nth: -1 };
      await d.click({ sel: '[data-collect]', within: row }, { after: 1200 });
      await d.type({ sel: 'input', within: row }, '10.2', { after: 100 });
      await d.click({ sel: 'button', text: 'Report', within: row }, { after: 2000 });
    },
  },
  {
    id: 'c09-merge',
    caption: ['Merging a duplicate · decision 1', 'Two UHIDs for one person, merged in one transaction'],
    captionMs: CAP_MS,
    async setup(d) { await signInAs(d, 'nasima', '/pages/merge.html'); await d.waitFor({ sel: '[data-pair]' }); },
    async run(d) {
      await d.click({ sel: '[data-pair]', within: { sel: 'tr, li, .card, div', text: 'Md. Rahim Uddin' } }, { after: 1300 });
      await d.type({ sel: '#m-reason' }, 'Same person: NID checked', { after: 100 });
      await d.click({ sel: '#m-go' }, { after: 600 });
      await d.click({ sel: '.modal [data-ok]' }, { after: 1900 });
    },
  },
  {
    id: 'c10-database',
    caption: ['The database itself', 'MySQL refuses these with no web page involved'],
    captionMs: CAP_MS,
    async setup(d) { await d.goto(TERM_URL); await d.pause(400); },
    async run(d) { await d.tab.eval(`play(${JSON.stringify(sqlSteps())})`); await d.pause(600); },
  },
  {
    id: 'c11-end',
    async setup(d) { await d.goto(CARD_URL + '?blank#none'); await d.pause(300); },
    async run(d) { await d.goto(CARD_URL + '?show#end'); await d.pause(4300); },
  },
];

export const scenes = list.map((s) => ({ pace: FAST, ...s }));
