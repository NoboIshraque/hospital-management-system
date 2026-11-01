/* ============================================================
   UHID — lab.html — the lab technician's worklist

   GET /api/lab-orders runs lab_worklist(): tests ordered at this
   hospital and not yet reported. It is a procedure, not a view,
   because a test name is clinical content — the procedure checks
   lab.report and keeps to the caller's hospital, in the database.

   Reporting calls report_lab_result(). The screen never decides
   whether a value is abnormal: trg_lab_result_bi compares it with the
   test's reference range, trg_lab_result_ai marks the order reported,
   and the answer comes back as { abnormal }.
   ============================================================ */

/* Results entered on this visit to the page, newest first — so the
   technician sees what the database decided about each one. */
const LAB = { orders: [], done: [] };

const TEXT_RESULTS = ['Negative', 'Positive', 'Reactive', 'Non-reactive', 'Not detected', 'Detected'];

async function renderLab(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('The lab technician sees every test waiting at this hospital and enters each result; MySQL decides whether it is abnormal.');
    return;
  }
  if (!LAB.orders.length) root.innerHTML = loadingHtml('Reading the lab worklist.');
  try { LAB.orders = await API.get('/lab-orders'); }
  catch (e) { root.innerHTML = errorHtml('The worklist could not be loaded', e.message); return; }
  drawLab(root);
}

const refText = o =>
  o.refLow != null && o.refHigh != null ? `${o.refLow}–${o.refHigh}`
  : o.refLow != null ? `≥ ${o.refLow}`
  : o.refHigh != null ? `≤ ${o.refHigh}` : '';

function drawLab(root) {
  const here = hospital(S.account.hospitalId).name;
  root.innerHTML = `
    <div class="page-h">
      <h2>Lab worklist</h2>
      <p>Tests ordered at ${esc(here)} and waiting for a result, oldest first. Whether a value is abnormal is worked out by a database trigger from the test&rsquo;s reference range &mdash; not by you, and not by this screen.</p>
    </div>
    ${LAB.orders.length ? `<div class="card queue">${LAB.orders.map(o => `
      <div class="qrow">
        <div class="who"><b>${esc(o.test)}</b><span class="meta">${esc(o.specimen)}${refText(o) ? ` &middot; ref ${esc(refText(o))} ${esc(o.unit || '')}` : ''}</span></div>
        <div class="what">
          <b>${esc(o.patient)}</b> <span class="mono" style="font-size:12px">${esc(o.uhid)}</span><br>
          ${o.bed ? `${esc(o.bed)}` : esc(o.encounterType)} &middot; ordered by ${esc(o.orderedBy)}
          <div class="meta">${esc(fmtDateTime(o.orderedAt))} &middot; ${waitText(o.hoursWaiting)}</div>
        </div>
        <form class="result-in" data-order="${Number(o.id)}" autocomplete="off">
          ${o.unit
            ? `<input class="field mono" type="number" step="any" required aria-label="Result for ${esc(o.test)}" placeholder="value"><span class="unit">${esc(o.unit)}</span>`
            : `<input class="field" list="text-results" required aria-label="Result for ${esc(o.test)}" placeholder="result"><span class="unit"></span>`}
          <button class="btn sm primary">Report</button>
        </form>
      </div>`).join('')}</div>
      <datalist id="text-results">${TEXT_RESULTS.map(t => `<option value="${t}"></option>`).join('')}</datalist>`
    : `<div class="card empty-state"><b>Nothing waiting</b>Every test ordered at ${esc(here)} has a result. New orders appear here as soon as a doctor saves an encounter that requests one.</div>`}
    ${LAB.done.length ? `
      <div class="sec-h"><h3>Reported just now</h3><span>what the database decided about each value</span></div>
      <div class="card queue">${LAB.done.map(d => `
        <div class="qrow done">
          <div class="who"><b>${esc(d.test)}</b><span class="meta">${esc(d.patient)}</span></div>
          <div class="what"><span class="mono">${esc(d.value)}</span> ${esc(d.unit || '')}${d.ref ? ` <span class="meta">(ref ${esc(d.ref)})</span>` : ''}</div>
          <span class="pill ${d.abnormal ? 'crit' : 'ok'}"><i class="dot"></i>${d.abnormal ? 'Abnormal' : 'Within range'}</span>
        </div>`).join('')}</div>` : ''}`;

  $$('.result-in', root).forEach(f => f.addEventListener('submit', e => { e.preventDefault(); report(f); }));
}

const waitText = h => Number(h) < 1 ? 'ordered within the hour'
  : Number(h) < 48 ? `waiting ${Number(h)} h` : `waiting ${Math.floor(Number(h) / 24)} days`;

async function report(form) {
  const o = LAB.orders.find(x => x.id === Number(form.dataset.order));
  const raw = $('input', form).value.trim();
  if (!raw) { toast('No value', 'Enter the result first.', 'err'); return; }
  const body = o.unit ? { orderId: o.id, valueNum: Number(raw) } : { orderId: o.id, valueText: raw };

  $('button', form).disabled = true;
  let r;
  try { r = await API.post('/lab-results', body); }
  catch (e) { $('button', form).disabled = false; toast('Not reported', e.message, 'err'); return; }

  LAB.done.unshift({ test: o.test, patient: o.patient, value: raw, unit: o.unit, ref: refText(o), abnormal: r.abnormal });
  toast(r.abnormal ? 'Reported — abnormal' : 'Reported', `${o.test} for ${o.patient}: ${raw} ${o.unit || ''}`.trim());
  renderLab($('#view'));
}

boot(renderLab);
