// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function showDashboard() {
  showScreen('dashboard');
  document.getElementById('sb-nm').textContent = USER.nombre;
  document.getElementById('sb-av').textContent = USER.nombre.split(' ').map(w=>w[0]).slice(0,2).join('');
  const roles = {admin:'Administrador',gerente:'Gerente · Con costos',gestor:'Gestor',visor:'Visor'};
  document.getElementById('sb-rl').textContent = roles[USER.perfil] || USER.perfil;

  const isAdmin = USER.perfil === 'admin';
  const isVisor = USER.perfil === 'visor';
  const verCostos = ['admin','gerente'].includes(USER.perfil);

  // nav-equipo visible para todos los perfiles
  document.getElementById('nav-equipo').style.display = '';

  if (isAdmin) {
    document.getElementById('sb-admin-sec').style.display = '';
    document.getElementById('nav-usuarios').style.display = '';
    document.getElementById('nav-tarifas').style.display = '';
    document.getElementById('nav-cargar').style.display = '';
    document.getElementById('nav-historial').style.display = '';
    document.getElementById('nav-logs').style.display = '';
    document.getElementById('equipo-colab-admin-btns').style.display = '';
    document.getElementById('celulas-edit-btn').style.display = '';
  } else {
    document.getElementById('equipo-colab-admin-btns').style.display = 'none';
    document.getElementById('th-equipo-acciones').style.display = 'none';
  }

  if (!verCostos) {
    document.getElementById('kpi-costo-card').style.display = 'none';
    document.getElementById('th-costo-per').style.display = 'none';
  }

  // ── Perfil VISOR: solo Avance y Equipo ───────────────────────────────────
  if (isVisor) {
    document.querySelectorAll('.nav-item').forEach(el => {
      const oc = el.getAttribute('onclick') || '';
      const permitido = oc.includes("'avance'") || oc.includes("'equipo'");
      if (!permitido) el.style.display = 'none';
    });
    // Ocultar sub-ítems del grupo que no estén permitidos y el header si todos ocultos
    document.querySelectorAll('.nav-grp-hdr').forEach(hdr => {
      const grpId = hdr.id.replace('nav-grp-','').replace('-hdr','');
      const items = document.getElementById('nav-grp-' + grpId);
      if (!items) return;
      const visible = Array.from(items.querySelectorAll('.nav-item')).some(el => el.style.display !== 'none');
      if (!visible) hdr.style.display = 'none';
    });
    const sbSec = document.querySelector('.sb-sec:not(#sb-admin-sec)');
    if (sbSec) sbSec.style.display = 'none';
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Abrir grupo Indicadores por defecto
  openNavGrp('ind');

  initTooltipSystem();
  if (!isVisor) {
    await loadFiltros();
    document.getElementById('filter-zone').style.display = '';
    _updateFilterUI();
  } else {
    document.getElementById('filter-zone').style.display = 'none';
  }
  showView(isVisor ? 'avance' : 'resumen');
}

