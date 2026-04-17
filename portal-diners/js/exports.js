// ─── EXPORTS / DOWNLOAD SYSTEM ───────────────────────────────────────────────

// ─── DOWNLOAD ICONS ───────────────────────────────────────────────────────────
function _icoImg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}
function _icoXls() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`;
}
function _icoDl() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><line x1="3" y1="21" x2="21" y2="21"/></svg>`;
}

// Genera el HTML de un botón de descarga unificado .dl-btn para poner en panel-hdr
function dlBtns(...acciones) {
  const opts = acciones.map(a => {
    if (a.tipo === 'img') return `['Imagen PNG','png','downloadChart(\\'${a.canvasId}\\',\\'${a.filename}\\')']`;
    if (a.tipo === 'xls' && a.tableId) return `['Excel','xls','exportTableExcel(\\'${a.tableId}\\',\\'${a.filename}\\')']`;
    if (a.tipo === 'xls' && a.dataFn)  return `['Excel','xls','${a.dataFn}()']`;
    return null;
  }).filter(Boolean).join(',');
  return `<button class="dl-btn" onclick="showDlMenu(event,[${opts}])" title="Descargar">${_icoDl()}</button>`;
}

// ─── DOWNLOAD MENU UNIFICADO ──────────────────────────────────────────────────
let _activeDlBtn = null;
let _dlMenuEl    = null;

function _getDlMenuEl() {
  if (_dlMenuEl) return _dlMenuEl;
  _dlMenuEl = document.createElement('div');
  _dlMenuEl.className = 'dl-menu';
  document.body.appendChild(_dlMenuEl);
  document.addEventListener('click', e => {
    if (!e.target.closest('.dl-btn') && !e.target.closest('.dl-menu')) _closeDlMenu();
  }, true);
  return _dlMenuEl;
}
function _closeDlMenu() { _getDlMenuEl().classList.remove('show'); }

