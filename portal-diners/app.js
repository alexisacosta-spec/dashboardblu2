// ─── STATE ──────────────────────────────────────────────────────────────────
// ─── TOOLTIP SISTEMA INFO ─────────────────────────────────────────────────────
const TOOLTIPS = {
  'horas-mes':    { title: 'Horas por mes', body: 'Suma de horas completadas de todas las tasks cerradas agrupadas por mes y año de registro.', formula: 'Σ HORAS_COMPLETADAS por MES/AÑO' },
  'empresa-donut':{ title: 'Distribución por empresa', body: 'Porcentaje de horas aportadas por cada empresa proveedora, calculado sobre el total del período seleccionado.', formula: 'Horas empresa / Horas totales × 100' },
  'top-ini':      { title: 'Top iniciativas', body: 'Las 5 iniciativas con mayor número de horas registradas en el período. Haz clic en "Ver todas" para el detalle completo.', formula: 'Rank por Σ HORAS_COMPLETADAS' },
  'horas-rol':    { title: 'Horas por rol', body: 'Distribución de horas por perfil de colaborador (LT, Desarrollador, QA, etc.) en el período filtrado.', formula: 'Σ HORAS_COMPLETADAS por ROL' },
  'horas-emp-bar':{ title: 'Horas por empresa', body: 'Barras horizontales con el total de horas por empresa. Considera los filtros de año, mes y categoría activos.', formula: 'Σ HORAS_COMPLETADAS por EMPRESA' },
  'matriz-emp-rol':{ title: 'Matriz empresa × rol', body: 'Cruce entre empresa y rol técnico. Cada celda muestra las horas sumadas para esa combinación. El color indica intensidad relativa.', formula: 'Σ HORAS por (EMPRESA, ROL)' },
  'detalle-emp':  { title: 'Detalle por empresa', body: 'Tabla con horas, costo y colaboradores únicos por empresa. El costo visible solo para perfiles con acceso a costos.', formula: 'Σ HORAS · Σ COSTO · COUNT(personas)' },
  'equipo':       { title: 'Equipo completo', body: 'Lista de todos los colaboradores con horas registradas. Se puede buscar por nombre, empresa o rol. Ordenable por columna.', formula: 'Σ HORAS y COSTO por NOMBRE_PERSONA' },
  'cat-donut':    { title: 'Horas por categoría', body: 'Distribución de horas según la categoría de negocio asignada en ADO. Las categorías vacías o con "SIN" se agrupan como "Sin Clasificar".', formula: 'Σ HORAS_COMPLETADAS por CATEGORÍA_NEGOCIO' },
  'cat-detalle':  { title: 'Detalle por categoría', body: 'Barras proporcionales de horas por categoría de negocio. El ancho representa el % sobre el total de horas del período.', formula: 'HORAS_CAT / HORAS_TOTALES × 100' },
  'ini-tabla':    { title: 'Por iniciativa', body: 'Tabla con el total de horas, porcentaje del total y personas únicas por iniciativa. Haz clic en una iniciativa para ver el desglose por Epic → HU → Task.', formula: 'Σ HORAS por ID_INICIATIVA' },
  'avance-ini':   { title: '% Avance por iniciativa', body: 'Porcentaje de tasks cerradas sobre el total de tasks planificadas. El total incluye tasks en todos los estados (Closed, Active, New). El color indica el nivel de avance.', formula: 'Tasks Closed / Tasks totales × 100' },
  'delivery':     { title: 'Delivery plan', body: 'Diagrama de Gantt con la duración real de cada iniciativa. El inicio es la fecha de inicio más temprana de sus tasks, el fin es la más tardía. La línea roja marca hoy.', formula: 'Inicio = MIN(FECHA_INICIO tasks) · Fin = MAX(FECHA_FIN tasks)' },
};

let _tooltipEl = null;
let _tooltipTimeout = null;

function initTooltipSystem() {
  _tooltipEl = document.createElement('div');
  _tooltipEl.className = 'info-tooltip';
  _tooltipEl.innerHTML = '<div class="info-tooltip-title"></div><div class="info-tooltip-body"></div><div class="info-tooltip-formula"></div>';
  document.body.appendChild(_tooltipEl);
}

function showTooltip(key, el) {
  const data = TOOLTIPS[key];
  if (!data || !_tooltipEl) return;
  clearTimeout(_tooltipTimeout);
  _tooltipEl.querySelector('.info-tooltip-title').textContent = data.title;
  _tooltipEl.querySelector('.info-tooltip-body').textContent  = data.body;
  _tooltipEl.querySelector('.info-tooltip-formula').textContent = data.formula;
  _tooltipEl.classList.add('show');
  positionTooltip(el);
}

function positionTooltip(el) {
  if (!_tooltipEl || !el) return;
  const rect = el.getBoundingClientRect();
  const tw   = _tooltipEl.offsetWidth  || 260;
  const th   = _tooltipEl.offsetHeight || 100;
  let left = rect.right + 8;
  let top  = rect.top - 4;
  if (left + tw > window.innerWidth  - 12) left = rect.left - tw - 8;
  if (top  + th > window.innerHeight - 12) top  = window.innerHeight - th - 12;
  if (top < 8) top = 8;
  _tooltipEl.style.left = left + 'px';
  _tooltipEl.style.top  = top  + 'px';
}

function hideTooltip() {
  if (!_tooltipEl) return;
  _tooltipTimeout = setTimeout(() => _tooltipEl.classList.remove('show'), 120);
}

function infoBtn(key) {
  return `<span class="info-btn" onmouseenter="showTooltip('${key}',this)" onmouseleave="hideTooltip()" onclick="event.stopPropagation()">i</span>`;
}


let TOKEN = localStorage.getItem('dc_token');
let USER = JSON.parse(localStorage.getItem('dc_user') || 'null');
let currentEmail = '';
let resetEmail = '';
let otpTimer = null;
let chartMes = null, chartEmpDonut = null, chartEmpBar = null, chartCat = null;
let allPersonas = [];

const MESES = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'};
const BADGE_EMPRESA = {Opinno:'badge-opinno',Sofka:'badge-sofka',Byteq:'badge-byteq',Digital:'badge-digital'};

// ─── INIT ────────────────────────────────────────────────────────────────────
window.onload = () => {
  setupOTP();
  if (TOKEN && USER) { showDashboard(); }
  else { showScreen('login'); }
};

// ─── AUTH ────────────────────────────────────────────────────────────────────
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
  // SEC-06: Invalidar el token en el servidor antes de limpiar localmente
  if (TOKEN) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    }).catch(() => {}); // Ignorar errores de red — el logout local siempre procede
  }
  localStorage.removeItem('dc_token'); localStorage.removeItem('dc_user');
  TOKEN = null; USER = null;
  showScreen('login');
}

// ─── RECUPERACIÓN DE CONTRASEÑA ──────────────────────────────────────────────
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
    // Limpiar campos de la pantalla de reset
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
    // Mostrar mensaje de éxito en la pantalla de login
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

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function showDashboard() {
  showScreen('dashboard');
  document.getElementById('sb-nm').textContent = USER.nombre;
  document.getElementById('sb-av').textContent = USER.nombre.split(' ').map(w=>w[0]).slice(0,2).join('');
  const roles = {admin:'Administrador',gerente:'Gerente · Con costos',gestor:'Gestor'};
  document.getElementById('sb-rl').textContent = roles[USER.perfil] || USER.perfil;

  const isAdmin = USER.perfil === 'admin';
  const verCostos = ['admin','gerente'].includes(USER.perfil);

  if (isAdmin) {
    document.getElementById('sb-admin-sec').style.display = '';
    document.getElementById('nav-usuarios').style.display = '';
    document.getElementById('nav-equipo').style.display = '';
    document.getElementById('nav-tarifas').style.display = '';
    document.getElementById('nav-cargar').style.display = '';
    document.getElementById('nav-historial').style.display = '';
    document.getElementById('nav-logs').style.display = '';
  }
  if (!verCostos) {
    document.getElementById('kpi-costo-card').style.display = 'none';
    document.getElementById('th-costo-per').style.display = 'none';
  }

  initTooltipSystem();
  await loadFiltros();
  document.getElementById('filter-zone').style.display = '';
  _updateFilterUI();   // UX-01/12: inicializar badge y botón limpiar
  showView('resumen');
}

// ─── FILTROS ─────────────────────────────────────────────────────────────────
async function loadFiltros() {
  try {
    const f = await api('/api/datos/filtros');
    const anioSel = document.getElementById('f-anio');
    const mesSel  = document.getElementById('f-mes');
    const empSel  = document.getElementById('f-empresa');
    const catSel  = document.getElementById('f-cat');
    const iniSel  = document.getElementById('f-ini');

    // Guardar valor seleccionado antes de limpiar
    const selAnio = anioSel.value;
    const selMes  = mesSel.value;
    const selEmp  = empSel.value;
    const selCat  = catSel.value;
    const selIni  = iniSel.value;

    // Limpiar y reconstruir — evita duplicados al recargar
    anioSel.innerHTML = '<option value="">Todos los años</option>';
    mesSel.innerHTML  = '<option value="">Todos los meses</option>';
    empSel.innerHTML  = '<option value="">Todas las empresas</option>';
    catSel.innerHTML  = '<option value="">Todas las categorías</option>';
    iniSel.innerHTML  = '<option value="">Todas las iniciativas</option>';

    f.anios.forEach(a => anioSel.innerHTML += `<option value="${a}">${a}</option>`);
    f.meses.forEach(m => mesSel.innerHTML  += `<option value="${m}">${MESES[m]||m}</option>`);
    f.empresas.forEach(e => empSel.innerHTML += `<option value="${e}">${e}</option>`);
    f.categorias.forEach(c => catSel.innerHTML += `<option value="${c}">${c}</option>`);
    f.iniciativas.forEach(i => iniSel.innerHTML += `<option value="${i.id}">${i.nombre}</option>`);

    // Restaurar selección anterior si aún existe
    if (selAnio) anioSel.value = selAnio;
    if (selMes)  mesSel.value  = selMes;
    if (selEmp)  empSel.value  = selEmp;
    if (selCat)  catSel.value  = selCat;
    if (selIni)  iniSel.value  = selIni;
  } catch(e) {}
}

function getFilters() {
  const p = new URLSearchParams();
  const vals = {anio:document.getElementById('f-anio').value,mes:document.getElementById('f-mes').value,
    empresa:document.getElementById('f-empresa').value,categoria:document.getElementById('f-cat').value,
    iniciativa:document.getElementById('f-ini').value};
  Object.entries(vals).forEach(([k,v]) => { if(v) p.set(k,v); });
  return p.toString() ? '?' + p.toString() : '';
}

// UX-01 + UX-12: badge de filtros activos y visibilidad del botón limpiar
function _updateFilterUI() {
  const count = ['f-anio','f-mes','f-empresa','f-cat','f-ini']
    .filter(id => document.getElementById(id)?.value).length;
  const badge    = document.getElementById('filter-badge');
  const clearBtn = document.querySelector('.btn-clear');
  if (badge) {
    badge.textContent = count + (count === 1 ? ' filtro activo' : ' filtros activos');
    badge.style.display = count ? '' : 'none';
  }
  if (clearBtn) clearBtn.style.display = count ? '' : 'none';
}

function clearFilters() {
  ['f-anio','f-mes','f-empresa','f-cat','f-ini'].forEach(id => document.getElementById(id).value = '');
  _updateFilterUI();
  applyFilters();
}

function applyFilters() {
  _updateFilterUI();
  const v = document.querySelector('.view.active')?.id?.replace('view-','');
  if (v) renderView(v);
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────
// Vistas que NO usan filtros globales — se oculta la barra al entrar
const VISTAS_SIN_FILTROS = new Set(['avance','indicadores','equipo','tarifas','usuarios','historial','cargar','logs']);

function showView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const view = document.getElementById('view-'+name);
  if (view) view.classList.add('active');
  const nav = document.querySelector(`[onclick="showView('${name}')"]`);
  if (nav) nav.classList.add('active');
  // Mostrar/ocultar barra de filtros según vista
  const filterZone = document.getElementById('filter-zone');
  if (filterZone) filterZone.style.display = VISTAS_SIN_FILTROS.has(name) ? 'none' : '';
  renderView(name);
}

