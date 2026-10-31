/* ============================================================
   Small helpers that turn database values into the exact shapes
   the screens in public/ already render. Nothing here touches the
   database.
   ============================================================ */

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-11-01 09:20:00' → a local Date. mysql2 returns strings (dateStrings).
const parse = s => new Date(String(s).replace(' ', 'T'));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = s => String(s).slice(11, 16);

// 'Sun 1 Nov' — the day label pages/book.js shows above each row of slots.
const dayLabel = s => { const d = parse(s); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };

// 'today 11:20' · 'tomorrow 09:40' · 'Tue 09:20' — the doctor card's "Next free".
function nextFreeLabel(s) {
  const d = parse(s);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (ymd(d) === ymd(today)) return `today ${hhmm(s)}`;
  if (ymd(d) === ymd(tomorrow)) return `tomorrow ${hhmm(s)}`;
  return `${dayLabel(s)} ${hhmm(s)}`;
}

/* doctor_availability() rows → [{ label, date, slots: [{ time, start, taken }] }]
   — the same shape buildSlots() in pages/book.js used to invent. */
function groupSlotsByDay(rows) {
  const days = [];
  for (const r of rows) {
    const date = String(r.slot_start).slice(0, 10);
    let day = days[days.length - 1];
    if (!day || day.date !== date) {
      day = { date, label: dayLabel(r.slot_start), slots: [] };
      days.push(day);
    }
    day.slots.push({ time: hhmm(r.slot_start), start: r.slot_start, taken: Boolean(r.taken) });
  }
  return days;
}

/* MySQL returns BOOLEAN as 0/1 and DECIMAL as a string. JSON for the
   browser should say true/false and 800, not 1 and '800.00'. */
const bool = v => v === null || v === undefined ? v : Boolean(Number(v));
const num = v => v === null || v === undefined ? v : Number(v);

module.exports = { dayLabel, nextFreeLabel, groupSlotsByDay, bool, num };
