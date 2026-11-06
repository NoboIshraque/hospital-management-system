/* ============================================================
   UHID — sign in
   login.html only.

   Served by Express, the password is checked on the SERVER against
   the bcrypt hash in user_account (POST /api/login). Opened from
   disk there is no server, so the four demo accounts in js/data.js
   are checked here in JavaScript the user can read: a stand-in for
   offline use only, and you should say so if anyone asks.
   ============================================================ */

/* Where each role lands after signing in — the first item of its
   own nav, which is what go(r.nav[0][0]) used to do. */
function enterApp(role, mustChange) {
  location.href = 'pages/' + (mustChange ? 'account' : ROLES[role].nav[0][0]) + '.html';
}

/* Already signed in? Go straight through, as a reload did before.
   replace() rather than href so the back button does not bounce
   the user off the screen they just landed on. Online, "signed in"
   means the server still has a session for this browser. */
API.ready.then(async online => {
  if (API.down) return;            // the sign-in form says why when it is used
  if (online) {
    try {
      const me = await API.get('/me');
      session.set(me.role);
      location.replace('pages/' + (me.mustChange ? 'account' : ROLES[me.role].nav[0][0]) + '.html');
    } catch (e) { session.clear(); }
    return;
  }
  const existing = session.get();
  if (existing && ROLES[existing.role]) {
    location.replace('pages/' + ROLES[existing.role].nav[0][0] + '.html');
  }
});

/* The demo accounts are listed only where they exist: opened from disk
   (the four in js/data.js), or on a server started with DEMO_MODE=1
   (GET /api/config), which also has the lab technician and the system
   admin. A real installation lists nothing: its staff have their own
   passwords, given by an administrator (checklist I1). */
const DEMO_EXTRA = [{ user: 'rumana', role: 'lab_technician' }, { user: 'sysadmin', role: 'system_admin' }];
API.ready.then(async online => {
  let list = ACCOUNTS;
  if (online) {
    let demo = false;
    try { demo = (await API.get('/config')).demo; } catch (e) { /* treat as a real installation */ }
    list = demo ? ACCOUNTS.concat(DEMO_EXTRA) : [];
  }
  if (!list.length) { $('#demo-card').hidden = true; return; }
  $('#demo-count').textContent = list.length === 4 ? 'all four' : 'all of them';
  $('#demo-list').innerHTML = list.map(a => {
    const r = ROLES[a.role];
    return `
      <button type="button" class="demo-row" data-user="${esc(a.user)}">
        <span class="av">${esc(initials(r.who))}</span>
        <span><b>${esc(r.who)}</b><span>${esc(r.label)}</span></span>
        <span class="u">${esc(a.user)}</span>
      </button>`;
  }).join('');
});

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

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('#l-user').value.trim().toLowerCase();
  const pass = $('#l-pass').value;
  const err  = $('#login-err');
  const fail = msg => { err.textContent = msg; err.hidden = false; $('#l-pass').value = ''; };

  if (!user || !pass) {
    err.textContent = 'Enter both a username and a password.';
    err.hidden = false;
    return;
  }

  let role, mustChange = false;
  if (await API.ready && API.down) {
    fail(`The server is running, but its database is not answering: ${API.down}`);
    return;
  }
  if (await API.ready) {
    /* The real check: the server compares the password with the bcrypt
       hash in user_account and starts a session. */
    try {
      const me = await API.post('/login', { username: user, password: pass });
      role = me.role;
      mustChange = me.mustChange === true;
    } catch (ex) {
      fail(ex.status === 401 ? 'No account matches those details.' : ex.message);
      return;
    }
  } else {
    const match = ACCOUNTS.find(a => a.user === user && a.pass === pass);
    if (!match) { fail('No account matches those details. Check the demo accounts on the right.'); return; }
    role = match.role;
  }
  err.hidden = true;
  $('#login-form').reset();
  $('#pw-toggle').textContent = 'show';
  $('#l-pass').type = 'password';
  session.set(role);
  enterApp(role, mustChange);
});

$('#reset-demo').addEventListener('click', resetDemo);

/* Replay anything the page we came from handed over — the sign-out
   and reset messages arrive this way. */
showFlashes();
