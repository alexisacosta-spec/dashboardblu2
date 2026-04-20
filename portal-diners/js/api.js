// ─── HELPERS ─────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

async function api(url, method='GET', body=null) {
  const opts = {method, headers:{'Content-Type':'application/json'}};
  if (TOKEN) opts.headers['Authorization'] = 'Bearer '+TOKEN;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (r.status === 401) { sessionExpired(); return; }
  const data = await r.json();
  if (!r.ok) {
    if (typeof clientLog !== 'undefined') {
      clientLog('API_ERROR', { url: url.split('?')[0], status: r.status, error: data.error });
    }
    throw new Error(data.error || 'Error del servidor');
  }
  return data;
}

function sessionExpired() {
  localStorage.removeItem('dc_token');
  localStorage.removeItem('dc_user');
  TOKEN = null; USER = null;
  showScreen('login');
  setTimeout(() => {
    const err = document.getElementById('l-err');
    if (err) {
      err.textContent = 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
      err.classList.add('show');
    }
  }, 50);
}

function fmtH(n) { return (Math.round((n||0)*10)/10).toLocaleString('es-EC',{minimumFractionDigits:1,maximumFractionDigits:1}); }
function fmtN(n) { return Math.round(n||0).toLocaleString('es-EC'); }
function esc(s) { return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
