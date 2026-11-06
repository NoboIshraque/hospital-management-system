/* ============================================================
   UHID — accounts.html — staff accounts (administrators)

   A hospital admin manages the receptionist, doctor and lab accounts of
   their own hospital; the system admin manages every staff account. The
   database decides that (require_account_scope); this screen only offers
   what it will allow.

   Passwords: a new account and a reset each get a one-time password,
   made on the server and shown here ONCE. Only its hash is stored, and
   its owner must replace it at their first sign-in.
   ============================================================ */

const ACC = { rows: [] };

async function renderAccounts(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('Administrators create staff accounts, reset passwords and switch accounts off here.');
    return;
  }
  root.innerHTML = loadingHtml('Loading the accounts you manage.');
  try { ACC.rows = await API.get('/accounts'); }
  catch (e) { root.innerHTML = errorHtml('The accounts could not be loaded', e.message); return; }
  drawAccounts(root);
}

const isSystemAdmin = () => !S.account.hospitalId;

function drawAccounts(root) {
  const sys = isSystemAdmin();
  const scope = sys ? 'every hospital' : hospital(S.account.hospitalId).name;
  root.innerHTML = `
    <div class="page-h">
      <h2>Staff accounts</h2>
      <p>The accounts of ${esc(scope)}. A new account and a password reset each get a one-time password, shown once; its owner chooses their own at first sign-in. Patients get their login from reception.</p>
    </div>
    <div class="sec-h" style="margin-top:0"><h3>${ACC.rows.length} account${ACC.rows.length === 1 ? '' : 's'}</h3><button class="btn sm primary" id="acc-new">New account&hellip;</button></div>
    ${ACC.rows.length ? `<div class="card queue">${ACC.rows.map(a => `
      <div class="qrow">
        <span class="pill ${a.active ? 'ok' : 'mute'}"><i class="dot"></i>${a.active ? 'active' : 'switched off'}</span>
        <div class="who"><b>${esc(a.name || a.username)}</b><span class="meta"><span class="mono">${esc(a.username)}</span> &middot; ${esc(a.roleLabel)}</span></div>
        <div class="what">
          ${a.hospitalId ? esc(hospital(a.hospitalId).name) : 'All hospitals'}
          <div class="meta">${a.lastLoginAt ? 'Last signed in ' + esc(fmtDateTime(a.lastLoginAt)) : 'Never signed in'}${a.mustChange ? ' &middot; one-time password not yet changed' : ''}</div>
        </div>
        <div class="acts">${a.isYou ? '<span class="meta">you</span>' : `
          <button class="btn sm" data-reset="${Number(a.id)}">Reset password</button>
          <button class="btn sm" data-active="${Number(a.id)}">${a.active ? 'Switch off' : 'Switch on'}</button>`}</div>
      </div>`).join('')}</div>`
    : `<div class="card empty-state"><b>No accounts yet</b>Create the first one with <i>New account</i>.</div>`}`;

  $('#acc-new').addEventListener('click', () => openNewAccount(root));
  $$('[data-reset]', root).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    const a = ACC.rows.find(x => x.id === Number(b.dataset.reset));
    let r;
    try { r = await API.post(`/accounts/${a.id}/reset`); }
    catch (e) { toast('Not reset', e.message, 'err'); return; }
    showOneTime(`New one-time password for ${a.name || a.username}`, a.username, r.oneTimePassword,
      'Give it to them in person. Their old password no longer works.');
    renderAccounts(root);
  })));
  $$('[data-active]', root).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    const a = ACC.rows.find(x => x.id === Number(b.dataset.active));
    try { await API.post(`/accounts/${a.id}/active`, { active: !a.active }); }
    catch (e) { toast('Not changed', e.message, 'err'); return; }
    toast(a.active ? 'Account switched off' : 'Account switched on',
      `${a.name || a.username} ${a.active ? 'can no longer sign in.' : 'can sign in again.'}`);
    renderAccounts(root);
  })));
}

function openNewAccount(root) {
  const sys = isSystemAdmin();
  const roles = sys
    ? [['receptionist', 'Receptionist'], ['doctor', 'Doctor'], ['lab_technician', 'Lab technician'], ['hospital_admin', 'Hospital admin'], ['system_admin', 'System admin']]
    : [['receptionist', 'Receptionist'], ['doctor', 'Doctor'], ['lab_technician', 'Lab technician']];
  const sc = modal(`
    <div class="modal-h"><h3>New staff account</h3><p>A one-time password is made for it and shown once.</p></div>
    <div class="modal-b">
      <div class="row c2">
        <div><label class="label" for="na-user">Username</label>
          <input class="field mono" id="na-user" maxlength="40" placeholder="e.g. rashida.k" autocomplete="off"></div>
        <div><label class="label" for="na-role">Role</label>
          <select class="field" id="na-role">${roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
      ${sys ? `<div class="row"><div><label class="label" for="na-hosp">Hospital</label>
        <select class="field" id="na-hosp">${HOSPITALS.map(h => `<option value="${Number(h.id)}">${esc(h.name)}</option>`).join('')}</select></div></div>` : ''}
      <div class="row" id="na-name-row"><div><label class="label" for="na-name">Full name</label>
        <input class="field" id="na-name" maxlength="100" placeholder="As it should appear on screen and in the logs"></div></div>
      <div class="row" id="na-doc-row" hidden><div><label class="label" for="na-doc">Doctor</label>
        <select class="field" id="na-doc"></select>
        <p class="hint">A doctor's name comes from their doctor record. Only doctors posted at this hospital are listed.</p></div></div>
      <p class="hint">Usernames are 3 to 40 lower-case letters, digits, dots, dashes or underscores.</p>
    </div>
    <div class="modal-f"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Create account</button></div>`);

  const hospId = () => sys ? Number($('#na-hosp', sc).value) : S.account.hospitalId;
  const sync = () => {
    const role = $('#na-role', sc).value;
    const hs = $('#na-hosp', sc);
    if (hs) hs.closest('.row').hidden = role === 'system_admin';
    $('#na-doc-row', sc).hidden = role !== 'doctor';
    $('#na-name-row', sc).hidden = role === 'doctor';
    const docs = DOCTORS.filter(d => d.hospitalId === hospId());
    $('#na-doc', sc).innerHTML = docs.length
      ? docs.map(d => `<option value="${Number(d.doctorId)}">${esc(d.name)} &mdash; ${esc(d.dept)}</option>`).join('')
      : '<option value="">No doctor is posted at this hospital</option>';
  };
  $('#na-role', sc).addEventListener('change', sync);
  if ($('#na-hosp', sc)) $('#na-hosp', sc).addEventListener('change', sync);
  sync();

  $('[data-ok]', sc).addEventListener('click', e => busy(e.currentTarget, async () => {
    const role = $('#na-role', sc).value;
    const body = {
      username: $('#na-user', sc).value.trim().toLowerCase(),
      role,
      hospitalId: role === 'system_admin' ? null : hospId(),
      doctorId: role === 'doctor' ? $('#na-doc', sc).value : null,
      staffName: role === 'doctor' ? null : $('#na-name', sc).value.trim()
    };
    let r;
    try { r = await API.post('/accounts', body); }
    catch (err) { toast('Not created', err.message, 'err'); return; }
    sc.remove();
    showOneTime('Account created', r.username, r.oneTimePassword,
      'Give it to them in person. They choose their own password the first time they sign in.');
    renderAccounts(root);
  }));
}

boot(renderAccounts);
