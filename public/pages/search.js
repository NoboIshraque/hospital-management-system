/* ============================================================
   UHID — search.html — find a patient
   One lookup across every connected hospital.
   ============================================================ */

function renderSearch(root) {
  root.innerHTML = `
    <div class="page-h">
      <h2>Find a patient</h2>
      <p>One lookup searches every connected hospital in the country. Try <b>Rahim</b>, <b>BD-2019</b> or <b>01711</b> &mdash; anyone you register also appears here.</p>
    </div>
    <div class="card" style="padding:15px 17px;margin-bottom:16px">
      <label class="label" for="ps">UHID, name, mobile or NID</label>
      <input class="field" id="ps" placeholder="Start typing&hellip;">
    </div>
    <div id="ps-out"></div>`;
  $('#ps').addEventListener('input', runSearch);
  runSearch();
}

function runSearch() {
  const q = $('#ps').value.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const out = $('#ps-out');
  const all = store.all();

  const hits = q.length < 2 ? all : all.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.uhid.toLowerCase().includes(q) ||
    (digits.length > 2 && p.phone.replace(/\D/g, '').includes(digits)) ||
    (digits.length > 2 && p.nid && p.nid.includes(digits))
  );

  if (hits.length === 0) {
    out.innerHTML = `<div class="card empty-state"><b>No match</b>No patient record matches &ldquo;${esc(q)}&rdquo;.</div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  out.innerHTML = `
    <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 10px">
      ${hits.length} record${hits.length > 1 ? 's' : ''}${q.length < 2 ? ' on file' : ' found nationally'}
    </p>
    <div class="doc-list">${hits.map(p => `
      <div class="card doc">
        <div class="doc-top">
          <div class="doc-av">${initials(p.name)}</div>
          <div class="doc-id">
            <b>${esc(p.name)} ${p.registeredAt === today ? '<span class="badge-new">new</span>' : ''}</b>
            <span class="spec mono" style="font-size:12px">${esc(p.uhid)}</span>
            <span class="qual">${esc(p.dob)} &middot; ${esc(p.sex)} &middot; ${esc(p.blood)} &middot; ${esc(p.district)}</span>
          </div>
        </div>
        <div class="doc-foot">
          <span class="next-free">
            <span class="mono">${esc(p.phone)}</span><br>
            <span style="font-size:11.5px;color:var(--ink-3)">${p.encounters.length} encounter${p.encounters.length === 1 ? '' : 's'}</span>
          </span>
          <button class="btn sm primary" data-open="${esc(p.uhid)}">Open record</button>
        </div>
      </div>`).join('')}</div>`;

  $$('[data-open]', out).forEach(b => b.addEventListener('click', () => openPatient(b.dataset.open)));
}

boot(renderSearch);
