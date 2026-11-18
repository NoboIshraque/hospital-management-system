// Builds the viva presentation: presentation/out/UHID-presentation.pptx
//
// Three parts, as asked: project details, the work in code, limitations and remarks,
// with the captioned demo video embedded on its own slide. About 3 min 40 s of talk
// without the video; each slide's speaker notes say what to say and how long it takes.
//
// Not part of the site, so its libraries are not in server/package.json. To rebuild:
//   1. bash video/captions/build-captioned.sh <exported video>   (makes the captioned mp4)
//   2. npm install pptxgenjs@3.12.0 react-icons react react-dom sharp   (in any folder)
//   3. APPLY_THEME=<pptx skill>/scripts/apply_theme.js NODE_PATH=<that folder>/node_modules \
//        node presentation/build-deck.js
//      pptxgenjs cannot write theme colours itself; apply_theme.js writes THEME into the
//      file afterwards. Without it the scheme colours fall back to Office's stock palette.

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(__dirname, "out");
const OUT = path.join(OUT_DIR, "UHID-presentation.pptx");
const VIDEO = path.join(ROOT, "video", "out", "UHID-demo-captioned.mp4");
const POSTER = path.join(ROOT, "video", "out", "poster.png");

// The app's own tokens (public/css/tokens.css), plus the amber of the video's call-outs.
const THEME = {
  name: "UHID",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0E1B22",     // --ink
    lt1: "FFFFFF",     // --surface
    dk2: "0C2B3A",     // --rail
    lt2: "EEF2F4",     // --ground
    accent1: "0E6E8C", // --brand
    accent2: "F5B83D", // amber, the call-out colour in the video
    accent3: "47606D", // --ink-2, muted text
    accent4: "A81F2D", // --crit
    accent5: "DDEDF3", // --brand-soft
    accent6: "A9C2CE", // --rail-ink
    hlink: "0E6E8C",
    folHlink: "0A5570",
  },
};
const HEX = THEME.colors;
const MONO = "Consolas";

