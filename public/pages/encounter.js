/* ============================================================
   UHID — encounter.html — a doctor records a visit

   Decision 5 on screen: the encounter is the hub, and diagnoses,
   vitals, drug lines and lab orders all hang off it. Diagnoses,
   medicines and tests are picked from the catalogues (GET
   /api/catalogue), never typed as free text.

   Save sends ONE request, POST /api/encounters. The route runs
   start_encounter(), add_diagnosis() for each line, record_vitals(),
   prescribe() for each drug, order_lab() for each test and
   end_encounter(), all inside one transaction on one connection. If
   any step is refused — most usefully, trg_prescription_item_bi
   refusing a drug the patient is allergic to — everything before it
   is rolled back too, and this screen keeps the form as it was so the
   doctor can fix the one line and save again.
   ============================================================ */

const CERTAINTY   = ['provisional', 'confirmed'];
const FREQUENCIES = ['once daily', 'twice daily', 'three times daily', 'four times daily', 'at night', 'as required'];

/* What the doctor has added so far. The lists are drawn from these
   arrays; nothing is ever read back out of the page's HTML. */
const ENC = { cat: null, record: null, dx: [], rx: [], saving: false };

async function renderEncounter(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('A doctor records a visit here: diagnoses, vitals, prescriptions and lab orders, saved by MySQL whole or not at all.');
    return;
  }
  if (S.role !== 'doctor') {
    root.innerHTML = errorHtml('Doctors only', 'Recording an encounter needs the encounter.write permission, which only the doctor role holds. The database checks this, whatever this screen shows.');
    return;
  }
  if (!S.patient) {
    root.innerHTML = `
      <div class="card empty-state">
        <b>No patient selected</b>
        An encounter belongs to one patient. Find them first, then choose <i>Record encounter</i> on their record.
        <div style="margin-top:16px"><button class="btn primary" id="to-search">Go to patient search</button></div>
      </div>`;
    $('#to-search').addEventListener('click', () => go('search'));
    return;
  }

  root.innerHTML = loadingHtml('Opening the record and the diagnosis, medicine and lab catalogues.');
  try {
    ENC.cat = await API.get('/catalogue');
  } catch (e) {
    root.innerHTML = errorHtml('The catalogues could not be loaded', e.message);
    return;
  }

  /* Reading the record is a logged read, like opening it on record.html:
     a doctor about to prescribe should see the allergies. With no access
     basis to READ (423) the form still opens, and asks for a reason:
     start_encounter() accepts the visit without one only if the doctor has
     an appointment with the patient today, a referral, a consent or an
     admission (security review A1). Otherwise the reason is logged and
     reviewed like break-glass. The allergy trigger guards the prescription
     either way. */
  let noBasis = '';
  try {
    ENC.record = await API.readRecord(S.patient.uhid);
  } catch (e) {
    if (e.status !== 423) {
      root.innerHTML = errorHtml(e.status === 404 ? 'No such record' : 'The record could not be opened', e.message);
      return;
    }
    noBasis = e.message;
  }
  const p = ENC.record || store.find(S.patient.uhid) || S.patient;
  drawEncounter(root, p, noBasis);
}

