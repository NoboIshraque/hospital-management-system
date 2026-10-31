/* ============================================================
   UHID — register.html — issue a UHID
   Duplicate detection on NID, name + date of birth, and mobile.
   ============================================================ */

function renderRegister(root) {
  root.innerHTML = `
    <div class="page-h">
      <h2>Register a new patient</h2>
      <p>Search before you create. A patient must never end up with two UHIDs &mdash; the panel on the right re-checks the national register on every keystroke.</p>
    </div>
    <div class="reg-grid">
      <form class="card form-card" id="reg-form" autocomplete="off">
        <div class="form-sec">
          <h3>Identity</h3>
          <div class="row c2">
            <div>
              <label class="label" for="f-nid">National ID / birth registration no.</label>
              <input class="field mono" id="f-nid" placeholder="1978419923041">
              <p class="hint">Leave blank only if the patient genuinely has neither.</p>
            </div>
            <div>
              <label class="label" for="f-name">Full name</label>
              <input class="field" id="f-name" placeholder="Md. Rahim Uddin">
            </div>
          </div>
          <div class="row c3">
            <div><label class="label" for="f-dob">Date of birth</label><input class="field mono" id="f-dob" type="date"></div>
            <div><label class="label" for="f-sex">Sex</label><select class="field" id="f-sex"><option>Male</option><option>Female</option><option>Other</option></select></div>
            <div><label class="label" for="f-phone">Mobile</label><input class="field mono" id="f-phone" placeholder="01711-482031"></div>
          </div>
        </div>
        <div class="form-sec">
          <h3>Clinical &amp; contact</h3>
          <div class="row c3">
            <div><label class="label" for="f-blood">Blood group</label><select class="field" id="f-blood">${BLOODS.map(b => `<option>${b}</option>`).join('')}</select></div>
            <div><label class="label" for="f-div">Division</label><select class="field" id="f-div">${DIVISIONS.map(d => `<option>${d}</option>`).join('')}</select></div>
            <div><label class="label" for="f-dist">District</label><input class="field" id="f-dist" placeholder="Dhaka" list="dist-list"><datalist id="dist-list"></datalist></div>
          </div>
          <div class="row"><div><label class="label" for="f-addr">Address</label><input class="field" id="f-addr" placeholder="House, road, area"></div></div>
          <div class="row c2">
            <div><label class="label" for="f-kin">Next of kin</label><input class="field" id="f-kin" placeholder="Name and relationship"></div>
            <div><label class="label" for="f-kinphone">Kin mobile</label><input class="field mono" id="f-kinphone" placeholder="01911-330218"></div>
          </div>
          <div class="row"><div>
            <label class="label" for="f-allergy">Known drug allergies</label>
            <input class="field" id="f-allergy" placeholder="Penicillin, Aspirin — comma separated, leave blank if none">
          </div></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn primary">Issue UHID &amp; create record</button>
          <button type="button" class="btn ghost" id="clear-btn">Clear</button>
        </div>
      </form>
      <div class="card match-panel">
        <div class="match-head">
          <h3>Possible existing records</h3>
          <p>Matched on NID, name + date of birth, and mobile number.</p>
        </div>
        <div class="match-body" id="matches"></div>
      </div>
    </div>`;

  /* Online, the district must be one of the 64 in the database:
     register_patient() refuses anything else. Offer them as suggestions. */
  if (API.online) {
    API.get('/districts')
      .then(list => { $('#dist-list').innerHTML = list.map(d => `<option value="${esc(d.district)}">${esc(d.div)}</option>`).join(''); })
      .catch(() => { /* suggestions are a convenience; typing still works */ });
  }

  ['f-nid','f-name','f-dob','f-phone'].forEach(id => $('#' + id).addEventListener('input', runMatch));
  $('#clear-btn').addEventListener('click', () => { $('#reg-form').reset(); runMatch(); });
  $('#reg-form').addEventListener('submit', submitRegistration);
  runMatch();
}

/* Deliberately simple and readable. In week 4 this becomes a
   MySQL query inside sp_register_patient — same three criteria. */
function currentMatches() {
  const val = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const nid   = val('f-nid');
  const name  = val('f-name').toLowerCase();
  const dob   = val('f-dob');
  const phone = val('f-phone').replace(/\D/g, '');

  return store.all().map(p => {
    let score = 0;
    if (nid && p.nid && p.nid === nid)                            score += 100;
    if (name.length > 2 && p.name.toLowerCase().includes(name))   score += 40;
    if (dob && p.dob === dob)                                     score += 35;
    if (phone.length > 4 && (p.phone || '').replace(/\D/g, '') === phone) score += 45;
    return { p, score };
  }).filter(m => m.score >= 35).sort((a, b) => b.score - a.score);
}

function runMatch() {
  const box = $('#matches');
  if (!box) return;
  const matches = currentMatches();

  if (matches.length === 0) {
    box.innerHTML = `<div class="match-empty">No existing record matches yet.<br>Keep typing &mdash; the check runs on every field.</div>`;
    return;
  }

  box.innerHTML = matches.map(m => {
    const exact = m.score >= 90;
    return `
      <div class="cand${exact ? ' strong' : ''}">
        <div class="cand-top">
          <b>${esc(m.p.name)}</b>
          <span class="pill ${exact ? 'crit' : 'warn'}"><i class="dot"></i>${exact ? 'Exact' : 'Possible'}</span>
        </div>
        <div class="cand-meta">
          <span class="k">UHID</span> <span class="mono">${esc(m.p.uhid)}</span><br>
          <span class="k">DOB</span> ${esc(m.p.dob)} &nbsp;&middot;&nbsp; ${esc(m.p.sex)} &nbsp;&middot;&nbsp; ${esc(m.p.blood)}<br>
          <span class="k">Mobile</span> <span class="mono">${esc(m.p.phone)}</span><br>
          <span class="k">District</span> ${esc(m.p.district)}
        </div>
        <div class="cand-acts">
          <button class="btn sm primary" data-use="${esc(m.p.uhid)}">Use this record</button>
          <span class="score" style="align-self:center;color:var(--ink-3)">match ${m.score}</span>
        </div>
      </div>`;
  }).join('');

  $$('[data-use]', box).forEach(b => b.addEventListener('click', () => {
    toast('Existing record opened', 'No new UHID issued — ' + b.dataset.use + ' reused.');
    openPatient(b.dataset.use);
  }));
}

