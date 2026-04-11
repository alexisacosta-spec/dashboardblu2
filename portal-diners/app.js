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
  localStorage.removeItem('dc_token'); localStorage.removeItem('dc_user');
  TOKEN = null; USER = null;
  showScreen('login');
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

function clearFilters() {
  ['f-anio','f-mes','f-empresa','f-cat','f-ini'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
}

function applyFilters() {
  const v = document.querySelector('.view.active')?.id?.replace('view-','');
  if (v) renderView(v);
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────
// Vistas que NO usan filtros globales — se oculta la barra al entrar
const VISTAS_SIN_FILTROS = new Set(['avance','equipo','tarifas','usuarios','historial','cargar','logs']);

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
    document.getElementById('resumen-sub').textContent = `Periodo: ${meses[0]||'—'} — ${meses[meses.length-1]||'—'} · BLU 2.0`;

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
    document.getElementById('emp-legend').innerHTML = labE.map((l,i)=>
      `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="width:8px;height:8px;border-radius:50%;background:${colsE[i]};flex-shrink:0"></div>
        <span style="font-size:10px;color:var(--text)">${l}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto">${fmtH(dataE[i])} h · ${Math.round(dataE[i]/totalEmp*100)}%</span>
      </div>`).join('');

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
          <div class="search-wrap">
            <input type="text" id="ini-search" class="search-input"
              placeholder="Buscar por nombre, ID o categoría…"
              oninput="filterIniciativas()">
            <span class="search-count" id="ini-search-count"></span>
          </div>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          <table class="tbl">
            <thead><tr>
              <th>ID</th><th>Iniciativa</th><th>Categoría</th>
              <th class="num">Horas</th><th class="num">% total</th>
              ${verCostos?'<th class="num">Costo</th>':''}
              <th class="num">Personas</th>
            </tr></thead>
            <tbody id="ini-tbody"></tbody>
          </table>
        </div>
      </div>`;
  }

  // Actualizar solo el tbody y el contador — el input no se toca
  const countEl = document.getElementById('ini-search-count');
  if (countEl) countEl.textContent = rows.length + ' iniciativas';

  const tbody = document.getElementById('ini-tbody');
  if (!tbody) return;

  tbody.innerHTML = rows.length ? rows.map(r=>`
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

function filterIniciativas() {
  const q = document.getElementById('ini-search').value.toLowerCase();
  const filtered = allIniciativas.filter(r =>
    r.nombre_iniciativa.toLowerCase().includes(q) ||
    String(r.id_iniciativa).includes(q) ||
    r.categoria_negocio.toLowerCase().includes(q)
  );
  renderIniciativasTable(filtered);
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
  document.getElementById('avance-ini-content').innerHTML = '<div class="loader">Cargando…</div>';
  document.getElementById('delivery-content').innerHTML   = '<div class="loader">Cargando…</div>';
  try {
    // Sin filtros temporales — avance es del proyecto completo
    const avance = await api('/api/datos/avance-iniciativas');
    renderAvanceKpis(avance);
    renderAvanceTabla(avance);
    renderDeliveryPlan(avance);
  } catch(e) {
    ['avance-ini-content','delivery-content'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="no-data">Error al cargar: ${e.message}</div>`;
    });
  }
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

function renderDeliveryPlan(rows) {
  const sorted = [...rows]
    .filter(r => r.nombre !== 'SIN PARENT' && r.fecha_ini && r.fecha_fin)
    .sort((a,b) => new Date(a.fecha_ini) - new Date(b.fecha_ini));

  if (!sorted.length) {
    document.getElementById('delivery-content').innerHTML = '<div class="no-data">Sin datos de fechas disponibles</div>';
    return;
  }

  const rangeStart = new Date('2025-12-01');
  const rangeEnd   = new Date('2026-04-30');
  const rangeDays  = (rangeEnd - rangeStart) / 86400000;
  const today      = new Date();
  today.setHours(0,0,0,0);
  const todayPct   = Math.min(100, Math.max(0, (today - rangeStart) / 86400000 / rangeDays * 100));
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const mesesHdr = ['Dic 25','Ene 26','Feb 26','Mar 26','Abr 26']
    .map(m => `<div class="gantt-month">${m}</div>`).join('');

  // ── Función de clasificación con umbrales gerenciales ──
  function clasificar(r) {
    const fin      = new Date(r.fecha_fin); fin.setHours(0,0,0,0);
    const diasRest = Math.round((fin - today) / 86400000); // positivo = futuro, negativo = pasado
    const pct      = r.pct || 0;

    if (pct >= 100) {
      // Completada — azul apagado independientemente de fechas
      return {
        estado: 'Completada',
        color:  '#3B5EA6',   // azul corporativo apagado
        tag:    'av-tag av-done-tag'
      };
    }
    if (diasRest < 0) {
      // Fecha fin ya pasó y no está completa → Atrasada
      return {
        estado: `Atrasada ${Math.abs(diasRest)}d`,
        color:  '#8C2A2A',   // rojo corporativo oscuro
        tag:    'av-tag av-late'
      };
    }
    if (diasRest <= 14 && pct < 85) {
      // Vence en ≤14 días con avance < 85% → En riesgo
      return {
        estado: `Riesgo · ${diasRest}d`,
        color:  '#8C6A1A',   // ámbar ejecutivo
        tag:    'av-tag av-risk-tag'
      };
    }
    // Resto → En tiempo
    return {
      estado: `En tiempo · ${diasRest}d`,
      color:  '#2D7A4F',   // verde sobrio
      tag:    'av-tag av-ok-tag'
    };
  }

  const barsHtml = sorted.map(r => {
    const ini  = new Date(r.fecha_ini);
    const fin  = new Date(r.fecha_fin);
    const left = Math.max(0, (ini - rangeStart) / 86400000 / rangeDays * 100);
    const width= Math.min(100 - left, (fin - ini) / 86400000 / rangeDays * 100);
    const dIni = `${ini.getDate()} ${MES[ini.getMonth()]}`;
    const dFin = `${fin.getDate()} ${MES[fin.getMonth()]}`;
    const cls  = clasificar(r);

    return `<div class="gantt-row">
      <div class="gantt-name">
        <div class="gantt-name-text" title="${r.nombre}">${r.nombre}</div>
        <div class="gantt-name-sub" style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="color:var(--muted)">${r.categoria}</span>
          <span class="av-tag" style="background:${cls.color}1A;color:${cls.color};border:1px solid ${cls.color}55;font-size:9px;padding:1px 6px;border-radius:4px;font-weight:600;letter-spacing:.03em">${cls.estado}</span>
        </div>
      </div>
      <div class="gantt-track">
        <div class="gantt-vline" style="left:20%"></div><div class="gantt-vline" style="left:40%"></div>
        <div class="gantt-vline" style="left:60%"></div><div class="gantt-vline" style="left:80%"></div>
        <div class="gantt-today" style="left:${todayPct.toFixed(1)}%"><span class="gantt-today-lbl">hoy</span></div>
        <div class="gantt-bar" style="left:${left.toFixed(1)}%;width:${Math.max(width,2).toFixed(1)}%;background:${cls.color};opacity:0.88">
          <span class="gantt-bar-lbl">${dIni} — ${dFin} · ${r.pct}%</span>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('delivery-content').innerHTML = `
    <div class="gantt-outer"><div class="gantt-inner">
      <div class="gantt-hdr-row"><div class="gantt-label"></div><div class="gantt-months">${mesesHdr}</div></div>
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
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  document.getElementById('personas-sub').textContent = `${allPersonas.length} colaboradores`;
  if (!verCostos) document.getElementById('th-costo-per').style.display = 'none';
  renderPersonasTable(allPersonas);
}

function renderPersonasTable(rows) {
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const countEl = document.getElementById('personas-count');
  if (countEl) countEl.textContent = rows.length + ' personas';
  document.getElementById('personas-tbody').innerHTML = rows.length ?
    rows.map(r=>`<tr>
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
  const q = document.getElementById('persona-search').value.toLowerCase();
  renderPersonasTable(allPersonas.filter(r =>
    r.nombre_persona.toLowerCase().includes(q) ||
    r.empresa.toLowerCase().includes(q) ||
    r.rol.toLowerCase().includes(q)
  ));
}

// ─── CATEGORÍAS ──────────────────────────────────────────────────────────────
async function loadCategorias() {
  const q = getFilters();
  const rows = await api('/api/datos/por-categoria'+q);
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const total = rows.reduce((s,r)=>s+r.horas,0);
  const cols = ['#0A1628','#6B7280','#B4B2A9','#D3D1C7','#1a3060'];

  if (chartCat) chartCat.destroy();
  chartCat = new Chart(document.getElementById('chart-cat'), {
    type:'doughnut', data:{labels:rows.map(r=>r.categoria_negocio), datasets:[{data:rows.map(r=>r.horas), backgroundColor:cols.slice(0,rows.length), borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'right',labels:{font:{size:10},boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtH(c.raw)} h`}}}}
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
  status.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:12px">⏳ Procesando CSV… esto puede tomar unos segundos</div>';
  const fd = new FormData();
  fd.append('archivo', file);
  try {
    const r = await fetch('/api/admin/cargar-csv', {
      method:'POST', headers:{'Authorization':'Bearer '+TOKEN}, body:fd
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);

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
    toast('CSV importado correctamente', 'ok');
    await loadFiltros();
  } catch(e) {
    status.innerHTML = `<div style="font-size:13px;color:var(--error);padding:12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px">
      ❌ Error: ${e.message}
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
  const q = document.getElementById('equipo-search').value.toLowerCase();
  const filtered = allEquipoRows.filter(r =>
    r.nombre.toLowerCase().includes(q) ||
    r.correo.toLowerCase().includes(q) ||
    r.empresa.toLowerCase().includes(q) ||
    r.rol.toLowerCase().includes(q)
  );
  renderEquipoTabla(filtered, true);
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
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

function fmtH(n) { return (Math.round((n||0)*10)/10).toLocaleString('es-EC',{minimumFractionDigits:1,maximumFractionDigits:1}); }
function fmtN(n) { return Math.round(n||0).toLocaleString('es-EC'); }
function esc(s) { return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

window.onclick = e => {
  document.querySelectorAll('.modal-overlay.show').forEach(m => {
    if (e.target === m) m.classList.remove('show');
  });
};
