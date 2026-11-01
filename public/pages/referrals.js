/* ============================================================
   UHID — referrals.html — patients referred to this hospital

   Decision 6, the receiving end. v_referral_inbox lists referrals to
   the signed-in hospital whose patient has not arrived yet
   (to_encounter_id IS NULL). Each one came with a 24-hour consent
   grant written by refer_patient(), so "Open record" reads the full
   history under basis 'consent' — logged, like every read.

   "See the patient" opens an encounter here; start_encounter() then
   marks the referral arrived, and it leaves this list.
   ============================================================ */

const URGENCY_PILL = { emergency: 'crit', urgent: 'warn', routine: 'info' };

async function renderReferrals(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('Patients referred to this hospital from anywhere in the country appear here, with the access their referral grants.');
    return;
  }
  root.innerHTML = loadingHtml('Reading the referral inbox.');
  let rows;
  try { rows = await API.get('/referrals/inbox'); }
  catch (e) { root.innerHTML = errorHtml('The inbox could not be loaded', e.message); return; }

  const here = hospital(S.account.hospitalId).name;
  const order = { emergency: 0, urgent: 1, routine: 2 };
  rows.sort((a, b) => (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3) || String(a.referredAt).localeCompare(String(b.referredAt)));

  root.innerHTML = `
    <div class="page-h">
      <h2>Referral inbox</h2>
      <p>Patients referred to ${esc(here)} who have not arrived yet. A referral brings 24 hours of access to the patient&rsquo;s whole record, from every hospital that has treated them.</p>
    </div>
    ${rows.length ? `
      <div class="card queue">${rows.map(r => `
        <div class="qrow">
          <span class="pill ${URGENCY_PILL[r.urgency] || 'mute'}"><i class="dot"></i>${esc(r.urgency)}</span>
          <div class="who"><b>${esc(r.patient)}</b><span class="uhid">${esc(r.uhid)}</span></div>
          <div class="what">
            From <b>${esc(r.fromHospital)}</b>${r.dept ? ` to <b>${esc(r.dept)}</b>` : ''}<br>
            ${esc(r.reason)}
            <div class="meta">Referred ${esc(fmtDateTime(r.referredAt))} &middot; ${Number(r.daysWaiting) === 0 ? 'today' : `waiting ${Number(r.daysWaiting)} day${Number(r.daysWaiting) === 1 ? '' : 's'}`}</div>
          </div>
          <div class="acts">
            <a class="btn sm" href="record.html?uhid=${encodeURIComponent(r.uhid)}">Open record</a>
            <a class="btn sm primary" href="encounter.html?uhid=${encodeURIComponent(r.uhid)}">See the patient</a>
          </div>
        </div>`).join('')}
      </div>
      <p class="hint" style="margin-top:10px">&ldquo;See the patient&rdquo; opens an encounter here. Saving it marks the referral arrived, and it leaves this list.</p>`
    : `<div class="card empty-state"><b>Nobody is waiting</b>No patient has been referred to ${esc(here)} who has not already arrived. When a doctor at another hospital refers someone here, they appear in this list straight away.</div>`}`;
}

boot(renderReferrals);
