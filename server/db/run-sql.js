/* ============================================================
   Run a .sql file through Node, the way the mysql client would.

   Why this exists: the mysql command-line client understands
   `DELIMITER $$`, but that is a feature of the CLIENT, not of
   MySQL itself — the server never sees the word DELIMITER. The
   mysql2 package sends exactly one statement per query() call and
   knows nothing about delimiters. So this file does the client's
   job: it reads the SQL, tracks the current delimiter, cuts the
   text into single statements, and sends them one at a time.

   It has to understand quotes and comments while it cuts, because
   seed.sql has semicolons INSIDE strings ('...accident; no consent
   possible') and those must not end a statement.

   Usage:  node db/run-sql.js ../database/tests.sql
   Used by db/reset.js, which runs all the database files in order.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/* Split SQL text into statements. Returns [{ sql, line }], where
   line is the line number the statement starts on — used in error
   messages so a failure points at the right place in the file. */
function splitStatements(text) {
  const out = [];
  let delimiter = ';';
  let buf = '';
  let startLine = 1;
  let line = 1;
  let i = 0;

  const flush = () => {
    const sql = buf.trim();
    if (sql) out.push({ sql, line: startLine });
    buf = '';
  };

  while (i < text.length) {
    // At the start of a line, a DELIMITER directive changes the rules.
    const atLineStart = i === 0 || text[i - 1] === '\n';
    if (atLineStart) {
      const rest = text.slice(i, text.indexOf('\n', i) === -1 ? undefined : text.indexOf('\n', i));
      const m = rest.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
      if (m) {
        flush();
        delimiter = m[1];
        i += rest.length;
        continue;
      }
      if (!buf.trim()) startLine = line;
    }

    const ch = text[i];
    const two = text.slice(i, i + 2);

    // -- comment or # comment: skip to end of line.
    if (two === '--' || ch === '#') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      continue;
    }
    // /* block comment */
    if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const chunk = text.slice(i, end === -1 ? text.length : end + 2);
      line += (chunk.match(/\n/g) || []).length;
      i += chunk.length;
      continue;
    }
    // A quoted string or identifier: copy it whole, honouring '' and \' escapes.
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\' && ch !== '`') { j += 2; continue; }
        if (text[j] === ch) {
          if (text[j + 1] === ch) { j += 2; continue; }   // doubled quote = literal quote
          break;
        }
        j++;
      }
      const chunk = text.slice(i, j + 1);
      line += (chunk.match(/\n/g) || []).length;
      buf += chunk;
      i = j + 1;
      continue;
    }
    // The delimiter ends a statement.
    if (text.startsWith(delimiter, i)) {
      flush();
      i += delimiter.length;
      continue;
    }

    if (ch === '\n') line++;
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function connect(database) {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    dateStrings: true
  });
}

/* Run one file on an open connection. Stops at the first error and
   says which file, which line, and what MySQL said. */
async function runFile(conn, file, { quiet = false } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(text);
  for (const st of statements) {
    try {
      const [result] = await conn.query(st.sql);
      // A SELECT in the file (tests.sql uses them to report) prints its rows.
      if (!quiet && Array.isArray(result) && result.length && !Array.isArray(result[0])) {
        console.table(result);
      }
    } catch (err) {
      const where = `${path.basename(file)} line ${st.line}`;
      const first = st.sql.split('\n')[0].slice(0, 90);
      const e = new Error(`${where}: ${err.message}\n    statement starts: ${first}`);
      e.cause = err;
      throw e;
    }
  }
  return statements.length;
}

module.exports = { splitStatements, connect, runFile };

// Run directly: node db/run-sql.js <file>
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node db/run-sql.js <file.sql>'); process.exit(1); }
  (async () => {
    const conn = await connect(process.env.DB_NAME || 'uhid');
    try {
      const n = await runFile(conn, path.resolve(file));
      console.log(`${path.basename(file)}: ${n} statements OK`);
    } finally {
      await conn.end();
    }
  })().catch(err => { console.error(err.message); process.exit(1); });
}