function drawEncounter(root, p, noBasis) {
  const cat = ENC.cat;
  const num = (id, label, unit, attrs) => `
    <div><label class="label" for="${id}">${label} <span style="color:var(--ink-3)">${unit}</span></label>
      <input class="field mono" id="${id}" type="number" inputmode="decimal" ${attrs}></div>`;

  root.innerHTML = `
    <div class="page-h">
      <h2>Record an encounter</h2>
      <p>One visit, saved in one transaction: if any line is refused, nothing is saved, and the form stays as it is so you can correct it.</p>
    </div>
    <div class="side-grid">
      <form class="card form-card" id="enc-form" autocomplete="off" novalidate>
        <div id="enc-err"></div>
        ${noBasis ? `<div class="form-sec">
          <h3>Why are you seeing this patient?</h3>
          <div class="banner info" style="margin-bottom:12px">${warnIcon}<div><b>No access basis yet</b>
            If you have an appointment with them today, a referral or an admission, leave this empty. Otherwise &mdash; a walk-in, an emergency &mdash; give a reason. It is recorded with your name and reviewed by the hospital administrator, like break-glass.</div></div>
          <div class="row"><div><label class="label" for="e-reason">Reason</label>
            <textarea class="field" id="e-reason" rows="2" maxlength="300" placeholder="e.g. Walked in with chest pain, no appointment"></textarea></div></div>
        </div>` : ''}
        <div class="form-sec">
          <h3>Visit</h3>
          <div class="row c2">
            <div><label class="label" for="e-type">Type</label>
              <select class="field" id="e-type"><option value="OPD">OPD &mdash; outpatient</option><option value="Emergency">Emergency</option></select>
              <p class="hint">Inpatient encounters open on admission, from the bed board.</p></div>
            <div><label class="label" for="e-complaint">Chief complaint</label>
              <input class="field" id="e-complaint" maxlength="200" placeholder="e.g. Fever for three days"></div>
          </div>
          <div class="row"><div><label class="label" for="e-notes">Notes</label>
            <textarea class="field" id="e-notes" rows="3" placeholder="History, examination, plan"></textarea></div></div>
        </div>

        <div class="form-sec">
          <h3>Vitals <span class="opt">&mdash; optional</span></h3>
          <div class="row c3">
            ${num('v-sys', 'BP systolic', 'mmHg', 'min="40" max="300"')}
            ${num('v-dia', 'BP diastolic', 'mmHg', 'min="20" max="200"')}
            ${num('v-pulse', 'Pulse', '/min', 'min="20" max="250"')}
          </div>
          <div class="row c3">
            ${num('v-temp', 'Temperature', '°C', 'min="30" max="45" step="0.1"')}
            ${num('v-spo2', 'SpO&#8322;', '%', 'min="50" max="100"')}
            ${num('v-weight', 'Weight', 'kg', 'min="0.5" max="350" step="0.1"')}
          </div>
        </div>

        <div class="form-sec">
          <h3>Diagnoses <span class="opt">&mdash; at least one, from the ICD-10 catalogue</span></h3>
          <div class="adder dx">
            <div><label class="label" for="dx-pick">Diagnosis</label>
              <input class="field" id="dx-pick" list="dx-list" placeholder="Type a code or a name, then pick from the list">
              <datalist id="dx-list">${cat.diagnoses.map(d => `<option value="${esc(d.code)} — ${esc(d.term)}"></option>`).join('')}</datalist></div>
            <div><label class="label" for="dx-cert">Certainty</label>
              <select class="field" id="dx-cert">${CERTAINTY.map(c => `<option>${c}</option>`).join('')}</select></div>
            <button type="button" class="btn" id="dx-add">Add</button>
          </div>
          <div class="lines" id="dx-lines" data-empty="No diagnosis yet. Free text is not accepted: a diagnosis is a catalogue code, so it can be counted and searched across the country."></div>
        </div>

        <div class="form-sec">
          <h3>Prescription <span class="opt">&mdash; optional</span></h3>
          <div class="adder rx">
            <div><label class="label" for="rx-med">Medicine</label>
              <select class="field" id="rx-med">${cat.medicines.map(m =>
                `<option value="${Number(m.id)}">${esc(m.name)} ${esc(m.strength)} ${esc(m.form)}</option>`).join('')}</select></div>
            <div><label class="label" for="rx-dose">Dose</label><input class="field" id="rx-dose" value="1 tablet" maxlength="40"></div>
            <div><label class="label" for="rx-freq">Frequency</label>
              <select class="field" id="rx-freq">${FREQUENCIES.map(f => `<option>${f}</option>`).join('')}</select></div>
            <div><label class="label" for="rx-days">Days</label><input class="field mono" id="rx-days" type="number" min="1" max="365" value="5"></div>
            <button type="button" class="btn" id="rx-add">Add</button>
          </div>
          <div class="adder rx-note"><div>
            <label class="label" for="rx-inst">Instruction <span style="color:var(--ink-3)">optional</span></label>
            <input class="field" id="rx-inst" maxlength="120" placeholder="e.g. after meals"></div></div>
          <div class="lines" id="rx-lines" data-empty="Nothing prescribed."></div>
        </div>

        <div class="form-sec">
          <h3>Lab tests <span class="opt">&mdash; optional; they go to the lab technician&rsquo;s worklist</span></h3>
          <div class="chips" id="lab-chips">${cat.labTests.map(t => `
            <label class="chip"><input type="checkbox" value="${esc(t.name)}">${esc(t.name)}${t.unit ? ` <span class="sub">${esc(t.unit)}</span>` : ''}</label>`).join('')}</div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn primary" id="save-close">Save and close the visit</button>
          <button type="button" class="btn" id="save-open">Save, keep it open</button>
          <button type="button" class="btn ghost" id="cancel">Cancel</button>
        </div>
      </form>

      <div class="side-panel">
        <div class="card">
          <h3>${esc(p.name)}</h3>
          <span class="uhid">${esc(p.uhid)}</span>
          <div class="pt-facts">
            <div><span class="k">Age / sex</span>${ageFrom(p.dob)} &middot; ${esc(p.sex || '—')}</div>
            <div><span class="k">Blood</span>${esc(p.blood || '—')}</div>
            <div><span class="k">At</span>${esc(hospital(S.account.hospitalId).name)}</div>
          </div>
        </div>
        ${allergyPanel(noBasis)}
        <div class="card">
          <h3>What saving runs</h3>
          <ol class="steps" id="steps"></ol>
          <p class="hint">All of it inside one <span class="mono">START TRANSACTION &hellip; COMMIT</span>. A refusal at any step rolls back every step before it.</p>
        </div>
      </div>
    </div>`;

  $('#dx-add').addEventListener('click', addDiagnosis);
  $('#dx-pick').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addDiagnosis(); } });
  $('#rx-add').addEventListener('click', addDrug);
  $('#lab-chips').addEventListener('change', drawSteps);
  $('#enc-form').addEventListener('submit', e => { e.preventDefault(); saveEncounter(true); });
  $('#save-open').addEventListener('click', () => saveEncounter(false));
  $('#cancel').addEventListener('click', () => go('record'));

  drawLines();
}

