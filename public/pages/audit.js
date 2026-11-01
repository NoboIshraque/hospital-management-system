/* ============================================================
   UHID — audit.html — break-glass review

   Decision 2's other half. A doctor with no access basis may still
   open a record in an emergency, with a written reason — and that read
   lands here, in v_break_glass_queue, until an administrator has
   looked at it.

   Reviewing calls review_break_glass(). It is the ONE change the
   access log's triggers allow: stamping reviewed_by and reviewed_at,
   once, on a break-glass row. Nothing can edit or delete the entry
   itself. A hospital admin reviews reads made at their own hospital;
   the system admin, who has no hospital, reviews the whole country.
   The procedure enforces that, not this screen.
   ============================================================ */

async function renderAudit(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('Every emergency break-glass read waits here, with the doctor’s written reason, until an administrator reviews it.');
    return;
  }
  root.innerHTML = loadingHtml('Reading the break-glass review queue.');
  let rows;
  try { rows = await API.get('/audit/break-glass'); }
  catch (e) { root.innerHTML = errorHtml('The review queue could not be loaded', e.message); return; }

  const scope = S.account.hospitalId ? `made at ${hospital(S.account.hospitalId).name}` : 'made at every connected hospital';

  root.innerHTML = `
    <div class="page-h">
      <h2>Break-glass review</h2>
      <p>Emergency reads ${esc(scope)} that nobody has reviewed yet. Each doctor gave a reason; your job is to ask whether it holds. The patient sees the same entry in their own access log.</p>
    </div>
    ${rows.length ? `<div class="sec-h" style="margin-top:0"><h3>${rows.length} waiting</h3><span>newest first</span></div>` : ''}
    ${rows.length ? `<div class="card queue">${rows.map(r => `
      <div class="qrow">
        <span class="pill ${r.hoursWaiting >= 72 ? 'crit' : r.hoursWaiting >= 24 ? 'warn' : 'info'}"><i class="dot"></i>${esc(waitLabel(r.hoursWaiting))}</span>
        <div class="who"><b>${esc(r.reader)}</b><span class="meta">${esc(r.hospital || '—')}</span></div>
        <div class="what">
          Opened the record of <b>${esc(r.patient)}</b> <span class="mono" style="font-size:12px">${esc(r.uhid)}</span><br>
          &ldquo;${esc(r.justification)}&rdquo;
          <div class="meta">${esc(fmtDateTime(r.at))}</div>
        </div>
        <div class="acts"><button class="btn sm primary" data-review="${Number(r.id)}">Mark reviewed</button></div>
      </div>`).join('')}</div>`
    : `<div class="card empty-state"><b>Nothing waiting for review</b>Every break-glass read ${esc(scope)} has been reviewed. A new one appears here the moment a doctor uses break-glass.</div>`}`;

  $$('[data-review]', root).forEach(b => b.addEventListener('click', () =>
    confirmReview(rows.find(r => r.id === Number(b.dataset.review)))));
}

const waitLabel = h => h < 1 ? 'just now' : h < 48 ? `${h} h waiting` : `${Math.floor(h / 24)} days waiting`;

function confirmReview(r) {
  const sc = modal(`
    <div class="modal-h"><h3>Mark this read reviewed</h3><p>Your name and the time are stamped on the entry. This cannot be undone.</p></div>
    <div class="modal-b">
      <dl class="kv">
        <dt>Read by</dt><dd>${esc(r.reader)}</dd>
        <dt>At</dt><dd>${esc(r.hospital || '—')}, ${esc(fmtDateTime(r.at))}</dd>
        <dt>Patient</dt><dd>${esc(r.patient)} <span class="mono" style="font-size:12px;color:var(--ink-3)">${esc(r.uhid)}</span></dd>
        <dt>Reason given</dt><dd>${esc(r.justification)}</dd>
      </dl>
      <p class="hint" style="margin-top:14px">Reviewing records that you looked. If the reason does not hold, take it up with the doctor; the entry itself stays in the log for ever, unchanged.</p>
    </div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Mark reviewed</button></div>`);
  $('[data-ok]', sc).addEventListener('click', async () => {
    $('[data-ok]', sc).disabled = true;
    try { await API.post(`/audit/break-glass/${Number(r.id)}/review`); }
    catch (e) { sc.remove(); toast('Not reviewed', e.message, 'err'); return; }
    sc.remove();
    toast('Reviewed', `${r.reader}'s read of ${r.patient}'s record is signed off.`);
    renderAudit($('#view'));
  });
}

boot(renderAudit);
