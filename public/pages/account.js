/* ============================================================
   UHID — account.html — your own account

   Every role has this screen. Its one job is changing your password.
   After a new account or a reset, the shell sends you here first and
   the server refuses everything else until you have chosen your own
   (requireLogin answers 403 with mustChangePassword).
   ============================================================ */

function renderAccount(root) {
  if (!API.online) {
    root.innerHTML = needsServerHtml('Your password is changed on the server, which keeps only a bcrypt hash of it.');
    return;
  }
  const a = S.account;
  root.innerHTML = `
    <div class="page-h">
      <h2>My account</h2>
      <p>Your password is yours alone: nobody at the hospital can read it, not even an administrator. If you forget it, an administrator can give you a one-time password to sign in with.</p>
    </div>
    ${a.mustChange ? `<div class="banner crit" style="max-width:640px">${warnIcon}<div><b>Choose your own password</b>You signed in with a one-time password that someone else gave you. Nothing else opens until you replace it.</div></div>` : ''}
    <div class="card form-card" style="max-width:640px">
      <dl class="kv" style="margin-bottom:18px">
        <dt>Name</dt><dd>${esc(a.name)}</dd>
        <dt>Username</dt><dd class="mono">${esc(a.username || '—')}</dd>
        <dt>Role</dt><dd>${esc(a.roleLabel || ROLES[S.role].label)}</dd>
      </dl>
      <form id="pw-form" novalidate>
        <div class="row"><div>
          <label class="label" for="pw-cur">${a.mustChange ? 'One-time password' : 'Current password'}</label>
          <input class="field" id="pw-cur" type="password" autocomplete="current-password">
        </div></div>
        <div class="row"><div>
          <label class="label" for="pw-new">New password</label>
          <input class="field" id="pw-new" type="password" autocomplete="new-password">
          <p class="hint">At least 10 characters, without your username. A few unrelated words make a password that is strong and easy to remember.</p>
        </div></div>
        <div class="row"><div>
          <label class="label" for="pw-rep">New password again</label>
          <input class="field" id="pw-rep" type="password" autocomplete="new-password">
        </div></div>
        <div id="pw-err"></div>
        <div class="form-actions"><button class="btn primary" type="submit" id="pw-save">Change password</button></div>
      </form>
    </div>`;

  $('#pw-form').addEventListener('submit', e => {
    e.preventDefault();
    busy($('#pw-save'), changePassword);
  });
}

async function changePassword() {
  const err = $('#pw-err');
  const current = $('#pw-cur').value, next = $('#pw-new').value, again = $('#pw-rep').value;
  const say = msg => { err.innerHTML = `<div class="banner crit" style="margin:4px 0 12px">${warnIcon}<div><b>Not changed</b>${esc(msg)}</div></div>`; };
  if (!current || !next) { say('Fill in all three boxes.'); return; }
  if (next !== again) { say('The two new passwords are different.'); return; }
  if (next.length < 10) { say('A password needs at least 10 characters.'); return; }
  try { await API.post('/me/password', { current, next }); }
  catch (e) { say(e.message); return; }

  const wasForced = S.account.mustChange;
  S.account.mustChange = false;
  $('#pw-form').reset();
  err.innerHTML = '';
  if (wasForced) {
    carryToasts();
    toast('Password changed', 'Your account is ready.');
    location.href = ROLES[S.role].nav[0][0] + '.html';
  } else {
    toast('Password changed', 'Use the new one next time you sign in.');
  }
}

boot(renderAccount);
