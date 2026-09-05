/* ============================================================
   UHID — record.html — the national health record
   Encounter timeline, prescriptions, and who has read this record.
   ============================================================ */

function renderRecord(root) {
  const p = S.patient;

  if (!p) {
    root.innerHTML = `
      <div class="card empty-state">
        <b>No patient selected</b>
        Find a patient first &mdash; a national record store never opens on somebody by default.
        <div style="margin-top:16px"><button class="btn primary" id="to-search">Go to patient search</button></div>
      </div>`;
    $('#to-search').addEventListener('click', () => go('search'));
    return;
  }

  const isSelf = S.role === 'patient';
  const hasAllergies = p.allergies && p.allergies.length > 0;

  const allergyBanner = hasAllergies
    ? `<div class="banner crit">${warnIcon}<div><b>Drug allergies on file</b>${
        p.allergies.map(a => `${esc(a.agent)} — ${esc(String(a.severity).toLowerCase())} (${esc(a.note)})`).join(' &nbsp;&middot;&nbsp; ')
      }</div></div>`
    : `<div class="banner ok">${warnIcon}<div><b>No known drug allergies</b>Nothing recorded. Confirm with the patient before prescribing.</div></div>`;

  root.innerHTML = `
    <div class="card pt-head">
      <div class="pt-av">${initials(p.name)}</div>
      <div class="pt-id">
        <h2>${esc(p.name)}</h2>
        <span class="uhid">${esc(p.uhid)}</span>
        ${p.identityVerified ? '' : '<span class="pill warn" style="margin-left:8px"><i class="dot"></i>Identity unverified</span>'}
        <div class="pt-facts">
          <div><span class="k">Age / sex</span>${ageFrom(p.dob)} &middot; ${esc(p.sex)}</div>
          <div><span class="k">Blood</span>${esc(p.blood)}</div>
          <div><span class="k">Mobile</span><span class="mono">${esc(p.phone)}</span></div>
          <div><span class="k">NID</span><span class="mono">${esc(p.nid || '—')}</span></div>
          <div><span class="k">Next of kin</span>${esc(p.kin)}</div>
          <div><span class="k">Registered</span>${fmtDate(p.registeredAt)}, ${esc(hospital(p.registeredHospitalId).name)}</div>
        </div>
      </div>
      ${isSelf ? '' : '<button class="btn" id="consent-btn">Access basis: consent</button>'}
    </div>

    ${allergyBanner}

    <div class="tabs" id="rec-tabs">
      <button data-tab="timeline" class="on">Encounter timeline</button>
      <button data-tab="rx">Prescriptions</button>
      <button data-tab="access">Who has viewed this</button>
    </div>
    <div id="rec-body"></div>`;

  $('#rec-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('#rec-tabs button').forEach(x => x.classList.toggle('on', x === b));
    S.tab = b.dataset.tab;
    renderRecordBody();
  });

  const consentBtn = $('#consent-btn');
  if (consentBtn) consentBtn.addEventListener('click', showConsent);

  S.tab = 'timeline';
  renderRecordBody();
}

function showConsent() {
  modal(`
    <div class="modal-h">
      <h3>Why you can see this record</h3>
      <p>Every clinical read is checked against a grant, and logged.</p>
    </div>
    <div class="modal-b">
      <dl class="kv">
        <dt>Viewer</dt><dd>${esc(ROLES[S.role].who)}</dd>
        <dt>Role</dt><dd>${esc(ROLES[S.role].label)}</dd>
        <dt>Patient</dt><dd>${esc(S.patient.name)}</dd>
        <dt>Basis</dt><dd>Active consent grant</dd>
        <dt>Expires</dt><dd>08 Nov 2026</dd>
        <dt>Scope</dt><dd>Full clinical history</dd>
        <dt>This view</dt><dd>Written to <span class="mono">access_log</span></dd>
      </dl>
    </div>
    <div class="modal-f"><button class="btn primary" data-close>Understood</button></div>`);
}