function allergyPanel(noBasis) {
  if (noBasis) {
    return `<div class="banner info">${warnIcon}<div><b>No access basis for this patient&rsquo;s history yet</b>
      Their history and allergies are not shown until the visit is saved. The database still refuses any drug they are allergic to.</div></div>`;
  }
  const list = ENC.record.allergies || [];
  if (!list.length) {
    return `<div class="banner ok">${warnIcon}<div><b>No known drug allergies</b>Nothing recorded. Ask the patient before prescribing.</div></div>`;
  }
  return `<div class="banner crit">${warnIcon}<div><b>Drug allergies on file</b>${
    list.map(a => `${esc(a.agent)} &mdash; ${esc(String(a.severity).toLowerCase())}`).join('<br>')}
    <br><span class="txt" style="font-size:12px">A prescription for any of these is refused by a trigger, not by this screen.</span></div></div>`;
}

/* ---------------- adding and removing lines ---------------- */

function addDiagnosis() {
  const typed = $('#dx-pick').value.trim();
  const code = typed.split(' — ')[0].trim().toUpperCase();
  const dx = ENC.cat.diagnoses.find(d => d.code.toUpperCase() === code)
          || ENC.cat.diagnoses.find(d => d.term.toLowerCase() === typed.toLowerCase());
  if (!dx) { toast('Pick from the list', 'A diagnosis must be a code in the ICD-10 catalogue.', 'err'); return; }
  if (ENC.dx.some(d => d.code === dx.code)) { toast('Already added', `${dx.code} is on this encounter.`, 'err'); return; }
  ENC.dx.push({ code: dx.code, term: dx.term, certainty: $('#dx-cert').value, primary: ENC.dx.length === 0 });
  $('#dx-pick').value = '';
  $('#dx-pick').focus();
  drawLines();
}

function addDrug() {
  const med = ENC.cat.medicines.find(m => m.id === Number($('#rx-med').value));
  const dose = $('#rx-dose').value.trim();
  const days = Number($('#rx-days').value);
  if (!med || !dose) { toast('Incomplete line', 'A drug line needs a medicine and a dose.', 'err'); return; }
  ENC.rx.push({
    medicineId: med.id, label: `${med.name} ${med.strength} ${med.form}`, drugClass: med.class,
    dose, frequency: $('#rx-freq').value, days: days > 0 ? days : null,
    instruction: $('#rx-inst').value.trim()
  });
  $('#rx-inst').value = '';
  drawLines();
}

function drawLines() {
  $('#dx-lines').innerHTML = ENC.dx.map((d, i) => `
    <div class="line">
      <span class="mono">${esc(d.code)}</span>
      <span class="grow">${esc(d.term)}</span>
      <span class="pill ${d.certainty === 'confirmed' ? 'ok' : 'mute'}">${esc(d.certainty)}</span>
      <label><input type="radio" name="dx-primary" data-primary="${i}"${d.primary ? ' checked' : ''}>primary</label>
      <button type="button" class="x" data-dx-del="${i}" aria-label="Remove ${esc(d.code)}">&times;</button>
    </div>`).join('');

  $('#rx-lines').innerHTML = ENC.rx.map((r, i) => `
    <div class="line">
      <span class="grow"><b>${esc(r.label)}</b><br><span class="sub">${esc(r.dose)}, ${esc(r.frequency)}${r.days ? `, ${Number(r.days)} days` : ''}${r.instruction ? ` &middot; ${esc(r.instruction)}` : ''}</span></span>
      <span class="pill mute">${esc(r.drugClass || '')}</span>
      <button type="button" class="x" data-rx-del="${i}" aria-label="Remove ${esc(r.label)}">&times;</button>
    </div>`).join('');

  $$('[data-primary]').forEach(el => el.addEventListener('change', () => {
    ENC.dx.forEach((d, i) => { d.primary = i === Number(el.dataset.primary); });
  }));
  $$('[data-dx-del]').forEach(el => el.addEventListener('click', () => {
    ENC.dx.splice(Number(el.dataset.dxDel), 1);
    if (ENC.dx.length && !ENC.dx.some(d => d.primary)) ENC.dx[0].primary = true;
    drawLines();
  }));
  $$('[data-rx-del]').forEach(el => el.addEventListener('click', () => {
    ENC.rx.splice(Number(el.dataset.rxDel), 1);
    drawLines();
  }));
  drawSteps();
}

