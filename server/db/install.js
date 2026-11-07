/* ============================================================
   npm run db:install — a REAL installation: no demo data.

   db:reset builds the demo (seven hospitals, their doctors and patients,
   accounts that all share demo1234). A hospital network starting for real
   wants none of that. This builds the same database from
     schema, triggers, procedures, views, reference, grants
   — leaving out seed.sql — and creates ONE account: the first system
   administrator, with a one-time password printed here once. They sign in,
   choose their own password, and set up everything else from the screens:
   hospitals (Hospital setup), hospital admins (Staff accounts), and so on.

   It refuses to touch an existing uhid database unless told --replace,
   and even then takes a backup of it first.

   Usage:  npm run db:install
           npm run db:install -- --admin rashed.admin --replace
   ============================================================ */

const path = require('path');
const bcrypt = require('bcryptjs');
const { connect, runFile } = require('./run-sql');
const { appPassword } = require('./app-password');
const { backup } = require('./backup');
const { oneTimePassword } = require('../lib/passwords');

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const ORDER = ['schema', 'triggers', 'procedures', 'views', 'reference', 'grants'];

function option(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

(async () => {
  const replace = process.argv.includes('--replace');
  const adminUser = String(option('admin', 'admin')).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(adminUser)) throw new Error('The admin username must be 3–40 lower-case letters, digits, dots, dashes or underscores.');

  const conn = await connect();
  try {
    const [[exists]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name = 'uhid'");
    if (exists.n && !replace) {
      throw new Error('A uhid database already exists. Nothing was changed.\n' +
        '  To replace it with an empty installation, run:  npm run db:install -- --replace\n' +
        '  (it is backed up first).');
    }
    if (exists.n) {
      const b = await backup('before-install');
      console.log(`  the existing database is saved in ${path.basename(b.file)}`);
    }

    await conn.query('SET @uhid_app_password = ?', [appPassword()]);
    for (const name of ORDER) {
      const n = await runFile(conn, path.join(DB_DIR, name + '.sql'), { quiet: true });
      console.log(`  ${name}.sql — ${n} statements`);
    }

    // The first system administrator. Created directly, as root: there is
    // nobody yet to create it through create_staff_account().
    const password = oneTimePassword();
    await conn.query(`INSERT INTO uhid.user_account (username, password_hash, role_id, staff_name, must_change_password)
                      VALUES (?, ?, (SELECT role_id FROM uhid.role WHERE code = 'system_admin'), 'System Administrator', TRUE)`,
      [adminUser, await bcrypt.hash(password, 10)]);

    console.log(`
Installed: an empty network — no hospitals, doctors or patients yet.

  First administrator   ${adminUser}
  One-time password     ${password}

Write the password down now: it is shown only here, and only its hash is
stored. Sign in at the site and you will be asked to choose your own. Then:
  1. Hospital setup → Hospitals: add each hospital.
  2. Staff accounts: create each hospital's administrator.
  3. Each hospital admin posts doctors, sessions and wards, and creates
     their reception, doctor and lab accounts.

Make sure DEMO_MODE is NOT in server/.env, or the sign-in page lists demo
accounts that do not exist here.`);
  } finally {
    await conn.end();
  }
})().catch(e => { console.error('\nInstall FAILED — ' + e.message); process.exit(1); });
