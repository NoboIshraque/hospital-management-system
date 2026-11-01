/* ============================================================
   UHID — book.html — find a doctor and book a slot
   Availability is computed, never stored.
   ============================================================ */

/* Offline only: the prototype's invented grid. Online the grid is
   doctor_availability() — schedule, minus leave, minus bookings. */
function buildSlots() {
  const labels = ['Mon 31 Aug', 'Tue 1 Sep', 'Wed 2 Sep'];
  const times  = ['09:00','09:20','09:40','10:00','10:20','10:40','11:00','11:20','11:40','12:00'];
  const taken  = [[1,2,5,6,9], [0,3,4], [2,7]];
  return labels.map((label, di) => ({
    label,
    slots: times.map((time, ti) => ({ time, start: null, taken: taken[di].includes(ti) }))
  }));
}

function renderBook(root) {
  const divs = [...new Set(HOSPITALS.map(h => h.div))];
  root.innerHTML = `
    <div class="page-h">
      <h2>Find an available doctor</h2>
      <p>Search every connected hospital in the country, not just this one. Availability is computed from each doctor&rsquo;s weekly schedule, their leave, and the slots already booked.</p>
    </div>
    <div class="card filters">
      <div><label class="label" for="fl-div">Division</label>
        <select class="field" id="fl-div"><option value="">All divisions</option>${divs.map(d => `<option>${d}</option>`).join('')}</select></div>
      <div><label class="label" for="fl-dept">Department</label>
        <select class="field" id="fl-dept"><option value="">All departments</option>${DEPARTMENTS.map(d => `<option>${d}</option>`).join('')}</select></div>
      <div><label class="label" for="fl-hosp">Hospital</label>
        <select class="field" id="fl-hosp"><option value="">All hospitals</option>${HOSPITALS.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></div>
      <div><label class="label" for="fl-q">Doctor name</label>
        <input class="field" id="fl-q" placeholder="Search&hellip;"></div>
    </div>
    <div id="doc-out"></div>`;

  ['fl-div','fl-dept','fl-hosp','fl-q'].forEach(id => $('#' + id).addEventListener('input', runDoctorFilter));
  runDoctorFilter();
}

function runDoctorFilter() {
  const dv = $('#fl-div').value, dp = $('#fl-dept').value, hp = $('#fl-hosp').value;
  const q  = $('#fl-q').value.trim().toLowerCase();
  const out = $('#doc-out');

  const list = DOCTORS.filter(d => {
    const h = hospital(d.hospitalId);
    return (!dv || h.div === dv) && (!dp || d.dept === dp)
        && (!hp || d.hospitalId === Number(hp)) && (!q || d.name.toLowerCase().includes(q));
  });

  if (list.length === 0) {
    out.innerHTML = `<div class="card empty-state"><b>No doctor found</b>No doctor matches these filters. Try widening the division or department.</div>`;
    return;
  }

  const nexts = ['today 11:20','today 14:00','tomorrow 09:40','tomorrow 10:00','Tue 09:20','Tue 16:30'];
  out.innerHTML = `
    <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 11px">${list.length} doctors available nationally</p>
    <div class="doc-list">${list.map((d, i) => {
      const h = hospital(d.hospitalId);
      return `
      <div class="card doc">
        <div class="doc-top">
          <div class="doc-av">${initials(d.name)}</div>
          <div class="doc-id"><b>${esc(d.name)}</b><span class="spec">${esc(d.dept)}</span><span class="qual">${esc(d.qual)}</span></div>
        </div>
        <div class="doc-where">${pinIcon}
          <span>${esc(h.name)}<br><span style="color:var(--ink-3);font-size:11.5px">${esc(h.dist)}, ${esc(h.div)} &middot; ${esc(h.tier)}</span></span>
        </div>
        <div class="doc-foot">
          <span class="next-free">Next free &middot; <b>${esc(API.online ? (d.nextFree || 'none in 14 days') : nexts[i % nexts.length])}</b><br><span class="fee">&#2547;${Number(d.fee)} consultation</span></span>
          <button class="btn primary sm" data-doc="${d.id}">See slots</button>
        </div>
      </div>`;
    }).join('')}</div>`;

  $$('[data-doc]', out).forEach(b => b.addEventListener('click', () => openSlots(Number(b.dataset.doc))));
}

