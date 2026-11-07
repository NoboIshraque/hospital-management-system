/* ============================================================
   npm run db:reset — rebuild the whole database from scratch.

   Runs the files in database/ in the only order that works:
     schema      tables (DROPs and recreates the uhid database)
     triggers    need the tables
     procedures  need the tables; triggers call none of them
     views       call account_name(), a function in procedures.sql
     reference   the lookup data every installation needs (I7)
     seed        the DEMO data; its INSERTs fire the triggers
                 (a real installation runs npm run db:install instead,
                 which leaves seed.sql out)
     grants      needs every procedure and view it grants on

   WARNING: schema.sql starts with DROP DATABASE. Every row you
   added by hand is gone afterwards. That is the point — it is how
   you get back to a known state before a demo.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { connect, runFile } = require('./run-sql');

const { appPassword } = require('./app-password');

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const ORDER = ['schema', 'triggers', 'procedures', 'views', 'reference', 'seed', 'grants'];

(async () => {
  // No database named here: schema.sql creates it and then says USE uhid.
  const conn = await connect();
  try {
    await conn.query('SET @uhid_app_password = ?', [appPassword()]);
    for (const name of ORDER) {
      const file = path.join(DB_DIR, name + '.sql');
      if (!fs.existsSync(file)) { console.log(`  ${name}.sql — not written yet, skipped`); continue; }
      const n = await runFile(conn, file, { quiet: true });
      console.log(`  ${name}.sql — ${n} statements`);
    }

    const [[counts]] = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'uhid' AND table_type = 'BASE TABLE') AS tables_,
        (SELECT COUNT(*) FROM information_schema.views    WHERE table_schema = 'uhid')   AS views_,
        (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'uhid') AS triggers_,
        (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'uhid') AS routines_,
        (SELECT COUNT(*) FROM uhid.patient) AS patients,
        (SELECT COUNT(*) FROM uhid.encounter) AS encounters`);
    console.log(`\nDatabase rebuilt: ${counts.tables_} tables, ${counts.views_} views, ` +
      `${counts.triggers_} triggers, ${counts.routines_} procedures/functions, ` +
      `${counts.patients} patients, ${counts.encounters} encounters.`);
  } finally {
    await conn.end();
  }
})().catch(err => {
  console.error('\nRebuild FAILED — ' + err.message);
  process.exit(1);
});
