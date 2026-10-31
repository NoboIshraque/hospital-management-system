/* ============================================================
   UHID — record.html — the national health record
   Encounter timeline, prescriptions, and who has read this record.

   Online, opening a record is a LOGGED ACT: GET /api/patients/:uhid
   runs get_patient_record(), which decides on what authority you may
   read it, writes access_log, and only then returns the record. When
   there is no authority, the server answers 423 and this screen offers
   break-glass instead.
   ============================================================ */

const BASIS_LABEL = {
  own_record: 'Your own record',
  treating: 'Treating clinician',
  consent: 'Active consent grant',
  break_glass: 'Break-glass — emergency',
  demographics_only: 'Demographics only'
};

function renderRecord(root) {
  if (!S.patient) {
    root.innerHTML = `
      <div class="card empty-state">
        <b>No patient selected</b>
        Find a patient first &mdash; a national record store never opens on somebody by default.
        <div style="margin-top:16px"><button class="btn primary" id="to-search">Go to patient search</button></div>
      </div>`;
    $('#to-search').addEventListener('click', () => go('search'));
    return;
  }
  if (!API.online) { drawRecord(root, S.patient); return; }
  loadRecord(root, S.patient.uhid, null);
}

async function loadRecord(root, uhid, reason) {
  root.innerHTML = loadingHtml('Checking your access and opening the record.');
  const q = reason ? `?breakGlass=1&reason=${encodeURIComponent(reason)}` : '';
  try {
    S.patient = await API.get('/patients/' + encodeURIComponent(uhid) + q);
    drawRecord(root, S.patient);
  } catch (e) {
    if (e.status === 423) { askBreakGlass(root, uhid, e.message); return; }
    root.innerHTML = errorHtml(e.status === 404 ? 'No such record' : 'The record could not be opened', e.message);
  }
}

/* Break-glass: allowed, never silent. The reason is required by the
   database (ck_log_break_glass), and the read lands in the review queue. */
function askBreakGlass(root, uhid, message) {
  root.innerHTML = `
    <div class="card empty-state">
      <b>You have no access basis for this record</b>
      ${esc(message)}
      <div style="margin-top:16px"><button class="btn" id="bg-open">Use break-glass&hellip;</button></div>
    </div>`;
  $('#bg-open').addEventListener('click', () => {
    const sc = modal(`
      <div class="modal-h"><h3>Break-glass access</h3><p>For emergencies only. This read is flagged and reviewed by the hospital administrator.</p></div>
      <div class="modal-b">
        <div class="banner crit" style="margin-bottom:14px">${warnIcon}<div><b>Your name, the time and your reason are recorded</b>The patient can see this entry in their own access log.</div></div>
        <label class="label" for="bg-reason">Reason</label>
        <textarea class="field" id="bg-reason" rows="3" placeholder="e.g. Unconscious on arrival, no consent possible"></textarea>
      </div>
      <div class="modal-f">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" data-ok>Open the record</button>
      </div>`);
    $('#bg-reason', sc).focus();
    $('[data-ok]', sc).addEventListener('click', () => {
      const reason = $('#bg-reason', sc).value.trim();
      if (!reason) { toast('Reason required', 'Break-glass needs a written reason.', 'err'); return; }
      sc.remove();
      loadRecord(root, uhid, reason);
    });
  });
}

