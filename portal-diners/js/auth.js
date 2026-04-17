// ─── AUTH ─────────────────────────────────────────────────────────────────────

// ─── INVITACIÓN ───────────────────────────────────────────────────────────────
async function handleInviteToken(token) {
  const loading = document.getElementById('invite-loading');
  const form = document.getElementById('invite-form');
  const invalid = document.getElementById('invite-invalid');
  try {
    const data = await fetch(`/api/auth/invitacion/${token}`).then(r => r.json());
    if (loading) loading.style.display = 'none';
    if (data.ok) {
      const nombreEl = document.getElementById('invite-nombre');
      const emailEl = document.getElementById('invite-email');
      if (nombreEl) nombreEl.textContent = data.nombre;
      if (emailEl) emailEl.textContent = data.email;
      if (form) form.style.display = '';
    } else {
      if (invalid) invalid.style.display = '';
    }
  } catch(e) {
    if (loading) loading.style.display = 'none';
    if (invalid) invalid.style.display = '';
  }
}

async function doActivateAccount() {
  const pass1 = document.getElementById('inv-pass1').value;
  const pass2 = document.getElementById('inv-pass2').value;
  const err = document.getElementById('inv-err');
  const btn = document.getElementById('btn-activate');
  err.classList.remove('show');
  if (!pass1 || !pass2) { err.textContent = 'Ambos campos son requeridos'; err.classList.add('show'); return; }
  if (pass1 !== pass2)  { err.textContent = 'Las contraseñas no coinciden'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Activando…';
  try {
    const res = await fetch('/api/auth/invitacion/activar', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ token: _inviteToken, password: pass1, confirmar_password: pass2 })
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || 'Error al activar la cuenta';
      err.classList.add('show');
      btn.disabled = false; btn.textContent = 'Activar mi cuenta';
      return;
    }
    TOKEN = data.token;
    USER = data.user;
    localStorage.setItem('dc_token', TOKEN);
    localStorage.setItem('dc_user', JSON.stringify(USER));
    _inviteToken = null;
    toast(`¡Bienvenido, ${data.user.nombre}! Tu cuenta ha sido activada.`, 'ok');
    showDashboard();
  } catch(e) {
    err.textContent = 'Error de conexión';
    err.classList.add('show');
    btn.disabled = false; btn.textContent = 'Activar mi cuenta';
  }
}

// ─── LOGIN / OTP ──────────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  const err = document.getElementById('l-err');
  const btn = document.getElementById('btn-login');
  err.classList.remove('show');
  if (!email || !pass) { err.textContent = 'Completa todos los campos'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Verificando…';
  try {
    const r = await api('/api/auth/login', 'POST', { email, password: pass });
    currentEmail = email;
    document.getElementById('otp-email-show').textContent = email;
    showScreen('otp');
    startOtpTimer(5 * 60);
    document.getElementById('o0').focus();
  } catch (e) {
    err.textContent = e.message || 'Credenciales incorrectas';
    err.classList.add('show');
  } finally { btn.disabled = false; btn.textContent = 'Ingresar al portal'; }
}

async function doVerify() {
  const codigo = [0,1,2,3,4,5].map(i => document.getElementById('o'+i).value).join('');
  const err = document.getElementById('otp-err');
  const btn = document.getElementById('btn-verify');
  err.classList.remove('show');
  if (codigo.length !== 6) { err.textContent = 'Ingresa los 6 dígitos'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Verificando…';
  try {
    const r = await api('/api/auth/verify-otp', 'POST', { email: currentEmail, codigo });
    TOKEN = r.token; USER = r.user;
    localStorage.setItem('dc_token', TOKEN);
    localStorage.setItem('dc_user', JSON.stringify(USER));
    if (otpTimer) clearInterval(otpTimer);
    showDashboard();
  } catch (e) {
    err.textContent = e.message || 'Código incorrecto';
    err.classList.add('show');
  } finally { btn.disabled = false; btn.textContent = 'Verificar código'; }
}

async function doResend() {
  try {
    await api('/api/auth/resend-otp', 'POST', { email: currentEmail });
    if (otpTimer) clearInterval(otpTimer);
    startOtpTimer(5 * 60);
    toast('Nuevo código enviado');
    [0,1,2,3,4,5].forEach(i => { const el = document.getElementById('o'+i); el.value = ''; });
    document.getElementById('o0').focus();
  } catch(e) { toast('Error al reenviar', 'err'); }
}

function goLogin() {
  if (otpTimer) clearInterval(otpTimer);
  showScreen('login');
}

function doLogout() {
  if (TOKEN) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    }).catch(() => {});
  }
  localStorage.removeItem('dc_token'); localStorage.removeItem('dc_user');
  TOKEN = null; USER = null;
  showScreen('login');
}

