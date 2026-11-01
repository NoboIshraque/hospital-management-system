/* ============================================================
   UHID — wards.html — bed board

   Online, the board is v_bed_board for the signed-in hospital, and
   admit / discharge / clean call procedures that write
   bed_occupancy. This screen never sets a bed's status: a trigger on
   bed_occupancy does (decision 7), and the database user the server
   connects as could not UPDATE the bed table even if it tried.

   Offline, bed state is kept in localStorage, standing in for that
   trigger, as the prototype did.
   ============================================================ */

function bedRow(prefix, states) {
  const map   = { O: 'occupied', F: 'free', R: 'reserved', C: 'cleaning' };
  const names = ['Md. Rahim Uddin','Fatema Begum','Abdul Karim Mia','Shirin Akter','Jashim Uddin','Rokeya Khatun','Sujon Mia','Nasrin Sultana','Habibur Rahman','Momena Begum'];
  const dxs   = ['Pneumonia','Acute MI','Dengue fever','Post-op recovery','CKD stage 4','Cellulitis','Typhoid fever','COPD exacerbation'];
  return states.split('').map((ch, i) => {
    const status = map[ch] || 'free';
    const occ = status === 'occupied';
    const serial = String(10000 + i * 137).slice(0, 5);
    return {
      no: prefix + '-' + String(i + 1).padStart(2, '0'),
      status,
      patient: occ ? names[i % names.length] : null,
      uhid:    occ ? `BD-20${18 + (i % 8)}-${serial}-${uhidCheckDigit(serial)}` : null,
      dx:      occ ? dxs[i % dxs.length] : null,
      days:    occ ? (i % 9) + 1 : null
    };
  });
}

/* Offline seed. Online, renderWards replaces WARDS with GET /api/wards. */
let WARDS = wardStore.all([
  { name: 'General Medicine — Male',   type: 'General', beds: bedRow('GM',  'OOOFOOCOOFOROOOFOOOO') },
  { name: 'General Medicine — Female', type: 'General', beds: bedRow('GF',  'OFOOOFOOROOFOOCF') },
  { name: 'Intensive Care Unit',       type: 'ICU',     beds: bedRow('ICU', 'OOOOOOFC') },
  { name: 'Paediatric Ward',           type: 'Paeds',   beds: bedRow('PD',  'FOOFOFFOOFFO') }
]);

/* 'out of service' is one status with spaces in it; as a CSS class it
   would become three. */
const bedClass = status => status.replace(/\s+/g, '-');

async function renderWards(root) {
  if (API.online) {
    if (!WARDS.length || !WARDS[0].id) root.innerHTML = loadingHtml('Reading the bed board.');
    try { WARDS = await API.get('/wards'); }
    catch (e) { root.innerHTML = errorHtml('The bed board could not be loaded', e.message); return; }
    if (!WARDS.length) { root.innerHTML = errorHtml('No wards', 'This hospital has no wards on record.'); return; }
  }

  const all = WARDS.flatMap(w => w.beds);
  const count = status => all.filter(b => b.status === status).length;
  const occPct = Math.round(count('occupied') / all.length * 100);
  const hosp = hospital(S.account.hospitalId || 1);

  root.innerHTML = `
    <div class="page-h">
      <h2>Wards &amp; beds</h2>
      <p>${esc(hosp.name)} &middot; live occupancy. Bed status is maintained by a database trigger when a patient is admitted, transferred or discharged &mdash; never by the application.</p>
    </div>
    <div class="stats">
      <div class="card stat"><div class="k">Total beds</div><div class="v">${all.length}</div><div class="sub">across ${WARDS.length} wards</div></div>
      <div class="card stat crit"><div class="k">Occupied</div><div class="v">${count('occupied')}</div><div class="sub">${occPct}% occupancy</div></div>
      <div class="card stat ok"><div class="k">Free now</div><div class="v">${count('free')}</div><div class="sub">ready for admission</div></div>
      <div class="card stat warn"><div class="k">Reserved</div><div class="v">${count('reserved')}</div><div class="sub">held for scheduled admissions</div></div>
      <div class="card stat"><div class="k">Cleaning</div><div class="v">${count('cleaning')}</div><div class="sub">turnaround in progress</div></div>
    </div>
    <div class="bed-legend">
      <span><i class="sw free"></i>Free</span><span><i class="sw occupied"></i>Occupied</span>
      <span><i class="sw reserved"></i>Reserved</span><span><i class="sw cleaning"></i>Cleaning</span>
      ${count('out of service') ? '<span><i class="sw out-of-service"></i>Out of service</span>' : ''}
    </div>
    ${WARDS.map((w, wi) => {
      const occ = w.beds.filter(b => b.status === 'occupied').length;
      const pct = Math.round(occ / w.beds.length * 100);
      const cls = pct >= 85 ? 'crit' : pct >= 65 ? 'warn' : '';
      return `
      <div class="card ward">
        <div class="ward-h">
          <b>${esc(w.name)}</b>
          <span class="pill mute">${esc(w.type)}</span>
          <span class="meter"><i class="${cls}" style="width:${Number(pct)}%"></i></span>
          <span class="cap">${occ} / ${w.beds.length} &middot; ${pct}%</span>
        </div>
        <div class="beds">${w.beds.map((b, bi) => `
          <button class="bed ${esc(bedClass(b.status))}" data-w="${wi}" data-b="${bi}">
            <span class="no">${esc(b.no)}</span><span class="st">${esc(b.status)}</span>
          </button>`).join('')}</div>
      </div>`;
    }).join('')}`;

  $$('.bed', root).forEach(btn =>
    btn.addEventListener('click', () => openBed(Number(btn.dataset.w), Number(btn.dataset.b))));
}

