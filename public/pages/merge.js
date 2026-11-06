/* ============================================================
   UHID — merge.html — two UHIDs that are one person

   Decision 1's safety net. Registration checks for duplicates before
   it issues a UHID, but a patient registered twice before that check
   — or with a different name spelling and no NID — still happens.

   The suggestions come from v_possible_duplicates, a self-join in the
   database: same name and date of birth, or same mobile number. The
   merge itself is merge_patients(): in one transaction it moves the
   losing record's encounters, appointments, referrals, consents and
   allergies to the surviving record and writes patient_merge, so the
   old UHID still opens the right record. The access log is NOT moved:
   who read the old record, and when, is a fact about the past.
   ============================================================ */

const MERGE = { pairs: [], keep: '', lose: '', reason: '' };

async function renderMerge(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('An administrator merges two UHIDs that turn out to be one person, in one transaction, keeping the old UHID working.');
    return;
  }
  root.innerHTML = loadingHtml('Asking the database for possible duplicate records.');
  try { MERGE.pairs = await API.get('/audit/duplicates'); }
  catch (e) { root.innerHTML = errorHtml('Possible duplicates could not be loaded', e.message); return; }
  drawMerge(root);
}

/* There is no patient list in the browser (security review L1), so each
   UHID chosen is looked up with the ordinary search — logged like any
   other. A merged-away UHID finds the survivor instead, so store.find()
   then has no live record under the old number, and the card says so. */
async function loadPicked(uhids) {
  for (const u of uhids) {
    if (!u || store.find(u) || !specificQuery(u)) continue;
    try { await API.searchPatients(u); }
    catch (e) { toast('Could not look up ' + u, e.message, 'err'); }
  }
}

/* The record to keep is the one with more history; on a tie, the one
   whose identity is verified. A suggestion — the form can swap them. */
function suggestKeep(a, b) {
  const pa = store.find(a), pb = store.find(b);
  if (!pa || !pb) return [a, b];
  const score = p => (Number(p.encounterCount) || 0) * 10 + (p.identityVerified ? 5 : 0) + (p.nid ? 1 : 0);
  return score(pa) >= score(pb) ? [a, b] : [b, a];
}

function drawMerge(root) {
  root.innerHTML = `
    <div class="page-h">
      <h2>Merge records</h2>
      <p>When one person holds two UHIDs, their history is split in two and a doctor sees only half of it. Merging moves everything to one record. The other UHID keeps working: it opens the surviving record.</p>
    </div>

    <div class="sec-h" style="margin-top:0"><h3>Possible duplicates</h3><span>found by the database: same name and date of birth, or same mobile</span></div>
    ${MERGE.pairs.length ? `<div class="card queue">${MERGE.pairs.map((d, i) => `
      <div class="qrow">
        <div class="who"><b>${esc(d.name)}</b><span class="meta">${esc(d.matchedOn)}</span></div>
        <div class="what"><span class="mono">${esc(d.uhidA)}</span> &nbsp;and&nbsp; <span class="mono">${esc(d.uhidB)}</span></div>
        <div class="acts"><button class="btn sm" data-pair="${i}">Compare</button></div>
      </div>`).join('')}</div>`
    : `<div class="card empty-state"><b>No likely duplicates</b>No two live records share a name and date of birth, or a mobile number. You can still merge two UHIDs you know are one person, below.</div>`}

    <div class="sec-h"><h3>Compare and merge</h3><span>pick a pair above, or type both UHIDs</span></div>
    <div class="compare">
      ${pickCard('keep', 'Record to keep', MERGE.keep)}
      ${pickCard('lose', 'Record to merge away', MERGE.lose)}
    </div>
    <div class="card form-card" style="padding:18px 20px">
      <label class="label" for="m-reason">Reason <span style="color:var(--ink-3)">required, and kept with the merge</span></label>
      <textarea class="field" id="m-reason" rows="2" placeholder="e.g. Same person: NID card checked at the front desk">${esc(MERGE.reason)}</textarea>
      <div class="form-actions" style="margin-top:14px;padding-top:14px">
        <button class="btn primary" id="m-go"${MERGE.keep && MERGE.lose ? '' : ' disabled'}>Merge&hellip;</button>
        <button class="btn ghost" id="m-swap"${MERGE.keep || MERGE.lose ? '' : ' disabled'}>Swap the two</button>
      </div>
    </div>
    <datalist id="uhid-list">${[...new Set(MERGE.pairs.flatMap(d => [d.uhidA, d.uhidB]))]
      .map(u => `<option value="${esc(u)}"></option>`).join('')}</datalist>`;

  $$('[data-pair]', root).forEach(b => b.addEventListener('click', async () => {
    const d = MERGE.pairs[Number(b.dataset.pair)];
    await loadPicked([d.uhidA, d.uhidB]);
    [MERGE.keep, MERGE.lose] = suggestKeep(d.uhidA, d.uhidB);
    drawMerge(root);
  }));
  $$('[data-pick]', root).forEach(inp => inp.addEventListener('change', async () => {
    MERGE[inp.dataset.pick] = inp.value.trim().toUpperCase();
    await loadPicked([MERGE[inp.dataset.pick]]);
    drawMerge(root);
  }));
  $('#m-swap').addEventListener('click', () => {
    [MERGE.keep, MERGE.lose] = [MERGE.lose, MERGE.keep];
    drawMerge(root);
  });
  $('#m-reason').addEventListener('input', e => { MERGE.reason = e.target.value; });
  $('#m-go').addEventListener('click', confirmMerge);
}

