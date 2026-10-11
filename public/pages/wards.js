/* ============================================================
   UHID — wards.html — bed board
   Bed state is persisted so an admission survives navigating away.
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

/* The bed board is the one screen that writes state. Now that each
   screen is its own document, "go to search and come back" is a
   reload — so the board is stored, and wardStore.all() falls back
   to this seed the first time it is opened.

   In the finished system bed status is maintained by a database
   trigger on admission, transfer and discharge — never by the
   application. This is standing in for that trigger. */
const WARDS = wardStore.all([
  { name: 'General Medicine — Male',   type: 'General', beds: bedRow('GM',  'OOOFOOCOOFOROOOFOOOO') },
  { name: 'General Medicine — Female', type: 'General', beds: bedRow('GF',  'OFOOOFOOROOFOOCF') },
  { name: 'Intensive Care Unit',       type: 'ICU',     beds: bedRow('ICU', 'OOOOOOFC') },
  { name: 'Paediatric Ward',           type: 'Paeds',   beds: bedRow('PD',  'FOOFOFFOOFFO') }
]);

function renderWards(root) {
  const all = WARDS.flatMap(w => w.beds);
  const count = status => all.filter(b => b.status === status).length;
  const occPct = Math.round(count('occupied') / all.length * 100);
  const hosp = hospital(ROLES[S.role].hospital || 1);

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
          <span class="meter"><i class="${cls}" style="width:${pct}%"></i></span>
          <span class="cap">${occ} / ${w.beds.length} &middot; ${pct}%</span>
        </div>
        <div class="beds">${w.beds.map((b, bi) => `
          <button class="bed ${b.status}" data-w="${wi}" data-b="${bi}">
            <span class="no">${esc(b.no)}</span><span class="st">${b.status}</span>
          </button>`).join('')}</div>
      </div>`;
    }).join('')}`;

  $$('.bed', root).forEach(btn =>
    btn.addEventListener('click', () => openBed(Number(btn.dataset.w), Number(btn.dataset.b))));
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
        <dt>Diagnosis</dt><dd>${esc(b.dx)}</dd>
        <dt>Day of stay</dt><dd>Day ${b.days}</dd>
        <dt>Status</dt><dd><span class="pill crit"><i class="dot"></i>Occupied</span></dd>
      </dl></div>
      <div class="modal-f">
        <button class="btn" data-close>Close</button>
        <button class="btn primary" data-discharge>Discharge</button>
      </div>`);
    $('[data-discharge]', sc).addEventListener('click', () => {
      b.status = 'cleaning'; b.patient = null; b.uhid = null; b.dx = null; b.days = null;
      sc.remove();
      toast('Patient discharged', b.no + ' released and sent for cleaning.');
      wardStore.write(WARDS);
      renderWards($('#view'));
    });
    return;
  }

  if (b.status !== 'free') {
    toast('Bed unavailable', b.no + ' is ' + b.status + '.', 'err');
    return;
  }

  const options = store.all()
    .map(p => `<option value="${esc(p.uhid)}">${esc(p.name)} — ${esc(p.uhid)}</option>`).join('');

  const sc = modal(`
    <div class="modal-h"><h3>Admit to ${esc(b.no)}</h3><p>${esc(w.name)}</p></div>
    <div class="modal-b">
      <div class="row"><div>
        <label class="label" for="ad-uhid">Patient</label>
        <select class="field" id="ad-uhid">${options}</select>
      </div></div>
      <div class="row"><div>
        <label class="label" for="ad-dx">Admitting diagnosis</label>
        <input class="field" id="ad-dx" placeholder="e.g. Pneumonia" value="Pneumonia">
      </div></div>
      <p class="hint">Allocating the bed and opening the admission happen in one transaction &mdash; both succeed, or neither does.</p>
    </div>
    <div class="modal-f">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" data-ok>Admit patient</button>
    </div>`);

  $('[data-ok]', sc).addEventListener('click', () => {
    const chosen = store.find($('#ad-uhid').value);
    b.status  = 'occupied';
    b.patient = chosen ? chosen.name : 'Unknown';
    b.uhid    = chosen ? chosen.uhid : '—';
    b.dx      = $('#ad-dx').value.trim() || 'Under investigation';
    b.days    = 1;
    sc.remove();
    toast('Patient admitted', b.patient + ' into ' + b.no + ', ' + w.name + '.');
    wardStore.write(WARDS);
    renderWards($('#view'));
  });
}

boot(renderWards);