function drawRecord(root, p) {
  const isSelf = S.role === 'patient';
  const access = p.access || { basis: isSelf ? 'own_record' : 'consent' };
  const hasAllergies = p.allergies && p.allergies.length > 0;

  const allergyBanner = hasAllergies
    ? `<div class="banner crit">${warnIcon}<div><b>Drug allergies on file</b>${
        p.allergies.map(a => `${esc(a.agent)} — ${esc(String(a.severity).toLowerCase())}${a.note ? ` (${esc(a.note)})` : ''}`).join(' &nbsp;&middot;&nbsp; ')
      }</div></div>`
    : `<div class="banner ok">${warnIcon}<div><b>No known drug allergies</b>Nothing recorded. Confirm with the patient before prescribing.</div></div>`;

  const accessBanner =
    access.basis === 'break_glass'
      ? `<div class="banner crit">${warnIcon}<div><b>Opened under break-glass</b>This read is in the access log with your reason, and waits for review by the hospital administrator.</div></div>`
    : access.basis === 'demographics_only'
      ? `<div class="banner info">${warnIcon}<div><b>Demographics only</b>Your role sees identity, contact and allergies. Clinical history needs a clinician with an access basis.</div></div>`
    : '';

  const merged = p.mergedUhids && p.mergedUhids.length
    ? `<div style="margin-top:6px;font-size:12px;color:var(--ink-3)">Also known by merged record${p.mergedUhids.length > 1 ? 's' : ''} <span class="mono">${p.mergedUhids.map(esc).join(', ')}</span></div>`
    : '';

  root.innerHTML = `
    <div class="card pt-head">
      <div class="pt-av">${initials(p.name)}</div>
      <div class="pt-id">
        <h2>${esc(p.name)}</h2>
        <span class="uhid">${esc(p.uhid)}</span>
        ${p.identityVerified ? '' : '<span class="pill warn" style="margin-left:8px"><i class="dot"></i>Identity unverified</span>'}
        ${merged}
        <div class="pt-facts">
          <div><span class="k">Age / sex</span>${ageFrom(p.dob)} &middot; ${esc(p.sex)}</div>
          <div><span class="k">Blood</span>${esc(p.blood)}</div>
          <div><span class="k">Mobile</span><span class="mono">${esc(p.phone || '—')}</span></div>
          <div><span class="k">NID</span><span class="mono">${esc(p.nid || '—')}</span></div>
          <div><span class="k">Next of kin</span>${esc(p.kin || '—')}</div>
          <div><span class="k">Registered</span>${fmtDate(p.registeredAt)}, ${esc(hospital(p.registeredHospitalId).name)}</div>
        </div>
      </div>
      <div class="pt-actions">
        ${isSelf ? '' : `<button class="btn" id="consent-btn">Access basis: ${esc((BASIS_LABEL[access.basis] || access.basis).toLowerCase())}</button>`}
        <button class="btn ghost" id="print-btn">Print record</button>
      </div>
    </div>

    ${accessBanner}
    ${allergyBanner}

    <div class="tabs" id="rec-tabs">
      <button data-tab="timeline" class="on">Encounter timeline</button>
      <button data-tab="rx">Prescriptions</button>
      <button data-tab="access">Who has viewed this</button>
    </div>
    <div id="rec-body"></div>
    <p class="print-only print-foot">Printed from the UHID national health record by ${esc(S.account.name)} (${esc(ROLES[S.role].label)}), ${esc(fmtDateTime(new Date()))}. Access basis: ${esc(BASIS_LABEL[access.basis] || access.basis)}. Confidential clinical information.</p>`;

  $('#rec-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('#rec-tabs button').forEach(x => x.classList.toggle('on', x === b));
    S.tab = b.dataset.tab;
    renderRecordBody();
  });

  const consentBtn = $('#consent-btn');
  if (consentBtn) consentBtn.addEventListener('click', () => showConsent(p, access));
  $('#print-btn').addEventListener('click', () => window.print());

  S.tab = 'timeline';
  renderRecordBody();
}

function showConsent(p, access) {
  const expires = access.basis === 'consent' && access.consentExpires
    ? fmtDateTime(access.consentExpires)
    : access.basis === 'treating' ? 'While the encounter is open' : '—';
  modal(`
    <div class="modal-h">
      <h3>Why you can see this record</h3>
      <p>Every clinical read is checked against a grant, and logged.</p>
    </div>
    <div class="modal-b">
      <dl class="kv">
        <dt>Viewer</dt><dd>${esc(S.account.name)}</dd>
        <dt>Role</dt><dd>${esc(ROLES[S.role].label)}</dd>
        <dt>Patient</dt><dd>${esc(p.name)}</dd>
        <dt>Basis</dt><dd>${esc(BASIS_LABEL[access.basis] || access.basis)}</dd>
        <dt>Expires</dt><dd>${esc(expires)}</dd>
        <dt>This view</dt><dd>Written to <span class="mono">access_log</span>${API.online ? '' : ' (in the finished system)'}</dd>
      </dl>
    </div>
    <div class="modal-f"><button class="btn primary" data-close>Understood</button></div>`);
}