function pickCard(side, title, uhid) {
  const p = uhid ? store.find(uhid) : null;
  const other = store.find(side === 'keep' ? MERGE.lose : MERGE.keep);
  const same = (k, fmt = v => v) => other && p && p[k] && fmt(p[k]) === fmt(other[k]) ? ' class="same"' : '';
  return `
    <div class="card ${p ? side : ''}">
      <h3>${title}</h3>
      <input class="field mono" data-pick="${side}" list="uhid-list" value="${esc(uhid)}" placeholder="BD-YYYY-NNNNN-N" aria-label="${title} UHID">
      ${p ? `
        <dl class="kv">
          <dt>Name</dt><dd${same('name')}>${esc(p.name)}</dd>
          <dt>Born</dt><dd${same('dob')}>${fmtDate(p.dob)} &middot; ${esc(p.sex)}</dd>
          <dt>Blood</dt><dd${same('blood')}>${esc(p.blood || '—')}</dd>
          <dt>Mobile</dt><dd class="mono"${same('phone')}>${esc(p.phone || '—')}</dd>
          <dt>NID</dt><dd class="mono"${same('nid')}>${esc(p.nid || '— none')}</dd>
          <dt>District</dt><dd>${esc(p.district || '—')}</dd>
          <dt>Registered</dt><dd>${fmtDate(p.registeredAt)}, ${esc(hospital(p.registeredHospitalId).name)}</dd>
          <dt>Encounters</dt><dd class="mono">${Number(p.encounterCount) || 0}</dd>
          <dt>Identity</dt><dd>${p.identityVerified ? '<span class="pill ok"><i class="dot"></i>Verified</span>' : '<span class="pill warn"><i class="dot"></i>Unverified</span>'}</dd>
        </dl>`
      : uhid ? `<p class="hint">No live record holds ${esc(uhid)}. It may already have been merged away.</p>`
      : `<p class="hint">Not chosen yet.</p>`}
    </div>`;
}

function confirmMerge() {
  const keep = store.find(MERGE.keep), lose = store.find(MERGE.lose);
  const reason = $('#m-reason').value.trim();
  if (!keep || !lose) { toast('Choose two records', 'Both UHIDs must be live records.', 'err'); return; }
  if (keep.uhid === lose.uhid) { toast('Same record', 'Choose two different UHIDs.', 'err'); return; }
  if (!reason) { toast('Reason required', 'A merge needs a recorded reason.', 'err'); $('#m-reason').focus(); return; }

  const sc = modal(`
    <div class="modal-h"><h3>Merge ${esc(lose.uhid)} into ${esc(keep.uhid)}?</h3><p>This cannot be undone from the console.</p></div>
    <div class="modal-b">
      <div class="banner crit" style="margin-bottom:14px">${warnIcon}<div><b>${esc(lose.name)}&rsquo;s ${Number(lose.encounterCount)} encounter${Number(lose.encounterCount) === 1 ? ' moves' : 's move'} to ${esc(keep.uhid)}</b>With their appointments, referrals, consent grants and allergies &mdash; in one transaction.</div></div>
      <dl class="kv">
        <dt>Keeps</dt><dd><span class="mono">${esc(keep.uhid)}</span> &mdash; ${esc(keep.name)}</dd>
        <dt>Merges away</dt><dd><span class="mono">${esc(lose.uhid)}</span> &mdash; still opens the record above</dd>
        <dt>Not moved</dt><dd>The access log: who read the old record stays a fact about the past</dd>
        <dt>Reason</dt><dd>${esc(reason)}</dd>
      </dl>
    </div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Merge the records</button></div>`);
  $('[data-ok]', sc).addEventListener('click', async () => {
    $('[data-ok]', sc).disabled = true;
    try {
      await API.post('/patients/merge', { losingUhid: lose.uhid, survivingUhid: keep.uhid, reason });
      API.patients = API.patients.filter(p => p.uhid !== lose.uhid);   // no longer a live record
    } catch (e) { sc.remove(); toast('Not merged', e.message, 'err'); return; }
    sc.remove();
    toast('Records merged', `${lose.uhid} now opens ${keep.uhid}.`);
    MERGE.keep = ''; MERGE.lose = ''; MERGE.reason = '';
    renderMerge($('#view'));
  });
}

boot(renderMerge);
