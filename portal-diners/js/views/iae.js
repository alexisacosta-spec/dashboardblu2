// ─── IAE VIEW ─────────────────────────────────────────────────────────────────

let _iaeAvanceCache = null;

const IAE_STYLES = `
<style id="iae-styles">
.iae-root { font-family: var(--font, 'Nunito Sans', sans-serif); }

/* ── KPI strip ── */
.iae-kpi-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px; margin-bottom: 20px;
}
.iae-kpi {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-lg, 8px); padding: 18px 20px;
  display: flex; flex-direction: column; gap: 4px;
}
.iae-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.iae-kpi-val   { font-size: 32px; font-weight: 800; line-height: 1; }
.iae-kpi-sub   { font-size: 12px; color: var(--muted); }
.iae-kpi.blue    .iae-kpi-val { color: #2563EB; }
.iae-kpi.gold    .iae-kpi-val { color: #B45309; }
.iae-kpi.verde   .iae-kpi-val { color: #166534; }
.iae-kpi.naranja .iae-kpi-val { color: #92400E; }
.iae-kpi.rojo    .iae-kpi-val { color: #991B1B; }

/* ── Stacked task-state bar ── */
.iae-stack-wrap {
  display: flex; align-items: center; gap: 8px;
}
.iae-stack-bar {
  flex: 1; height: 11px; border-radius: 3px;
  overflow: hidden; background: #F1F5F9;
  display: flex; min-width: 70px;
}
.iae-seg-closed { background: #16A34A; }
.iae-seg-active { background: #2563EB; }
.iae-seg-new    { background: #94A3B8; }
.iae-seg-other  { background: #C084FC; }
.iae-stack-lbl  { font-size: 11px; font-weight: 600; color: var(--text2); white-space: nowrap; }

/* ── IAE dual bar ── */
.iae-bar-wrap {
  position: relative; height: 12px;
  background: #EFF6FF; border-radius: 3px;
  min-width: 80px;
}
.iae-bar-ghost {
  position: absolute; top: 0; left: 0; height: 100%;
  background: rgba(59,130,246,.18); border-radius: 3px;
}
.iae-bar-fill {
  position: absolute; top: 0; left: 0; height: 100%;
  border-radius: 3px;
}
.iae-bar-fill.verde   { background: #16A34A; }
.iae-bar-fill.naranja { background: #D97706; }
.iae-bar-fill.rojo    { background: #DC2626; }

/* ── Semáforo dot ── */
.iae-dot {
  display: inline-block; width: 9px; height: 9px;
  border-radius: 50%; flex-shrink: 0;
}
.iae-dot.verde   { background: #16A34A; }
.iae-dot.naranja { background: #D97706; }
.iae-dot.rojo    { background: #DC2626; }

/* ── Alert bar ── */
.iae-alert-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px;
  background: #FEF9EC; border: 1px solid #FDE68A;
  border-radius: var(--r-lg, 8px); margin-bottom: 20px; font-size: 13px;
}
.iae-alert-bar.ok { background: #F0FDF4; border-color: #BBF7D0; }
.iae-alert-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
}
.iae-alert-chip.critica     { background: #FEE2E2; color: #991B1B; }
.iae-alert-chip.advertencia { background: #FEF3C7; color: #92400E; }
.iae-alert-chip.info        { background: #DBEAFE; color: #1E40AF; }
.iae-alert-chip.resuelta    { background: #D1FAE5; color: #065F46; }

/* ── Collapsible ── */
.iae-collapsible { margin-bottom: 12px; border: 1px solid var(--border); border-radius: var(--r, 6px); overflow: hidden; }
.iae-col-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; cursor: pointer;
  background: var(--surface2, #F8FAFC); user-select: none;
  font-size: 13px; font-weight: 600;
}
.iae-col-header:hover { background: var(--surface); }
.iae-col-arrow { margin-left: auto; font-size: 11px; transition: transform .2s; }
.iae-col-arrow.open { transform: rotate(180deg); }
.iae-col-body { display: none; padding: 0 16px 14px; }
.iae-col-body.open { display: block; }

/* ── Task ID badges ── */
.iae-task-badge {
  display: inline-block; font-size: 10px; font-weight: 600; font-family: monospace;
  padding: 2px 7px; border-radius: 4px;
  background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;
  margin: 2px; cursor: default;
}

/* ── Anomaly tables ── */
.iae-anom-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.iae-anom-tbl th { background: var(--surface2); padding: 6px 10px; text-align: left; font-size: 11px; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--border); }
.iae-anom-tbl td { padding: 6px 10px; border-bottom: 1px solid var(--border2, #F1F5F9); vertical-align: top; }
.iae-anom-tbl tr:last-child td { border-bottom: none; }
.iae-anom-tbl .num { text-align: right; }

/* ── Initiative block within collapsible ── */
.iae-ini-block { margin-bottom: 12px; padding: 10px 12px; background: var(--surface2); border-radius: 6px; }
.iae-ini-block-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 600; }
.iae-ini-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.iae-ini-badge.verde   { background: #DCFCE7; color: #166534; }
.iae-ini-badge.naranja { background: #FEF3C7; color: #92400E; }
.iae-ini-badge.rojo    { background: #FEE2E2; color: #991B1B; }


/* ── Main table ── */
.iae-main-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.iae-main-tbl th { background: var(--surface2); padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
.iae-main-tbl td { padding: 9px 12px; border-bottom: 1px solid var(--border2, #F1F5F9); vertical-align: middle; }
.iae-main-tbl tr:last-child td { border-bottom: none; }
.iae-main-tbl tr:hover td { background: var(--surface2); }
.iae-main-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.iae-drill { cursor: pointer; }
.iae-drill:hover .iae-ini-name-txt { text-decoration: underline; }

/* ── Legend ── */
.iae-legend-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.iae-legend-sect { font-size: 12px; line-height: 1.8; }
.iae-legend-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 6px; }
.iae-formula-box { font-family: monospace; font-size: 12px; background: var(--surface2); border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; line-height: 1.6; }

/* ── Delivery date filter in IAE ── */
.iae-delivery-filter {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}

@media (max-width: 700px) {
  .iae-kpi-strip    { grid-template-columns: repeat(2, 1fr); }
  .iae-legend-grid  { grid-template-columns: 1fr; }
}
</style>`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _fmt1(n) { return (n || 0).toFixed(1); }

