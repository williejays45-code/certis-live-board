(() => {
  const status = document.getElementById('certis-session-status');
  const login = document.getElementById('certis-login');
  const logout = document.getElementById('certis-logout');
  if (!status || !login || !logout) return;
  const loginButton = login.querySelector('button');
  const logoutButton = logout.querySelector('button');
  let generation = 0, submitting = false, recovery;

  function show(state) {
    login.hidden = state === 'signed-in';
    logout.hidden = state === 'signed-out';
    status.textContent = {
      'signed-in': 'Signed in · Ready to explore',
      'signed-out': 'Signed out · Use Google to continue',
      'unknown': 'Sign-in status unavailable. You can still try your question.'
    }[state];
  }
  async function check() {
    if (submitting) return;
    const request = ++generation;
    status.textContent = 'Checking sign-in…';
    try {
      const response = await fetch('/auth/session', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (response.status !== 200 && response.status !== 401) throw Error('UNAVAILABLE');
      const text = await response.text();
      if (text.length > 1024) throw Error('INVALID_STATUS');
      const result = JSON.parse(text);
      if (result?.authenticated !== (response.status === 200) ||
          result.founder_authority !== false || result.financial_authority !== 'none') throw Error('INVALID_STATUS');
      if (request === generation) show(result.authenticated ? 'signed-in' : 'signed-out');
    } catch {
      if (request === generation) show('unknown');
    }
  }
  function reset() {
    clearTimeout(recovery);
    submitting = false;
    loginButton.disabled = logoutButton.disabled = false;
    loginButton.textContent = 'Sign in with Google';
    logoutButton.textContent = 'Sign out';
  }
  function starting(form, button, message) {
    form.addEventListener('submit', event => {
      if (submitting) { event.preventDefault(); return; }
      // Keep the native POST/redirect and HttpOnly session handling intact.
      ++generation;
      submitting = true;
      loginButton.disabled = logoutButton.disabled = true;
      button.textContent = message;
      status.textContent = message;
      recovery = setTimeout(() => {
        reset();
        status.textContent = 'The page did not finish opening. Please try the button again.';
      }, 15000);
    });
  }
  starting(login, loginButton, 'Opening Google…');
  starting(logout, logoutButton, 'Signing out…');
  window.addEventListener('pageshow', event => { if (event.persisted) { reset(); check(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  check();
})();