function renderRecordBody() {
  const p = S.patient;
  const box = $('#rec-body');
  const demographicsOnly = p.access && p.access.basis === 'demographics_only';

  if (S.tab === 'timeline') {
    if (demographicsOnly) {
      box.innerHTML = `<div class="card empty-state"><b>Clinical history not shown</b>Your role reads demographics only. A clinician treating this patient, or holding their consent, sees the full timeline.</div>`;
      return;
    }
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
      ${referralCards(p)}
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
              <span class="pill ${e.type === 'Emergency' ? 'crit' : e.type === 'Inpatient' ? 'warn' : 'info'}">${esc(e.type)}</span>
              <span class="pill mute">${esc(h.div)}</span>
              ${e.isOpen ? '<span class="pill ok"><i class="dot"></i>Open</span>' : ''}
            </div>
            <div class="enc-body">
              <span class="dx">${esc(e.dx)}</span>${e.notes ? ` &mdash; ${esc(e.notes)}` : ''}
              <div style="margin-top:5px;color:var(--ink-3);font-size:12px">${esc(e.doctor)} &middot; ${esc(e.dept)}</div>
            </div>
            ${vitalsLine(e)}
            ${e.rx.length ? `<div class="enc-rx"><span class="k">Prescribed</span><ul>${
              e.rx.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
            ${labsBlock(e)}
          </div>
        </div>`;
      }).join('')}</div>`;

  } else if (S.tab === 'rx') {
    if (demographicsOnly) {
      box.innerHTML = `<div class="card empty-state"><b>Prescriptions not shown</b>Your role reads demographics only.</div>`;
      return;
    }
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
    /* Online this is the real access_log, newest first, including the read
       that just opened this page. Offline it is the prototype's sample list. */
    const rows = p.accessLog
      ? p.accessLog.map(l => ({ when: fmtDateTime(l.when), who: l.who, where: l.where, basis: l.basis, kind: l.kind,
                                note: l.justification ? `Reason: ${l.justification}${l.reviewed ? ' · reviewed' : ' · awaiting review'}` : '' }))
      : (p.encounters.length ? ACCESS_LOG : [
          { when: fmtDate(p.registeredAt) + ' · registration', who: 'Rezaul Karim (Reception)',
            where: hospital(p.registeredHospitalId).name, basis: 'Created record', kind: 'ok' }
        ]);
    if (!rows.length) {
      box.innerHTML = `<div class="card empty-state"><b>Nobody has read this record yet</b>Every future read will appear here.</div>`;
      return;
    }
    box.innerHTML = `
      <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 12px">
        Every read is written to the access log before the record is shown, and nobody &mdash; not even an administrator &mdash; can edit or delete an entry. The patient can see this list too.
      </p>
      <div class="card" style="padding:6px 0">${rows.map(r => `
        <div style="padding:11px 18px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap;align-items:center">
          <span class="mono" style="font-size:12px;color:var(--ink-3);min-width:150px">${esc(r.when)}</span>
          <span style="min-width:170px;font-weight:500">${esc(r.who)}</span>
          <span style="flex:1;min-width:200px;font-size:12.5px;color:var(--ink-2)">${esc(r.where)}${r.note ? `<br><span style="color:var(--ink-3)">${esc(r.note)}</span>` : ''}</span>
          <span class="pill ${esc(r.kind)}">${esc(r.basis)}</span>
        </div>`).join('')}</div>`;
  }
}

/* Decision 6, on screen: where this patient was sent, and whether they got there. */
function referralCards(p) {
  if (!p.referrals || !p.referrals.length) return '';
  return `<div class="card" style="padding:6px 0;margin-bottom:16px">${p.referrals.map(r => {
    const arrived = r.status === 'arrived' || r.status === 'completed';
    return `
      <div style="padding:11px 18px;border-bottom:1px solid var(--line);display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <span class="pill ${arrived ? 'ok' : 'warn'}"><i class="dot"></i>${arrived ? 'Arrived' : 'Referred'}</span>
        <span style="flex:1;min-width:240px;font-size:13px">
          <b>${esc(hospital(r.fromHospitalId).name)}</b> &rarr; <b>${esc(hospital(r.toHospitalId).name)}</b>${r.dept ? ` &middot; ${esc(r.dept)}` : ''}<br>
          <span style="color:var(--ink-2)">${esc(r.reason)}</span>
        </span>
        <span style="font-size:12px;color:var(--ink-3)">${esc(r.urgency)} &middot; ${fmtDate(r.referredAt)} &middot; ${esc(r.referredBy)}</span>
      </div>`;
  }).join('')}</div>`;
}

function vitalsLine(e) {
  if (!e.vitals || !e.vitals.length) return '';
  const v = e.vitals[e.vitals.length - 1];
  const parts = [
    v.bp && `BP ${v.bp}`, v.pulse && `pulse ${v.pulse}`, v.temp && `${v.temp} °C`,
    v.spo2 && `SpO₂ ${v.spo2}%`, v.weight && `${v.weight} kg`
  ].filter(Boolean);
  return parts.length
    ? `<div class="enc-rx"><span class="k">Vitals</span><span class="mono" style="font-size:12.5px">${esc(parts.join(' · '))}</span></div>`
    : '';
}

function labsBlock(e) {
  if (!e.labs || !e.labs.length) return '';
  return `<div class="enc-rx"><span class="k">Lab results</span><ul>${e.labs.map(l => `
    <li>${esc(l.test)}: ${l.value ? `<span class="mono"${l.abnormal ? ' style="color:var(--crit);font-weight:600"' : ''}>${esc(l.value)}</span>${l.abnormal ? ' <span class="pill crit">abnormal</span>' : ''}${l.ref ? ` <span style="color:var(--ink-3);font-size:12px">(ref ${esc(l.ref)})</span>` : ''}`
      : `<span style="color:var(--ink-3)">${esc(l.status)}</span>`}</li>`).join('')}</ul></div>`;
}

boot(renderRecord);