function renderView(name) {
  const map = {resumen:loadResumen,iniciativas:loadIniciativas,empresas:loadEmpresas,
    personas:loadPersonas,categorias:loadCategorias,avance:loadAvance,
    indicadores:loadIndicadores,
    usuarios:loadUsuarios,equipo:loadEquipo,tarifas:loadTarifas,
    cargar:()=>{},historial:loadHistorialCSV,logs:loadLogs};
  if (map[name]) map[name]();
}

// ─── RESUMEN ─────────────────────────────────────────────────────────────────
async function loadResumen() {
  const q = getFilters();
  try {
    const [kpis, mes, emp, ini, roles] = await Promise.all([
      api('/api/datos/kpis'+q), api('/api/datos/por-mes'+q),
      api('/api/datos/por-empresa'+q), api('/api/datos/por-iniciativa'+q),
      api('/api/datos/por-rol'+q)
    ]);
    // KPIs
    document.getElementById('kpi-h').textContent = fmtH(kpis.horas);
    if (kpis.costo !== null) document.getElementById('kpi-c').textContent = '$' + fmtN(kpis.costo);
    document.getElementById('kpi-i').textContent = kpis.iniciativas;
    document.getElementById('kpi-p').textContent = kpis.personas;

    // Subtítulo
    const meses = [...new Set(mes.map(r => `${MESES[r.mes]||r.mes} ${r.anio}`))];
    document.getElementById('resumen-sub').textContent = `Periodo: ${meses[0]||'—'} — ${meses[meses.length-1]||'—'} · Portal Canales`;

    // Chart mes
    const labM = mes.map(r => `${MESES[r.mes]||r.mes}\n${r.anio}`);
    const dataM = mes.map(r => r.horas);
    if (chartMes) chartMes.destroy();
    chartMes = new Chart(document.getElementById('chart-mes'), {
      type:'bar', data:{labels:labM, datasets:[{
        data:dataM, backgroundColor:'rgba(10,22,40,0.75)', borderRadius:2,
        hoverBackgroundColor:'rgba(201,168,76,0.85)'
      }]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmtH(c.raw)+' h'}}},
        scales:{y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{size:10}}},
                x:{grid:{display:false},ticks:{font:{size:10}}}}}
    });

    // Chart donut empresa
    const labE = emp.map(r=>r.empresa), dataE = emp.map(r=>r.horas);
    const colsE = ['#0A1628','#6B7280','#B4B2A9','#D3D1C7'];
    if (chartEmpDonut) chartEmpDonut.destroy();
    chartEmpDonut = new Chart(document.getElementById('chart-emp-donut'), {
      type:'doughnut', data:{labels:labE, datasets:[{data:dataE, backgroundColor:colsE, borderWidth:0, hoverOffset:4}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtH(c.raw)} h`}}}}
    });
    const totalEmp = dataE.reduce((a,b)=>a+b,0);
    // UX-20: Leyenda custom clickeable para filtrar segmentos del donut
    document.getElementById('emp-legend').innerHTML = labE.map((l,i)=>
      `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;
        border-radius:4px;padding:2px 4px;transition:background .15s"
        onclick="toggleDonutSegment(chartEmpDonut,${i},this)"
        onmouseenter="this.style.background='rgba(255,255,255,0.05)'"
        onmouseleave="this.style.background=''"
        title="Clic para mostrar/ocultar ${l}">
        <div style="width:8px;height:8px;border-radius:50%;background:${colsE[i]};flex-shrink:0"></div>
        <span style="font-size:10px;color:var(--text)">${l}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto">${fmtH(dataE[i])} h · ${Math.round(dataE[i]/totalEmp*100)}%</span>
      </div>`).join('');

    // Caché para exportación
    _cacheResumen.mes    = mes.map(r=>({label:`${MESES[r.mes]||r.mes} ${r.anio}`, horas:r.horas}));
    _cacheResumen.roles  = roles.map(r=>({label:r.rol, horas:r.horas}));
    _cacheResumen.topIni = ini.slice(0,8).map(r=>({label:r.nombre_iniciativa, horas:r.horas}));

    // Pbar iniciativas (top 8)
    document.getElementById('pbar-iniciativas').innerHTML = renderPbars(ini.slice(0,8), 'horas');
    // Pbar roles
    document.getElementById('pbar-roles').innerHTML = renderPbars(roles, 'horas', 'rol');

    // Badge rango meses
    if (mes.length) document.getElementById('badge-mes-range').textContent = `${mes.length} ${mes.length===1?'mes':'meses'}`;

  } catch(e) { console.error(e); }
}

function renderPbars(rows, campo, labelKey='nombre_iniciativa') {
  if (!rows.length) return '<div class="no-data">Sin datos para los filtros seleccionados</div>';
  const max = Math.max(...rows.map(r=>r[campo]));
  return rows.map(r =>
    `<div class="pbar-row">
      <div class="pbar-label" title="${r[labelKey]}">${r[labelKey]}</div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${Math.round(r[campo]/max*100)}%"></div></div>
      <div class="pbar-val">${fmtH(r[campo])}</div>
    </div>`
  ).join('');
}

// ─── INICIATIVAS ─────────────────────────────────────────────────────────────
let drillState = {level:'iniciativas', iniciativa:null, epic:null};

let allIniciativas = [];

async function loadIniciativas() {
  drillState = {level:'iniciativas', iniciativa:null, epic:null};
  document.getElementById('ini-title').textContent = 'Por iniciativa';
  document.getElementById('ini-sub').textContent = 'Haz clic en una iniciativa para ver el detalle por Epics';
  document.getElementById('ini-breadcrumb').style.display = 'none';
  const q = getFilters();
  allIniciativas = await api('/api/datos/por-iniciativa'+q);
  renderIniciativasTable(allIniciativas);
}

function renderIniciativasTable(rows) {
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const totalH = rows.reduce((s,r)=>s+r.horas,0);

  // Si el panel ya existe, solo actualizar tbody y count — no destruir el input
  const existing = document.getElementById('ini-table-panel');
  if (!existing) {
    // Primera vez: crear el panel completo con el buscador
    document.getElementById('ini-content').innerHTML = `
      <div class="panel" id="ini-table-panel">
        <div class="panel-hdr">
          <div style="display:flex;align-items:center"><div class="panel-title">Iniciativas</div>${infoBtn('ini-tabla')}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="search-wrap">
              <input type="text" id="ini-search" class="search-input"
                placeholder="Buscar por nombre, ID o categoría…"
                oninput="filterIniciativas()">
              <span class="search-count" id="ini-search-count"></span>
            </div>
            <button class="panel-dl-btn" onclick="exportIniExcel()" title="Descargar Excel">${_icoXls()} Excel</button>
          </div>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          <table class="tbl">
            <thead><tr>
              <th class="th-sort" id="th-ini-id"       onclick="sortIniciativas('id_iniciativa')">ID<i class="sort-arrow">↕</i></th>
              <th class="th-sort" id="th-ini-nombre"   onclick="sortIniciativas('nombre_iniciativa')">Iniciativa<i class="sort-arrow">↕</i></th>
              <th class="th-sort" id="th-ini-cat"      onclick="sortIniciativas('categoria_negocio')">Categoría<i class="sort-arrow">↕</i></th>
              <th class="th-sort num" id="th-ini-horas"    onclick="sortIniciativas('horas')">Horas<i class="sort-arrow">↕</i></th>
              <th class="th-sort num" id="th-ini-pct"      onclick="sortIniciativas('pct')">% total<i class="sort-arrow">↕</i></th>
              ${verCostos?'<th class="th-sort num" id="th-ini-costo" onclick="sortIniciativas(\'costo\')">Costo<i class="sort-arrow">↕</i></th>':''}
              <th class="th-sort num" id="th-ini-personas" onclick="sortIniciativas('personas')">Personas<i class="sort-arrow">↕</i></th>
            </tr></thead>
            <tbody id="ini-tbody"></tbody>
          </table>
        </div>
      </div>`;
  }

  // Actualizar solo el tbody y el contador — el input no se toca
  const countEl = document.getElementById('ini-search-count');
  if (countEl) countEl.textContent = rows.length + ' iniciativas';

  // UX-13: Aplicar ordenamiento y actualizar flechas
  _applySortArrows('ini', _sortIni, ['id_iniciativa','nombre_iniciativa','categoria_negocio','horas','pct','costo','personas'],
    {id_iniciativa:'th-ini-id', nombre_iniciativa:'th-ini-nombre', categoria_negocio:'th-ini-cat',
     horas:'th-ini-horas', pct:'th-ini-pct', costo:'th-ini-costo', personas:'th-ini-personas'});
  const sortedRows = _sortIni.col ? _sortRows(rows, _sortIni) : rows;

  const tbody = document.getElementById('ini-tbody');
  if (!tbody) return;

  tbody.innerHTML = sortedRows.length ? sortedRows.map(r=>`
    <tr>
      <td><span class="id-badge" title="ID ADO: ${r.id_iniciativa}">${r.id_iniciativa}</span></td>
      <td><button class="drill-btn" onclick="drillIniciativa('${esc(String(r.id_iniciativa))}','${esc(r.nombre_iniciativa)}')">${r.nombre_iniciativa}</button></td>
      <td class="muted" style="font-size:11px">${r.categoria_negocio}</td>
      <td class="num">${fmtH(r.horas)}</td>
      <td class="num">${r.pct}%</td>
      ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
      <td class="num">${r.personas}</td>
    </tr>`).join('') +
    `<tr style="background:var(--surface);font-weight:600">
      <td></td><td>Total</td><td></td>
      <td class="num">${fmtH(totalH)}</td>
      <td class="num">100%</td>
      ${verCostos?`<td class="num">$${fmtN(rows.reduce((s,r)=>s+(r.costo||0),0))}</td>`:''}
      <td class="num">${rows.reduce((s,r)=>s+r.personas,0)}</td>
    </tr>` :
    `<tr><td colspan="7"><div class="no-data">Sin resultados</div></td></tr>`;
}

// UX-10: Debounce — timers por cada búsqueda para no disparar en cada tecla
let _timerIni, _timerPersonas, _timerEquipo, _timerLT;

// UX-13: Estado de ordenamiento por tabla
let _sortIni      = { col: null,   dir: 1 };
let _sortPersonas = { col: 'horas', dir: -1 };
let _sortLT       = { col: 'lead_time', dir: -1 };

// ── UX-13: helpers genéricos de ordenamiento ──────────────────────────────────
function _sortRows(rows, state) {
  return [...rows].sort((a, b) => {
    const va = a[state.col] ?? '';
    const vb = b[state.col] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') return state.dir * (va - vb);
    return state.dir * String(va).localeCompare(String(vb), 'es', { numeric: true });
  });
}

function _applySortArrows(prefix, state, cols, thMap) {
  cols.forEach(col => {
    const thId = thMap[col];
    if (!thId) return;
    const th = document.getElementById(thId);
    if (!th) return;
    th.classList.remove('asc', 'desc');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '↕';
    if (state.col === col) {
      th.classList.add(state.dir === 1 ? 'asc' : 'desc');
      if (arrow) arrow.textContent = state.dir === 1 ? '▲' : '▼';
    }
  });
}

function _toggleSort(state, col) {
  if (state.col === col) { state.dir *= -1; }
  else { state.col = col; state.dir = 1; }
}

// ── Funciones públicas de sort (llamadas desde onclick) ───────────────────────
function sortIniciativas(col) {
  _toggleSort(_sortIni, col);
  // Re-renderizar con los datos ya filtrados en memoria (filterIniciativas los filtra)
  const q = document.getElementById('ini-search')?.value?.toLowerCase() || '';
  const filtered = q
    ? allIniciativas.filter(r =>
        r.nombre_iniciativa.toLowerCase().includes(q) ||
        String(r.id_iniciativa).includes(q) ||
        r.categoria_negocio.toLowerCase().includes(q))
    : allIniciativas;
  renderIniciativasTable(filtered);
}

function sortPersonas(col) {
  _toggleSort(_sortPersonas, col);
  const q = document.getElementById('persona-search')?.value?.toLowerCase() || '';
  const filtered = q
    ? allPersonas.filter(r =>
        r.nombre_persona.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q) ||
        r.rol.toLowerCase().includes(q))
    : allPersonas;
  renderPersonasTable(filtered);
}

function sortLT(col) {
  _toggleSort(_sortLT, col);
  if (_ltData) _runLTFiltro();
}

function filterIniciativas() {
  clearTimeout(_timerIni);
  _timerIni = setTimeout(() => {
    const q = document.getElementById('ini-search').value.toLowerCase();
    const filtered = allIniciativas.filter(r =>
      r.nombre_iniciativa.toLowerCase().includes(q) ||
      String(r.id_iniciativa).includes(q) ||
      r.categoria_negocio.toLowerCase().includes(q)
    );
    renderIniciativasTable(filtered);
  }, 250);
}

async function drillIniciativa(idIni, nombre) {
  drillState = {level:'epics', iniciativa:nombre, idIni:idIni, epic:null};
  document.getElementById('ini-title').textContent = nombre;
  document.getElementById('ini-sub').textContent = 'Haz clic en un Epic para ver las Tasks';
  const bc = document.getElementById('ini-breadcrumb');
  bc.style.display = '';
  bc.innerHTML = `<div class="breadcrumb"><button class="back-btn" onclick="loadIniciativas()">← Volver</button><span>Todas las iniciativas</span> / <span>${nombre}</span></div>`;
  document.getElementById('ini-content').innerHTML = '<div class="loader">Cargando Epics…</div>';

  // ID numérico en la URL — solo dígitos o texto sin caracteres problemáticos
  const filtersStr = getFilters();
  const url = '/api/datos/iniciativa/' + idIni + '/epics' + filtersStr;

  let rows;
  try {
    rows = await api(url);
  } catch(e) {
    document.getElementById('ini-content').innerHTML =
      `<div class="no-data">Error al cargar: ${e.message}</div>`;
    return;
  }

  const verCostos = ['admin','gerente'].includes(USER.perfil);

  if (!rows.length) {
    document.getElementById('ini-content').innerHTML =
      '<div class="no-data">No se encontraron Epics para esta iniciativa con los filtros actuales.<div class="no-data-action">Prueba limpiando los filtros de mes o empresa.</div></div>';
    return;
  }
  document.getElementById('ini-content').innerHTML = `
    <div class="panel"><div class="panel-body" style="overflow-x:auto">
    <table class="tbl">
      <thead><tr><th>ID</th><th>Epic</th><th class="num">Horas</th>${verCostos?'<th class="num">Costo</th>':''}<th class="num">Personas</th></tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td><span class="id-badge" title="ID ADO: ${r.id_epic}">${r.id_epic}</span></td>
          <td><button class="drill-btn" onclick="drillEpic('${esc(r.id_epic)}','${esc(r.nombre_epic)}')">${r.nombre_epic}</button></td>
          <td class="num">${fmtH(r.horas)}</td>
          ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
          <td class="num">${r.personas}</td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
}

async function drillEpic(epicId, epicNombre) {
  drillState.idEpic = epicId;
  drillState.epic   = epicNombre;
  const bc = document.getElementById('ini-breadcrumb');
  bc.innerHTML = `<div class="breadcrumb">
    <button class="back-btn" onclick="drillIniciativa('${esc(drillState.idIni)}','${esc(drillState.iniciativa)}')">← Epics</button>
    <span>${drillState.iniciativa}</span> / <span>${epicNombre}</span>
  </div>`;
  document.getElementById('ini-content').innerHTML = '<div class="loader">Cargando HU / Enablers…</div>';

  let rows;
  try { rows = await api('/api/datos/epic/' + epicId + '/hus' + getFilters()); }
  catch(e) { document.getElementById('ini-content').innerHTML = `<div class="no-data">Error: ${e.message}</div>`; return; }

  const verCostos = ['admin','gerente'].includes(USER.perfil);

  if (!rows.length) {
    document.getElementById('ini-content').innerHTML =
      '<div class="no-data">No se encontraron HU/Enablers para este Epic.</div>';
    return;
  }
  document.getElementById('ini-content').innerHTML = `
    <div class="panel"><div class="panel-body" style="overflow-x:auto">
    <table class="tbl">
      <thead><tr>
        <th>ID</th><th>HU / Enabler</th>
        <th class="num">Horas</th>${verCostos?'<th class="num">Costo</th>':''}
        <th class="num">Personas</th>
      </tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td><span class="id-badge" title="ID ADO: ${r.id_hu}">${r.id_hu}</span></td>
          <td><button class="drill-btn" onclick="drillHu('${esc(r.id_hu)}','${esc(r.nombre_hu)}')">${r.nombre_hu}</button></td>
          <td class="num">${fmtH(r.horas)}</td>
          ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
          <td class="num">${r.personas}</td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
}

async function drillHu(idHu, huNombre) {
  drillState.idHu = idHu;
  drillState.hu   = huNombre;
  const bc = document.getElementById('ini-breadcrumb');
  bc.innerHTML = `<div class="breadcrumb">
    <button class="back-btn" onclick="drillEpic('${esc(drillState.idEpic)}','${esc(drillState.epic)}')">← HUs</button>
    <span>${drillState.iniciativa}</span> / <span>${drillState.epic}</span> / <span>${huNombre}</span>
  </div>`;
  document.getElementById('ini-content').innerHTML = '<div class="loader">Cargando Tasks…</div>';

  let rows;
  try { rows = await api('/api/datos/hu/' + idHu + '/tasks'); }
  catch(e) { document.getElementById('ini-content').innerHTML = `<div class="no-data">Error: ${e.message}</div>`; return; }

  const verCostos = ['admin','gerente'].includes(USER.perfil);

  if (!rows.length) {
    document.getElementById('ini-content').innerHTML =
      '<div class="no-data">No se encontraron Tasks para esta HU/Enabler.</div>';
    return;
  }
  document.getElementById('ini-content').innerHTML = `
    <div class="panel"><div class="panel-body" style="overflow-x:auto">
    <table class="tbl">
      <thead><tr>
        <th>ID</th><th>Task</th><th>Persona</th><th>Empresa</th><th>Rol</th>
        <th class="num">Horas</th>${verCostos?'<th class="num">Costo</th>':''}
        <th class="num">Mes</th>
      </tr></thead>
      <tbody>${rows.map(r=>`
        <tr>
          <td><span class="id-badge" title="ID ADO: ${r.id_task}">${r.id_task}</span></td>
          <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              title="${r.nombre_task}">${r.nombre_task}</td>
          <td style="font-size:11px">${r.nombre_persona}</td>
          <td><span class="badge ${BADGE_EMPRESA[r.empresa]||'badge-default'}">${r.empresa}</span></td>
          <td class="muted" style="font-size:10px">${r.rol}</td>
          <td class="num">${fmtH(r.horas_completadas)}</td>
          ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
          <td class="num muted">${MESES[r.mes]||r.mes} ${r.anio}</td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
}

// ─── AVANCE / DELIVERY / QA ──────────────────────────────────────────────────
async function loadAvance() {
  // Precargar mes actual si los inputs están vacíos
  const elDesde = document.getElementById('av-desde');
  const elHasta = document.getElementById('av-hasta');
  if (elDesde && !elDesde.value) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const primerDia = new Date(y, m, 1);
    const ultimoDia = new Date(y, m + 1, 0);
    elDesde.value = primerDia.toISOString().slice(0, 10);
    elHasta.value = ultimoDia.toISOString().slice(0, 10);
  }

  document.getElementById('avance-ini-content').innerHTML = '<div class="loader">Cargando…</div>';
  document.getElementById('delivery-content').innerHTML   = '<div class="loader">Cargando…</div>';
  try {
    const desde = elDesde?.value;
    const hasta  = elHasta?.value;
    let qs = '';
    if (desde && hasta) qs = `?desde=${desde}&hasta=${hasta}`;
    const avance = await api('/api/datos/avance-iniciativas' + qs);
    _cacheAvance = avance;
    renderAvanceKpis(avance);
    renderAvanceTabla(avance);
    renderDeliveryPlan(avance, desde || null, hasta || null);
  } catch(e) {
    ['avance-ini-content','delivery-content'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="no-data">Error al cargar: ${e.message}</div>`;
    });
  }
}

function applyAvanceFiltro() {
  const elDesde = document.getElementById('av-desde');
  const elHasta = document.getElementById('av-hasta');
  const errEl   = document.getElementById('av-date-err');
  // Limpiar estado de error previo
  elDesde.classList.remove('input-error');
  elHasta.classList.remove('input-error');
  if (errEl) errEl.style.display = 'none';

  const desde = elDesde.value;
  const hasta  = elHasta.value;
  if (!desde || !hasta) { toast('Selecciona fecha desde y hasta', 'err'); return; }
  if (desde > hasta) {
    // UX-08: validación visual inline
    elDesde.classList.add('input-error');
    elHasta.classList.add('input-error');
    if (errEl) { errEl.textContent = '⚠ "Desde" debe ser anterior a "Hasta"'; errEl.style.display = ''; }
    toast('La fecha "desde" debe ser anterior a "hasta"', 'err');
    return;
  }
  loadAvance();
}

function clearAvanceFiltro() {
  const elDesde = document.getElementById('av-desde');
  const elHasta = document.getElementById('av-hasta');
  elDesde.value = ''; elHasta.value = '';
  elDesde.classList.remove('input-error');
  elHasta.classList.remove('input-error');
  const errEl = document.getElementById('av-date-err');
  if (errEl) errEl.style.display = 'none';
  loadAvance();
}

function renderAvanceKpis(avance) {
  const totalTasks = avance.reduce((s,r) => s + r.total,    0);
  const cerradas   = avance.reduce((s,r) => s + r.cerradas, 0);
  const abiertas   = totalTasks - cerradas;
  const pctDev     = totalTasks > 0 ? Math.round(cerradas / totalTasks * 1000) / 10 : 0;

  document.getElementById('av-kpi-dev').textContent      = pctDev + '%';
  document.getElementById('av-kpi-total').textContent    = fmtN(totalTasks);
  document.getElementById('av-kpi-cerradas').textContent = fmtN(cerradas);
  document.getElementById('av-kpi-open').textContent     = fmtN(abiertas);

  document.getElementById('av-kpi-dev').style.color =
    pctDev >= 90 ? '#1D9E75' : pctDev >= 80 ? 'var(--blue-el)' : '#BA7517';
}

function renderAvanceTabla(rows) {
  const sorted = [...rows].filter(r => r.nombre !== 'SIN PARENT').sort((a,b) => b.pct - a.pct);
  if (!sorted.length) {
    document.getElementById('avance-ini-content').innerHTML =
      '<div class="no-data">Sin datos de avance<div class="no-data-action">Ve a <strong>Admin → Cargar Excel</strong> y sube el archivo para ver el avance de iniciativas.</div></div>';
    document.getElementById('delivery-content').innerHTML =
      '<div class="no-data">Sin datos de fechas<div class="no-data-action">Carga el Excel para ver el Delivery Plan.</div></div>';
    return;
  }
  const hdr = `<div class="avance-hdr-row av-g">
    <span class="av-col-h">Iniciativa</span>
    <span class="av-col-h">Progreso</span>
    <span class="av-col-h num">%</span>
    <span class="av-col-h num">Tasks</span>
    <span class="av-col-h num">Estado</span>
  </div>`;

  const rowsHtml = sorted.map(r => {
    const fillColor = r.pct >= 100 ? '#3B5EA6' : r.pct >= 85 ? '#2D7A4F' : r.pct >= 70 ? '#8C6A1A' : '#8C2A2A';
    const tag = r.pct >= 100
      ? '<span class="av-tag av-done">Completa</span>'
      : r.pct >= 85 ? '<span class="av-tag av-prog">En curso</span>'
      : r.pct >= 70 ? '<span class="av-tag av-risk">Atención</span>'
      : '<span class="av-tag av-late">Rezago</span>';
    return `<div class="avance-row av-g">
      <div><div class="av-ini-name" title="${r.nombre}">${r.nombre}</div><div class="av-ini-cat">${r.categoria}</div></div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${r.pct}%;background:${fillColor}"></div></div>
      <div class="av-pct" style="color:${fillColor}">${r.pct}%</div>
      <div class="av-tasks">${fmtN(r.cerradas)} / ${fmtN(r.total)}</div>
      <div>${tag}</div>
    </div>`;
  }).join('');

  document.getElementById('avance-ini-content').innerHTML = `<div style="padding-top:4px">${hdr}${rowsHtml}</div>`;
}

function renderDeliveryPlan(rows, filtroDesde, filtroHasta) {
  const sorted = [...rows]
    .filter(r => r.nombre !== 'SIN PARENT' && r.fecha_ini && r.fecha_fin)
    .sort((a,b) => new Date(a.fecha_ini) - new Date(b.fecha_ini));

  if (!sorted.length) {
    document.getElementById('delivery-content').innerHTML = '<div class="no-data">Sin datos de fechas disponibles</div>';
    return;
  }

  // ── Rango visual dinámico ──────────────────────────────────────────────────
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  let rangeStart, rangeEnd;
  if (filtroDesde && filtroHasta) {
    rangeStart = new Date(filtroDesde);
    rangeEnd   = new Date(filtroHasta);
  } else {
    // Ajustar al inicio de la semana del min y fin de la semana del max
    const allIni = sorted.map(r => new Date(r.fecha_ini));
    const allFin = sorted.map(r => new Date(r.fecha_fin));
    rangeStart = new Date(Math.min(...allIni));
    rangeEnd   = new Date(Math.max(...allFin));
  }
  // Anclar rangeStart al lunes de su semana y rangeEnd al domingo de su semana
  const dow = rangeStart.getDay(); // 0=dom,1=lun...
  rangeStart.setDate(rangeStart.getDate() - (dow === 0 ? 6 : dow - 1));
  rangeStart.setHours(0,0,0,0);
  const dowE = rangeEnd.getDay();
  rangeEnd.setDate(rangeEnd.getDate() + (dowE === 0 ? 0 : 7 - dowE));
  rangeEnd.setHours(0,0,0,0);

  const rangeDays = (rangeEnd - rangeStart) / 86400000;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayPct = Math.min(100, Math.max(0, (today - rangeStart) / 86400000 / rangeDays * 100));

  // ── Generar lista de días ──────────────────────────────────────────────────
  const allDays = [];
  { let cur = new Date(rangeStart);
    while (cur < rangeEnd) { allDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  }

  // ── Generar bloques de mes agrupando días ──────────────────────────────────
  const monthMap = new Map();
  for (const d of allDays) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { label: `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, days: [] });
    }
    monthMap.get(key).days.push(d);
  }
  const months = [...monthMap.values()];

  // ── Cabecera dos niveles: mes arriba, días abajo ───────────────────────────
  const monthsHdr = months.map(m => {
    const monthWidthPct = m.days.length / rangeDays * 100;
    const daysInner = m.days.map(d => {
      const isMonday = d.getDay() === 1;
      const borderStyle = isMonday ? 'border-left:1px solid var(--border2)' : '';
      return `<div class="gantt-day-lbl" style="${borderStyle}">${d.getDate()}</div>`;
    }).join('');
    return `<div class="gantt-hdr-month-block" style="width:${monthWidthPct.toFixed(2)}%">
      <div class="gantt-month-lbl">${m.label}</div>
      <div class="gantt-hdr-weeks">${daysInner}</div>
    </div>`;
  }).join('');

  // ── Líneas verticales: lunes=semana, día 1=mes ─────────────────────────────
  const vlines = allDays.map((d, i) => {
    if (i === 0) return '';
    const leftPct = (d - rangeStart) / 86400000 / rangeDays * 100;
    if (d.getDate() === 1) return `<div class="gantt-vline-month" style="left:${leftPct.toFixed(2)}%"></div>`;
    if (d.getDay() === 1)  return `<div class="gantt-vline-week"  style="left:${leftPct.toFixed(2)}%"></div>`;
    return '';
  }).join('');

  // ── Función de clasificación con umbrales gerenciales ─────────────────────
  function clasificar(r) {
    const fin      = new Date(r.fecha_fin); fin.setHours(0,0,0,0);
    const diasRest = Math.round((fin - today) / 86400000);
    const pct      = r.pct || 0;
    if (pct >= 100) return { estado: 'Completada',              color: '#3B5EA6' };
    if (diasRest < 0) return { estado: `Atrasada ${Math.abs(diasRest)}d`, color: '#8C2A2A' };
    if (diasRest <= 14 && pct < 85) return { estado: `Riesgo · ${diasRest}d`, color: '#8C6A1A' };
    return { estado: `En tiempo · ${diasRest}d`, color: '#2D7A4F' };
  }

  // ── Filas de barras ────────────────────────────────────────────────────────
  const barsHtml = sorted.map(r => {
    const ini = new Date(r.fecha_ini);
    const fin = new Date(r.fecha_fin);
    // Recortar al rango visible
    const visStart = new Date(Math.max(ini.getTime(), rangeStart.getTime()));
    const visEnd   = new Date(Math.min(fin.getTime(), rangeEnd.getTime()));
    if (visStart > visEnd) return '';
    const left  = (visStart - rangeStart) / 86400000 / rangeDays * 100;
    const width = Math.max(0.5, (visEnd - visStart + 86400000) / 86400000 / rangeDays * 100);
    const dIni  = `${ini.getDate()} ${MES[ini.getMonth()]}`;
    const dFin  = `${fin.getDate()} ${MES[fin.getMonth()]}`;
    const cls   = clasificar(r);

    return `<div class="gantt-row">
      <div class="gantt-name">
        <div class="gantt-name-text" title="${r.nombre}">${r.nombre}</div>
        <div class="gantt-name-sub" style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="color:var(--muted)">${r.categoria}</span>
          <span class="av-tag" style="background:${cls.color}1A;color:${cls.color};border:1px solid ${cls.color}55;font-size:9px;padding:1px 6px;border-radius:4px;font-weight:600;letter-spacing:.03em">${cls.estado}</span>
        </div>
      </div>
      <div class="gantt-track">
        ${vlines}
        <div class="gantt-today" style="left:${todayPct.toFixed(1)}%"><span class="gantt-today-lbl">hoy</span></div>
        <div class="gantt-bar" style="left:${left.toFixed(1)}%;width:${Math.max(width,1).toFixed(1)}%;background:${cls.color};opacity:0.88">
          <span class="gantt-bar-lbl">${dIni} — ${dFin} · ${r.pct}%</span>
        </div>
      </div>
    </div>`;
  }).filter(Boolean).join('');

  document.getElementById('delivery-content').innerHTML = `
    <div class="gantt-outer"><div class="gantt-inner">
      <div class="gantt-hdr-row">
        <div class="gantt-label"></div>
        <div class="gantt-months gantt-hdr-months">${monthsHdr}</div>
      </div>
      ${barsHtml}
    </div></div>
    <div class="qa-stack-legend" style="margin-top:14px;gap:16px">
      <div class="qa-leg-item"><div class="qa-leg-dot" style="background:#3B5EA6"></div><span style="color:#3B5EA6;font-weight:600">Completada</span> 100% tasks cerradas</div>
      <div class="qa-leg-item"><div class="qa-leg-dot" style="background:#2D7A4F"></div><span style="color:#2D7A4F;font-weight:600">En tiempo</span> fin &gt; 14 días o avance ≥ 85%</div>
      <div class="qa-leg-item"><div class="qa-leg-dot" style="background:#8C6A1A"></div><span style="color:#8C6A1A;font-weight:600">En riesgo</span> ≤ 14 días y avance &lt; 85%</div>
      <div class="qa-leg-item"><div class="qa-leg-dot" style="background:#8C2A2A"></div><span style="color:#8C2A2A;font-weight:600">Atrasada</span> fecha fin pasada y &lt; 95%</div>
    </div>`;
}


// ─── EMPRESAS ────────────────────────────────────────────────────────────────
async function loadEmpresas() {
  const q = getFilters();
  const [emp, heatmap] = await Promise.all([api('/api/datos/por-empresa'+q), api('/api/datos/empresa-rol'+q)]);
  _cacheEmpresas = { emp, heatmap };
  const verCostos = ['admin','gerente'].includes(USER.perfil);

  // Chart barras
  if (chartEmpBar) chartEmpBar.destroy();
  chartEmpBar = new Chart(document.getElementById('chart-emp-bar'), {
    type:'bar', data:{labels:emp.map(r=>r.empresa), datasets:[{
      label:'Horas', data:emp.map(r=>r.horas),
      backgroundColor:['rgba(10,22,40,.8)','rgba(107,114,128,.7)','rgba(180,178,169,.7)','rgba(211,209,199,.7)'],
      borderRadius:2
    }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>' '+fmtH(c.raw)+' h'}}},
      scales:{y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:10}}}}}
  });

  // Heatmap
  const roles = [...new Set(heatmap.map(r=>r.rol))];
  const empresas = [...new Set(heatmap.map(r=>r.empresa))];
  const maxH = Math.max(...heatmap.map(r=>r.horas));
  const getH = (emp,rol) => heatmap.find(r=>r.empresa===emp&&r.rol===rol)?.horas || 0;
  const hmClass = h => { if(!h) return 'hm-0'; const p=h/maxH; return p>.8?'hm-5':p>.6?'hm-4':p>.4?'hm-3':p>.2?'hm-2':'hm-1'; };
  document.getElementById('heatmap-content').innerHTML = `
    <table><thead><tr><th></th>${roles.map(r=>`<th title="${r}">${r.replace('Desarrollador ','Dev ')}</th>`).join('')}</tr></thead>
    <tbody>${empresas.map(e=>`<tr><th style="text-align:left;font-size:9px;padding:5px 8px;white-space:nowrap">${e}</th>
      ${roles.map(r=>`<td class="${hmClass(getH(e,r))}">${fmtH(getH(e,r))}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;

  // Tabla detalle
  document.getElementById('emp-table-wrap').innerHTML = `
    <table class="tbl"><thead><tr><th>Empresa</th><th class="num">Horas</th>
      ${verCostos?'<th class="num">Costo</th>':''}
      <th class="num">% del total</th></tr></thead>
    <tbody>${emp.map(r=>`<tr>
      <td><span class="badge ${BADGE_EMPRESA[r.empresa]||'badge-default'}">${r.empresa}</span></td>
      <td class="num">${fmtH(r.horas)}</td>
      ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
      <td class="num">${Math.round(r.horas/emp.reduce((s,x)=>s+x.horas,0)*1000)/10}%</td>
    </tr>`).join('')}</tbody></table>`;
}

// ─── PERSONAS ────────────────────────────────────────────────────────────────
async function loadPersonas() {
  const q = getFilters();
  allPersonas = await api('/api/datos/por-persona'+q);
  _cachePersonas = allPersonas;
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  document.getElementById('personas-sub').textContent = `${allPersonas.length} colaboradores`;
  if (!verCostos) document.getElementById('th-costo-per').style.display = 'none';
  renderPersonasTable(allPersonas);
}

function renderPersonasTable(rows) {
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const countEl = document.getElementById('personas-count');
  if (countEl) countEl.textContent = rows.length + ' personas';

  // UX-13: Aplicar ordenamiento
  const thMap = { nombre_persona:'th-per-nombre', empresa:'th-per-empresa', rol:'th-per-rol',
                  horas:'th-per-horas', costo:'th-costo-per' };
  _applySortArrows('per', _sortPersonas, Object.keys(thMap), thMap);
  const sorted = _sortRows(rows, _sortPersonas);

  document.getElementById('personas-tbody').innerHTML = sorted.length ?
    sorted.map(r=>`<tr>
      <td>${r.nombre_persona}</td>
      <td><span class="badge ${BADGE_EMPRESA[r.empresa]||'badge-default'}">${r.empresa}</span></td>
      <td class="muted" style="font-size:11px">${r.rol}</td>
      <td class="num">
        <button class="drill-btn" style="font-variant-numeric:tabular-nums"
          onclick="verTasksPersona('${esc(r.nombre_persona)}','${esc(r.nombre_persona)}')"
          title="Ver tasks detalladas">
          ${fmtH(r.horas)} h
        </button>
      </td>
      ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
    </tr>`).join('') :
    `<tr><td colspan="5"><div class="no-data">Sin datos</div></td></tr>`;
}

function filterPersonas() {
  clearTimeout(_timerPersonas);
  _timerPersonas = setTimeout(() => {
    const q = document.getElementById('persona-search').value.toLowerCase();
    renderPersonasTable(allPersonas.filter(r =>
      r.nombre_persona.toLowerCase().includes(q) ||
      r.empresa.toLowerCase().includes(q) ||
      r.rol.toLowerCase().includes(q)
    ));
  }, 250);
}

async function exportPersonasExcel() {
  const btn = document.getElementById('btn-export-personas');
  btn.disabled = true; btn.textContent = 'Generando…';

  try {
    const verCostos = ['admin','gerente'].includes(USER.perfil);
    const q = getFilters();
    const rows = await api('/api/datos/personas/export' + (q ? q : ''));

    // Aplicar búsqueda de texto si hay algo escrito
    const search = document.getElementById('persona-search').value.toLowerCase();
    const data = search
      ? rows.filter(r => r.nombre_persona.toLowerCase().includes(search) ||
                         (r.empresa||'').toLowerCase().includes(search) ||
                         (r.rol||'').toLowerCase().includes(search))
      : rows;

    if (!data.length) { alert('No hay datos para exportar con los filtros aplicados.'); return; }

    const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    // ── Hoja 1: Resumen por persona ──────────────────────────────────────────
    const resumenMap = {};
    data.forEach(r => {
      if (!resumenMap[r.nombre_persona]) {
        resumenMap[r.nombre_persona] = { nombre: r.nombre_persona, empresa: r.empresa, rol: r.rol, horas: 0, costo: 0 };
      }
      resumenMap[r.nombre_persona].horas += r.horas_completadas || 0;
      resumenMap[r.nombre_persona].costo += r.costo || 0;
    });
    const resumenHeaders = ['Nombre', 'Empresa', 'Rol', 'Horas'];
    if (verCostos) resumenHeaders.push('Costo ($)');
    const resumenRows = Object.values(resumenMap)
      .sort((a,b) => b.horas - a.horas)
      .map(r => {
        const row = [r.nombre, r.empresa, r.rol, Math.round(r.horas * 10) / 10];
        if (verCostos) row.push(Math.round(r.costo));
        return row;
      });
    const wsResumen = XLSX.utils.aoa_to_sheet([resumenHeaders, ...resumenRows]);
    wsResumen['!cols'] = [{wch:30},{wch:18},{wch:22},{wch:10},{wch:12}];

    // ── Hoja 2: Detalle de tasks ─────────────────────────────────────────────
    const taskHeaders = ['Persona','Empresa','Rol','Iniciativa','Epic','HU','Task','ID Task','Año','Mes','Horas'];
    if (verCostos) taskHeaders.push('Costo ($)');
    const taskRows = data.map(r => {
      const row = [
        r.nombre_persona, r.empresa, r.rol,
        r.nombre_iniciativa || '', r.nombre_epic || '', r.nombre_hu || '',
        r.nombre_task || '', r.id_task || '',
        r.anio, MESES[r.mes] || r.mes,
        r.horas_completadas
      ];
      if (verCostos) row.push(r.costo || 0);
      return row;
    });
    const wsTasks = XLSX.utils.aoa_to_sheet([taskHeaders, ...taskRows]);
    wsTasks['!cols'] = [{wch:30},{wch:18},{wch:22},{wch:30},{wch:30},{wch:30},{wch:40},{wch:12},{wch:6},{wch:12},{wch:8},{wch:12}];

    // ── Armar workbook y descargar ───────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks');

    // Nombre del archivo con filtros aplicados
    const params = new URLSearchParams(q.replace(/^\?/,''));
    const partes = [];
    if (params.get('anio'))    partes.push(params.get('anio'));
    if (params.get('mes'))     partes.push(MESES[parseInt(params.get('mes'))]);
    if (params.get('empresa')) partes.push(params.get('empresa'));
    if (search)                partes.push(search);
    const sufijo = partes.length ? '_' + partes.join('_') : '';
    XLSX.writeFile(wb, `horas_personas${sufijo}.xlsx`);

  } finally {
    btn.disabled = false; btn.textContent = '↓ Exportar Excel';
  }
}

// ─── CATEGORÍAS ──────────────────────────────────────────────────────────────
async function loadCategorias() {
  const q = getFilters();
  const rows = await api('/api/datos/por-categoria'+q);
  _cacheCategorias = rows;
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const total = rows.reduce((s,r)=>s+r.horas,0);
  const cols = ['#0A1628','#6B7280','#B4B2A9','#D3D1C7','#1a3060'];

  if (chartCat) chartCat.destroy();
  chartCat = new Chart(document.getElementById('chart-cat'), {
    type:'doughnut', data:{labels:rows.map(r=>r.categoria_negocio), datasets:[{data:rows.map(r=>r.horas), backgroundColor:cols.slice(0,rows.length), borderWidth:0}]},
    // UX-20: onHover/onLeave cambia el cursor para indicar que la leyenda es clickeable
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{
        legend:{
          position:'right',
          labels:{font:{size:10},boxWidth:12},
          onHover: (e, item, legend) => { legend.chart.canvas.style.cursor = 'pointer'; },
          onLeave: (e, item, legend) => { legend.chart.canvas.style.cursor = 'default'; }
        },
        tooltip:{callbacks:{label:c=>`${c.label}: ${fmtH(c.raw)} h`}}
      }}
  });

  document.getElementById('cat-detail').innerHTML = rows.map(r=>`
    <div class="pbar-row">
      <div class="pbar-label">${r.categoria_negocio}</div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${Math.round(r.horas/total*100)}%"></div></div>
      <div style="font-size:10px;color:var(--muted);width:60px;text-align:right;flex-shrink:0">${fmtH(r.horas)} h</div>
    </div>
    ${verCostos?`<div style="font-size:10px;color:var(--muted);text-align:right;margin-bottom:8px">$${fmtN(r.costo)}</div>`:''}
  `).join('');
}

// ─── USUARIOS ────────────────────────────────────────────────────────────────
async function loadUsuarios() {
  const users = await api('/api/admin/usuarios');
  const PERFILES = {admin:'Administrador',gerente:'Gte. con costos',gestor:'Gestor'};
  document.getElementById('users-tbody').innerHTML = users.map(u=>`
    <tr>
      <td>${u.nombre}</td>
      <td class="muted" style="font-size:11px">${u.email}</td>
      <td><span class="perfil-badge perfil-${u.perfil}">${PERFILES[u.perfil]||u.perfil}</span></td>
      <td><span class="dot ${u.activo?'dot-ok':'dot-err'}"></span> ${u.activo?'Activo':'Inactivo'}</td>
      <td class="muted" style="font-size:11px">${u.ultimo_acceso?new Date(u.ultimo_acceso).toLocaleString('es-EC'):'Nunca'}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn-sm" onclick="toggleUser(${u.id},${u.activo})">${u.activo?'Desactivar':'Activar'}</button>
        ${u.email!=='admin@dinersclub.com.ec'?`<button class="btn-sm del" onclick="deleteUser(${u.id},'${u.nombre}')">Eliminar</button>`:''}
      </td>
    </tr>`).join('');
}

function openModalNuevoUsuario() {
  ['u-nombre','u-email','u-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-perfil').value = 'gestor';
  document.getElementById('u-err').classList.remove('show');
  document.getElementById('modal-usuario').classList.add('show');
}

async function createUser() {
  const nombre = document.getElementById('u-nombre').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const password = document.getElementById('u-pass').value;
  const perfil = document.getElementById('u-perfil').value;
  const err = document.getElementById('u-err');
  err.classList.remove('show');
  if (!nombre||!email||!password) { err.textContent='Todos los campos son requeridos'; err.classList.add('show'); return; }
  if (password.length < 8) { err.textContent='La contraseña debe tener al menos 8 caracteres'; err.classList.add('show'); return; }
  try {
    await api('/api/admin/usuarios','POST',{nombre,email,password,perfil});
    closeModal('modal-usuario');
    toast(`Usuario ${nombre} creado`, 'ok');
    loadUsuarios();
  } catch(e) { err.textContent=e.message||'Error al crear el usuario'; err.classList.add('show'); }
}

async function toggleUser(id, activo) {
  await api(`/api/admin/usuarios/${id}`,'PATCH',{activo:!activo});
  toast(activo?'Usuario desactivado':'Usuario activado','ok');
  loadUsuarios();
}

async function deleteUser(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
  await api(`/api/admin/usuarios/${id}`,'DELETE');
  toast('Usuario eliminado','ok');
  loadUsuarios();
}

// ─── LOGS ────────────────────────────────────────────────────────────────────
async function loadLogs() {
  const logs = await api('/api/admin/logs');
  const EVT = {LOGIN_OK:'✅ Ingreso exitoso',LOGIN_FALLIDO:'❌ Contraseña incorrecta',OTP_ENVIADO:'📧 OTP enviado',OTP_FALLIDO:'⚠️ OTP incorrecto'};
  document.getElementById('logs-tbody').innerHTML = logs.map(l=>`
    <tr>
      <td class="muted" style="font-size:11px;white-space:nowrap">${new Date(l.fecha).toLocaleString('es-EC')}</td>
      <td style="font-size:12px">${l.email||'—'}</td>
      <td style="font-size:12px">${EVT[l.evento]||l.evento}</td>
      <td class="muted" style="font-size:11px">${l.ip||'—'}</td>
    </tr>`).join('');
}

// ─── CSV UPLOAD ──────────────────────────────────────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv')) uploadCSV(file);
  else toast('Solo se aceptan archivos .csv exportados desde Azure DevOps','err');
}

async function uploadCSV(file) {
  const status = document.getElementById('upload-status');
  status.style.display = '';
  status.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:12px">⏳ Procesando CSV… esto puede tomar unos segundos</div>';
  const fd = new FormData();
  fd.append('archivo', file);
  try {
    const r = await fetch('/api/admin/cargar-csv', {
      method:'POST', headers:{'Authorization':'Bearer '+TOKEN}, body:fd
    });
    if (r.status === 401) { sessionExpired(); return; }
    // Capturar cuerpo como texto primero para evitar error si no es JSON
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Respuesta inesperada del servidor (${r.status}): ${text.slice(0,200)}`); }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);

    let html = `<div style="font-size:13px;padding:12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;color:var(--success)">
      ✅ <strong>CSV procesado correctamente</strong><br>
      <span style="font-size:12px;color:var(--text2)">
        ${fmtN(data.tasks_con_horas)} tasks con horas cargadas ·
        ${fmtN(data.iniciativas)} iniciativas ·
        ${fmtN(data.tasks_total)} tasks totales procesadas
      </span>
    </div>`;

    if (data.sin_lookup && data.sin_lookup.length > 0) {
      html += `<div style="margin-top:10px;padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-size:12px;color:#92400E">
        ⚠️ <strong>${data.sin_lookup.length} correo(s) sin registro en la tabla de Equipo</strong> — sus horas no se incluyen en el dashboard.<br>
        <div style="margin-top:6px;color:var(--muted)">${data.sin_lookup.map(c=>`<code>${c}</code>`).join(', ')}</div>
        <div style="margin-top:6px">Ve a <strong>Equipo</strong> para agregar estos colaboradores y luego vuelve a cargar el CSV.</div>
      </div>`;
    }

    status.innerHTML = html;
    // UX-07: Toast con conteo de resultados
    const sinLookupN = data.sin_lookup?.length || 0;
    toast(`✓ ${fmtN(data.tasks_con_horas)} tasks · ${data.iniciativas || 0} iniciativas${sinLookupN ? ` · ⚠ ${sinLookupN} sin lookup` : ''}`, sinLookupN ? 'warn' : 'ok');
    await loadFiltros();
  } catch(e) {
    status.innerHTML = `<div style="font-size:13px;color:var(--error);padding:12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px">
      ❌ <strong>Error al procesar el CSV</strong><br>
      <span style="font-size:12px;margin-top:4px;display:block">${e.message}</span>
    </div>`;
    toast('Error al procesar el CSV', 'err');
  }
}


// ─── EQUIPO ───────────────────────────────────────────────────────────────────
const EMPRESAS_CONOCIDAS = ['Sofka','Opinno','Byteq','Digital','Diners','CentroHub'];

let allEquipoRows = [];

async function loadEquipo() {
  allEquipoRows = await api('/api/admin/equipo');
  renderEquipoTabla(allEquipoRows);
}

function filterEquipo() {
  clearTimeout(_timerEquipo);
  _timerEquipo = setTimeout(() => {
    const q = document.getElementById('equipo-search').value.toLowerCase();
    const filtered = allEquipoRows.filter(r =>
      r.nombre.toLowerCase().includes(q) ||
      r.correo.toLowerCase().includes(q) ||
      r.empresa.toLowerCase().includes(q) ||
      r.rol.toLowerCase().includes(q)
    );
    renderEquipoTabla(filtered, true);
  }, 250);
}

function renderEquipoTabla(rows, preserveSearch = false) {
  const activos       = rows.filter(r => r.estado === 'activo');
  const otroProyecto  = rows.filter(r => r.estado === 'otro_proyecto');
  const desvinculados = rows.filter(r => r.estado === 'desvinculado');

  // Actualizar contador
  const countEl = document.getElementById('equipo-count');
  if (countEl) countEl.textContent = rows.length + ' colaboradores';

  function renderFila(r) {
    let badge, btnEstado;

    if (r.estado === 'activo') {
      badge     = '<span class="dot dot-ok"></span> Activo';
      btnEstado = `<button class="btn-sm" style="color:#854F0B;border-color:#BA7517" onclick="cambiarEstadoEquipo(${r.id},'otro_proyecto')">Otro proyecto</button>
                   <button class="btn-sm del" onclick="cambiarEstadoEquipo(${r.id},'desvinculado')">Desvincular</button>`;
    } else if (r.estado === 'otro_proyecto') {
      badge     = '<span class="dot" style="background:#BA7517"></span> Otro proyecto';
      btnEstado = `<button class="btn-sm" onclick="cambiarEstadoEquipo(${r.id},'activo')">Reactivar</button>
                   <button class="btn-sm del" onclick="cambiarEstadoEquipo(${r.id},'desvinculado')">Desvincular</button>`;
    } else {
      badge     = '<span class="dot dot-err"></span> Desvinculado';
      btnEstado = `<button class="btn-sm" onclick="cambiarEstadoEquipo(${r.id},'activo')">Reactivar</button>`;
    }

    return `<tr>
      <td>${r.nombre}</td>
      <td class="muted" style="font-size:11px">${r.correo}</td>
      <td><span class="badge badge-default">${r.empresa}</span></td>
      <td class="muted" style="font-size:11px">${r.rol}</td>
      <td style="font-size:11px">${badge}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn-sm" onclick="editarEquipo(${r.id},'${esc(r.nombre)}','${esc(r.correo)}','${esc(r.empresa)}','${esc(r.rol)}')">Editar</button>
        ${btnEstado}
      </td>
    </tr>`;
  }

  let html = '';
  if (activos.length) {
    html += `<tr><td colspan="6" style="background:var(--surface2);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:8px 12px">Activos (${activos.length})</td></tr>`;
    html += activos.map(renderFila).join('');
  }
  if (otroProyecto.length) {
    html += `<tr><td colspan="6" style="background:#FAEEDA;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#854F0B;padding:8px 12px">En otro proyecto (${otroProyecto.length})</td></tr>`;
    html += otroProyecto.map(renderFila).join('');
  }
  if (desvinculados.length) {
    html += `<tr><td colspan="6" style="background:#FFF7ED;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#92400E;padding:8px 12px">Desvinculados (${desvinculados.length})</td></tr>`;
    html += desvinculados.map(renderFila).join('');
  }
  if (!html) html = `<tr><td colspan="6"><div class="no-data">Sin colaboradores<div class="no-data-action">Agrega los miembros del equipo para poder procesar los CSVs de ADO</div></div></td></tr>`;

  document.getElementById('equipo-tbody').innerHTML = html;
}

function openModalEquipo() {
  document.getElementById('eq-id').value = '';
  ['eq-nombre','eq-correo','eq-empresa','eq-rol'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('eq-err').textContent = '';
  document.getElementById('modal-equipo-title').textContent = 'Agregar colaborador';
  document.getElementById('modal-equipo').classList.add('show');
}

function editarEquipo(id, nombre, correo, empresa, rol) {
  document.getElementById('eq-id').value = id;
  document.getElementById('eq-nombre').value  = nombre;
  document.getElementById('eq-correo').value  = correo;
  document.getElementById('eq-empresa').value = empresa;
  document.getElementById('eq-rol').value     = rol;
  document.getElementById('eq-err').textContent = '';
  document.getElementById('modal-equipo-title').textContent = 'Editar colaborador';
  document.getElementById('modal-equipo').classList.add('show');
}

async function saveEquipo() {
  const id      = document.getElementById('eq-id').value;
  const nombre  = document.getElementById('eq-nombre').value.trim();
  const correo  = document.getElementById('eq-correo').value.trim();
  const empresa = document.getElementById('eq-empresa').value.trim();
  const rol     = document.getElementById('eq-rol').value.trim();
  const errEl   = document.getElementById('eq-err');
  if (!nombre || !correo || !empresa || !rol) {
    errEl.textContent = 'Todos los campos son requeridos'; errEl.classList.add('show'); return;
  }
  try {
    if (id) {
      await api('/api/admin/equipo/'+id, 'PATCH', { nombre, correo, empresa, rol });
    } else {
      await api('/api/admin/equipo', 'POST', { nombre, correo, empresa, rol });
    }
    document.getElementById('modal-equipo').classList.remove('show');
    toast('Colaborador guardado', 'ok');
    loadEquipo();
  } catch(e) {
    errEl.textContent = e.message; errEl.classList.add('show');
  }
}

function openModalCargaEquipo() {
  document.getElementById('equipo-import-status').innerHTML = '';
  document.getElementById('equipo-file-input').value = '';
  document.getElementById('modal-carga-equipo').classList.add('show');
}

function descargarTemplateEquipo() {
  // Generar CSV template directamente en el navegador
  const header = 'nombre,correo,empresa,rol';
  const ejemplo = [
    'Acosta Alexis,alexis.acosta@centrohub.co,Opinno,Líder Técnico',
    'García Juan,juan.garcia@sofka.com.co,Sofka,Desarrollador React',
    'Pérez María,maria.perez@byteq.com,Byteq,QA',
  ].join('\n');
  const contenido = header + '\n' + ejemplo;
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'template_equipo.csv';
  a.click(); URL.revokeObjectURL(url);
}

async function importarEquipoExcel(file) {
  if (!file) return;
  const status = document.getElementById('equipo-import-status');
  status.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px">⏳ Procesando…</div>';
  const fd = new FormData();
  fd.append('archivo', file);
  try {
    const r = await fetch('/api/admin/equipo/importar', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN }, body: fd
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);

    let html = `<div style="font-size:12px;padding:10px 12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;color:var(--success)">
      ✅ <strong>${data.agregados} colaboradores agregados · ${data.actualizados} actualizados</strong>
    </div>`;
    if (data.errores && data.errores.length) {
      html += `<div style="margin-top:8px;font-size:11px;padding:8px 12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;color:#92400E">
        ⚠️ ${data.errores.length} fila(s) con error:<br>
        <span style="color:var(--muted)">${data.errores.join('<br>')}</span>
      </div>`;
    }
    status.innerHTML = html;
    toast(`${data.agregados} nuevos · ${data.actualizados} actualizados`, 'ok');
    loadEquipo();
  } catch(e) {
    status.innerHTML = `<div style="font-size:12px;padding:10px 12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:var(--error)">❌ ${e.message}</div>`;
    toast('Error al importar', 'err');
  }
}

async function cambiarEstadoEquipo(id, estado) {
  const mensajes = {
    desvinculado:  '¿Marcar como desvinculado? Sus horas históricas se conservan.',
    otro_proyecto: '¿Marcar como "En otro proyecto"? Sus horas históricas se conservan.',
    activo:        '¿Reactivar este colaborador en el proyecto?'
  };
  const toasts = {
    desvinculado:  'Colaborador desvinculado',
    otro_proyecto: 'Colaborador marcado como "En otro proyecto"',
    activo:        'Colaborador reactivado'
  };
  if (!confirm(mensajes[estado])) return;
  await api('/api/admin/equipo/'+id, 'PATCH', { estado });
  toast(toasts[estado], 'ok');
  loadEquipo();
}

// ─── TARIFAS ──────────────────────────────────────────────────────────────────
async function loadTarifas() {
  const rows = await api('/api/admin/tarifas');
  document.getElementById('tarifas-tbody').innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${r.empresa}</td>
        <td class="muted" style="font-size:11px">${r.rol}</td>
        <td class="num" style="font-weight:600">$${fmtN(r.tarifa)}/h</td>
        <td style="display:flex;gap:5px">
          <button class="btn-sm" onclick="editarTarifa(${r.id},'${esc(r.empresa)}','${esc(r.rol)}',${r.tarifa})">Editar</button>
          <button class="btn-sm del" onclick="deleteTarifa(${r.id})">Eliminar</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="no-data">Sin tarifas<div class="no-data-action">Agrega las tarifas por empresa y rol para que el portal calcule los costos</div></div></td></tr>`;
}

function openModalTarifa() {
  document.getElementById('tar-id').value = '';
  ['tar-empresa','tar-rol','tar-valor'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tar-err').textContent = '';
  document.getElementById('modal-tarifa-title').textContent = 'Agregar tarifa';
  document.getElementById('modal-tarifa').classList.add('show');
}

function editarTarifa(id, empresa, rol, tarifa) {
  document.getElementById('tar-id').value      = id;
  document.getElementById('tar-empresa').value = empresa;
  document.getElementById('tar-rol').value     = rol;
  document.getElementById('tar-valor').value   = tarifa;
  document.getElementById('tar-err').textContent = '';
  document.getElementById('modal-tarifa-title').textContent = 'Editar tarifa';
  document.getElementById('modal-tarifa').classList.add('show');
}

async function saveTarifa() {
  const id      = document.getElementById('tar-id').value;
  const empresa = document.getElementById('tar-empresa').value.trim();
  const rol     = document.getElementById('tar-rol').value.trim();
  const tarifa  = parseFloat(document.getElementById('tar-valor').value);
  const errEl   = document.getElementById('tar-err');
  if (!empresa || !rol || isNaN(tarifa)) {
    errEl.textContent = 'Todos los campos son requeridos'; errEl.classList.add('show'); return;
  }
  try {
    if (id) {
      await api('/api/admin/tarifas/'+id, 'PATCH', { empresa, rol, tarifa });
    } else {
      await api('/api/admin/tarifas', 'POST', { empresa, rol, tarifa });
    }
    document.getElementById('modal-tarifa').classList.remove('show');
    toast('Tarifa guardada', 'ok');
    loadTarifas();
  } catch(e) {
    errEl.textContent = e.message; errEl.classList.add('show');
  }
}

async function deleteTarifa(id) {
  if (!confirm('¿Eliminar esta tarifa?')) return;
  await api('/api/admin/tarifas/'+id, 'DELETE');
  toast('Tarifa eliminada', 'ok');
  loadTarifas();
}


// ─── TASKS POR PERSONA (drill-down) ──────────────────────────────────────────
async function verTasksPersona(nombre_key, nombre) {
  const modal = document.getElementById('modal-persona-tasks');
  const titulo = document.getElementById('modal-persona-titulo');
  const tbody  = document.getElementById('modal-persona-tbody');
  const total  = document.getElementById('modal-persona-total');

  titulo.textContent = nombre;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px"><div class="loader">Cargando…</div></td></tr>';
  total.textContent = '';
  modal.classList.add('show');

  try {
    const q = getFilters();
    const rows = await api('/api/datos/persona/' + encodeURIComponent(nombre_key) + '/tasks' + q);
    const verCostos = ['admin','gerente'].includes(USER.perfil);
    const totalH = rows.reduce((s,r) => s + (r.horas_completadas||0), 0);

    tbody.innerHTML = rows.length ? rows.map(r => `<tr>
      <td><span class="id-badge">${r.id_task}</span></td>
      <td style="font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.nombre_task}">${r.nombre_task}</td>
      <td style="font-size:10px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.nombre_iniciativa}">${r.nombre_iniciativa||'—'}</td>
      <td class="num" style="font-size:11px">${fmtH(r.horas_completadas)} h</td>
      ${verCostos ? `<td class="num" style="font-size:11px">$${fmtN(r.costo)}</td>` : ''}
      <td class="muted" style="font-size:10px;white-space:nowrap">${MESES[r.mes]||r.mes||'—'} ${r.anio||''}</td>
    </tr>`).join('') :
    '<tr><td colspan="6"><div class="no-data">Sin tasks en el período seleccionado</div></td></tr>';

    total.textContent = `${rows.length} tasks · ${fmtH(totalH)} h totales`;
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="no-data">Error: ${e.message}</div></td></tr>`;
  }
}


// ─── HISTORIAL CSV ────────────────────────────────────────────────────────────
async function loadHistorialCSV() {
  const rows = await api('/api/admin/historial-csv');
  document.getElementById('historial-tbody').innerHTML = rows.length
    ? rows.map((r, i) => {
        const esCurrent = i === 0;
        const tieneError = r.estado === 'error';
        const tieneLog   = !!r.log_error;

        const estadoBadge = tieneError
          ? '<span class="av-tag av-late" style="font-size:9px;margin-right:4px">Error</span>'
          : esCurrent ? '<span class="av-tag av-prog" style="font-size:9px;margin-right:4px">Actual</span>' : '';

        // Columna Sin Lookup: número clickeable si hay log
        const sinLookupCell = r.sin_lookup > 0
          ? `<button onclick="verLogHistorial(${r.id})" style="background:none;border:none;cursor:pointer;font-size:11px;font-weight:600;color:#BA7517;display:flex;align-items:center;gap:4px;padding:0">
               ${fmtN(r.sin_lookup)}
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BA7517" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
               <span style="font-size:10px;text-decoration:underline">Ver log</span>
             </button>`
          : `<span style="font-size:11px;color:var(--muted)">—</span>`;

        return `<tr>
          <td style="font-size:12px;font-weight:500">${estadoBadge}${r.nombre_archivo}</td>
          <td class="muted" style="font-size:11px;white-space:nowrap">${new Date(r.fecha_carga).toLocaleString('es-EC')}</td>
          <td class="muted" style="font-size:11px">${r.usuario}</td>
          <td class="num">${fmtN(r.tasks_cargadas)}</td>
          <td class="num">${fmtN(r.iniciativas)}</td>
          <td>${sinLookupCell}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${tieneLog || tieneError ? `<button class="btn-sm" onclick="verLogHistorial(${r.id})" style="color:#185FA5">📋 Ver log</button>` : ''}
            ${!esCurrent ? `<button class="btn-pri" style="font-size:11px;padding:4px 10px" onclick="restaurarCSV(${r.id},'${esc(r.nombre_archivo)}','${esc(r.fecha_carga)}')">↩ Restaurar</button>` : ''}
            <button class="btn-sm del" onclick="eliminarHistorial(${r.id})">Eliminar</button>
          </td>
        </tr>`;
      }).join('') :
    `<tr><td colspan="7"><div class="no-data">Sin cargas registradas<div class="no-data-action">Las próximas cargas de CSV aparecerán aquí</div></div></td></tr>`;
}

// Ver el log completo de una carga
async function verLogHistorial(id) {
  const rows = await api('/api/admin/historial-csv');
  const r = rows.find(x => x.id === id);
  if (!r) return;

  const modal   = document.getElementById('modal-log-historial');
  const titulo  = document.getElementById('modal-log-titulo');
  const cuerpo  = document.getElementById('modal-log-cuerpo');

  titulo.textContent = r.nombre_archivo;

  let html = `<div style="font-size:11px;color:var(--muted);margin-bottom:12px">
    Cargado el ${new Date(r.fecha_carga).toLocaleString('es-EC')} por ${r.usuario}
  </div>`;

  if (r.estado === 'error') {
    html += `<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--error);margin-bottom:4px">❌ Error de procesamiento</div>
      <code style="font-size:11px;color:var(--error);white-space:pre-wrap;word-break:break-all">${r.log_error || 'Sin detalle disponible'}</code>
    </div>`;
  }

  if (r.sin_lookup > 0 && r.log_error) {
    // Extraer correos del log
    const correos = r.log_error.replace(/^.*?:\s*/, '').split(',').map(c => c.trim()).filter(Boolean);
    html += `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px">
      <div style="font-size:11px;font-weight:600;color:#92400E;margin-bottom:8px">
        ⚠ ${r.sin_lookup} correo(s) sin registro en la tabla de Equipo
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Estas personas tienen horas en el CSV pero no están en el Equipo del portal.
        Sus horas aparecen en el dashboard con empresa "Sin asignar" y costo $0.
        Para corregirlo: ve a <strong>Equipo → Agregar colaborador</strong> y luego recarga el CSV.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${correos.map(c => `<code style="background:var(--surface2);border:0.5px solid var(--border);border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text2)">${c}</code>`).join('')}
      </div>
    </div>`;
  }

  if (!r.log_error) {
    html += `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">
      ✅ Esta carga se procesó sin errores ni advertencias.
    </div>`;
  }

  cuerpo.innerHTML = html;
  modal.classList.add('show');
}

async function restaurarCSV(id, nombre, fecha) {
  if (!confirm(`¿Restaurar los datos de "${nombre}" (${new Date(fecha).toLocaleString('es-EC')})?\n\nEsto reemplazará los datos actuales del dashboard.`)) return;
  const status = document.getElementById('historial-tbody');
  try {
    const r = await api('/api/admin/historial-csv/' + id + '/restaurar', 'POST');
    toast(`Restaurado: ${fmtN(r.tasks)} tasks · ${fmtN(r.iniciativas)} iniciativas`, 'ok');
    await loadFiltros();
    loadHistorialCSV();
  } catch(e) {
    toast('Error al restaurar: ' + e.message, 'err');
  }
}

async function eliminarHistorial(id) {
  if (!confirm('¿Eliminar este registro del historial? No se puede deshacer.')) return;
  await api('/api/admin/historial-csv/' + id, 'DELETE');
  toast('Registro eliminado', 'ok');
  loadHistorialCSV();
}

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
  if (!r.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

function sessionExpired() {
  localStorage.removeItem('dc_token');
  localStorage.removeItem('dc_user');
  TOKEN = null; USER = null;
  // Mostrar mensaje en pantalla de login
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

// ─── DESCARGA UNIVERSAL ───────────────────────────────────────────────────────
// Ícono PNG para botón de gráfica
function _icoImg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}
// Ícono Excel para botón de tabla
function _icoXls() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`;
}

// Genera el HTML de un grupo de botones de descarga para poner en panel-hdr
// tipos: [{ tipo:'img', canvasId, filename } | { tipo:'xls', tableId, filename, dataFn }]
function dlBtns(...acciones) {
  return `<div class="panel-dl-group">${acciones.map(a => {
    if (a.tipo === 'img')
      return `<button class="panel-dl-btn" onclick="downloadChart('${a.canvasId}','${a.filename}')" title="Descargar imagen PNG">${_icoImg()} PNG</button>`;
    if (a.tipo === 'xls' && a.tableId)
      return `<button class="panel-dl-btn" onclick="exportTableExcel('${a.tableId}','${a.filename}')" title="Descargar Excel">${_icoXls()} Excel</button>`;
    if (a.tipo === 'xls' && a.dataFn)
      return `<button class="panel-dl-btn" onclick="${a.dataFn}()" title="Descargar Excel">${_icoXls()} Excel</button>`;
    return '';
  }).join('')}</div>`;
}

// Descarga cualquier canvas Chart.js como PNG
// UX-20: Toggle de segmento en donut con feedback visual en la leyenda custom
function toggleDonutSegment(chart, index, el) {
  if (!chart) return;
  // toggleDataVisibility actúa sobre el segmento individual (no el dataset completo)
  chart.toggleDataVisibility(index);
  chart.update();
  const ahoraVisible = chart.getDataVisibility(index);
  el.style.opacity        = ahoraVisible ? '1'             : '0.35';
  el.style.textDecoration = ahoraVisible ? ''              : 'line-through';
}

// UX-06: Feedback visual en botones de descarga
function flashBtn(btn) {
  if (!btn) return;
  const orig = btn.innerHTML;
  const origColor = btn.style.color;
  btn.innerHTML = '✓ Descargado';
  btn.style.color = '#22c55e';
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = orig;
    btn.style.color = origColor;
    btn.disabled = false;
  }, 2000);
}
function _getDlBtn() {
  // Obtiene el botón .panel-dl-btn que disparó el evento actual (si existe)
  return window.event?.target?.closest?.('.panel-dl-btn') || null;
}

function downloadChart(canvasId, filename) {
  const btn = _getDlBtn();
  const canvas = document.getElementById(canvasId);
  if (!canvas) { toast('Gráfica no disponible', 'err'); return; }
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(canvas, 0, 0);
  const link = document.createElement('a');
  link.download = filename + '.png';
  link.href = off.toDataURL('image/png');
  link.click();
  flashBtn(btn);
  toast('Imagen descargada');
}

// Descarga un <table> HTML como Excel usando SheetJS
function exportTableExcel(tableId, filename) {
  const btn = _getDlBtn();
  let el = document.getElementById(tableId);
  if (el && el.tagName !== 'TABLE') el = el.querySelector('table');
  if (!el) { toast('Tabla no disponible', 'err'); return; }
  const wb = XLSX.utils.table_to_book(el, { sheet: 'Datos', raw: false });
  XLSX.writeFile(wb, filename + '.xlsx');
  flashBtn(btn);
  toast('Excel descargado');
}

// Descarga datos arbitrarios (array de objetos) como Excel
function exportDataExcel(rows, sheetName, filename) {
  const btn = _getDlBtn();
  if (!rows || !rows.length) { toast('Sin datos para exportar', 'err'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename + '.xlsx');
  flashBtn(btn);
  toast('Excel descargado');
}

// ── Cachés para exportación ───────────────────────────────────────────────────
let _cacheResumen = { mes:[], roles:[], topIni:[] };
let _cacheEmpresas = { emp:[], heatmap:[] };
let _cacheCategorias = [];
let _cacheAvance = [];
let _cachePersonas = [];     // alias de allPersonas
let _cacheIni = [];          // iniciativas actuales en vista

// ── Funciones de exportación por sección ─────────────────────────────────────
function exportMesExcel()    { exportDataExcel(_cacheResumen.mes.map(r=>({'Mes':r.label,'Horas':r.horas})), 'Horas por mes', 'horas-por-mes'); }
function exportRolesExcel()  { exportDataExcel(_cacheResumen.roles.map(r=>({'Rol':r.label,'Horas':r.horas})), 'Por rol', 'horas-por-rol'); }
function exportTopIniExcel() { exportDataExcel(_cacheResumen.topIni.map(r=>({'Iniciativa':r.label,'Horas':r.horas})), 'Top iniciativas', 'top-iniciativas'); }
function exportCatExcel()    { exportDataExcel(_cacheCategorias.map(r=>({'Categoría':r.categoria_negocio,'Horas':r.horas,'Costo':r.costo})), 'Categorías', 'horas-por-categoria'); }
function exportAvanceExcel() { exportDataExcel(_cacheAvance.map(r=>({'Iniciativa':r.nombre,'Categoría':r.categoria,'Tasks cerradas':r.cerradas,'Tasks activas':r.activas,'Tasks nuevas':r.nuevas,'Total tasks':r.total,'% Avance':r.pct,'Fecha inicio':r.fecha_ini,'Fecha fin':r.fecha_fin})), 'Avance', 'avance-iniciativas'); }
function exportPersonasExcel(){ exportTableExcel('personas-content', 'equipo-horas'); }
function exportEmpresaExcel(){ exportTableExcel('emp-table-wrap', 'horas-por-empresa'); }
function exportHeatmapExcel(){ exportTableExcel('heatmap-content', 'matriz-empresa-rol'); }
function exportLTExcel()     { exportTableExcel('lt-tabla-content', 'lead-time-iniciativas'); }
function exportIniExcel()    { exportTableExcel('ini-content', 'detalle-iniciativas'); }

// ─── INDICADORES ─────────────────────────────────────────────────────────────
let _ltData = null;
let chartLTDist = null, chartLTBar = null;

async function loadIndicadores() {
  document.getElementById('lt-tabla-content').innerHTML        = '<div class="loader">Cargando…</div>';
  document.getElementById('lt-chart-dist-wrap').innerHTML      = '<div class="loader">Cargando…</div>';
  document.getElementById('lt-chart-bar-wrap').innerHTML       = '<div class="loader">Cargando…</div>';
  document.getElementById('lt-kpi-total').textContent          = '—';
  document.getElementById('lt-kpi-prom').textContent           = '—';
  document.getElementById('lt-kpi-med').textContent            = '—';
  document.getElementById('lt-kpi-min').textContent            = '—';
  document.getElementById('lt-kpi-max').textContent            = '—';
  try {
    _ltData = await api('/api/indicadores/lead-time');
    if (!_ltData.iniciativas.length) {
      ['lt-tabla-content','lt-chart-dist-wrap','lt-chart-bar-wrap'].forEach(id => {
        document.getElementById(id).innerHTML =
          '<div class="no-data">Sin datos de iniciativas<div class="no-data-action">Carga el Excel para ver los indicadores.</div></div>';
      });
      return;
    }
    renderLTKpis(_ltData.kpis);
    // Poblar select de categorías
    const cats = [...new Set(_ltData.iniciativas.map(r => r.categoria))].sort();
    const sel  = document.getElementById('lt-cat');
    sel.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
    applyLTFiltro();
  } catch(e) {
    ['lt-tabla-content','lt-chart-dist-wrap','lt-chart-bar-wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="no-data">Error al cargar: ${e.message}</div>`;
    });
  }
}

function renderLTKpis(kpis) {
  document.getElementById('lt-kpi-total').textContent = kpis.total;
  document.getElementById('lt-kpi-prom').textContent  = kpis.promedio + 'd';
  document.getElementById('lt-kpi-med').textContent   = kpis.mediana  + 'd';
  document.getElementById('lt-kpi-min').textContent   = kpis.minimo   + 'd';
  document.getElementById('lt-kpi-max').textContent   = kpis.maximo   + 'd';
}

function calcLTKpis(iniciativas) {
  const lts = iniciativas.map(r => r.lead_time).sort((a, b) => a - b);
  const n   = lts.length;
  return {
    total:    n,
    promedio: n > 0 ? Math.round(lts.reduce((s, v) => s + v, 0) / n) : 0,
    mediana:  n > 0 ? (n % 2 === 0 ? Math.round((lts[n/2-1] + lts[n/2]) / 2) : lts[Math.floor(n/2)]) : 0,
    minimo:   n > 0 ? lts[0]     : 0,
    maximo:   n > 0 ? lts[n - 1] : 0
  };
}

function applyLTFiltro() {
  clearTimeout(_timerLT);
  _timerLT = setTimeout(_runLTFiltro, 250);
}
function _runLTFiltro() {
  if (!_ltData) return;
  const texto = (document.getElementById('lt-search')?.value || '').toLowerCase().trim();
  const cat   =  document.getElementById('lt-cat')?.value   || '';

  let filtradas = _ltData.iniciativas;
  if (texto) filtradas = filtradas.filter(r => r.nombre.toLowerCase().includes(texto));
  if (cat)   filtradas = filtradas.filter(r => r.categoria === cat);

  const total = _ltData.iniciativas.length;
  document.getElementById('lt-counter').textContent =
    filtradas.length === total ? `${total} iniciativas` : `${filtradas.length} de ${total}`;
  document.getElementById('lt-badge-tabla').textContent =
    `${filtradas.length} iniciativa${filtradas.length !== 1 ? 's' : ''}`;

  // Recalcular KPIs sobre el subconjunto filtrado
  renderLTKpis(calcLTKpis(filtradas));

  // La distribución se recalcula también sobre el subconjunto filtrado
  const distFiltrada = { '0–30d': 0, '31–60d': 0, '61–90d': 0, '91–180d': 0, '180+d': 0 };
  for (const r of filtradas) {
    if      (r.lead_time <= 30)  distFiltrada['0–30d']++;
    else if (r.lead_time <= 60)  distFiltrada['31–60d']++;
    else if (r.lead_time <= 90)  distFiltrada['61–90d']++;
    else if (r.lead_time <= 180) distFiltrada['91–180d']++;
    else                         distFiltrada['180+d']++;
  }
  renderLTChartDist(distFiltrada);
  renderLTChartBar(filtradas);
  renderLTTabla(filtradas);
}

function ltColor(lt) {
  if (lt > 120) return '#8C2A2A';
  if (lt > 60)  return '#8C6A1A';
  if (lt > 30)  return '#3B5EA6';
  return '#2D7A4F';
}

function renderLTChartDist(dist) {
  const wrap = document.getElementById('lt-chart-dist-wrap');
  wrap.innerHTML = '<canvas id="chart-lt-dist"></canvas>';
  const ctx = document.getElementById('chart-lt-dist');
  if (chartLTDist) { chartLTDist.destroy(); chartLTDist = null; }
  const labels = Object.keys(dist);
  const values = Object.values(dist);
  const colors = ['#2D7A4F','#3B5EA6','#8C6A1A','#C05B2D','#8C2A2A'];
  chartLTDist = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors,
      borderRadius: 5, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.raw} iniciativa${c.raw !== 1 ? 's' : ''}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#EBF0FA' }, ticks: { stepSize: 1, font: { size: 10 } },
          beginAtZero: true }
      }
    }
  });
}