async function openSlots(docId) {
  const d = DOCTORS.find(x => x.id === docId);
  const h = hospital(d.hospitalId);
  S.doctor = d;
  S.slot = null;

  const root = $('#view');
  let days;
  if (API.online) {
    root.innerHTML = loadingHtml(`Working out ${d.name}’s free slots for the coming week.`);
    try { days = await API.get(`/doctors/${d.id}/availability?days=8`); }
    catch (e) { root.innerHTML = errorHtml('Availability could not be loaded', e.message); return; }
  } else {
    days = buildSlots();
  }

  root.innerHTML = `
    <button class="btn ghost sm" id="back" style="margin-bottom:14px">&larr; Back to doctors</button>
    <div class="card pt-head" style="margin-bottom:18px">
      <div class="pt-av">${initials(d.name)}</div>
      <div class="pt-id">
        <h2>${esc(d.name)}</h2>
        <div style="color:var(--brand-ink);font-size:13.5px">${esc(d.dept)}</div>
        <div class="pt-facts">
          <div><span class="k">Hospital</span>${esc(h.name)}</div>
          <div><span class="k">BMDC reg.</span><span class="mono">${esc(d.bmdc)}</span></div>
          <div><span class="k">Fee</span><span class="mono">&#2547;${Number(d.fee)}</span></div>
          <div><span class="k">Slot length</span>20 minutes</div>
        </div>
      </div>
    </div>
    <div class="page-h">
      <h2 style="font-size:16px">Choose a time</h2>
      <p>Struck-through slots are already booked. In the finished system this grid is a live query, and the booking runs inside a transaction so two patients can never take the same slot.</p>
    </div>
    ${days.length ? days.map(day => `
      <div class="slot-day">
        <h4>${esc(day.label)} <span>${day.slots.filter(s => !s.taken).length} of ${day.slots.length} free</span></h4>
        <div class="slots">${day.slots.map(s =>
          `<button class="slot" data-t="${esc(day.label + ' · ' + s.time)}" data-start="${esc(s.start || '')}"${s.taken ? ' disabled' : ''}>${esc(s.time)}</button>`
        ).join('')}</div>
      </div>`).join('')
    : `<div class="card empty-state"><b>No clinics in the coming week</b>${esc(d.name)} has no scheduled sessions here this week, or is on leave. Try another doctor.</div>`}
    <div class="form-actions" style="border:0;padding-top:4px">
      <button class="btn primary" id="confirm" disabled>Confirm appointment</button>
      <span id="picked" style="align-self:center;font-size:13px;color:var(--ink-3)">No slot selected</span>
    </div>`;

  $('#back').addEventListener('click', () => go('book'));
  $$('.slot', root).forEach(b => b.addEventListener('click', () => {
    $$('.slot', root).forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    S.slot = { label: b.dataset.t, start: b.dataset.start };
    $('#picked').textContent = 'Selected · ' + S.slot.label;
    $('#confirm').disabled = false;
  }));
  $('#confirm').addEventListener('click', () => confirmBooking(d, h));
}

function confirmBooking(d, h) {
  const p = S.patient;
  const who = p
    ? `${esc(p.name)} <span class="mono" style="color:var(--ink-3);font-size:12px">${esc(p.uhid)}</span>`
    : '<span style="color:var(--warn)">No patient selected — search for one first</span>';

  const sc = modal(`
    <div class="modal-h"><h3>Confirm appointment</h3><p>Booked against the national appointment register.</p></div>
    <div class="modal-b">
      <dl class="kv">
        <dt>Patient</dt><dd>${who}</dd>
        <dt>Doctor</dt><dd>${esc(d.name)}</dd>
        <dt>Department</dt><dd>${esc(d.dept)}</dd>
        <dt>Hospital</dt><dd>${esc(h.name)}</dd>
        <dt>When</dt><dd>${esc(S.slot.label)}</dd>
        <dt>Fee</dt><dd class="mono">&#2547;${Number(d.fee)}</dd>
      </dl>
    </div>
    <div class="modal-f">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" data-ok${p ? '' : ' disabled'}>Confirm booking</button>
    </div>`);

  const ok = $('[data-ok]', sc);
  if (p) ok.addEventListener('click', async () => {
    if (API.online) {
      /* book_appointment() locks the doctor and re-checks the slot inside a
         transaction. If someone else took it a moment ago, it says so, and
         the grid is redrawn from the database. */
      ok.disabled = true;
      try {
        await API.post('/appointments', { postingId: d.id, uhid: p.uhid, slotStart: S.slot.start });
      } catch (e) {
        sc.remove();
        toast('Not booked', e.message, 'err');
        if (e.status === 409) openSlots(d.id);
        return;
      }
    }
    sc.remove();
    toast('Appointment booked', S.slot.label + ' with ' + d.name + ' at ' + h.name + '.');
    go('book');
  });
}

boot(renderBook);
