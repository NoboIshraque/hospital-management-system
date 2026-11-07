/* ============================================================
   UHID — setup.html — hospital setup (administrators)

   Everything that used to need seed.sql: who works here, in which
   department, for what fee; their weekly sessions; their leave; the wards
   and beds. A hospital admin sets up their own hospital; the system admin
   picks any hospital, and also adds and closes hospitals.

   Every rule lives in procedures.sql §13, not here: who may change which
   hospital, that a doctor is never in two places at once, that ending a
   posting or a session never strands a booked patient. This screen asks,
   and shows the database's answer.
   ============================================================ */

const SET = { hospitalId: null, data: null, tab: 'doctors', hospitals: [] };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isSys = () => !S.account.hospitalId;

async function renderSetup(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('Administrators post doctors, set fees, weekly sessions and leave, and add wards and beds here.');
    return;
  }
  if (!SET.hospitalId) SET.hospitalId = S.account.hospitalId || (HOSPITALS[0] && HOSPITALS[0].id);
  root.innerHTML = loadingHtml('Reading the hospital setup.');
  try {
    if (isSys()) SET.hospitals = await API.get('/setup/hospitals');
    SET.data = await API.get(`/setup/${Number(SET.hospitalId)}`);
  } catch (e) { root.innerHTML = errorHtml('The setup could not be loaded', e.message); return; }
  drawSetup(root);
}

function hospitalName(id) {
  const h = SET.hospitals.find(x => x.id === id) || hospital(id);
  return h.name;
}

function drawSetup(root) {
  const tabs = [['doctors', 'Doctors and fees'], ['sessions', 'Weekly sessions'], ['leave', 'Leave'], ['wards', 'Wards and beds']]
    .concat(isSys() ? [['hospitals', 'Hospitals']] : []);
  root.innerHTML = `
    <div class="page-h">
      <h2>Hospital setup</h2>
      <p>${isSys() ? 'Choose a hospital to set up. As system administrator you also add hospitals to the network.' : `Doctors, sessions, leave, wards and beds at ${esc(hospitalName(SET.hospitalId))}.`} Patients book from what is set here the moment it is saved: availability is worked out from it, never stored.</p>
    </div>
    ${isSys() ? `<div class="card appt-bar" style="grid-template-columns:minmax(0,420px)"><div><label class="label" for="st-hosp">Hospital</label>
      <select class="field" id="st-hosp">${SET.hospitals.filter(h => h.active).map(h =>
        `<option value="${Number(h.id)}"${h.id === SET.hospitalId ? ' selected' : ''}>${esc(h.name)} &mdash; ${esc(h.dist)}</option>`).join('')}</select></div></div>` : ''}
    <div class="tabs" role="tablist" aria-label="Setup">${tabs.map(([k, l]) =>
      `<button role="tab" data-tab="${k}" aria-selected="${k === SET.tab}" class="${k === SET.tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="st-body"></div>`;
  if ($('#st-hosp')) $('#st-hosp').addEventListener('change', e => { SET.hospitalId = Number(e.target.value); renderSetup(root); });
  $$('[data-tab]', root).forEach(b => b.addEventListener('click', () => { SET.tab = b.dataset.tab; drawSetup(root); }));
  ({ doctors: drawDoctors, sessions: drawSessions, leave: drawLeave, wards: drawWards, hospitals: drawHospitals })[SET.tab]($('#st-body'), root);
}

/* Every change goes through here: post it, say what happened, reload. */
async function save(root, method, url, body, done) {
  let r;
  try { r = method === 'DELETE' ? await API.del(url) : await API.post(url, body); }
  catch (e) { toast('Not saved', e.message, 'err'); return false; }
  toast('Saved', typeof done === 'function' ? done(r) : done);
  await renderSetup(root);
  return true;
}

const money = n => `৳${Number(n).toLocaleString('en-IN')}`;