function _iaeBar(pct_tareas, iae, sem) {
  const gw = Math.min(100, pct_tareas).toFixed(1);
  const fw = Math.min(100, iae).toFixed(1);
  return `<div class="iae-bar-wrap" title="%Tareas: ${_fmt1(pct_tareas)}%  IAE: ${_fmt1(iae)}%">
    <div class="iae-bar-ghost" style="width:${gw}%"></div>
    <div class="iae-bar-fill ${sem}" style="width:${fw}%"></div>
  </div>`;
}

function _iaeStackBar(total, cerradas, activas, nuevas, otros) {
  if (!total) return '<span style="color:var(--muted);font-size:11px">—</span>';
  const pC = (cerradas / total * 100).toFixed(1);
  const pA = (activas  / total * 100).toFixed(1);
  const pN = (nuevas   / total * 100).toFixed(1);
  const pO = (otros    / total * 100).toFixed(1);
  return `<div class="iae-stack-wrap" style="cursor:pointer"
    data-total="${total}" data-cerradas="${cerradas}" data-activas="${activas}" data-nuevas="${nuevas}" data-otros="${otros||0}"
    onmouseenter="showStackTip(event,this)" onmousemove="_posGanttTip(event)" onmouseleave="hideGanttTip()"
    onclick="pinStackTip(event,this)">
    <div class="iae-stack-bar" style="pointer-events:none">
      <div class="iae-seg-closed" style="width:${pC}%"></div>
      <div class="iae-seg-active" style="width:${pA}%"></div>
      <div class="iae-seg-new"    style="width:${pN}%"></div>
      ${otros ? `<div class="iae-seg-other" style="width:${pO}%"></div>` : ''}
    </div>
    <span class="iae-stack-lbl" style="pointer-events:none">${cerradas}/${total}</span>
  </div>`;
}

// ─── ALERT BAR ────────────────────────────────────────────────────────────────

