/* ============================================================
   UHID — appointments.html — the appointment list

   One screen, three lists, and the database decides which one you get
   (list_appointments()):
     patient                        their own appointments, everywhere
     doctor                         their own list for the day or week
     receptionist, hospital admin   everything booked at their hospital

   Each row comes with canCancel / canNoShow worked out by the same rules
   cancel_appointment() and mark_no_show() apply, so the buttons shown are
   the ones that will work. The procedures check again when pressed.
   ============================================================ */

const APPT = { rows: [], from: null, days: null };

const STATUS = {
  booked:    ['info', 'Booked'],
  attended:  ['ok',   'Attended'],
  cancelled: ['mute', 'Cancelled'],
  no_show:   ['warn', 'Did not come']
};

const isPatient = () => S.role === 'patient';

async function renderAppointments(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('The day list for a doctor, the hospital’s list for reception, and a patient’s own appointments, with cancel and no-show.');
    return;
  }
  if (!APPT.from) { APPT.from = todayLocal(); APPT.days = isPatient() ? 31 : 1; }
  root.innerHTML = loadingHtml('Reading the appointment list.');
  try { APPT.rows = await API.get(`/appointments?from=${encodeURIComponent(APPT.from)}&days=${Number(APPT.days)}`); }
  catch (e) { root.innerHTML = errorHtml('The appointment list could not be loaded', e.message); return; }
  drawAppointments(root);
}

function heading() {
  if (isPatient()) return ['My appointments', 'Every appointment booked for you, at any connected hospital. You can cancel one until it starts.'];
  if (S.role === 'doctor') return ['My appointments', 'Your own list across every hospital where you hold a posting. Open a visit from here when the patient arrives.'];
  return ['Appointment list', `Everything booked at ${hospital(S.account.hospitalId).name}. Cancel a booking before it starts; once its time has passed, mark a patient who did not come.`];
}

function drawAppointments(root) {
  const [title, intro] = heading();
  const byDay = [];
  for (const a of APPT.rows) {
    const day = String(a.slotStart).slice(0, 10);
    let g = byDay[byDay.length - 1];
    if (!g || g.day !== day) { g = { day, rows: [] }; byDay.push(g); }
    g.rows.push(a);
  }
  const live = APPT.rows.filter(a => a.status === 'booked').length;

  root.innerHTML = `
    <div class="page-h"><h2>${esc(title)}</h2><p>${esc(intro)}</p></div>
    <form class="card appt-bar" id="appt-bar">
      <div><label class="label" for="ap-from">From</label>
        <input class="field" type="date" id="ap-from" value="${esc(APPT.from)}" required></div>
      <div><label class="label" for="ap-days">Showing</label>
        <select class="field" id="ap-days">
          ${[[1, 'that day'], [7, 'a week'], [31, 'a month']].map(([v, l]) =>
            `<option value="${v}"${v === APPT.days ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
      <div class="appt-bar-acts">
        <button type="button" class="btn sm" id="ap-today">Today</button>
        <button class="btn sm primary">Show</button>
      </div>
    </form>
    <div class="sec-h"><h3>${APPT.rows.length} appointment${APPT.rows.length === 1 ? '' : 's'}</h3><span>${live} still booked</span></div>
    ${byDay.length ? byDay.map(g => `
      <div class="sec-h appt-day"><h3>${esc(fmtDay(g.day))}</h3></div>
      <div class="card queue">${g.rows.map(rowHtml).join('')}</div>`).join('')
    : `<div class="card empty-state"><b>No appointments</b>Nothing is booked ${isPatient() ? 'for you ' : ''}in this period.${isPatient() ? ' Book one from <a href="book.html">Find a doctor</a>.' : ' Choose another date above.'}</div>`}`;

  $('#appt-bar').addEventListener('submit', e => {
    e.preventDefault();
    const from = $('#ap-from').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { toast('No date', 'Choose a date to start from.', 'err'); return; }
    APPT.from = from;
    APPT.days = Number($('#ap-days').value);
    renderAppointments(root);
  });
  $('#ap-today').addEventListener('click', () => { APPT.from = todayLocal(); renderAppointments(root); });

  $$('[data-cancel]', root).forEach(b => b.addEventListener('click', () => confirmCancel(root, Number(b.dataset.cancel))));
  $$('[data-noshow]', root).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    try { await API.post(`/appointments/${Number(b.dataset.noshow)}/no-show`); }
    catch (e) { toast('Not marked', e.message, 'err'); return; }
    toast('Marked as missed', 'The slot stays on the record as a no-show.');
    renderAppointments(root);
  })));
}

const fmtDay = ymd => {
  const d = new Date(ymd + 'T00:00');
  const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return ymd === todayLocal() ? `Today — ${label}` : label;
};

function rowHtml(a) {
  const [kind, label] = STATUS[a.status] || ['mute', a.status];
  const isToday = String(a.slotStart).slice(0, 10) === todayLocal();
  const who = isPatient()
    ? `<b>${esc(a.doctorName)}</b><span class="meta">${esc(a.dept)}</span>`
    : `<b>${esc(a.patientName)}</b><span class="meta mono">${esc(a.uhid)}</span>`;
  const what = isPatient()
    ? esc(hospital(a.hospitalId).name)
    : S.role === 'doctor'
      ? `${esc(a.dept)} &middot; ${esc(hospital(a.hospitalId).name)}`
      : `${esc(a.doctorName)} &middot; ${esc(a.dept)}`;
  const acts = [];
  if (S.role === 'doctor' && a.status === 'booked' && isToday) {
    acts.push(`<a class="btn sm primary" href="encounter.html?uhid=${encodeURIComponent(a.uhid)}">Start visit</a>`);
  }
  if (!isPatient() && S.role !== 'doctor') {
    acts.push(`<a class="btn sm ghost" href="record.html?uhid=${encodeURIComponent(a.uhid)}">Record</a>`);
  }
  if (a.canNoShow) acts.push(`<button class="btn sm" data-noshow="${Number(a.id)}">Did not come</button>`);
  if (a.canCancel) acts.push(`<button class="btn sm" data-cancel="${Number(a.id)}">Cancel</button>`);
  return `
    <div class="qrow">
      <span class="mono appt-time">${esc(String(a.slotStart).slice(11, 16))}&ndash;${esc(String(a.slotEnd).slice(11, 16))}</span>
      <div class="who">${who}</div>
      <div class="what">${what}<div class="meta">Booked ${esc(fmtDateTime(a.bookedAt))}${a.cancelledBy ? ` &middot; cancelled by ${esc(a.cancelledBy)}, ${esc(fmtDateTime(a.cancelledAt))}` : ''}</div></div>
      <span class="pill ${kind}"><i class="dot"></i>${esc(label)}</span>
      <div class="acts">${acts.join('')}</div>
    </div>`;
}

function confirmCancel(root, id) {
  const a = APPT.rows.find(x => x.id === id);
  const sc = modal(`
    <div class="modal-h"><h3>Cancel this appointment?</h3>
      <p>${esc(isPatient() ? a.doctorName : a.patientName)}, ${esc(fmtDateTime(a.slotStart))}. The slot becomes free for someone else straight away.</p></div>
    <div class="modal-f"><button class="btn" data-close>Keep it</button><button class="btn primary" data-ok>Cancel appointment</button></div>`);
  $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
    try { await API.del(`/appointments/${Number(id)}`); }
    catch (err) { toast('Not cancelled', err.message, 'err'); return; }
    sc.remove();
    toast('Appointment cancelled', 'The slot is free again.');
    renderAppointments(root);
  }));
}

boot(renderAppointments);