/* After any change online, read the board again from the database —
   the trigger, not this screen, decided what the beds now say. */
function afterChange(title, msg) {
  toast(title, msg);
  if (!API.online) wardStore.write(WARDS);
  renderWards($('#view'));
}

function openBed(wi, bi) {
  const w = WARDS[wi];
  const b = w.beds[bi];

  if (b.status === 'occupied') {
    const sc = modal(`
      <div class="modal-h"><h3>${esc(b.no)}</h3><p>${esc(w.name)}</p></div>
      <div class="modal-b"><dl class="kv">
        <dt>Patient</dt><dd>${esc(b.patient)}</dd>
        <dt>UHID</dt><dd class="mono">${esc(b.uhid)}</dd>
        <dt>Diagnosis</dt><dd>${esc(b.dx || 'Under investigation')}</dd>
        <dt>Day of stay</dt><dd>Day ${Number(b.days)}</dd>
        <dt>Status</dt><dd><span class="pill crit"><i class="dot"></i>Occupied</span></dd>
      </dl>
      ${API.online ? '<p class="hint">Only a doctor may discharge. The database checks this, not the screen.</p>' : ''}</div>
      <div class="modal-f">
        <button class="btn" data-close>Close</button>
        <button class="btn" data-transfer>Transfer&hellip;</button>
        <button class="btn primary" data-discharge>Discharge</button>
      </div>`);
    $('[data-transfer]', sc).addEventListener('click', () => { sc.remove(); openTransfer(wi, bi); });
    $('[data-discharge]', sc).addEventListener('click', async () => {
      if (API.online) {
        try { await API.post(`/admissions/${b.admissionId}/discharge`, { outcome: 'recovered' }); }
        catch (e) { toast('Not discharged', e.message, 'err'); return; }
      } else {
        b.status = 'cleaning'; b.patient = null; b.uhid = null; b.dx = null; b.days = null;
      }
      sc.remove();
      afterChange('Patient discharged', `${b.no} released and sent for cleaning.`);
    });
    return;
  }

  if (b.status === 'cleaning' && API.online) {
    const sc = modal(`
      <div class="modal-h"><h3>${esc(b.no)}</h3><p>${esc(w.name)}</p></div>
      <div class="modal-b">This bed is being cleaned after a discharge. Mark it clean when it is ready for the next patient.</div>
      <div class="modal-f"><button class="btn" data-close>Close</button><button class="btn primary" data-ok>Mark clean</button></div>`);
    $('[data-ok]', sc).addEventListener('click', async () => {
      try { await API.post('/beds/clean', { wardId: w.id, bedNo: b.no }); }
      catch (e) { toast('Not changed', e.message, 'err'); return; }
      sc.remove();
      afterChange('Bed ready', `${b.no} is clean and free.`);
    });
    return;
  }

  if (b.status !== 'free') {
    toast('Bed unavailable', `${b.no} is ${b.status}.`, 'err');
    return;
  }

  const options = store.all()
    .map(p => `<option value="${esc(p.uhid)}">${esc(p.name)} — ${esc(p.uhid)}</option>`).join('');
  // Online, an admission is under a consultant who works at this hospital.
  const consultants = DOCTORS.filter(d => d.hospitalId === (S.account.hospitalId || 1))
    .map(d => `<option value="${Number(d.id)}">${esc(d.name)} — ${esc(d.dept)}</option>`).join('');

  const sc = modal(`
    <div class="modal-h"><h3>Admit to ${esc(b.no)}</h3><p>${esc(w.name)}</p></div>
    <div class="modal-b">
      <div class="row"><div>
        <label class="label" for="ad-uhid">Patient</label>
        <select class="field" id="ad-uhid">${options}</select>
      </div></div>
      ${API.online ? `<div class="row"><div>
        <label class="label" for="ad-doc">Admitting consultant</label>
        <select class="field" id="ad-doc">${consultants}</select>
      </div></div>` : ''}
      <div class="row"><div>
        <label class="label" for="ad-dx">${API.online ? 'Reason for admission' : 'Admitting diagnosis'}</label>
        <input class="field" id="ad-dx" placeholder="e.g. Pneumonia" value="Pneumonia">
      </div></div>
      <p class="hint">Allocating the bed and opening the admission happen in one transaction &mdash; both succeed, or neither does.</p>
    </div>
    <div class="modal-f">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" data-ok>Admit patient</button>
    </div>`);

  $('[data-ok]', sc).addEventListener('click', async () => {
    const uhid = $('#ad-uhid', sc).value;
    const chosen = store.find(uhid);
    const reason = $('#ad-dx', sc).value.trim();
    if (API.online) {
      try {
        await API.post('/admissions', {
          uhid, postingId: Number($('#ad-doc', sc).value), wardId: w.id, bedNo: b.no, complaint: reason
        });
      } catch (e) { toast('Not admitted', e.message, 'err'); return; }
    } else {
      b.status  = 'occupied';
      b.patient = chosen ? chosen.name : 'Unknown';
      b.uhid    = chosen ? chosen.uhid : '—';
      b.dx      = reason || 'Under investigation';
      b.days    = 1;
    }
    sc.remove();
    afterChange('Patient admitted', `${chosen ? chosen.name : uhid} into ${b.no}, ${w.name}.`);
  });
}