function renderRecordBody() {
  const p = S.patient;
  const box = $('#rec-body');

  if (S.tab === 'timeline') {
    if (!p.encounters.length) {
      box.innerHTML = `<div class="card empty-state">
        <b>No encounters yet</b>
        This patient was registered on ${fmtDate(p.registeredAt)} and has not been seen by a doctor.
        Their timeline fills in as they are treated &mdash; at any hospital in the country.
      </div>`;
      return;
    }
    const hospitalCount = new Set(p.encounters.map(e => e.hospitalId)).size;
    const divisionCount = new Set(p.encounters.map(e => hospital(e.hospitalId).div)).size;
    box.innerHTML = `
      <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 14px">
        ${p.encounters.length} encounter${p.encounters.length === 1 ? '' : 's'} across ${hospitalCount} hospital${hospitalCount === 1 ? '' : 's'} in ${divisionCount} division${divisionCount === 1 ? '' : 's'} &mdash; one record, no transfers, no paper.
      </p>
      <div class="timeline">${p.encounters.map((e, i) => {
        const h = hospital(e.hospitalId);
        return `
        <div class="enc${i === 0 ? ' here' : ''}">
          <div class="card enc-card">
            <div class="enc-top">
              <span class="enc-date">${fmtDate(e.date)}</span>
              <span class="enc-hosp">${esc(h.name)}</span>
              <span class="pill ${e.type === 'Emergency' ? 'crit' : 'info'}">${esc(e.type)}</span>
              <span class="pill mute">${esc(h.div)}</span>
            </div>
            <div class="enc-body">
              <span class="dx">${esc(e.dx)}</span> &mdash; ${esc(e.notes)}
              <div style="margin-top:5px;color:var(--ink-3);font-size:12px">${esc(e.doctor)} &middot; ${esc(e.dept)}</div>
            </div>
            ${e.rx.length ? `<div class="enc-rx"><span class="k">Prescribed</span><ul>${
              e.rx.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`;

  } else if (S.tab === 'rx') {
    const all = p.encounters.flatMap(e => e.rx.map(r => ({ r, e })));
    if (!all.length) {
      box.innerHTML = `<div class="card empty-state"><b>Nothing prescribed</b>No medication has been prescribed to this patient at any hospital.</div>`;
      return;
    }
    box.innerHTML = `<div class="card" style="padding:6px 0">${all.map(x => `
      <div style="padding:11px 18px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap;align-items:baseline">
        <span class="mono" style="font-size:12px;color:var(--ink-3);min-width:96px">${fmtDate(x.e.date)}</span>
        <span style="flex:1;min-width:220px">${esc(x.r)}</span>
        <span style="font-size:12px;color:var(--ink-3)">${esc(hospital(x.e.hospitalId).name)}</span>
      </div>`).join('')}</div>`;

  } else {
    const rows = p.encounters.length ? ACCESS_LOG : [
      { when: fmtDate(p.registeredAt) + ' · registration', who: 'Rezaul Karim (Reception)',
        where: hospital(p.registeredHospitalId).name, basis: 'Created record', kind: 'ok' }
    ];
    box.innerHTML = `
      <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 12px">
        Written automatically by a database trigger on every read. The patient can see this list too.
      </p>
      <div class="card" style="padding:6px 0">${rows.map(r => `
        <div style="padding:11px 18px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap;align-items:center">
          <span class="mono" style="font-size:12px;color:var(--ink-3);min-width:150px">${esc(r.when)}</span>
          <span style="min-width:170px;font-weight:500">${esc(r.who)}</span>
          <span style="flex:1;min-width:200px;font-size:12.5px;color:var(--ink-2)">${esc(r.where)}</span>
          <span class="pill ${r.kind}">${esc(r.basis)}</span>
        </div>`).join('')}</div>`;
  }
}

boot(renderRecord);
