/* ============================================================
   UHID — search.html — find a patient
   One lookup across every connected hospital.
   ============================================================ */

function renderSearch(root) {
  root.innerHTML = `
    <div class="page-h">
      <h2>Find a patient</h2>
      <p>${API.online
        ? `One lookup searches every connected hospital in the country. Name who you are looking for &mdash; try <b>Rahim</b>, <b>BD-2019-04821-5</b> or <b>01711-482031</b>. At most 20 people come back, NID and mobile are masked, and every person shown is logged against your name.`
        : `One lookup searches every connected hospital in the country. Try <b>Rahim</b>, <b>BD-2019</b> or <b>01711</b> &mdash; anyone you register also appears here.`}</p>
    </div>
    <div class="card" style="padding:15px 17px;margin-bottom:16px">
      <label class="label" for="ps">UHID, name, mobile or NID</label>
      <input class="field" id="ps" placeholder="Start typing&hellip;">
    </div>
    <div id="ps-out"></div>`;
  $('#ps').addEventListener('input', API.online ? searchOnline : runSearch);
  if (API.online) searchOnline(); else runSearch();
}

/* Online: the database searches, not this page. Wait until typing pauses,
   send only a query search_patients() will accept, and ignore an answer
   that arrives after a newer one was asked for. */
let searchTimer = 0;
let searchSeq = 0;
function searchOnline() {
  const q = $('#ps').value.trim();
  const out = $('#ps-out');
  clearTimeout(searchTimer);
  if (!specificQuery(q)) {
    searchSeq++;          // an answer still on its way is now out of date
    out.innerHTML = `<div class="card empty-state"><b>Who are you looking for?</b>
      Type a UHID, an NID, an 11-digit mobile number, or at least 3 letters of the name.
      There is no list of everyone: a national register is searched for one person, not browsed.</div>`;
    return;
  }
  out.innerHTML = loadingHtml('Searching every connected hospital.');
  const seq = ++searchSeq;
  searchTimer = setTimeout(async () => {
    let hits;
    try { hits = await API.searchPatients(q); }
    catch (e) { if (seq === searchSeq) out.innerHTML = errorHtml('The search failed', e.message); return; }
    if (seq !== searchSeq) return;
    drawHits(out, hits, q, false);
  }, 350);
}

function runSearch() {
  const q = $('#ps').value.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const out = $('#ps-out');
  const all = store.all();

  const hits = q.length < 2 ? all : all.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.uhid.toLowerCase().includes(q) ||
    (digits.length > 2 && (p.phone || '').replace(/\D/g, '').includes(digits)) ||
    (digits.length > 2 && p.nid && p.nid.includes(digits))
  );
  drawHits(out, hits, q, q.length < 2);
}

function drawHits(out, hits, q, wholeList) {
  if (hits.length === 0) {
    out.innerHTML = `<div class="card empty-state"><b>No match</b>No patient record matches &ldquo;${esc(q)}&rdquo;.</div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  out.innerHTML = `
    <p style="font-size:12.5px;color:var(--ink-3);margin:0 0 10px">
      ${hits.length} record${hits.length > 1 ? 's' : ''}${wholeList ? ' on file' : ' found nationally'}${hits.length >= 20 && API.online ? ' &mdash; the first 20; be more specific to narrow it' : ''}
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
            <span style="font-size:11.5px;color:var(--ink-3)">${encounterCount(p)} encounter${encounterCount(p) === 1 ? '' : 's'}</span>
          </span>
          <button class="btn sm primary" data-open="${esc(p.uhid)}">Open record</button>
        </div>
      </div>`).join('')}</div>`;

  $$('[data-open]', out).forEach(b => b.addEventListener('click', () => openPatient(b.dataset.open)));
}

/* Online, a search result carries a count from search_patients() but
   not the encounters themselves: those are clinical, and reading them
   is a logged act (get_patient_record), not something a search does. */
const encounterCount = p => p.encounterCount ?? (p.encounters ? p.encounters.length : 0);

boot(renderSearch);
