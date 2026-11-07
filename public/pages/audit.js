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
      <p>Access ${esc(scope)} that bypassed the usual reasons and nobody has reviewed yet: emergency break-glass reads, and visits or admissions opened for a patient with no appointment, referral or consent. Each came with a written reason; your job is to ask whether it holds. The patient sees the same entry in their own access log.</p>
    </div>
    ${rows.length ? `<div class="sec-h" style="margin-top:0"><h3>${rows.length} waiting</h3><span>newest first</span></div>` : ''}
    ${rows.length ? `<div class="card queue">${rows.map(r => `
      <div class="qrow">
        <span class="pill ${r.hoursWaiting >= 72 ? 'crit' : r.hoursWaiting >= 24 ? 'warn' : 'info'}"><i class="dot"></i>${esc(waitLabel(r.hoursWaiting))}</span>
        <div class="who"><b>${esc(r.reader)}</b><span class="meta">${esc(r.hospital || '—')}</span></div>
        <div class="what">
          ${ACTION_WORDS[r.action] || 'Opened the record of'} <b>${esc(r.patient)}</b> <span class="mono" style="font-size:12px">${esc(r.uhid)}</span><br>
          &ldquo;${esc(r.justification)}&rdquo;
          <div class="meta">${esc(fmtDateTime(r.at))}</div>
        </div>
        <div class="acts"><button class="btn sm primary" data-review="${Number(r.id)}">Review&hellip;</button></div>
      </div>`).join('')}</div>`
    : `<div class="card empty-state"><b>Nothing waiting for review</b>Every break-glass read ${esc(scope)} has been reviewed. A new one appears here the moment a doctor uses break-glass.</div>`}`;

  $$('[data-review]', root).forEach(b => b.addEventListener('click', () =>
    confirmReview(rows.find(r => r.id === Number(b.dataset.review)))));
}

const waitLabel = h => h < 1 ? 'just now' : h < 48 ? `${h} h waiting` : `${Math.floor(h / 24)} days waiting`;

function confirmReview(r) {
  const sc = modal(`
    <div class="modal-h"><h3>Review this access</h3><p>Your verdict, your name and the time are stamped on the entry. This cannot be undone.</p></div>
    <div class="modal-b">
      <dl class="kv">
        <dt>Read by</dt><dd>${esc(r.reader)}</dd>
        <dt>At</dt><dd>${esc(r.hospital || '—')}, ${esc(fmtDateTime(r.at))}</dd>
        <dt>Patient</dt><dd>${esc(r.patient)} <span class="mono" style="font-size:12px;color:var(--ink-3)">${esc(r.uhid)}</span></dd>
        <dt>Reason given</dt><dd>${esc(r.justification)}</dd>
      </dl>
      <div class="row" style="margin-top:14px"><div>
        <label class="label" for="rv-verdict">Does the reason hold?</label>
        <select class="field" id="rv-verdict"><option value="justified">Justified</option><option value="not_justified">Not justified</option></select>
      </div></div>
      <div class="row"><div>
        <label class="label" for="rv-note">Note <span id="rv-need">(optional)</span></label>
        <textarea class="field" id="rv-note" rows="3" maxlength="300" placeholder="What you checked, or why the reason does not hold"></textarea>
      </div></div>
      <p class="hint">A &ldquo;not justified&rdquo; verdict needs a note: it is what anyone following it up will read. The patient sees the verdict in their access log.</p>
    </div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Record verdict</button></div>`);
  $('#rv-verdict', sc).addEventListener('change', e => {
    $('#rv-need', sc).textContent = e.target.value === 'not_justified' ? '(required)' : '(optional)';
  });
  $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
    const verdict = $('#rv-verdict', sc).value, note = $('#rv-note', sc).value.trim();
    if (verdict === 'not_justified' && note.length < 10) { toast('Say why', 'A "not justified" verdict needs a note of at least 10 characters.', 'err'); return; }
    try { await API.post(`/audit/break-glass/${Number(r.id)}/review`, { verdict, note }); }
    catch (err) { toast('Not reviewed', err.message, 'err'); return; }
    sc.remove();
    toast('Reviewed', `${r.reader}'s access to ${r.patient}'s record: ${verdict === 'justified' ? 'justified' : 'not justified'}.`);
    renderAudit($('#view'));
  }));
}

/* The queue holds four kinds of flagged access, all with a written reason:
   a break-glass read, a visit opened with no basis, a visit refused
   half-way, and an admission with no basis (stress test, 7 Nov 2026). */
const ACTION_WORDS = {
  'record.read': 'Opened the record of',
  'encounter.open': 'Opened a visit, with no basis, for',
  'encounter.attempt': 'Tried to record a visit, with no basis, for',
  'admission.open': 'Admitted, with no visit or consent here,'
};

boot(renderAudit);