function showDlMenu(e, opts) {
  e.stopPropagation();
  _activeDlBtn = e.currentTarget;
  if (opts.length === 1) { _closeDlMenu(); new Function(opts[0][2])(); return; }
  const menu = _getDlMenuEl();
  if (menu.classList.contains('show') && menu._btn === _activeDlBtn) { _closeDlMenu(); return; }
  menu._btn = _activeDlBtn;
  const _ico = t => t === 'png'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`;
  menu.innerHTML = opts.map(o =>
    `<div class="dl-menu-item">${_ico(o[1])}<span>${o[0]}</span></div>`
  ).join('<div class="dl-menu-sep"></div>');
  const rect = _activeDlBtn.getBoundingClientRect();
  menu.style.top   = (rect.bottom + 6) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  menu.style.left  = 'auto';
  menu.querySelectorAll('.dl-menu-item').forEach((item, i) => {
    item.onclick = () => { _closeDlMenu(); new Function(opts[i][2])(); };
  });
  requestAnimationFrame(() => menu.classList.add('show'));
}

// ─── TOGGLE DONUT SEGMENT ─────────────────────────────────────────────────────
function toggleDonutSegment(chart, index, el) {
  if (!chart) return;
  chart.toggleDataVisibility(index);
  chart.update();
  const ahoraVisible = chart.getDataVisibility(index);
  el.style.opacity        = ahoraVisible ? '1'             : '0.35';
  el.style.textDecoration = ahoraVisible ? ''              : 'line-through';
}

// ─── FLASH BUTTON FEEDBACK ────────────────────────────────────────────────────
function flashBtn(btn) {
  if (!btn) return;
  const orig = btn.innerHTML;
  const origColor = btn.style.color;
  btn.style.color = '#22c55e';
  btn.disabled = true;
  if (btn.classList.contains('dl-btn')) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
      btn.innerHTML = orig; btn.style.color = origColor; btn.disabled = false;
      if (_activeDlBtn === btn) _activeDlBtn = null;
    }, 1500);
  } else {
    btn.innerHTML = '✓ Descargado';
    setTimeout(() => {
      btn.innerHTML = orig; btn.style.color = origColor; btn.disabled = false;
    }, 2000);
  }
}
function _getDlBtn() {
  return _activeDlBtn || window.event?.target?.closest?.('.panel-dl-btn,.dl-btn') || null;
}

// ─── CHART DOWNLOAD ───────────────────────────────────────────────────────────
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

// ─── TABLE EXPORT ─────────────────────────────────────────────────────────────
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

// ─── DATA EXPORT ──────────────────────────────────────────────────────────────
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

// ─── CACHÉS PARA EXPORTACIÓN ──────────────────────────────────────────────────
let _cacheResumen = { mes:[], roles:[], topIni:[] };
let _cacheEmpresas = { emp:[], heatmap:[] };
let _cacheCategorias = [];
let _cacheAvance = [];
let _cachePersonas = [];
let _cacheIni = [];

// ─── FUNCIONES DE EXPORTACIÓN POR SECCIÓN ────────────────────────────────────
function exportMesExcel()    { exportDataExcel(_cacheResumen.mes.map(r=>({'Mes':r.label,'Horas':r.horas})), 'Horas por mes', 'horas-por-mes'); }
function exportRolesExcel()  { exportDataExcel(_cacheResumen.roles.map(r=>({'Rol':r.label,'Horas':r.horas})), 'Por rol', 'horas-por-rol'); }
function exportTopIniExcel() { exportDataExcel(_cacheResumen.topIni.map(r=>({'Iniciativa':r.label,'Horas':r.horas})), 'Top iniciativas', 'top-iniciativas'); }
function exportCatExcel()    { exportDataExcel(_cacheCategorias.map(r=>({'Categoría':r.categoria_negocio,'Horas':r.horas,'Costo':r.costo})), 'Categorías', 'horas-por-categoria'); }
function exportAvanceExcel() { exportDataExcel(_cacheAvance.map(r=>({'Iniciativa':r.nombre,'Categoría':r.categoria,'Tasks cerradas':r.cerradas,'Tasks activas':r.activas,'Tasks nuevas':r.nuevas,'Total tasks':r.total,'% Avance':r.pct,'H. Completadas':r.horas,'H. Estimadas':r.horas_est,'Fecha inicio':r.fecha_ini,'Fecha fin':r.fecha_fin})), 'Avance', 'avance-iniciativas'); }
function exportPersonasExcel(){ exportTableExcel('personas-content', 'equipo-horas'); }
function exportEmpresaExcel(){ exportTableExcel('emp-table-wrap', 'horas-por-empresa'); }
function exportHeatmapExcel(){ exportTableExcel('heatmap-content', 'matriz-empresa-rol'); }
function exportLTExcel()     { exportTableExcel('lt-tabla-content', 'lead-time-iniciativas'); }
function exportIniExcel()    { exportTableExcel('ini-content', 'detalle-iniciativas'); }

// ─── BUGS EXPORT ──────────────────────────────────────────────────────────────
function exportBugsExcel(filas, nombreArchivo, columnas) {
  if (!filas || !filas.length) { alert('Sin datos para exportar con los filtros actuales.'); return; }
  const datos = filas.map(r => {
    const obj = {};
    columnas.forEach(({ key, label }) => { obj[label] = r[key] ?? ''; });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(datos);
  const colWidths = columnas.map(({ label }) => ({ wch: Math.max(label.length + 2, 14) }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bugs');
  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

const BUG_COLS_BASE = [
  { key: 'id_bug',             label: 'ID Bug' },
  { key: 'titulo',             label: 'Título' },
  { key: 'estado',             label: 'Estado' },
  { key: 'severity',           label: 'Severidad' },
  { key: 'categoria_bug',      label: 'Categoría' },
  { key: 'ambiente',           label: 'Ambiente' },
  { key: 'sprint',             label: 'Sprint' },
  { key: 'nombre_iniciativa',  label: 'Iniciativa' },
  { key: 'id_iniciativa',      label: 'ID Iniciativa' },
  { key: 'nombre_epic',        label: 'Epic' },
  { key: 'id_epic',            label: 'ID Epic' },
  { key: 'nombre_hu',          label: 'Historia de Usuario' },
  { key: 'id_hu',              label: 'ID HU' },
  { key: 'created_date',       label: 'Fecha creación' },
  { key: 'closed_date',        label: 'Fecha cierre' },
  { key: 'dias_resolucion',    label: 'Días resolución' },
];

function dlBugsProduccion() {
  const raw = _bugsData?.raw || [];
  const fil = raw.filter(r => ['PRODUCCION','EXTERNO_PRODUCCION','GSF'].includes(r.ambiente));
  exportBugsExcel(fil, 'bugs_produccion', BUG_COLS_BASE);
}
function dlBugsIniciativa() {
  exportBugsExcel(_bugsData?.raw || [], 'bugs_por_iniciativa',
    BUG_COLS_BASE.filter(c => !['Ambiente'].includes(c.label)));
}
function dlBugsSprint() {
  const raw = (_bugsData?.raw || []).filter(r => r.sprint);
  exportBugsExcel(raw, 'bugs_por_sprint', BUG_COLS_BASE);
}
function dlBugsMttr() {
  const raw = (_bugsData?.raw || []).filter(r => r.dias_resolucion != null);
  exportBugsExcel(raw, 'bugs_mttr', BUG_COLS_BASE);
}
function dlBugsSeveridad() {
  exportBugsExcel(_bugsData?.raw || [], 'bugs_por_severidad', BUG_COLS_BASE);
}
function dlBugsCategoria() {
  const raw = (_bugsData?.raw || []).filter(r => r.categoria_bug);
  exportBugsExcel(raw, 'bugs_por_categoria', BUG_COLS_BASE);
}
