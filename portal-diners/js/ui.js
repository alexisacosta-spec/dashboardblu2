// ─── UI HELPERS ───────────────────────────────────────────────────────────────

// ─── TOOLTIP SISTEMA ─────────────────────────────────────────────────────────
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

// ─── SKELETON SCREENS ─────────────────────────────────────────────────────────
function skelTable(widths=[80,180,60,60], rows=6) {
  return Array.from({length:rows}, () =>
    `<tr class="skel-tbl-row">${widths.map(w=>
      `<td><span class="skel" style="width:${w}px;height:11px"></span></td>`).join('')}</tr>`
  ).join('');
}
function skelPbars(n=5) {
  return Array.from({length:n}, (_,i) =>
    `<div class="skel-pbar-row">
      <span class="skel" style="width:${90+i*22}px;height:10px"></span>
      <div class="pbar-track" style="flex:1"><span class="skel" style="width:${80-i*8}%;height:7px;border-radius:4px;display:block"></span></div>
      <span class="skel" style="width:32px;height:10px"></span>
    </div>`
  ).join('');
}
function skelKpi() {
  return `<span class="skel" style="width:90px;height:32px;display:inline-block;border-radius:6px"></span>`;
}

// ─── EMPTY STATES ─────────────────────────────────────────────────────────────
function emptyState(msg, hint='', icon='📭') {
  return `<div class="empty-state">
    <div class="empty-state-ico">${icon}</div>
    <div class="empty-state-msg">${msg}</div>
    ${hint ? `<div class="empty-state-hint">${hint}</div>` : ''}
  </div>`;
}

// ─── GANTT TOOLTIP ────────────────────────────────────────────────────────────
let _tipPinned = false; // true cuando el tooltip fue abierto por click (no hover)

function _showTip(t, html, e) {
  t.innerHTML = html;
  t.style.display = 'block';
  _posGanttTip(e);
}

function showStackTip(e, el) {
  const t = document.getElementById('gantt-tip');
  if (!t) return;
  const total    = +el.dataset.total    || 0;
  const cerradas = +el.dataset.cerradas || 0;
  const activas  = +el.dataset.activas  || 0;
  const nuevas   = +el.dataset.nuevas   || 0;
  const otros    = +el.dataset.otros    || 0;
  const pC = total ? (cerradas / total * 100).toFixed(1) : 0;
  const pA = total ? (activas  / total * 100).toFixed(1) : 0;
  const pN = total ? (nuevas   / total * 100).toFixed(1) : 0;
  const pO = total ? (otros    / total * 100).toFixed(1) : 0;
  const dot = (color) => `<span style="display:inline-block;width:9px;height:9px;background:${color};border-radius:2px;margin-right:5px;vertical-align:middle"></span>`;
  _showTip(t, `<strong style="font-size:12px">Distribución de Tasks</strong>
    <div class="gantt-tip-row">${dot('#16A34A')} Cerradas: <b>${cerradas}</b> <span style="color:#9CA3AF">(${pC}%)</span></div>
    <div class="gantt-tip-row">${dot('#2563EB')} Activas: <b>${activas}</b> <span style="color:#9CA3AF">(${pA}%)</span></div>
    <div class="gantt-tip-row">${dot('#94A3B8')} Nuevas: <b>${nuevas}</b> <span style="color:#9CA3AF">(${pN}%)</span></div>
    ${otros > 0 ? `<div class="gantt-tip-row">${dot('#C084FC')} Otros: <b>${otros}</b> <span style="color:#9CA3AF">(${pO}%)</span></div>` : ''}
    <div class="gantt-tip-row" style="border-top:1px solid #E5E7EB;margin-top:5px;padding-top:4px;font-weight:600">Total: ${total}</div>`, e);
}

// Versión "pinned" para onclick: mouseleave no lo cierra
function pinStackTip(e, el) {
  _tipPinned = true;
  showStackTip(e, el);
  e.stopPropagation();
}

function showGanttTip(e, el) {
  const t = document.getElementById('gantt-tip');
  if (!t) return;
  _showTip(t, `<strong>${el.dataset.nombre||'—'}</strong>
    <div class="gantt-tip-row">📅 <b>${el.dataset.ini||'?'}</b> → <b>${el.dataset.fin||'?'}</b></div>
    <div class="gantt-tip-row">⏱ Lead Time: <b>${el.dataset.lt||'?'}d</b></div>
    <div class="gantt-tip-row">✅ Avance: <b>${el.dataset.pct||'0'}%</b> (${el.dataset.cerradas||0}/${el.dataset.total||0} tasks)</div>
    ${Number(el.dataset.horas) > 0 ? `<div class="gantt-tip-row">🕐 Horas: <b>${Math.round(Number(el.dataset.horas)).toLocaleString('es-EC')}h comp</b>${Number(el.dataset.horasEst) > 0 ? ` / ${Math.round(Number(el.dataset.horasEst)).toLocaleString('es-EC')}h est` : ''}</div>` : ''}
    <div class="gantt-tip-row" style="margin-top:4px"><span style="background:${el.dataset.color||'#ccc'}30;color:${el.dataset.color||'#666'};border:1px solid ${el.dataset.color||'#ccc'}55;padding:1px 8px;border-radius:20px;font-size:10px;font-weight:700">${el.dataset.estado||'—'}</span></div>`, e);
}

function _posGanttTip(e) {
  const t = document.getElementById('gantt-tip');
  if (!t) return;
  let x = e.clientX + 14, y = e.clientY + 14;
  const w = t.offsetWidth || 260, h = t.offsetHeight || 110;
  if (x + w > window.innerWidth - 8)  x = e.clientX - w - 10;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - 10;
  t.style.left = x + 'px';
  t.style.top  = y + 'px';
}

function hideGanttTip() {
  if (_tipPinned) return; // No ocultar si fue abierto por click
  const t = document.getElementById('gantt-tip');
  if (t) t.style.display = 'none';
}

// ─── PAGINATION ───────────────────────────────────────────────────────────────
function renderPagination(total, page, onPrev, onNext) {
  if (total <= PAGE_SIZE) return '';
  const pages  = Math.ceil(total / PAGE_SIZE);
  const from   = page * PAGE_SIZE + 1;
  const to     = Math.min((page + 1) * PAGE_SIZE, total);
  const prevDisabled = page === 0 ? 'disabled' : '';
  const nextDisabled = page >= pages - 1 ? 'disabled' : '';
  return `<div class="pagination">
    <button class="pg-btn" ${prevDisabled} onclick="${onPrev}">‹ Anterior</button>
    <span class="pg-info">${from}–${to} de ${total}</span>
    <button class="pg-btn" ${nextDisabled} onclick="${onNext}">Siguiente ›</button>
  </div>`;
}

// ─── SORT HELPERS ─────────────────────────────────────────────────────────────
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
