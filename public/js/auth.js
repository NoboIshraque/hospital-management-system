/* ============================================================
   UHID — sign in
   index.html only.

   These credentials are checked in JavaScript the user can read.
   That is a prototype stand-in and nothing else: in week 4 the
   accounts live in `user_account`, the password is a bcrypt hash,
   and the check happens on the SERVER. Say so if anyone asks.
   ============================================================ */

/* Where each role lands after signing in — the first item of its
   own nav, which is what go(r.nav[0][0]) used to do. */
function enterApp(role) {
  location.href = 'pages/' + ROLES[role].nav[0][0] + '.html';
}

/* Already signed in? Go straight through, as a reload did before.
   replace() rather than href so the back button does not bounce
   the user off the screen they just landed on. */
const existing = session.get();
if (existing && ROLES[existing.role]) {
  location.replace('pages/' + ROLES[existing.role].nav[0][0] + '.html');
}

$('#demo-list').innerHTML = ACCOUNTS.map(a => {
  const r = ROLES[a.role];
  return `
    <button type="button" class="demo-row" data-user="${a.user}">
      <span class="av">${initials(r.who)}</span>
      <span><b>${esc(r.who)}</b><span>${esc(r.label)}</span></span>
      <span class="u">${a.user}</span>
    </button>`;
}).join('');

$('#demo-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-user]');
  if (!btn) return;
  $('#l-user').value = btn.dataset.user;
  $('#l-pass').value = 'demo1234';
  $('#login-err').hidden = true;
  $('#l-pass').focus();
});

$('#pw-toggle').addEventListener('click', () => {
  const f = $('#l-pass');
  const showing = f.type === 'text';
  f.type = showing ? 'password' : 'text';
  $('#pw-toggle').textContent = showing ? 'show' : 'hide';
});

$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const user = $('#l-user').value.trim().toLowerCase();
  const pass = $('#l-pass').value;
  const err  = $('#login-err');

  if (!user || !pass) {
    err.textContent = 'Enter both a username and a password.';
    err.hidden = false;
    return;
  }
  const match = ACCOUNTS.find(a => a.user === user && a.pass === pass);
  if (!match) {
    err.textContent = 'No account matches those details. Check the demo accounts on the right.';
    err.hidden = false;
    $('#l-pass').value = '';
    return;
  }
  err.hidden = true;
  $('#login-form').reset();
  $('#pw-toggle').textContent = 'show';
  $('#l-pass').type = 'password';
  session.set(match.role);
  enterApp(match.role);
});

$('#reset-demo').addEventListener('click', resetDemo);

/* Replay anything the page we came from handed over — the sign-out
   and reset messages arrive this way. */
showFlashes();