function _renderAlertBar(alertas) {
  const activas    = alertas.filter(a => ['nueva','activa'].includes(a.estado));
  const criticas   = activas.filter(a => a.tipo === 'TASKS_ABIERTAS_CRITICO').length;
  const advertencias = activas.filter(a => a.tipo === 'HORAS_PLACEHOLDER').length;
  const infos      = activas.filter(a => a.tipo === 'ZERO_ESTIMATE').length;
  const resueltas  = alertas.filter(a => a.estado === 'resuelta').length;
  const nuevas     = alertas.filter(a => a.estado === 'nueva').length;
  if (!activas.length) {
    return `<div class="iae-alert-bar ok">
      <span>✅</span>
      <span style="font-weight:600">Sin alertas activas</span>
      <span style="color:var(--muted)">Todos los indicadores dentro de los parámetros esperados.</span>
    </div>`;
  }
  return `<div class="iae-alert-bar">
    <span>⚠️</span>
    <span style="font-weight:600;margin-right:4px">${activas.length} alerta${activas.length!==1?'s':''} activa${activas.length!==1?'s':''}</span>
    ${criticas     ? `<span class="iae-alert-chip critica">${criticas} crítica${criticas!==1?'s':''}</span>` : ''}
    ${advertencias ? `<span class="iae-alert-chip advertencia">${advertencias} advertencia${advertencias!==1?'s':''}</span>` : ''}
    ${infos        ? `<span class="iae-alert-chip info">${infos} info</span>` : ''}
    ${resueltas    ? `<span class="iae-alert-chip resuelta">${resueltas} resuelta${resueltas!==1?'s':''}</span>` : ''}
    ${nuevas > 0   ? `<span style="font-size:11px;color:#991B1B;font-weight:600;margin-left:4px">· ${nuevas} nueva${nuevas!==1?'s':''}</span>` : ''}
    <span style="margin-left:auto;font-size:11px;color:var(--muted)">Ver panel de anomalías ↓</span>
  </div>`;
}

// ─── ANOMALY PANEL ───────────────────────────────────────────────────────────

function _renderCollapsible(id, icon, title, count, sevColor, bodyHtml) {
  return `
  <div class="iae-collapsible" id="iae-col-${id}">
    <div class="iae-col-header" onclick="_iaeToggleCol('${id}')">
      <span>${icon}</span>
      <span>${title}</span>
      <span class="iae-alert-chip ${sevColor}" style="margin-left:4px">${count} task${count!==1?'s':''}</span>
      <span class="iae-col-arrow" id="iae-col-arr-${id}">▼</span>
    </div>
    <div class="iae-col-body" id="iae-col-body-${id}">${bodyHtml}</div>
  </div>`;
}