function renderLTChartBar(iniciativas) {
  const wrap = document.getElementById('lt-chart-bar-wrap');
  if (!iniciativas.length) {
    wrap.innerHTML = '<div class="no-data" style="height:180px;display:flex;align-items:center;justify-content:center">Sin resultados para el filtro</div>';
    if (chartLTBar) { chartLTBar.destroy(); chartLTBar = null; }
    return;
  }
  wrap.innerHTML = '<canvas id="chart-lt-bar"></canvas>';
  const ctx = document.getElementById('chart-lt-bar');
  if (chartLTBar) { chartLTBar.destroy(); chartLTBar = null; }
  const top = [...iniciativas].sort((a, b) => b.lead_time - a.lead_time).slice(0, 12);
  chartLTBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(r => r.nombre.length > 30 ? r.nombre.slice(0, 30) + '…' : r.nombre),
      datasets: [{ data: top.map(r => r.lead_time),
        backgroundColor: top.map(r => ltColor(r.lead_time)),
        borderRadius: 4, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => top[items[0].dataIndex].nombre,
          label: c => ` ${c.raw}d de lead time`
        } } },
      scales: {
        x: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 },
          callback: v => v + 'd' } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderLTTabla(iniciativas) {
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function fmtFecha(s) {
    if (!s) return '—';
    const d = new Date(s + 'T12:00:00');
    return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
  }

  // UX-13: Aplicar ordenamiento (default: lead_time desc)
  const thMapLT = { nombre:'th-lt-nombre', fecha_ini:'th-lt-ini', fecha_fin:'th-lt-fin',
                    lead_time:'th-lt-lt', pct:'th-lt-pct' };
  _applySortArrows('lt', _sortLT, Object.keys(thMapLT), thMapLT);
  const sorted = _sortRows(iniciativas, _sortLT);

  if (!sorted.length) {
    document.getElementById('lt-tabla-content').innerHTML =
      '<div class="no-data">Sin iniciativas que coincidan con el filtro</div>';
    return;
  }

  const rows = sorted.map((r, i) => {
    const col = ltColor(r.lead_time);
    const pbarColor = r.pct >= 100 ? '#3B5EA6' : r.pct >= 70 ? '#2D7A4F' : '#8C6A1A';
    return `<tr>
      <td class="muted" style="font-size:10px;width:24px;text-align:center">${i + 1}</td>
      <td>
        <div style="font-weight:600;font-size:12px;color:var(--text);line-height:1.3">${r.nombre}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${r.categoria}</div>
      </td>
      <td class="muted" style="white-space:nowrap">${fmtFecha(r.fecha_ini)}</td>
      <td class="muted" style="white-space:nowrap">${fmtFecha(r.fecha_fin)}</td>
      <td style="white-space:nowrap">
        <span style="background:${col}18;color:${col};border:1px solid ${col}44;
          font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">
          ${r.lead_time}d
        </span>
      </td>
      <td style="min-width:120px">
        <div style="display:flex;align-items:center;gap:7px">
          <div class="lt-pbar-track"><div class="lt-pbar-fill"
            style="width:${r.pct}%;background:${pbarColor}"></div></div>
          <span style="font-size:11px;font-weight:700;color:var(--text2);min-width:36px;text-align:right">${r.pct}%</span>
        </div>
      </td>
      <td class="muted" style="text-align:right;white-space:nowrap">${r.cerradas} / ${r.total}</td>
    </tr>`;
  }).join('');

  document.getElementById('lt-tabla-content').innerHTML = `
    <table class="tbl">
      <thead><tr>
        <th>#</th>
        <th class="th-sort" id="th-lt-nombre"  onclick="sortLT('nombre')">Iniciativa<i class="sort-arrow">↕</i></th>
        <th class="th-sort" id="th-lt-ini"     onclick="sortLT('fecha_ini')">Fecha inicio<i class="sort-arrow">↕</i></th>
        <th class="th-sort" id="th-lt-fin"     onclick="sortLT('fecha_fin')">Fecha fin<i class="sort-arrow">↕</i></th>
        <th class="th-sort" id="th-lt-lt"      onclick="sortLT('lead_time')">Lead Time<i class="sort-arrow">↕</i></th>
        <th class="th-sort" id="th-lt-pct"     onclick="sortLT('pct')">Avance<i class="sort-arrow">↕</i></th>
        <th style="text-align:right">Tasks</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

window.onclick = e => {
  document.querySelectorAll('.modal-overlay.show').forEach(m => {
    if (e.target === m) m.classList.remove('show');
  });
};