/* UHID format: BD - year issued - serial - check digit.
   The check digit is the serial's digits summed mod 10, so a
   mistyped UHID can be caught before it hits the database. */
function issueUhid() {
  const year   = new Date().getFullYear();
  const serial = String(Math.floor(Math.random() * 90000) + 10000);
  return `BD-${year}-${serial}-${uhidCheckDigit(serial)}`;
}

async function submitRegistration(e) {
  e.preventDefault();

  const v = id => $('#' + id).value.trim();
  const name = v('f-name');
  const dob  = v('f-dob');
  const nid  = v('f-nid');

  if (!name) { toast('Name required', 'Enter the full name before issuing a UHID.', 'err'); $('#f-name').focus(); return; }
  if (!dob)  { toast('Date of birth required', 'Age drives dosing and ward allocation — it is not optional.', 'err'); $('#f-dob').focus(); return; }

  if (currentMatches().some(m => m.score >= 90)) {
    toast('Blocked — exact match', 'This NID already holds a UHID. Open the existing record instead of creating a second one.', 'err');
    return;
  }

  let patient;
  if (API.online) {
    /* The server issues the UHID: register_patient() takes the next serial
       under a lock, so no browser ever invents one. 'Salma Rahim (wife)'
       is split into the name and relationship columns. */
    const kin = v('f-kin').match(/^(.*?)\s*\((.+)\)\s*$/);
    const btn = $('#reg-form button[type=submit]');
    btn.disabled = true;
    try {
      patient = await API.post('/patients', {
        name, dob, nid,
        sex: $('#f-sex').value,
        blood: $('#f-blood').value,
        phone: v('f-phone'),
        district: v('f-dist'),
        address: v('f-addr'),
        kinName: kin ? kin[1] : v('f-kin'),
        kinRelation: kin ? kin[2] : '',
        kinPhone: v('f-kinphone'),
        allergies: v('f-allergy') ? v('f-allergy').split(',').map(x => x.trim()).filter(Boolean) : []
      });
    } catch (err) {
      toast('Not registered', err.message, 'err');
      return;
    } finally {
      btn.disabled = false;
    }
    store.add(patient);
  } else {
    patient = offlinePatient(v, name, dob, nid);
    store.add(patient);
  }
  S.patient = patient;
  showIssued(patient);
}

/* Offline only: the prototype's stand-in, which invents a UHID in the
   browser. Online the database issues it. */
function offlinePatient(v, name, dob, nid) {
  return {
    uhid: issueUhid(),
    name,
    dob,
    sex:   $('#f-sex').value,
    blood: $('#f-blood').value,
    phone: v('f-phone') || '—',
    nid,
    district: v('f-dist') || $('#f-div').value,
    address:  v('f-addr') || '—',
    kin:      v('f-kin') ? v('f-kin') + (v('f-kinphone') ? ' · ' + v('f-kinphone') : '') : '—',
    registeredAt: new Date().toISOString().slice(0, 10),
    registeredHospitalId: S.account.hospitalId || 1,
    identityVerified: Boolean(nid),
    allergies: v('f-allergy')
      ? v('f-allergy').split(',').map(s => s.trim()).filter(Boolean)
          .map(agent => ({ agent, severity: 'Recorded at registration', note: 'reported by patient' }))
      : [],
    encounters: []
  };
}

function showIssued(patient) {
  const sc = modal(`
    <div class="modal-h">
      <h3>UHID issued</h3>
      <p>Saved. This identifier now follows the patient to every connected hospital.</p>
    </div>
    <div class="modal-b">
      <div style="text-align:center;padding:12px 0 20px">
        <span class="uhid" style="font-size:19px;padding:8px 16px;display:inline-block">${esc(patient.uhid)}</span>
      </div>
      <dl class="kv">
        <dt>Name</dt><dd>${esc(patient.name)}</dd>
        <dt>Date of birth</dt><dd>${esc(patient.dob)} &middot; age ${ageFrom(patient.dob)}</dd>
        <dt>Registered at</dt><dd>${esc(hospital(patient.registeredHospitalId).name)}</dd>
        <dt>Identity check</dt><dd>${patient.identityVerified
          ? 'NID verified'
          : '<span style="color:var(--warn)">Unverified &mdash; NID pending</span>'}</dd>
      </dl>
    </div>
    <div class="modal-f">
      <button class="btn" data-close>Register another</button>
      <button class="btn primary" data-open>Open record</button>
    </div>`);

  $('[data-close]', sc).addEventListener('click', () => { $('#reg-form').reset(); runMatch(); });
  $('[data-open]', sc).addEventListener('click', () => { sc.remove(); go('record'); });

  toast('Patient saved', patient.name + ' is now searchable nationally.');
  runMatch();
}

boot(renderRegister);