/* The side panel lists the procedure calls Save will make, with counts —
   the transaction in the route, made visible. */
function drawSteps() {
  const labs = $$('#lab-chips input:checked').length;
  const steps = [
    ['start_encounter()', 'opens the visit under your posting here'],
    ENC.dx.length && [`add_diagnosis() × ${ENC.dx.length}`, 'one per diagnosis'],
    ['record_vitals()', 'if any vital is filled in'],
    ENC.rx.length && [`prescribe() × ${ENC.rx.length}`, 'the allergy trigger checks each line'],
    labs && [`order_lab() × ${labs}`, 'each lands on the lab worklist'],
    ['end_encounter()', 'only for “Save and close”']
  ].filter(Boolean);
  $('#steps').innerHTML = steps.map(([call, why]) => `<li><span class="mono">${esc(call)}</span> &mdash; ${esc(why)}</li>`).join('');
}

/* ---------------- saving ---------------- */

const numOrNull = id => { const v = $('#' + id).value.trim(); return v === '' ? null : Number(v); };

async function saveEncounter(end) {
  if (ENC.saving) return;
  const err = $('#enc-err');
  err.innerHTML = '';
  if (!ENC.dx.length) {
    err.innerHTML = `<div class="banner crit" style="margin-bottom:16px">${warnIcon}<div><b>Add a diagnosis first</b>Every encounter records at least one, even a provisional one.</div></div>`;
    $('#dx-pick').focus();
    return;
  }

  const vitals = { systolic: numOrNull('v-sys'), diastolic: numOrNull('v-dia'), pulse: numOrNull('v-pulse'),
                   temp: numOrNull('v-temp'), spo2: numOrNull('v-spo2'), weight: numOrNull('v-weight') };
  const body = {
    uhid: S.patient.uhid,
    type: $('#e-type').value,
    complaint: $('#e-complaint').value.trim(),
    notes: $('#e-notes').value.trim(),
    reason: $('#e-reason') ? $('#e-reason').value.trim() : '',
    diagnoses: ENC.dx.map(d => ({ icd10: d.code, primary: d.primary, certainty: d.certainty })),
    vitals: Object.values(vitals).some(v => v !== null) ? vitals : null,
    prescriptions: ENC.rx.map(r => ({ medicineId: r.medicineId, dose: r.dose, frequency: r.frequency, days: r.days, instruction: r.instruction })),
    labTests: $$('#lab-chips input:checked').map(el => el.value),
    end
  };

  ENC.saving = true;
  $$('.form-actions .btn').forEach(b => { b.disabled = true; });
  try {
    await API.post('/encounters', body);
  } catch (e) {
    ENC.saving = false;
    $$('.form-actions .btn').forEach(b => { b.disabled = false; });
    if (e.status === 423 && $('#e-reason')) $('#e-reason').focus();
    err.innerHTML = `<div class="banner crit" style="margin-bottom:16px">${warnIcon}<div><b>Nothing was saved</b>${esc(e.message)}
      <br><span class="txt" style="font-size:12px">The whole visit was rolled back, including every line before the one refused. Correct it and save again.</span></div></div>`;
    err.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const parts = [`${body.diagnoses.length} diagnos${body.diagnoses.length === 1 ? 'is' : 'es'}`];
  if (body.prescriptions.length) parts.push(`${body.prescriptions.length} drug line${body.prescriptions.length === 1 ? '' : 's'}`);
  if (body.labTests.length) parts.push(`${body.labTests.length} lab order${body.labTests.length === 1 ? '' : 's'}`);
  toast(end ? 'Encounter saved and closed' : 'Encounter saved — still open', parts.join(', ') + ', in one transaction.');
  go('record');
}

boot(renderEncounter);