// ─── RECUPERACIÓN DE CONTRASEÑA ───────────────────────────────────────────────
async function doForgotPassword() {
  const email = document.getElementById('fp-email').value.trim();
  const err   = document.getElementById('fp-err');
  const btn   = document.getElementById('btn-forgot');
  err.classList.remove('show');
  if (!email) { err.textContent = 'Ingresa tu correo institucional'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    await api('/api/auth/forgot-password', 'POST', { email });
    resetEmail = email;
    document.getElementById('reset-email-show').textContent = email;
    [0,1,2,3,4,5].forEach(i => { const el = document.getElementById('r'+i); if(el) el.value = ''; });
    document.getElementById('rp-pass1').value = '';
    document.getElementById('rp-pass2').value = '';
    document.getElementById('rp-err').classList.remove('show');
    showScreen('reset');
    setTimeout(() => { const r0 = document.getElementById('r0'); if(r0) r0.focus(); }, 100);
  } catch(e) {
    err.textContent = e.message || 'Error al enviar el código';
    err.classList.add('show');
  } finally { btn.disabled = false; btn.textContent = 'Enviar código de recuperación'; }
}

async function doResetPassword() {
  const codigo = [0,1,2,3,4,5].map(i => document.getElementById('r'+i).value).join('');
  const pass1  = document.getElementById('rp-pass1').value;
  const pass2  = document.getElementById('rp-pass2').value;
  const err    = document.getElementById('rp-err');
  const btn    = document.getElementById('btn-reset');
  err.classList.remove('show');

  if (codigo.length !== 6) { err.textContent = 'Ingresa el código de 6 dígitos'; err.classList.add('show'); return; }
  if (!pass1 || !pass2)    { err.textContent = 'Completa ambas contraseñas'; err.classList.add('show'); return; }
  if (pass1 !== pass2)     { err.textContent = 'Las contraseñas no coinciden'; err.classList.add('show'); return; }

  btn.disabled = true; btn.textContent = 'Cambiando contraseña…';
  try {
    await api('/api/auth/reset-password', 'POST', {
      email: resetEmail, codigo,
      nueva_password: pass1, confirmar_password: pass2
    });
    showScreen('login');
    setTimeout(() => {
      const lerr = document.getElementById('l-err');
      if (lerr) {
        lerr.textContent = '✓ Contraseña actualizada correctamente. Ya puedes iniciar sesión.';
        lerr.style.color = '#22c55e';
        lerr.classList.add('show');
        setTimeout(() => { lerr.classList.remove('show'); lerr.style.color = ''; }, 5000);
      }
    }, 100);
  } catch(e) {
    err.textContent = e.message || 'Código incorrecto o expirado';
    err.classList.add('show');
  } finally { btn.disabled = false; btn.textContent = 'Cambiar contraseña'; }
}

async function doResendReset() {
  const err = document.getElementById('rp-err');
  err.classList.remove('show');
  try {
    await api('/api/auth/forgot-password', 'POST', { email: resetEmail });
    [0,1,2,3,4,5].forEach(i => { const el = document.getElementById('r'+i); if(el) el.value = ''; });
    document.getElementById('r0').focus();
    toast('Nuevo código enviado a ' + resetEmail);
  } catch(e) { toast('Error al reenviar el código', 'err'); }
}

// ─── OTP INPUT BEHAVIOR ───────────────────────────────────────────────────────
function setupOTP() {
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('o'+i);
    el.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g,'');
      e.target.value = v.slice(-1);
      if (v && i < 5) document.getElementById('o'+(i+1)).focus();
      if ([0,1,2,3,4,5].map(j=>document.getElementById('o'+j).value).join('').length === 6) doVerify();
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !el.value && i > 0) document.getElementById('o'+(i-1)).focus();
    });
    el.addEventListener('paste', e => {
      const txt = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'');
      if (txt.length === 6) {
        for (let j=0;j<6;j++) document.getElementById('o'+j).value = txt[j];
        document.getElementById('o5').focus();
        e.preventDefault();
        doVerify();
      }
    });
  }
  document.getElementById('l-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  // Setup inputs OTP del flujo de reset de contraseña (r0–r5)
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('r'+i);
    if (!el) continue;
    el.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g,'');
      e.target.value = v.slice(-1);
      if (v && i < 5) document.getElementById('r'+(i+1)).focus();
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !el.value && i > 0) document.getElementById('r'+(i-1)).focus();
      if (e.key === 'Enter') doResetPassword();
    });
    el.addEventListener('paste', e => {
      const txt = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'');
      if (txt.length === 6) {
        for (let j=0;j<6;j++) document.getElementById('r'+j).value = txt[j];
        document.getElementById('r5').focus();
        e.preventDefault();
      }
    });
  }
  // Enter en campos de contraseña de reset
  ['rp-pass1','rp-pass2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if(e.key==='Enter') doResetPassword(); });
  });
  // Enter en campo de email de forgot
  const fpEmail = document.getElementById('fp-email');
  if (fpEmail) fpEmail.addEventListener('keydown', e => { if(e.key==='Enter') doForgotPassword(); });
}

function startOtpTimer(secs) {
  const el = document.getElementById('otp-cd');
  let s = secs;
  el.textContent = fmt(s);
  otpTimer = setInterval(() => {
    s--;
    el.textContent = fmt(s);
    if (s <= 0) { clearInterval(otpTimer); el.textContent = 'Expirado'; }
  }, 1000);
  function fmt(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
}