/* Move an inpatient to another bed. Online, transfer_patient() closes the
   old bed_occupancy row and opens a new one in one transaction; the
   triggers then set the old bed to cleaning and the new one to occupied,
   and refuse a bed that is not free, the wrong sex's ward, or an adult in
   paediatrics — in which case the patient stays exactly where they were. */
function openTransfer(wi, bi) {
  const w = WARDS[wi];
  const b = w.beds[bi];
  const groups = WARDS.map((ward, i) => {
    const free = ward.beds.map((bed, j) => ({ bed, j })).filter(x => x.bed.status === 'free');
    return free.length
      ? `<optgroup label="${esc(ward.name)}">${free.map(x => `<option value="${i}:${x.j}">${esc(x.bed.no)}</option>`).join('')}</optgroup>`
      : '';
  }).join('');

  if (!groups) { toast('No free bed', 'Every bed in this hospital is taken or being cleaned.', 'err'); return; }

  const sc = modal(`
    <div class="modal-h"><h3>Transfer ${esc(b.patient)}</h3><p>From ${esc(b.no)}, ${esc(w.name)}</p></div>
    <div class="modal-b">
      <div class="row"><div>
        <label class="label" for="tr-bed">Move to</label>
        <select class="field" id="tr-bed">${groups}</select>
      </div></div>
      <p class="hint">The old bed goes for cleaning and the new one is occupied in one transaction. ${API.online ? 'The database refuses a ward for the other sex, or an adult in paediatrics, and then nothing moves.' : ''}</p>
    </div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Transfer</button></div>`);

  $('[data-ok]', sc).addEventListener('click', async () => {
    const [ti, tj] = $('#tr-bed', sc).value.split(':').map(Number);
    const tw = WARDS[ti];
    const tb = tw.beds[tj];
    if (API.online) {
      try { await API.post(`/admissions/${b.admissionId}/transfer`, { wardId: tw.id, bedNo: tb.no }); }
      catch (e) { toast('Not transferred', e.message, 'err'); return; }
    } else {
      Object.assign(tb, { status: 'occupied', patient: b.patient, uhid: b.uhid, dx: b.dx, days: b.days });
      Object.assign(b, { status: 'cleaning', patient: null, uhid: null, dx: null, days: null });
    }
    sc.remove();
    afterChange('Patient transferred', `${tb.patient || b.patient || 'Patient'} moved from ${b.no} to ${tb.no}, ${tw.name}.`);
  });
}

boot(renderWards);