async function icon(Comp, color = "FFFFFF", size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
  pres.title = "UHID National Hospital Management System";
  pres.author = "Nobo Ishraque";
  pres.subject = "DBMS course project presentation";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  const FOOT = { x: 0.6, y: 6.95, w: 9, h: 0.3 };

  // ------------------------------------------------------------------ layouts
  pres.defineSlideMaster({
    title: "UHID Title",
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: "kicker", type: "body", x: 0.75, y: 1.55, w: 7.2, h: 0.4, fontSize: 14, bold: true, color: C.accent2, charSpacing: 3, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.75, y: 2.0, w: 7.0, h: 1.9, fontSize: 44, bold: true, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.75, y: 4.05, w: 7.0, h: 0.6, fontSize: 24, color: C.accent6, margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "UHID Content",
    background: { color: C.background1 },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 0.38, w: 12, h: 0.32, fontSize: 12, bold: true, color: C.accent1, charSpacing: 2, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.7, w: 12.1, h: 0.75, fontSize: 32, bold: true, color: C.text1, valign: "top", align: "left", margin: 0 }, text: "" } },
      { text: { text: "UHID · DBMS course project · Dept. of ICT, BUP", options: { ...FOOT, fontSize: 10, color: C.accent3, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 6.95, w: 0.5, h: 0.3, fontSize: 10, color: C.accent3, align: "right" },
  });
  pres.defineSlideMaster({
    title: "UHID Dark",
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 0.38, w: 12, h: 0.32, fontSize: 12, bold: true, color: C.accent2, charSpacing: 2, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.7, w: 12.1, h: 0.75, fontSize: 32, bold: true, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 12.2, y: 6.95, w: 0.5, h: 0.3, fontSize: 10, color: C.accent6, align: "right" },
  });

  // Shared pieces -------------------------------------------------------------
  const card = (slide, x, y, w, h, name, fill = C.background2) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.08, objectName: name });
  const circleIcon = (slide, img, x, y, d, name, fill = C.accent1) => {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: name + " circle" });
    const pad = d * 0.25;
    slide.addImage({ data: img, x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, objectName: name + " icon", altText: name });
  };
  const text = (slide, t, opts) => slide.addText(t, { isTextBox: true, margin: 0, valign: "top", ...opts });

  const I = {
    hospital: await icon(fa.FaHospital), id: await icon(fa.FaIdCard), user: await icon(fa.FaUser),
    desk: await icon(fa.FaClipboardUser), doctor: await icon(fa.FaUserDoctor), flask: await icon(fa.FaFlask),
    admin: await icon(fa.FaUserShield), gear: await icon(fa.FaUserGear), db: await icon(fa.FaDatabase),
    server: await icon(fa.FaServer), screen: await icon(fa.FaDesktop), check: await icon(fa.FaCircleCheck),
    lock: await icon(fa.FaLock), cloud: await icon(fa.FaCloud), warn: await icon(fa.FaTriangleExclamation),
    file: await icon(fa.FaFileWaveform), play: await icon(fa.FaPlay),
  };

  // ====================================================================== 1. Title
  {
    pres.addSection({ title: "Project details" });
    const s = pres.addSlide({ masterName: "UHID Title", sectionTitle: "Project details" });
    s.addText("DATABASE MANAGEMENT SYSTEM COURSE PROJECT", { placeholder: "kicker" });
    s.addText("UHID National Hospital Management System", { placeholder: "title" });
    s.addText("One patient. One record. Every hospital.", { placeholder: "body" });
    text(s, [
      { text: "Nobo Ishraque", options: { bold: true, breakLine: true } },
      { text: "with Abir and Noria · Department of ICT, Bangladesh University of Professionals" },
    ], { x: 0.75, y: 5.45, w: 7.4, h: 0.8, fontSize: 16, color: C.accent6 });

    // The UHID itself, as the app shows it, with its four parts named
    const X = 8.45, Y = 2.35;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X, y: Y, w: 4.3, h: 1.0, fill: { color: C.accent5 }, line: { type: "none" }, rectRadius: 0.08, objectName: "UHID chip" });
    text(s, "BD-2026-13052-1", { x: X, y: Y, w: 4.3, h: 1.0, fontFace: MONO, fontSize: 30, bold: true, color: C.accent1, align: "center", valign: "middle" });
    const parts = [["BD", "country"], ["2026", "year issued"], ["13052", "serial"], ["1", "check digit"]];
    parts.forEach(([p, label], i) => {
      text(s, [{ text: p, options: { fontFace: MONO, bold: true, color: C.accent2, breakLine: true } }, { text: label, options: { color: C.accent6 } }],
        { x: X + i * 1.075, y: Y + 1.2, w: 1.075, h: 0.7, fontSize: 13, align: "center" });
    });
    text(s, "1 + 3 + 0 + 5 + 2 = 11  →  check digit 1", { x: X, y: Y + 2.05, w: 4.3, h: 0.6, fontSize: 13, color: C.accent6, align: "center", italic: true });
    s.addNotes(
      "[≈ 15 s] Good morning. This is UHID, a national hospital management and health-record system for our Database Management Systems course. Every patient gets one Unified Health ID, like this one, for life. I'll cover the project, the code, a two-minute demo, and the limitations."
    );
  }

  // ====================================================================== 2. Problem → idea
  {
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Project details" });
    s.addText("1 · PROJECT DETAILS", { placeholder: "kicker" });
    s.addText("One health ID that follows the patient to every hospital", { placeholder: "title" });

    const Y = 1.85, H = 3.9;
    card(s, 0.6, Y, 5.75, H, "Problem card");
    circleIcon(s, I.file, 0.95, Y + 0.35, 0.7, "Paper records", C.accent4);
    text(s, "The problem", { x: 1.85, y: Y + 0.45, w: 4.2, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
    text(s, [
      { text: "Records are kept hospital by hospital, mostly on paper.", options: { bullet: true, breakLine: true } },
      { text: "A patient who moves to another hospital arrives with no history, no allergy list and no medicines.", options: { bullet: true, breakLine: true } },
      { text: "One person can end up with several files that nobody can join.", options: { bullet: true } },
    ], { x: 0.95, y: Y + 1.3, w: 5.1, h: 2.1, fontSize: 16, color: C.text1, paraSpaceAfter: 8 });

    s.addShape(pres.shapes.RIGHT_ARROW, { x: 6.5, y: Y + H / 2 - 0.3, w: 0.45, h: 0.6, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "Arrow" });

    card(s, 7.1, Y, 5.6, H, "Idea card", C.accent5);
    circleIcon(s, I.id, 7.45, Y + 0.35, 0.7, "One ID");
    text(s, "The UHID idea", { x: 8.35, y: Y + 0.45, w: 4.1, h: 0.5, fontSize: 22, bold: true, color: C.text1 });
    text(s, [
      { text: "One UHID per person, issued at first contact and anchored to the national ID.", options: { bullet: true, breakLine: true } },
      { text: "Every connected hospital reads and writes the same record.", options: { bullet: true, breakLine: true } },
      { text: "A referral carries consent, so the next hospital sees the full history.", options: { bullet: true } },
    ], { x: 7.45, y: Y + 1.3, w: 5.0, h: 2.1, fontSize: 16, color: C.text1, paraSpaceAfter: 8 });

    text(s, [
      { text: "Demo data: ", options: { bold: true } },
      { text: "8 hospitals in several divisions · 11 doctors · 18 patients · 28 use cases written up, each mapped to its procedure, trigger or view" },
    ], { x: 0.6, y: 6.1, w: 12.1, h: 0.5, fontSize: 14, color: C.accent3 });
    s.addNotes(
      "[≈ 25 s] Today, records live inside each hospital, mostly on paper, so a patient who moves arrives with no history and no allergy list. Our answer: one UHID per person, anchored to the national ID. Every hospital shares one record, and a referral carries the patient's consent to the next hospital. Each of our 28 use cases maps to a database object."
    );
  }

  // ====================================================================== 3. Roles + architecture
  {
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Project details" });
    s.addText("1 · PROJECT DETAILS", { placeholder: "kicker" });
    s.addText("Six roles, one database, three layers", { placeholder: "title" });

    const roles = [
      [I.desk, "Receptionist", "registers, books, admits to a bed"],
      [I.doctor, "Doctor", "records visits, refers, discharges"],
      [I.flask, "Lab technician", "enters results"],
      [I.admin, "Hospital admin", "reviews break-glass, merges duplicates, hospital setup"],
      [I.gear, "System admin", "hospitals and staff accounts"],
      [I.user, "Patient", "own record, who read it, consents"],
    ];
    roles.forEach(([img, name, what], i) => {
      const y = 1.8 + i * 0.78;
      circleIcon(s, img, 0.6, y, 0.55, name);
      text(s, [{ text: name, options: { bold: true, breakLine: true } }, { text: what, options: { color: C.accent3 } }],
        { x: 1.35, y: y - 0.04, w: 4.95, h: 0.7, fontSize: 14, color: C.text1 });
    });

    // Architecture: three stacked layers with what connects them
    const X = 6.6, W = 6.1;
    const layers = [
      [I.screen, "Browser", "Plain HTML, CSS and JavaScript — 14 console screens and a public site. No framework, no build step."],
      [I.server, "Express API (Node.js)", "60 JSON endpoints. Connects as uhid_app, which may only EXECUTE named procedures and SELECT views."],
      [I.db, "MySQL 8.4", "41 tables, triggers, CHECKs and stored procedures: every business rule lives here."],
    ];
    const between = ["fetch() — JSON", "CALL procedure(…)"];
    layers.forEach(([img, name, what], i) => {
      const y = 1.8 + i * 1.65;
      card(s, X, y, W, 1.2, name + " layer", i === 2 ? C.accent5 : C.background2);
      circleIcon(s, img, X + 0.25, y + 0.3, 0.6, name);
      text(s, [{ text: name, options: { bold: true, fontSize: 17, breakLine: true } }, { text: what, options: { fontSize: 13, color: C.accent3 } }],
        { x: X + 1.05, y: y + 0.15, w: W - 1.3, h: 0.95, color: C.text1 });
      if (i < 2) {
        s.addShape(pres.shapes.DOWN_ARROW, { x: X + 0.4, y: y + 1.24, w: 0.3, h: 0.38, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "Arrow " + i });
        text(s, between[i], { x: X + 0.85, y: y + 1.27, w: 4, h: 0.32, fontSize: 12, fontFace: MONO, color: C.accent1 });
      }
    });
    s.addNotes(
      "[≈ 25 s] Six roles use it, from reception to the patient, who can see who read their record. There are three layers: plain HTML pages call a JSON API, and the API connects as a MySQL user that may only call stored procedures. So every rule lives in the database, not in the web code."
    );
  }

  // ====================================================================== 4. The database in numbers
  {
    pres.addSection({ title: "Work in code" });
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Work in code" });
    s.addText("2 · OUR WORK, IN CODE", { placeholder: "kicker" });
    s.addText("The database carries the project", { placeholder: "title" });
    const stats = [
      ["41", "tables", "normalised to BCNF"],
      ["21", "triggers", "bed state, allergies, append-only log"],
      ["84", "procedures + functions", "76 procedures, 8 functions"],
      ["9", "views", "including the duplicate finder"],
      ["20", "demonstration queries", "ROLLUP, window functions, CTEs"],
      ["309", "database tests", "every one passing, each with its error number"],
    ];
    stats.forEach(([n, label, sub], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.6 + col * 4.1, y = 1.8 + row * 2.2, w = 3.85, h = 1.95;
      card(s, x, y, w, h, label + " stat", i === 5 ? C.accent5 : C.background2);
      text(s, n, { x: x + 0.3, y: y + 0.2, w: w - 0.6, h: 0.95, fontSize: 54, bold: true, color: C.accent1 });
      text(s, [{ text: label, options: { bold: true, breakLine: true } }, { text: sub, options: { color: C.accent3, fontSize: 13 } }],
        { x: x + 0.3, y: y + 1.12, w: w - 0.6, h: 0.75, fontSize: 16, color: C.text1 });
    });
    text(s, "Also written: the ER model in Chen notation, a data dictionary for all 41 tables, and a 1NF → BCNF normalisation write-up.",
      { x: 0.6, y: 6.3, w: 12.1, h: 0.4, fontSize: 14, color: C.accent3 });
    s.addNotes(
      "[≈ 18 s] This is a database course, so the database carries the project: 41 tables in BCNF, 21 triggers, 84 procedures and functions, 9 views, 20 demonstration queries and 309 tests, all passing."
    );
  }

  // ====================================================================== 5. Seven decisions
  {
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Work in code" });
    s.addText("2 · OUR WORK, IN CODE", { placeholder: "kicker" });
    s.addText("Seven design decisions, each enforced by MySQL", { placeholder: "title" });
    const head = { bold: true, color: C.background1, fill: { color: C.accent1 }, fontSize: 14, valign: "middle" };
    const rows = [
      ["1", "One UHID per person", "Live duplicate check; serial from a counter row locked FOR UPDATE; CHECK on the check digit"],
      ["2", "Access is granted, not assumed", "care_basis() decides who may read; consent grants expire; the read procedure writes access_log first; break-glass is flagged"],
      ["3", "Availability is computed, never stored", "doctor_availability(): a recursive CTE — schedule − leave − bookings"],
      ["4", "Booking is transactional", "UNIQUE (doctor_id, active_slot) + SELECT … FOR UPDATE on the doctor"],
      ["5", "The encounter is the clinical hub", "Diagnoses, drugs and tests from catalogues; a trigger refuses a drug the patient is allergic to"],
      ["6", "Referrals make it national", "A referral carries a consent grant to the receiving hospital"],
      ["7", "Bed state changes by trigger", "trg_bed_occupancy_* set the status; trg_bed_bu refuses a direct UPDATE"],
    ];
    const body = rows.map((r, i) => r.map((c, j) => ({
      text: c,
      options: {
        fontSize: 13, color: C.text1, fill: { color: i % 2 ? C.background1 : C.background2 },
        bold: j < 2, fontFace: j === 0 ? MONO : undefined, align: j === 0 ? "center" : "left", valign: "middle",
      },
    })));
    s.addTable([[{ text: "#", options: { ...head, align: "center" } }, { text: "Decision", options: head }, { text: "Enforced in the database by", options: head }], ...body], {
      x: 0.6, y: 1.75, w: 12.1, colW: [0.55, 3.6, 7.95], rowH: 0.62, border: { type: "solid", pt: 0.75, color: HEX.lt2 }, margin: [0.04, 0.12, 0.04, 0.12],
      objectName: "Decisions table",
    });
    s.addNotes(
      "[≈ 35 s] Seven decisions carry the design, each enforced inside MySQL. UHIDs come from a locked counter and a CHECK verifies the check digit. MySQL has no SELECT trigger, so a record can only be read through a procedure that writes the access log first. Free slots are computed by a recursive CTE, never stored. Booking is a locked transaction. An allergy trigger refuses dangerous prescriptions. Referrals carry consent. And only triggers change a bed's status."
    );
  }

  // ====================================================================== 6. Code close-up
  {
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Work in code" });
    s.addText("2 · OUR WORK, IN CODE", { placeholder: "kicker" });
    s.addText("Close-up: two receptionists, one slot", { placeholder: "title" });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.75, w: 7.6, h: 4.95, fill: { color: C.text2 }, line: { type: "none" }, rectRadius: 0.08, objectName: "Code panel" });
    const code = [
      ["-- database/procedures.sql · book_appointment()  (abridged)", C.accent6],
      ["DECLARE EXIT HANDLER FOR 1062            -- duplicate key", C.background1],
      ["BEGIN", C.background1],
      ["  ROLLBACK;", C.background1],
      ["  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =", C.background1],
      ["    'That slot has just been taken by another booking.';", C.accent2],
      ["END;", C.background1],
      ["", C.background1],
      ["START TRANSACTION;", C.background1],
      ["-- serialise on the doctor: one person, one diary", C.accent6],
      ["SELECT doctor_id INTO v_doctor FROM doctor", C.background1],
      ["  WHERE doctor_id = v_doctor FOR UPDATE;", C.accent2],
      ["…  slot on the schedule? doctor on leave? overlap?  …", C.accent6],
      ["INSERT INTO appointment (posting_id, doctor_id, …)", C.background1],
      ["  VALUES (p_posting_id, v_doctor, …);", C.background1],
      ["COMMIT;", C.background1],
    ];
    text(s, code.map(([t, color], i) => ({ text: t || " ", options: { color, breakLine: i < code.length - 1 } })),
      { x: 0.9, y: 1.98, w: 7.1, h: 4.55, fontFace: MONO, fontSize: 13.5, lineSpacingMultiple: 1.15, valign: "middle" });

    const points = [
      ["1", "The lock", "FOR UPDATE on the doctor's row makes the second booking wait until the first one commits."],
      ["2", "The safety net", "UNIQUE (doctor_id, active_slot): even if a lock were missed, the second INSERT fails with error 1062."],
      ["3", "A plain answer", "The handler turns 1062 into a message the receptionist can act on, after a ROLLBACK."],
    ];
    points.forEach(([n, head, body], i) => {
      const y = 1.8 + i * 1.35;
      s.addShape(pres.shapes.OVAL, { x: 8.6, y, w: 0.5, h: 0.5, fill: { color: C.accent2 }, line: { type: "none" }, objectName: "Point " + n });
      text(s, n, { x: 8.6, y, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.text1, align: "center", valign: "middle" });
      text(s, [{ text: head, options: { bold: true, breakLine: true } }, { text: body, options: { color: C.accent3, fontSize: 14 } }],
        { x: 9.3, y: y - 0.03, w: 3.4, h: 1.25, fontSize: 16, color: C.text1 });
    });
    card(s, 8.6, 5.85, 4.1, 0.85, "Race result", C.accent5);
    circleIcon(s, I.check, 8.78, 6.0, 0.55, "Proof");
    text(s, [{ text: "npm run race", options: { fontFace: MONO, bold: true, breakLine: true } }, { text: "5 of 5 rounds: exactly one booking", options: { color: C.accent3 } }],
      { x: 9.45, y: 5.95, w: 3.15, h: 0.7, fontSize: 13, color: C.text1 });
    s.addNotes(
      "[≈ 25 s] Here is decision four in our real code. Inside one transaction, SELECT FOR UPDATE locks the doctor's row, so a second booking waits. A unique key is the safety net: a duplicate insert fails with error 1062, and the handler rolls back with a plain message. Our race test fires two bookings at once: five rounds out of five, exactly one wins."
    );
  }

  // ====================================================================== 7. Backend, frontend, testing
  {
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Work in code" });
    s.addText("2 · OUR WORK, IN CODE", { placeholder: "kicker" });
    s.addText("Around the database: API, pages and tests", { placeholder: "title" });
    const cols = [
      [I.server, "Backend", [
        "Node.js + Express, 60 endpoints; each route checks its input and calls one procedure",
        "Least privilege: uhid_app has no table rights at all",
        "bcrypt passwords, sessions stored in MySQL, login rate limit, Content-Security-Policy",
        "The request log masks UHIDs; who read what lives only in access_log",
      ]],
      [I.screen, "Frontend", [
        "Plain HTML, CSS and JavaScript, as the course requires",
        "14 console screens, one per task, for all six roles",
        "Every screen has loading, empty and error states",
        "Opened from disk, it still runs on sample data, with no server",
      ]],
      [I.check, "Testing", [
        "db:test — 309 / 309 database tests",
        "api:test — 145 / 145 end-to-end API checks",
        "race — 5 / 5 single bookings and 5 / 5 single admissions to one bed",
        "first-day:test — empty install to a booked patient through the app alone",
      ]],
    ];
    cols.forEach(([img, head, items], i) => {
      const x = 0.6 + i * 4.1, y = 1.8, w = 3.85, h = 4.85;
      card(s, x, y, w, h, head + " card", i === 2 ? C.accent5 : C.background2);
      circleIcon(s, img, x + 0.3, y + 0.3, 0.65, head);
      text(s, head, { x: x + 1.1, y: y + 0.42, w: w - 1.3, h: 0.45, fontSize: 20, bold: true, color: C.text1 });
      text(s, items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1 } })),
        { x: x + 0.3, y: y + 1.2, w: w - 0.55, h: h - 1.4, fontSize: 14, color: C.text1, paraSpaceAfter: 9 });
    });
    s.addNotes(
      "[≈ 25 s] Around the database: 60 API endpoints, each validating input and calling one procedure, under a MySQL user with no table rights. Passwords are bcrypt hashes; sessions live in MySQL. The frontend is plain HTML, CSS and JavaScript, fourteen screens. And it is all tested: 309 database tests, 145 API checks, the race test, and a first-day install test."
    );
  }

  // ====================================================================== 8. Demo video
  {
    pres.addSection({ title: "Demo" });
    const s = pres.addSlide({ masterName: "UHID Dark", sectionTitle: "Demo" });
    s.addText("DEMO · 1 MIN 46 S", { placeholder: "kicker" });
    s.addText("The system running, end to end", { placeholder: "title" });
    const W = 9.6, H = W * 9 / 16, X = (13.333 - W) / 2, Y = 1.6;
    const cover = "data:image/png;base64," + fs.readFileSync(POSTER).toString("base64");
    s.addMedia({ type: "video", path: VIDEO, cover, x: X, y: Y, w: W, h: H, objectName: "Demo video" });
    text(s, "Captions under the picture explain each step; amber call-outs point at what the database did. Click the video to play.",
      { x: X, y: Y + H + 0.12, w: W, h: 0.4, fontSize: 13, color: C.accent6, align: "center" });
    s.addNotes(
      "[Video, 1:46 — not counted in the 4 minutes] Now the system itself. The video has captions and call-outs, so it explains itself; I'll stay quiet while it plays. " +
      "Click the video once to start it. If the projector machine cannot play it, the same file is video/out/UHID-demo-captioned.mp4."
    );
  }

  // ====================================================================== 9. Limitations
  {
    pres.addSection({ title: "Limitations and remarks" });
    const s = pres.addSlide({ masterName: "UHID Content", sectionTitle: "Limitations and remarks" });
    s.addText("3 · LIMITATIONS AND REMARKS", { placeholder: "kicker" });
    s.addText("What it does not do yet, and the risks we accepted", { placeholder: "title" });

    const left = [
      [I.cloud, "Not hosted", "Runs on one laptop: no domain, HTTPS, SMS reminders or off-site backups yet."],
      [I.id, "No national NID link", "The NID is checked for format and uniqueness, not against the government registry."],
      [I.hospital, "Demo scale", "8 hospitals, 18 patients, one MySQL server: not load-tested at national scale."],
      [I.lock, "Out of scope", "Two-factor login, encryption at rest, an outside penetration test, health-data law."],
    ];
    text(s, "Not built yet", { x: 0.6, y: 1.72, w: 6, h: 0.4, fontSize: 18, bold: true, color: C.accent1 });
    left.forEach(([img, head, body], i) => {
      const y = 2.25 + i * 1.08;
      circleIcon(s, img, 0.6, y, 0.55, head);
      text(s, [{ text: head, options: { bold: true, breakLine: true } }, { text: body, options: { color: C.accent3, fontSize: 14 } }],
        { x: 1.35, y: y - 0.05, w: 5.2, h: 0.95, fontSize: 15, color: C.text1 });
    });

    card(s, 7.0, 1.72, 5.7, 4.95, "Accepted risks card", C.background2);
    circleIcon(s, I.warn, 7.3, 1.98, 0.55, "Accepted risks", C.accent4);
    text(s, "Accepted risks, written down", { x: 8.05, y: 2.05, w: 4.5, h: 0.45, fontSize: 18, bold: true, color: C.text1 });
    const risks = [
      ["A10", "MySQL trusts the account id the web server passes in; a fully compromised server could act as any user."],
      ["D2", "Procedures run with root's rights. Safe only because no procedure ever builds SQL from text."],
      ["L4", "Root can still TRUNCATE the access log; no trigger fires on TRUNCATE."],
    ];
    risks.forEach(([id, body], i) => {
      const y = 2.85 + i * 1.1;
      text(s, id, { x: 7.3, y, w: 0.75, h: 0.4, fontFace: MONO, fontSize: 15, bold: true, color: C.accent4 });
      text(s, body, { x: 8.05, y, w: 4.4, h: 1.0, fontSize: 14, color: C.text1 });
    });
    text(s, "Each is in docs/er-design.md §8.4, with what a real deployment would add.", { x: 7.3, y: 6.05, w: 5.2, h: 0.45, fontSize: 12, italic: true, color: C.accent3 });
    s.addNotes(
      "[≈ 30 s] Limitations. It isn't hosted yet: one laptop, no HTTPS. The national ID is checked for format and uniqueness, not against the government registry. It is demo scale, one MySQL server. Two-factor login and encryption at rest are out of scope. We also documented three accepted risks: the database trusts the account id the server sends; procedures run with root's rights, safe only because none builds SQL from text; and root could truncate the access log."
    );
  }

  // ====================================================================== 10. Remarks
  {
    const s = pres.addSlide({ masterName: "UHID Dark", sectionTitle: "Limitations and remarks" });
    s.addText("3 · REMARKS", { placeholder: "kicker" });
    s.addText("The database enforces the rules", { placeholder: "title" });
    text(s, "The pages only show what MySQL decided — so no web page can skip a rule.", { x: 0.6, y: 1.5, w: 12, h: 0.5, fontSize: 20, color: C.accent6 });
    const items = [
      [I.check, "What worked", "Rules in triggers and procedures could be tested one by one (309 tests) and cannot be bypassed from the API."],
      [I.db, "What we learned", "Transactions and row locks, a logged read without a SELECT trigger, least-privilege accounts, derived state kept by triggers."],
      [I.cloud, "Next steps", "Hosting with HTTPS, a link to the national NID registry, then replication for national scale."],
    ];
    items.forEach(([img, head, body], i) => {
      const x = 0.6 + i * 4.1, y = 2.45, w = 3.85, h = 2.75;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: C.background1, transparency: 92 }, line: { type: "none" }, rectRadius: 0.08, objectName: head + " card" });
      circleIcon(s, img, x + 0.3, y + 0.3, 0.6, head, C.accent1);
      text(s, head, { x: x + 1.05, y: y + 0.4, w: w - 1.2, h: 0.45, fontSize: 19, bold: true, color: C.background1 });
      text(s, body, { x: x + 0.3, y: y + 1.15, w: w - 0.6, h: h - 1.35, fontSize: 15, color: C.accent6 });
    });
    text(s, "Thank you — questions?", { x: 0.6, y: 5.75, w: 12.1, h: 0.55, fontSize: 24, bold: true, color: C.accent2 });
    s.addNotes(
      "[≈ 20 s] To close: the database enforces the rules, and the pages only show what MySQL decided, so every rule is testable and can't be skipped. Next would be hosting, the NID registry and replication. Thank you, we're happy to take questions."
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await pres.writeFile({ fileName: OUT });
  if (process.env.APPLY_THEME) {
    const { applyTheme } = require(process.env.APPLY_THEME);
    await applyTheme(OUT, THEME);
  }
  console.log("wrote " + OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