/* ---------------- doctors and fees ---------------- */
function drawDoctors(box, root) {
  const ps = SET.data.postings;
  box.innerHTML = `
    <div class="sec-h" style="margin-top:0"><h3>${ps.length} doctor posting${ps.length === 1 ? '' : 's'}</h3><button class="btn sm primary" id="st-post">Post a doctor&hellip;</button></div>
    ${ps.length ? `<div class="card queue">${ps.map(p => `
      <div class="qrow">
        <div class="who"><b>${esc(p.doctor)}</b><span class="meta"><span class="mono">${esc(p.bmdc)}</span> &middot; ${esc(p.qual)}</span></div>
        <div class="what"><b>${esc(p.dept)}</b> &middot; ${money(p.fee)}
          <div class="meta">From ${esc(fmtDate(p.validFrom))}${p.validTo ? ` to ${esc(fmtDate(p.validTo))}` : ''} &middot; ${Number(p.bookedAhead)} booked ahead</div></div>
        <div class="acts">
          <button class="btn sm" data-fee="${Number(p.id)}">Fee&hellip;</button>
          ${p.validTo ? '' : `<button class="btn sm" data-end="${Number(p.id)}">End posting&hellip;</button>`}
        </div>
      </div>`).join('')}</div>`
    : '<div class="card empty-state"><b>No doctors posted</b>Post the first one with <i>Post a doctor</i>.</div>'}`;

  $('#st-post').addEventListener('click', () => {
    const sc = modal(`
      <div class="modal-h"><h3>Post a doctor</h3><p>Doctors are found by their BMDC registration number. One not yet in the national registry is added with their name and qualifications.</p></div>
      <div class="modal-b">
        <div class="row c2">
          <div><label class="label" for="pd-bmdc">BMDC number</label><input class="field mono" id="pd-bmdc" maxlength="20" placeholder="A-47755"></div>
          <div><label class="label" for="pd-dept">Department</label><select class="field" id="pd-dept">${DEPARTMENTS.map(d => `<option>${esc(d)}</option>`).join('')}</select></div>
        </div>
        <div class="row c2">
          <div><label class="label" for="pd-fee">Consultation fee (৳)</label><input class="field mono" id="pd-fee" type="number" min="0" max="100000" step="50" value="500"></div>
          <div><label class="label" for="pd-from">Starts</label><input class="field" id="pd-from" type="date" value="${todayLocal()}"></div>
        </div>
        <p class="hint" style="margin:6px 0 10px">Only for a doctor new to the registry:</p>
        <div class="row c2">
          <div><label class="label" for="pd-name">Name</label><input class="field" id="pd-name" maxlength="100" placeholder="Dr. &hellip;"></div>
          <div><label class="label" for="pd-qual">Qualifications</label><input class="field" id="pd-qual" maxlength="200" placeholder="MBBS, FCPS (&hellip;)"></div>
        </div>
      </div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Post</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      const v = id => $('#' + id, sc).value.trim();
      if (await save(root, 'POST', `/setup/${Number(SET.hospitalId)}/postings`,
        { bmdc: v('pd-bmdc'), dept: v('pd-dept'), fee: v('pd-fee'), from: v('pd-from'), name: v('pd-name'), qual: v('pd-qual') },
        'The doctor is posted. Add their weekly sessions so patients can book them.')) sc.remove();
    }));
  });
  $$('[data-fee]', box).forEach(b => b.addEventListener('click', () => {
    const p = ps.find(x => x.id === Number(b.dataset.fee));
    const sc = modal(`
      <div class="modal-h"><h3>Consultation fee</h3><p>${esc(p.doctor)}, ${esc(p.dept)}. Applies to bookings from now on.</p></div>
      <div class="modal-b"><label class="label" for="fe-fee">Fee (৳)</label><input class="field mono" id="fe-fee" type="number" min="0" max="100000" step="50" value="${Number(p.fee)}"></div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      if (await save(root, 'POST', `/setup/postings/${p.id}/fee`, { fee: $('#fe-fee', sc).value }, 'The new fee is in the directory.')) sc.remove();
    }));
  }));
  $$('[data-end]', box).forEach(b => b.addEventListener('click', () => {
    const p = ps.find(x => x.id === Number(b.dataset.end));
    const sc = modal(`
      <div class="modal-h"><h3>End this posting</h3><p>${esc(p.doctor)}, ${esc(p.dept)}. Their sessions here end the same day. The database refuses while patients are booked after it${p.bookedAhead ? ` &mdash; there are ${Number(p.bookedAhead)} now` : ''}.</p></div>
      <div class="modal-b"><label class="label" for="ep-day">Last working day</label><input class="field" id="ep-day" type="date" value="${todayLocal()}"></div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>End posting</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      if (await save(root, 'POST', `/setup/postings/${p.id}/end`, { lastDay: $('#ep-day', sc).value }, 'The posting ends on that day.')) sc.remove();
    }));
  }));
}

/* ---------------- weekly sessions ---------------- */
function drawSessions(box, root) {
  const ps = SET.data.postings.filter(p => !p.validTo || p.validTo >= todayLocal());
  box.innerHTML = ps.length ? ps.map(p => {
    const ss = SET.data.schedules.filter(s => s.postingId === p.id);
    return `
      <div class="sec-h"><h3>${esc(p.doctor)} &middot; ${esc(p.dept)}</h3><button class="btn sm" data-add="${Number(p.id)}">Add a session&hellip;</button></div>
      ${ss.length ? `<div class="card queue">${ss.map(s => `
        <div class="qrow">
          <span class="mono appt-time">${esc(s.startTime)}&ndash;${esc(s.endTime)}</span>
          <div class="who"><b>${DAYS[Number(s.weekday)]}s</b><span class="meta">${Number(s.slotMinutes)}-minute slots</span></div>
          <div class="what"><div class="meta">From ${esc(fmtDate(s.validFrom))}${s.validTo ? ` until ${esc(fmtDate(s.validTo))}` : ''}</div></div>
          <div class="acts"><button class="btn sm" data-stop="${Number(s.id)}">End&hellip;</button></div>
        </div>`).join('')}</div>`
      : '<div class="card empty-state"><b>No sessions</b>Nobody can book this doctor here until they have one.</div>'}`;
  }).join('') : '<div class="card empty-state"><b>No doctors posted</b>Post a doctor first, on <i>Doctors and fees</i>.</div>';

  $$('[data-add]', box).forEach(b => b.addEventListener('click', () => {
    const p = ps.find(x => x.id === Number(b.dataset.add));
    const sc = modal(`
      <div class="modal-h"><h3>Add a weekly session</h3><p>${esc(p.doctor)}, ${esc(p.dept)}. It may not overlap any other session of this doctor, at any hospital.</p></div>
      <div class="modal-b">
        <div class="row c3">
          <div><label class="label" for="as-day">Day</label><select class="field" id="as-day">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
          <div><label class="label" for="as-start">From</label><input class="field mono" id="as-start" type="time" value="09:00"></div>
          <div><label class="label" for="as-end">To</label><input class="field mono" id="as-end" type="time" value="13:00"></div>
        </div>
        <div class="row c2">
          <div><label class="label" for="as-slot">Minutes per patient</label><input class="field mono" id="as-slot" type="number" min="5" max="120" step="5" value="20"></div>
          <div><label class="label" for="as-from">Starting</label><input class="field" id="as-from" type="date" value="${todayLocal()}"></div>
        </div>
      </div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      const v = id => $('#' + id, sc).value;
      if (await save(root, 'POST', `/setup/postings/${p.id}/schedules`,
        { weekday: v('as-day'), start: v('as-start'), end: v('as-end'), slot: v('as-slot'), from: v('as-from') },
        'Patients can book the new session now.')) sc.remove();
    }));
  }));
  $$('[data-stop]', box).forEach(b => b.addEventListener('click', () => {
    const s = SET.data.schedules.find(x => x.id === Number(b.dataset.stop));
    const sc = modal(`
      <div class="modal-h"><h3>End this session</h3><p>${DAYS[Number(s.weekday)]}s ${esc(s.startTime)}&ndash;${esc(s.endTime)}. Refused while patients are booked into it after the last day.</p></div>
      <div class="modal-b"><label class="label" for="es-day">Last day it runs</label><input class="field" id="es-day" type="date" value="${todayLocal()}"></div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>End session</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      if (await save(root, 'POST', `/setup/schedules/${s.id}/end`, { lastDay: $('#es-day', sc).value }, 'The session ends on that day.')) sc.remove();
    }));
  }));
}

/* ---------------- leave ---------------- */
function drawLeave(box, root) {
  const doctors = [...new Map(SET.data.postings.filter(p => !p.validTo || p.validTo >= todayLocal())
    .map(p => [p.doctorId, p.doctor])).entries()];
  const lv = SET.data.leave;
  box.innerHTML = `
    <div class="sec-h" style="margin-top:0"><h3>Leave not yet over</h3>${doctors.length ? '<button class="btn sm primary" id="lv-add">Record leave&hellip;</button>' : ''}</div>
    ${lv.length ? `<div class="card queue">${lv.map(l => `
      <div class="qrow">
        <div class="who"><b>${esc(l.doctor)}</b><span class="meta">${esc(l.reason || 'No reason given')}</span></div>
        <div class="what">${esc(fmtDateTime(l.fromAt))} &rarr; ${esc(fmtDateTime(l.toAt))}</div>
        <div class="acts">${new Date(String(l.fromAt).replace(' ', 'T')) > new Date() ? `<button class="btn sm" data-rm="${Number(l.id)}">Remove</button>` : '<span class="pill warn"><i class="dot"></i>On leave now</span>'}</div>
      </div>`).join('')}</div>`
    : '<div class="card empty-state"><b>No leave recorded</b>A doctor on leave stops being offered for booking during it.</div>'}`;
  if ($('#lv-add')) $('#lv-add').addEventListener('click', () => {
    const sc = modal(`
      <div class="modal-h"><h3>Record leave</h3><p>The doctor&rsquo;s slots in this time stop being offered. Patients already booked inside it are not cancelled automatically: you are told how many, so the desk can call them.</p></div>
      <div class="modal-b">
        <div class="row"><div><label class="label" for="lv-doc">Doctor</label><select class="field" id="lv-doc">${doctors.map(([id, n]) => `<option value="${Number(id)}">${esc(n)}</option>`).join('')}</select></div></div>
        <div class="row c2">
          <div><label class="label" for="lv-from">From</label><input class="field" id="lv-from" type="datetime-local" value="${todayLocal()}T08:00"></div>
          <div><label class="label" for="lv-to">To</label><input class="field" id="lv-to" type="datetime-local" value="${todayLocal()}T18:00"></div>
        </div>
        <div class="row"><div><label class="label" for="lv-why">Reason</label><input class="field" id="lv-why" maxlength="120" placeholder="Conference, illness, annual leave"></div></div>
      </div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Record</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      const v = id => $('#' + id, sc).value;
      if (await save(root, 'POST', '/setup/leave',
        { doctorId: v('lv-doc'), from: v('lv-from').replace('T', ' '), to: v('lv-to').replace('T', ' '), reason: v('lv-why') },
        r => r.bookedInside ? `Leave recorded. ${r.bookedInside} patient(s) are already booked inside it — call them to rebook.` : 'Leave recorded; nobody was booked inside it.')) sc.remove();
    }));
  });
  $$('[data-rm]', box).forEach(b => b.addEventListener('click', () =>
    busy(b, () => save(root, 'DELETE', `/setup/leave/${Number(b.dataset.rm)}`, null, 'The leave is removed; the slots are offered again.'))));
}