// ─── FILTROS ──────────────────────────────────────────────────────────────────
async function loadFiltros() {
  try {
    const f = await api('/api/datos/filtros');
    const anioSel = document.getElementById('f-anio');
    const mesSel  = document.getElementById('f-mes');
    const empSel  = document.getElementById('f-empresa');
    const catSel  = document.getElementById('f-cat');
    const iniSel  = document.getElementById('f-ini');

    const selAnio = anioSel.value;
    const selMes  = mesSel.value;
    const selEmp  = empSel.value;
    const selCat  = catSel.value;
    const selIni  = iniSel.value;

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
  if (typeof clientLog !== 'undefined') {
    const filtros = {};
    [['f-anio','anio'],['f-mes','mes'],['f-empresa','empresa'],['f-cat','cat'],['f-ini','ini']]
      .forEach(([id, key]) => { const val = document.getElementById(id)?.value; if (val) filtros[key] = val; });
    if (Object.keys(filtros).length) clientLog('FILTER_APPLIED', filtros);
  }
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────
const VISTAS_SIN_FILTROS = new Set(['avance','indicadores','equipo','tarifas','usuarios','historial','cargar','logs','iae']);

const VIEW_LABELS = {
  resumen:'Resumen ejecutivo', iniciativas:'Por iniciativa', empresas:'Por empresa',
  personas:'Por persona', categorias:'Por categoría', avance:'Avance y Delivery',
  indicadores:'Indicadores · Lead Time', equipo:'Equipo', tarifas:'Tarifas',
  cargar:'Cargar CSV', historial:'Historial CSV', usuarios:'Usuarios', logs:'Log de accesos',
  iae:'Índice de Avance Efectivo (IAE)'
};

function showView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const view = document.getElementById('view-'+name);
  if (view) view.classList.add('active');
  const nav = document.querySelector(`[onclick="showView('${name}')"]`);
  if (nav) nav.classList.add('active');
  const filterZone = document.getElementById('filter-zone');
  if (filterZone) filterZone.style.display = VISTAS_SIN_FILTROS.has(name) ? 'none' : '';
  const bc = document.getElementById('global-bc');
  const bcLabel = document.getElementById('global-bc-label');
  if (bc && bcLabel) {
    bcLabel.textContent = VIEW_LABELS[name] || name;
    bc.style.display = '';
  }
  renderView(name);
}

function renderView(name) {
  const map = {resumen:loadResumen,iniciativas:loadIniciativas,empresas:loadEmpresas,
    personas:loadPersonas,categorias:loadCategorias,avance:loadAvance,
    indicadores:loadIndicadores,
    usuarios:loadUsuarios,equipo:loadEquipoView,tarifas:loadTarifas,
    cargar:()=>{},historial:loadHistorialCSV,logs:loadLogs,
    iae:loadIAE};
  if (map[name]) map[name]();
}

// ─── NAV GROUPS ───────────────────────────────────────────────────────────────
// Vistas que pertenecen al grupo "Indicadores"
const NAV_GROUPS = { ind: new Set(['indicadores','iae']) };

function toggleNavGrp(id) {
  const items = document.getElementById('nav-grp-' + id);
  const arr   = document.getElementById('nav-grp-' + id + '-arr');
  const hdr   = document.getElementById('nav-grp-' + id + '-hdr');
  if (!items) return;
  const open = items.classList.toggle('open');
  if (arr) arr.classList.toggle('open', open);
  if (hdr) hdr.classList.toggle('open', open);
}

function openNavGrp(id) {
  const items = document.getElementById('nav-grp-' + id);
  const arr   = document.getElementById('nav-grp-' + id + '-arr');
  const hdr   = document.getElementById('nav-grp-' + id + '-hdr');
  if (items) items.classList.add('open');
  if (arr)   arr.classList.add('open');
  if (hdr)   hdr.classList.add('open');
}

// ─── SIDEBAR MOBILE ───────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const btn = document.getElementById('btn-hamburger');
  const ov  = document.getElementById('sidebar-overlay');
  const open = sb?.classList.toggle('open');
  btn?.classList.toggle('open', open);
  if (ov) ov.classList.toggle('show', open);
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('btn-hamburger')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.onload = () => {
  setupOTP();
  const urlParams = new URLSearchParams(window.location.search);
  const invToken = urlParams.get('invite');
  if (invToken) {
    _inviteToken = invToken;
    window.history.replaceState({}, document.title, window.location.pathname);
    showScreen('invite');
    handleInviteToken(invToken);
  } else if (TOKEN && USER) {
    showDashboard();
  } else {
    showScreen('login');
  }
};

window.onclick = e => {
  document.querySelectorAll('.modal-overlay.show').forEach(m => {
    if (e.target === m) m.classList.remove('show');
  });
  // Cerrar gantt-tip pinned al hacer clic fuera de la barra
  const tip = document.getElementById('gantt-tip');
  if (tip && tip.style.display === 'block') {
    const isInsideBar = e.target.closest('.gantt-bar, .iae-stack-wrap');
    if (!isInsideBar) {
      _tipPinned = false;
      tip.style.display = 'none';
    }
  }
};

// ─── PATCH showView: auto-open grupo + mobile sidebar ────────────────────────
const _origShowView = showView;
window.showView = function(name) {
  _origShowView(name);
  // Auto-abrir el grupo al que pertenece la vista
  for (const [grpId, vistas] of Object.entries(NAV_GROUPS)) {
    if (vistas.has(name)) { openNavGrp(grpId); break; }
  }
  if (window.innerWidth <= 900) closeSidebar();
  if (typeof clientLog !== 'undefined') clientLog('VIEW', { vista: name });
};