function _renderCriticalOpenSection(critical_open, alertasMap) {
  if (!critical_open.length) return _renderCollapsible('critical', '🔴', 'Tasks abiertas en iniciativas críticas (IAE &lt; 70%)', 0, 'critica', '<p style="color:var(--muted);font-size:13px;padding:8px 0">Sin anomalías ✓</p>');
  const byIni = {};
  for (const t of critical_open) {
    if (!byIni[t.id_iniciativa]) byIni[t.id_iniciativa] = { nombre: t.nombre_iniciativa, tasks: [] };
    byIni[t.id_iniciativa].tasks.push(t);
  }
  let html = '<div style="padding-top:10px">';
  for (const [id_ini, data] of Object.entries(byIni)) {
    const alerta = alertasMap[`TASKS_ABIERTAS_CRITICO::${id_ini}`];
    const iaeVal = alerta ? _fmt1(alerta.iae) + '%' : '—';
    const sem    = alerta && alerta.iae >= 85 ? 'verde' : alerta && alerta.iae >= 70 ? 'naranja' : 'rojo';
    html += `<div class="iae-ini-block">
      <div class="iae-ini-block-hdr">
        <span class="iae-dot ${sem}"></span>
        <span style="flex:1">${data.nombre}</span>
        <span class="iae-ini-badge ${sem}">IAE ${iaeVal}</span>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:5px">${data.tasks.length} task${data.tasks.length!==1?'s':''} sin cerrar — IDs en ADO:</div>
        <div>${data.tasks.map(t => `<span class="iae-task-badge" title="${t.nombre_task||''}">#${t.id_task}</span>`).join('')}</div>
      </div>
    </div>`;
  }
  html += '</div>';
  return _renderCollapsible('critical', '🔴', 'Tasks abiertas en iniciativas críticas (IAE &lt; 70%)', critical_open.length, 'critica', html);
}

function _renderPlaceholderSection(placeholder, alertasMap) {
  if (!placeholder.length) return _renderCollapsible('placeholder', '🟠', 'Horas placeholder (&ge; 100h por task)', 0, 'advertencia', '<p style="color:var(--muted);font-size:13px;padding:8px 0">Sin anomalías ✓</p>');
  const byIni = {};
  for (const t of placeholder) {
    if (!byIni[t.id_iniciativa]) byIni[t.id_iniciativa] = { nombre: t.nombre_iniciativa, tasks: [] };
    byIni[t.id_iniciativa].tasks.push(t);
  }
  let html = '<div style="padding-top:10px"><table class="iae-anom-tbl"><thead><tr><th>#ID ADO</th><th>Task</th><th>Iniciativa</th><th class="num">H.Est.</th><th class="num">H.Ejec.</th><th>Estado</th></tr></thead><tbody>';
  for (const t of placeholder) {
    html += `<tr>
      <td><span class="iae-task-badge">#${t.id_task}</span></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(t.nombre_task||'').replace(/"/g,"'")}">${t.nombre_task||'—'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.nombre_iniciativa||'—'}</td>
      <td class="num" style="color:#B45309;font-weight:600">${_fmt1(t.horas_estimadas)}h</td>
      <td class="num">${_fmt1(t.horas_completadas)}h</td>
      <td><span style="font-size:11px;color:var(--muted)">${t.estado||'—'}</span></td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  return _renderCollapsible('placeholder', '🟠', 'Horas placeholder (&ge; 100h por task)', placeholder.length, 'advertencia', html);
}

function _renderZeroEstSection(zero_estimate, alertasMap) {
  if (!zero_estimate.length) return _renderCollapsible('zero', 'ℹ️', 'Sin estimación con horas ejecutadas', 0, 'info', '<p style="color:var(--muted);font-size:13px;padding:8px 0">Sin anomalías ✓</p>');
  const byIni = {};
  for (const t of zero_estimate) {
    if (!byIni[t.id_iniciativa]) byIni[t.id_iniciativa] = { nombre: t.nombre_iniciativa, tasks: [] };
    byIni[t.id_iniciativa].tasks.push(t);
  }
  let html = '<div style="padding-top:10px"><table class="iae-anom-tbl"><thead><tr><th>#ID ADO</th><th>Task</th><th>Iniciativa</th><th class="num">H.Ejec.</th><th>Estado</th></tr></thead><tbody>';
  for (const t of zero_estimate) {
    html += `<tr>
      <td><span class="iae-task-badge">#${t.id_task}</span></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(t.nombre_task||'').replace(/"/g,"'")}">${t.nombre_task||'—'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.nombre_iniciativa||'—'}</td>
      <td class="num">${_fmt1(t.horas_completadas)}h</td>
      <td><span style="font-size:11px;color:var(--muted)">${t.estado||'—'}</span></td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  return _renderCollapsible('zero', 'ℹ️', 'Sin estimación con horas ejecutadas', zero_estimate.length, 'info', html);
}

// ─── MAIN TABLE ───────────────────────────────────────────────────────────────

function _renderMainTable(iniciativas) {
  if (!iniciativas.length) return '<p style="color:var(--muted);padding:12px">No hay datos aún. Carga un CSV primero.</p>';

  const canDrill = typeof USER !== 'undefined' && USER?.perfil !== 'visor';
  const total = iniciativas.length;

  const rows = iniciativas.map(r => {
    const sem = r.semaforo;
    const drillAttr = canDrill ? `onclick="openIniTasks('${r.id_iniciativa}')" title="Ver tasks de esta iniciativa"` : '';
    const semColor = sem === 'verde' ? '#166534' : sem === 'naranja' ? '#B45309' : '#991B1B';
    return `<tr class="iae-tbl-row${canDrill ? ' iae-drill' : ''}" data-nombre="${(r.nombre||'').toLowerCase()}" ${drillAttr}>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="iae-dot ${sem}" style="flex-shrink:0"></span>
          <span class="iae-ini-name-txt" style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.nombre}">${r.nombre}</span>
          ${canDrill ? '<span style="font-size:10px;color:var(--muted);flex-shrink:0">›</span>' : ''}
        </div>
      </td>
      <td style="min-width:130px">${_iaeStackBar(r.total_tasks, r.cerradas, r.activas, r.nuevas, r.otros)}</td>
      <td class="num" style="font-weight:700;color:#2563EB">${_fmt1(r.pct_tareas)}%</td>
      <td class="num" style="color:var(--muted)">${r.h_est ? _fmt1(r.h_est)+'h' : '—'}</td>
      <td class="num" style="color:var(--muted)">${r.h_ejec ? _fmt1(r.h_ejec)+'h' : '—'}</td>
      <td class="num" style="color:${r.pct_horas > 100 ? '#DC2626' : 'var(--muted)'};font-weight:${r.pct_horas > 100 ? '700' : '400'}">${r.h_est ? _fmt1(r.pct_horas)+'%' : '—'}</td>
      <td class="num" style="font-weight:800;font-size:13px;color:${semColor}">${_fmt1(r.iae)}%</td>
      <td style="min-width:100px">${_iaeBar(r.pct_tareas, r.iae, sem)}</td>
    </tr>`;
  }).join('');

  const legend = `<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap;font-size:11px;color:var(--muted)">
    <span><span style="display:inline-block;width:9px;height:9px;background:#16A34A;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Cerradas</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#2563EB;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Activas</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#94A3B8;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Nuevas</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#C084FC;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Otros</span>
    <span style="margin-left:6px"><span style="display:inline-block;width:20px;height:9px;background:rgba(59,130,246,.18);border-radius:2px;vertical-align:middle;margin-right:3px"></span>%Tareas · sólido = IAE · brecha = penalización</span>
  </div>`;

  return `
  <!-- Barra de búsqueda -->
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
    <div style="position:relative;flex:1;min-width:180px;max-width:360px">
      <svg style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--muted);pointer-events:none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="iae-search" type="text" placeholder="Buscar iniciativa…"
        oninput="_iaeFilterRows(this.value)"
        style="width:100%;padding:7px 30px 7px 30px;border:1.5px solid var(--border2);border-radius:var(--r);font-family:var(--font);font-size:12px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;transition:border-color .15s"
        onfocus="this.style.borderColor='var(--blue-el)'" onblur="this.style.borderColor='var(--border2)'">
      <button id="iae-search-clear" onclick="_iaeClearSearch()" style="display:none;position:absolute;right:7px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;color:var(--muted);font-size:15px;line-height:1;padding:2px 4px">×</button>
    </div>
    <span id="iae-row-count" style="font-size:11px;font-weight:600;color:var(--muted);background:var(--surface2);border:1px solid var(--border2);padding:4px 10px;border-radius:20px;white-space:nowrap">${total} iniciativa${total !== 1 ? 's' : ''}</span>
  </div>

  <!-- Tabla con scroll y header sticky -->
  <div style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
    <div style="overflow-x:auto;overflow-y:auto;max-height:520px">
      <table class="iae-main-tbl" id="iae-main-tbl" style="min-width:680px">
        <thead id="iae-tbl-head" style="position:sticky;top:0;z-index:3">
          <tr>
            <th style="background:var(--surface2);border-bottom:1.5px solid var(--border)">
              Iniciativa ${canDrill ? '<span style="font-size:9px;font-weight:400;opacity:.55">· clic para ver tasks</span>' : ''}
            </th>
            <th style="min-width:130px;background:var(--surface2);border-bottom:1.5px solid var(--border)">Tasks por estado</th>
            <th class="num" style="background:var(--surface2);border-bottom:1.5px solid var(--border)">%Tareas</th>
            <th class="num" style="background:var(--surface2);border-bottom:1.5px solid var(--border)">H.Est.</th>
            <th class="num" style="background:var(--surface2);border-bottom:1.5px solid var(--border)">H.Ejec.</th>
            <th class="num" style="background:var(--surface2);border-bottom:1.5px solid var(--border)">%Horas</th>
            <th class="num" style="background:var(--surface2);border-bottom:1.5px solid var(--border)">IAE</th>
            <th style="min-width:100px;background:var(--surface2);border-bottom:1.5px solid var(--border)">%Tareas vs IAE</th>
          </tr>
        </thead>
        <tbody id="iae-tbl-body">${rows}</tbody>
      </table>
    </div>
    <!-- Fila vacía si búsqueda no encuentra resultados -->
    <div id="iae-no-results" style="display:none;padding:28px;text-align:center;color:var(--muted);font-size:13px">
      🔍 Sin resultados para "<span id="iae-no-results-q"></span>"
    </div>
  </div>
  ${legend}`;
}

// ─── FILTRO DE TABLA IAE ──────────────────────────────────────────────────────

function _iaeFilterRows(val) {
  const q = (val || '').toLowerCase().trim();
  const rows   = document.querySelectorAll('#iae-tbl-body .iae-tbl-row');
  const countEl  = document.getElementById('iae-row-count');
  const clearEl  = document.getElementById('iae-search-clear');
  const noRes    = document.getElementById('iae-no-results');
  const noResQ   = document.getElementById('iae-no-results-q');
  const tblWrap  = document.querySelector('#iae-main-tbl')?.parentElement;

  let visible = 0;
  rows.forEach(row => {
    const match = !q || row.dataset.nombre.includes(q);
    row.style.display = match ? '' : 'none';
    if (match) visible++;
  });

  const total = rows.length;
  if (countEl) countEl.textContent = q
    ? `${visible} de ${total} iniciativa${total !== 1 ? 's' : ''}`
    : `${total} iniciativa${total !== 1 ? 's' : ''}`;
  if (clearEl) clearEl.style.display = val ? '' : 'none';
  if (noRes) {
    const empty = visible === 0 && q;
    noRes.style.display = empty ? '' : 'none';
    if (tblWrap) tblWrap.style.display = empty ? 'none' : '';
    if (noResQ && empty) noResQ.textContent = val;
  }
}

function _iaeClearSearch() {
  const inp = document.getElementById('iae-search');
  if (inp) { inp.value = ''; inp.focus(); }
  _iaeFilterRows('');
}

// ─── RENDER VIEW ─────────────────────────────────────────────────────────────

function _renderIAEView(resumen, anomalias, alertas) {
  const { kpis, iniciativas } = resumen;
  const { placeholder, zero_estimate, critical_open } = anomalias;
  const alertasMap = {};
  for (const a of alertas) alertasMap[`${a.tipo}::${a.id_iniciativa}`] = a;
  const totalAnomalias = placeholder.length + zero_estimate.length + critical_open.length;

  return `
  ${IAE_STYLES}
  <div class="iae-root">

    <!-- Topbar -->
    <div class="topbar" style="margin-bottom:20px">
      <div>
        <div class="page-title">Índice de Avance Efectivo (IAE)</div>
        <div class="page-sub">Avance por tareas · eficiencia de horas · cronograma de entrega</div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;align-items:center">
        <button class="btn-sec" onclick="document.getElementById('modal-iae-metodologia').classList.add('show')"
          style="display:flex;align-items:center;gap:6px;font-size:12px">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          Metodología
        </button>
        <button class="btn-sec" onclick="loadIAE()" style="display:flex;align-items:center;gap:5px;font-size:12px">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          Actualizar
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="iae-kpi-strip">
      <div class="iae-kpi blue">
        <div class="iae-kpi-label">% Avance por Tareas</div>
        <div class="iae-kpi-val">${_fmt1(kpis.pct_tareas)}%</div>
        <div class="iae-kpi-sub">Tasks cerradas / tasks planificadas</div>
      </div>
      <div class="iae-kpi gold">
        <div class="iae-kpi-label">% Ejecución de Horas</div>
        <div class="iae-kpi-val">${_fmt1(kpis.pct_horas)}%</div>
        <div class="iae-kpi-sub">Horas ejecutadas / horas estimadas</div>
      </div>
      <div class="iae-kpi ${kpis.semaforo}">
        <div class="iae-kpi-label">IAE Global</div>
        <div class="iae-kpi-val">${_fmt1(kpis.iae)}%</div>
        <div class="iae-kpi-sub">${kpis.semaforo==='verde'?'✅ En Control':kpis.semaforo==='naranja'?'⚠️ Advertencia':'🔴 Crítico'} · ${iniciativas.length} iniciativas</div>
      </div>
    </div>

    <!-- Alert bar -->
    ${_renderAlertBar(alertas)}

    <!-- Anomaly panel -->
    ${totalAnomalias > 0 ? `
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-hdr">
        <div class="panel-title">Panel de Anomalías de Datos</div>
        <div class="panel-badge" style="background:#FEF2F2;color:#7F1D1D;border-color:#FECACA">${totalAnomalias} tarea${totalAnomalias!==1?'s':''} con anomalía${totalAnomalias!==1?'s':''}</div>
      </div>
      <div class="panel-body">
        <p style="font-size:12px;color:var(--muted);margin:0 0 14px">Corrígelas en ADO usando los IDs listados y recarga el CSV.</p>
        ${_renderCriticalOpenSection(critical_open, alertasMap)}
        ${_renderPlaceholderSection(placeholder, alertasMap)}
        ${_renderZeroEstSection(zero_estimate, alertasMap)}
      </div>
    </div>` : ''}

    <!-- Main table -->
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-hdr">
        <div class="panel-title">Rendimiento por Iniciativa</div>
        <div class="panel-badge">ordenado por IAE · peores primero</div>
      </div>
      <div class="panel-body">${_renderMainTable(iniciativas)}</div>
    </div>

    <!-- Delivery Plan -->
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-hdr">
        <div class="panel-title">Delivery Plan · Cronograma</div>
        <div class="iae-delivery-filter">
          <div class="avance-date-group">
            <span class="avance-date-lbl">Desde</span>
            <input type="date" id="iae-desde" class="avance-date-input">
          </div>
          <span style="color:var(--muted);font-size:13px">→</span>
          <div class="avance-date-group">
            <span class="avance-date-lbl">Hasta</span>
            <input type="date" id="iae-hasta" class="avance-date-input">
          </div>
          <button class="avance-filter-btn" onclick="_iaeApplyDelivery()">Aplicar</button>
          <button class="avance-filter-btn avance-filter-btn-clear" onclick="_iaeClearDelivery()">Limpiar</button>
        </div>
      </div>
      <div class="panel-body" id="iae-delivery-content"><div class="loader">Cargando cronograma…</div></div>
    </div>

  </div>`;
}

// ─── PUBLIC: loadIAE ─────────────────────────────────────────────────────────

async function loadIAE() {
  const root = document.getElementById('iae-root');
  if (!root) return;
  root.innerHTML = '<div class="loader">Cargando IAE…</div>';
  try {
    const [resumen, anomalias, alertas, avance] = await Promise.all([
      api('/api/iae/resumen'),
      api('/api/iae/anomalias'),
      api('/api/iae/alertas'),
      api('/api/datos/avance-iniciativas')
    ]);

    _iaeAvanceCache = avance;
    // Pasar datos a la caché de avance para que openIniTasks funcione desde IAE
    if (typeof _cacheAvance !== 'undefined') _cacheAvance = avance;

    root.innerHTML = _renderIAEView(resumen, anomalias, alertas);

    // Renderizar Delivery Plan en el div que acaba de aparecer
    renderDeliveryPlan(avance, null, null, 'iae-delivery-content');

    // Badge del nav
    const nuevas = alertas.filter(a => a.estado === 'nueva').length;
    const badge  = document.getElementById('nav-iae-badge');
    if (badge) {
      badge.textContent  = nuevas;
      badge.style.display = nuevas > 0 ? '' : 'none';
    }
  } catch (e) {
    root.innerHTML = `<div style="padding:24px;color:var(--danger,#DC2626)">Error cargando IAE: ${e.message || e}</div>`;
  }
}

// ─── DELIVERY PLAN FILTERS ───────────────────────────────────────────────────

function _iaeApplyDelivery() {
  const desde = document.getElementById('iae-desde')?.value;
  const hasta  = document.getElementById('iae-hasta')?.value;
  if (!desde || !hasta) { toast('Selecciona fecha desde y hasta', 'err'); return; }
  if (desde > hasta)    { toast('La fecha "desde" debe ser anterior a "hasta"', 'err'); return; }
  renderDeliveryPlan(_iaeAvanceCache || [], desde, hasta, 'iae-delivery-content');
}

function _iaeClearDelivery() {
  const d = document.getElementById('iae-desde');
  const h = document.getElementById('iae-hasta');
  if (d) d.value = '';
  if (h) h.value = '';
  renderDeliveryPlan(_iaeAvanceCache || [], null, null, 'iae-delivery-content');
}

// ─── COLLAPSIBLE + ALERT ACTIONS ─────────────────────────────────────────────

function _iaeToggleCol(id) {
  const body = document.getElementById(`iae-col-body-${id}`);
  const arr  = document.getElementById(`iae-col-arr-${id}`);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (arr) arr.classList.toggle('open', isOpen);
}