/* ---------------- wards and beds ---------------- */
function drawWards(box, root) {
  const { wards, beds, wardTypes } = SET.data;
  box.innerHTML = `
    <div class="sec-h" style="margin-top:0"><h3>${wards.length} ward${wards.length === 1 ? '' : 's'}</h3><button class="btn sm primary" id="wd-add">Add a ward&hellip;</button></div>
    ${wards.map(w => `
      <div class="sec-h"><h3>${esc(w.name)}</h3><span>${esc(w.type)}${w.sex ? ' &middot; ' + esc(w.sex) : ' &middot; mixed'} &middot; ${Number(w.beds)} beds${w.outOfService ? `, ${Number(w.outOfService)} out of service` : ''}</span>
        <button class="btn sm" data-beds="${Number(w.id)}">Add beds&hellip;</button></div>
      <div class="card chips" style="padding:12px 14px">${beds.filter(b => b.wardId === w.id).map(b => `
        <button class="btn sm${b.outOfService ? ' bed-out' : ''}" data-bed="${Number(b.wardId)}|${esc(b.bedNo)}" title="${b.outOfService ? 'Out of service — click to return it' : esc(b.status) + ' — click to take out of service'}">
          <span class="mono">${esc(b.bedNo)}</span>${b.outOfService ? ' &middot; out' : b.status !== 'free' ? ' &middot; ' + esc(b.status) : ''}</button>`).join('') || '<span class="meta">No beds yet.</span>'}</div>`).join('')}
    <p class="hint" style="margin-top:12px">Out of service is for a bed that cannot be used (broken, being repaired). Whether a bed is free, occupied or being cleaned is kept by the database&rsquo;s triggers from admissions and discharges, never set by hand.</p>`;

  $('#wd-add').addEventListener('click', () => {
    const sc = modal(`
      <div class="modal-h"><h3>Add a ward</h3><p>${esc(hospitalName(SET.hospitalId))}. Add its beds next.</p></div>
      <div class="modal-b">
        <div class="row"><div><label class="label" for="wd-name">Name</label><input class="field" id="wd-name" maxlength="80" placeholder="Surgery — Female"></div></div>
        <div class="row c3">
          <div><label class="label" for="wd-type">Type</label><select class="field" id="wd-type">${wardTypes.map(t => `<option value="${esc(t.code)}">${esc(t.label)}</option>`).join('')}</select></div>
          <div><label class="label" for="wd-sex">For</label><select class="field" id="wd-sex"><option value="">Everyone</option><option>Male</option><option>Female</option></select></div>
          <div><label class="label" for="wd-pre">Bed prefix</label><input class="field mono" id="wd-pre" maxlength="6" placeholder="SF"></div>
        </div>
        <div class="row c2"><div><label class="label" for="wd-n">Beds</label><input class="field mono" id="wd-n" type="number" min="0" max="50" value="10"></div></div>
      </div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add ward</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      const v = id => $('#' + id, sc).value.trim();
      let made;
      try { made = await API.post(`/setup/${Number(SET.hospitalId)}/wards`, { name: v('wd-name'), type: v('wd-type'), sex: v('wd-sex') }); }
      catch (err) { toast('Not saved', err.message, 'err'); return; }
      if (Number(v('wd-n')) > 0) {
        try { await API.post(`/setup/wards/${made.wardId}/beds`, { prefix: v('wd-pre'), count: Number(v('wd-n')) }); }
        catch (err) { toast('Ward added, beds not', err.message, 'err'); sc.remove(); renderSetup(root); return; }
      }
      sc.remove();
      toast('Ward added', 'It is on the bed board now.');
      renderSetup(root);
    }));
  });
  $$('[data-beds]', box).forEach(b => b.addEventListener('click', () => {
    const w = wards.find(x => x.id === Number(b.dataset.beds));
    const sc = modal(`
      <div class="modal-h"><h3>Add beds to ${esc(w.name)}</h3><p>Numbered on from the ward&rsquo;s highest bed.</p></div>
      <div class="modal-b"><div class="row c2">
        <div><label class="label" for="ab-n">How many</label><input class="field mono" id="ab-n" type="number" min="1" max="50" value="2"></div>
        <div><label class="label" for="ab-pre">Prefix (empty ward only)</label><input class="field mono" id="ab-pre" maxlength="6"></div>
      </div></div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add</button></div>`);
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      if (await save(root, 'POST', `/setup/wards/${w.id}/beds`, { count: Number($('#ab-n', sc).value), prefix: $('#ab-pre', sc).value.trim() },
        r => `Beds ${r.firstBed} to ${r.lastBed} added, free.`)) sc.remove();
    }));
  }));
  $$('[data-bed]', box).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    const [wardId, bedNo] = b.dataset.bed.split('|');
    const bed = beds.find(x => x.wardId === Number(wardId) && x.bedNo === bedNo);
    await save(root, 'POST', '/setup/beds/service', { wardId: Number(wardId), bedNo, out: !bed.outOfService },
      bed.outOfService ? `${bedNo} is back in service.` : `${bedNo} is out of service.`);
  })));
}

/* ---------------- hospitals (system admin) ---------------- */
function drawHospitals(box, root) {
  box.innerHTML = `
    <div class="sec-h" style="margin-top:0"><h3>${SET.hospitals.length} hospitals in the network</h3><button class="btn sm primary" id="hp-add">Add a hospital&hellip;</button></div>
    <div class="card queue">${SET.hospitals.map(h => `
      <div class="qrow">
        <span class="pill ${h.active ? 'ok' : 'mute'}"><i class="dot"></i>${h.active ? 'open' : 'closed'}</span>
        <div class="who"><b>${esc(h.name)}</b><span class="meta">${esc(h.dist)}, ${esc(h.div)} &middot; ${esc(h.tier)}</span></div>
        <div class="what">${Number(h.postings)} doctor posting${Number(h.postings) === 1 ? '' : 's'}</div>
        <div class="acts"><button class="btn sm" data-act="${Number(h.id)}">${h.active ? 'Close' : 'Reopen'}</button></div>
      </div>`).join('')}</div>`;
  $('#hp-add').addEventListener('click', () => {
    const sc = modal(`
      <div class="modal-h"><h3>Add a hospital</h3><p>It joins the national network: its patients get UHIDs, and every connected hospital can see records made there.</p></div>
      <div class="modal-b">
        <div class="row"><div><label class="label" for="hp-name">Name</label><input class="field" id="hp-name" maxlength="120"></div></div>
        <div class="row c2">
          <div><label class="label" for="hp-dist">District</label><input class="field" id="hp-dist" list="hp-dists" maxlength="60"><datalist id="hp-dists"></datalist></div>
          <div><label class="label" for="hp-tier">Kind</label><select class="field" id="hp-tier">${SET.data.tiers.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        </div>
        <div class="row c2">
          <div><label class="label" for="hp-addr">Address</label><input class="field" id="hp-addr" maxlength="200"></div>
          <div><label class="label" for="hp-ph">Phone</label><input class="field mono" id="hp-ph" maxlength="20"></div>
        </div>
      </div>
      <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add hospital</button></div>`);
    API.get('/districts').then(l => { $('#hp-dists', sc).innerHTML = l.map(d => `<option value="${esc(d.district)}">${esc(d.div)}</option>`).join(''); }).catch(() => {});
    $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
      const v = id => $('#' + id, sc).value.trim();
      if (await save(root, 'POST', '/setup/hospitals', { name: v('hp-name'), district: v('hp-dist'), tier: v('hp-tier'), address: v('hp-addr'), phone: v('hp-ph') },
        'The hospital is in the network. Create its admin on Staff accounts, then post its doctors.')) sc.remove();
    }));
  });
  $$('[data-act]', box).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    const h = SET.hospitals.find(x => x.id === Number(b.dataset.act));
    await save(root, 'POST', `/setup/hospitals/${h.id}/active`, { active: !h.active },
      h.active ? `${h.name} is closed; its records stay.` : `${h.name} is open again.`);
  })));
}

boot(renderSetup);
