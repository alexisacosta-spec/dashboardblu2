// ─── AVANCE / DELIVERY ────────────────────────────────────────────────────────

async function loadAvance() {
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
  elDesde.classList.remove('input-error');
  elHasta.classList.remove('input-error');
  if (errEl) errEl.style.display = 'none';

  const desde = elDesde.value;
  const hasta  = elHasta.value;
  if (!desde || !hasta) { toast('Selecciona fecha desde y hasta', 'err'); return; }
  if (desde > hasta) {
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
      emptyState('Sin datos de avance','Ve a <strong>Admin → Cargar Excel</strong> y sube el archivo para ver el avance de iniciativas.','📈');
    document.getElementById('delivery-content').innerHTML =
      emptyState('Sin datos de fechas','Carga el Excel para ver el Delivery Plan con las fechas de inicio y fin.','📅');
    return;
  }
  const hdr = `<div class="avance-hdr-row av-g">
    <span class="av-col-h">Iniciativa</span>
    <span class="av-col-h">Progreso</span>
    <span class="av-col-h num">%</span>
    <span class="av-col-h num">Tasks</span>
    <span class="av-col-h num">Horas</span>
    <span class="av-col-h num">Estado</span>
  </div>`;

  const rowsHtml = sorted.map(r => {
    const fillColor = r.pct >= 100 ? '#3B5EA6' : r.pct >= 85 ? '#2D7A4F' : r.pct >= 70 ? '#8C6A1A' : '#8C2A2A';
    const tag = r.pct >= 100
      ? '<span class="av-tag av-done">Completa</span>'
      : r.pct >= 85 ? '<span class="av-tag av-prog">En curso</span>'
      : r.pct >= 70 ? '<span class="av-tag av-risk">Atención</span>'
      : '<span class="av-tag av-late">Rezago</span>';
    const pendientes   = r.total - r.cerradas;
    const conDrilldown = USER.perfil !== 'visor';
    return `<div class="avance-row av-g${conDrilldown ? ' avance-row-clickable' : ''}"
               ${conDrilldown ? `onclick="openIniTasks('${esc(r.id)}')"` : ''}
               title="${conDrilldown
                 ? `Ver ${fmtN(pendientes)} task${pendientes!==1?'s':''} pendiente${pendientes!==1?'s':''} · ${fmtN(r.cerradas)} cerrada${r.cerradas!==1?'s':''}`
                 : esc(r.nombre)}">
      <div>
        <div class="av-ini-name" style="display:flex;align-items:center;gap:5px">
          <span title="${r.nombre}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.nombre}</span>
          ${conDrilldown ? '<span class="av-drill-hint">›</span>' : ''}
        </div>
        <div class="av-ini-cat">${r.categoria}</div>
      </div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${r.pct}%;background:${fillColor}"></div></div>
      <div class="av-pct" style="color:${fillColor}">${r.pct}%</div>
      <div class="av-tasks">${fmtN(r.cerradas)} / ${fmtN(r.total)}</div>
      <div class="av-horas">${r.horas > 0
        ? `<span style="font-size:11px;font-weight:600;color:${r.horas > r.horas_est && r.horas_est > 0 ? '#BA7517' : 'var(--text)'}">${fmtN(Math.round(r.horas))}h</span>${r.horas_est > 0 ? `<span style="font-size:9px;color:var(--muted);display:block">/ ${fmtN(Math.round(r.horas_est))}h est</span>` : ''}`
        : '<span style="font-size:11px;color:var(--muted)">—</span>'}</div>
      <div>${tag}</div>
    </div>`;
  }).join('');

  document.getElementById('avance-ini-content').innerHTML = `<div style="padding-top:4px">${hdr}${rowsHtml}</div>`;
}

// ─── DRILLDOWN DE TASKS POR INICIATIVA ───────────────────────────────────────
let _iniTasksId  = null;
let _iniTasksTab = 'pendientes';

function openIniTasks(idIni) {
  if (USER.perfil === 'visor') return;
  const r = (_cacheAvance || []).find(x => String(x.id) === String(idIni));
  if (!r) return;
  const nombre   = r.nombre;
  const categoria = r.categoria;
  _iniTasksId  = idIni;
  _iniTasksTab = (r.total - r.cerradas) > 0 ? 'pendientes' : 'cerradas';

  document.getElementById('ini-modal-nombre').textContent = nombre;
  const catEl = document.getElementById('ini-modal-cat');
  catEl.textContent = categoria;
  const tagEl = document.getElementById('ini-modal-tag');
  const pct = r.pct;
  if (pct >= 100) { tagEl.className='av-tag av-done';  tagEl.textContent='Completa'; }
  else if (pct >= 85) { tagEl.className='av-tag av-prog'; tagEl.textContent='En curso'; }
  else if (pct >= 70) { tagEl.className='av-tag av-risk'; tagEl.textContent='Atención'; }
  else                { tagEl.className='av-tag av-late'; tagEl.textContent='Rezago';  }

  const pendientes = r.total - r.cerradas;
  const otros = r.otros || 0;
  const fillColor = pct >= 100 ? '#3B5EA6' : pct >= 85 ? '#2D7A4F' : pct >= 70 ? '#8C6A1A' : '#8C2A2A';
  document.getElementById('ini-modal-kpis').innerHTML = `
    <div class="ini-kpi-item">
      <div class="ini-kpi-val" style="color:${fillColor}">${pct}%</div>
      <div class="ini-kpi-lbl">Avance</div>
    </div>
    <div class="ini-kpi-sep"></div>
    <div class="ini-kpi-item">
      <div class="ini-kpi-val" style="color:#2D7A4F">${fmtN(r.cerradas)}</div>
      <div class="ini-kpi-lbl">Cerradas</div>
    </div>
    <div class="ini-kpi-item">
      <div class="ini-kpi-val" style="color:#BA7517">${fmtN(r.activas||0)}</div>
      <div class="ini-kpi-lbl">Activas</div>
    </div>
    <div class="ini-kpi-item">
      <div class="ini-kpi-val" style="color:#5A6E8A">${fmtN(r.nuevas||0)}</div>
      <div class="ini-kpi-lbl">Nuevas</div>
    </div>
    ${otros > 0 ? `
    <div class="ini-kpi-item">
      <div class="ini-kpi-val" style="color:#7C5CBF">${fmtN(otros)}</div>
      <div class="ini-kpi-lbl">Otros estados</div>
    </div>` : ''}
    <div class="ini-kpi-sep"></div>
    <div class="ini-kpi-item">
      <div class="ini-kpi-val">${fmtN(r.total)}</div>
      <div class="ini-kpi-lbl">Total</div>
    </div>
    <div class="ini-kpi-item ini-kpi-pend">
      <div class="ini-kpi-val">${fmtN(pendientes)}</div>
      <div class="ini-kpi-lbl">Pendientes</div>
    </div>`;

  document.getElementById('ini-tab-pend').textContent = `Pendientes (${fmtN(pendientes)})`;
  document.getElementById('ini-tab-cerr').textContent = `Cerradas (${fmtN(r.cerradas)})`;

  switchIniTasksTab(_iniTasksTab);

  document.getElementById('modal-iniciativa-tasks').classList.add('show');
}

function switchIniTasksTab(tab) {
  _iniTasksTab = tab;
  document.getElementById('ini-tab-pend').classList.toggle('active', tab === 'pendientes');
  document.getElementById('ini-tab-cerr').classList.toggle('active', tab === 'cerradas');
  loadIniTasks(_iniTasksId, tab);
}

async function loadIniTasks(idIni, tab) {
  const tbody = document.getElementById('ini-tasks-tbody');
  const thead = document.getElementById('ini-tasks-thead');
  const COLS = 7;
  tbody.innerHTML = `<tr><td colspan="${COLS}"><div class="loader">Cargando…</div></td></tr>`;

  const esCerradas = tab === 'cerradas';
  thead.innerHTML = `<tr>
    <th style="width:80px">ID</th>
    <th style="width:100px">Sprint</th>
    <th>Task</th>
    <th>Asignado a</th>
    <th class="num" style="width:72px">H. Est.</th>
    <th class="num" style="width:72px">H. Comp.</th>
    <th style="width:110px">Estado</th>
  </tr>`;

  try {
    const rows = await api(`/api/datos/iniciativa/${encodeURIComponent(idIni)}/tasks-seguimiento?tab=${tab}`);

    if (!rows.length) {
      const msg  = esCerradas ? 'No hay tasks cerradas aún' : '¡Todas las tasks están cerradas! 🎉';
      const hint = esCerradas
        ? 'Las tasks cerradas aparecerán aquí al actualizar el CSV.'
        : 'Esta iniciativa no tiene tasks pendientes.';
      tbody.innerHTML = `<tr><td colspan="${COLS}">${emptyState(msg, hint, esCerradas ? '📋' : '🎉')}</td></tr>`;
      return;
    }

    const STATE_BADGE = {
      'Active':          '<span class="ini-estado-badge ini-estado-active">Active</span>',
      'New':             '<span class="ini-estado-badge ini-estado-new">New</span>',
      'Closed':          '<span class="ini-estado-badge ini-estado-closed">Closed</span>',
      'Resolved':        '<span class="ini-estado-badge ini-estado-resolved">Resolved</span>',
      'Returned':        '<span class="ini-estado-badge ini-estado-returned">Returned</span>',
      'Ready_to_Deploy': '<span class="ini-estado-badge ini-estado-deploy">Ready to Deploy</span>',
    };

    const fmtH = h => h > 0 ? `${Math.round(h * 10) / 10}h` : '<span class="muted">—</span>';

    tbody.innerHTML = rows.map(t => {
      const badge       = STATE_BADGE[t.estado] || `<span class="ini-estado-badge ini-estado-other">${t.estado||'—'}</span>`;
      const sprintLabel = t.sprint || '<span class="muted" style="font-size:11px">—</span>';
      const persona     = t.nombre_persona
        ? `<div style="font-size:12px;font-weight:500">${t.nombre_persona}</div><div style="font-size:10px;color:var(--muted)">${t.empresa && t.empresa !== 'Sin asignar' ? t.empresa : ''}</div>`
        : '<span class="muted" style="font-size:11px">Sin asignar</span>';
      const taskIdCell  = t.id_task
        ? `<span style="font-size:11px;font-weight:600;color:var(--blue-el);font-family:monospace">#${t.id_task}</span>`
        : '<span class="muted">—</span>';
      const taskName    = t.nombre_task
        ? `<div style="font-size:12px;font-weight:500;line-height:1.35">${t.nombre_task}</div>`
        : '<span class="muted" style="font-size:11px">Sin nombre</span>';

      return `<tr>
        <td style="white-space:nowrap">${taskIdCell}</td>
        <td style="font-size:11px;color:var(--muted);white-space:nowrap">${sprintLabel}</td>
        <td>${taskName}</td>
        <td>${persona}</td>
        <td class="num" style="font-size:12px;color:var(--muted)">${fmtH(t.horas_estimadas)}</td>
        <td class="num" style="font-size:12px;font-weight:${t.horas_completadas > 0 ? '600' : '400'};color:${t.horas_completadas > 0 ? 'var(--text)' : 'var(--muted)'}">${fmtH(t.horas_completadas)}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="${COLS}"><div class="no-data">Error al cargar: ${e.message}</div></td></tr>`;
  }
}

// ─── DELIVERY PLAN ────────────────────────────────────────────────────────────
function renderDeliveryPlan(rows, filtroDesde, filtroHasta) {
  const sorted = [...rows]
    .filter(r => r.nombre !== 'SIN PARENT' && r.fecha_ini && r.fecha_fin)
    .sort((a,b) => new Date(a.fecha_ini) - new Date(b.fecha_ini));

  if (!sorted.length) {
    document.getElementById('delivery-content').innerHTML =
      emptyState('Sin datos de fechas disponibles','No hay iniciativas con fechas de inicio y fin registradas en el rango seleccionado.','📅');
    return;
  }

  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  let rangeStart, rangeEnd;
  if (filtroDesde && filtroHasta) {
    rangeStart = new Date(filtroDesde);
    rangeEnd   = new Date(filtroHasta);
  } else {
    const allIni = sorted.map(r => new Date(r.fecha_ini));
    const allFin = sorted.map(r => new Date(r.fecha_fin));
    rangeStart = new Date(Math.min(...allIni));
    rangeEnd   = new Date(Math.max(...allFin));
  }
  const dow = rangeStart.getDay();
  rangeStart.setDate(rangeStart.getDate() - (dow === 0 ? 6 : dow - 1));
  rangeStart.setHours(0,0,0,0);
  const dowE = rangeEnd.getDay();
  rangeEnd.setDate(rangeEnd.getDate() + (dowE === 0 ? 0 : 7 - dowE));
  rangeEnd.setHours(0,0,0,0);

  const rangeDays = (rangeEnd - rangeStart) / 86400000;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayPct = Math.min(100, Math.max(0, (today - rangeStart) / 86400000 / rangeDays * 100));

  const allDays = [];
  { let cur = new Date(rangeStart);
    while (cur < rangeEnd) { allDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  }

  const monthMap = new Map();
  for (const d of allDays) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { label: `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, days: [] });
    }
    monthMap.get(key).days.push(d);
  }
  const months = [...monthMap.values()];

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

  const vlines = allDays.map((d, i) => {
    if (i === 0) return '';
    const leftPct = (d - rangeStart) / 86400000 / rangeDays * 100;
    if (d.getDate() === 1) return `<div class="gantt-vline-month" style="left:${leftPct.toFixed(2)}%"></div>`;
    if (d.getDay() === 1)  return `<div class="gantt-vline-week"  style="left:${leftPct.toFixed(2)}%"></div>`;
    return '';
  }).join('');

  function clasificar(r) {
    const fin      = new Date(r.fecha_fin); fin.setHours(0,0,0,0);
    const diasRest = Math.round((fin - today) / 86400000);
    const pct      = r.pct || 0;
    if (pct >= 100) return { estado: 'Completada',              color: '#3B5EA6' };
    if (diasRest < 0) return { estado: `Atrasada ${Math.abs(diasRest)}d`, color: '#8C2A2A' };
    if (diasRest <= 14 && pct < 85) return { estado: `Riesgo · ${diasRest}d`, color: '#8C6A1A' };
    return { estado: `En tiempo · ${diasRest}d`, color: '#2D7A4F' };
  }

  const barsHtml = sorted.map(r => {
    const ini = new Date(r.fecha_ini);
    const fin = new Date(r.fecha_fin);
    const visStart = new Date(Math.max(ini.getTime(), rangeStart.getTime()));
    const visEnd   = new Date(Math.min(fin.getTime(), rangeEnd.getTime()));
    if (visStart > visEnd) return '';
    const left  = (visStart - rangeStart) / 86400000 / rangeDays * 100;
    const width = Math.max(0.5, (visEnd - visStart + 86400000) / 86400000 / rangeDays * 100);
    const dIni  = `${ini.getDate()} ${MES[ini.getMonth()]}`;
    const dFin  = `${fin.getDate()} ${MES[fin.getMonth()]}`;
    const cls   = clasificar(r);
    const ltDays = Math.round((fin - ini) / 86400000);

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
        <div class="gantt-bar"
          data-nombre="${esc(r.nombre)}"
          data-ini="${dIni}" data-fin="${dFin}"
          data-lt="${ltDays}" data-pct="${r.pct}"
          data-cerradas="${r.cerradas||0}" data-total="${r.total||0}"
          data-horas="${r.horas||0}" data-horas-est="${r.horas_est||0}"
          data-estado="${cls.estado}" data-color="${cls.color}"
          onmouseenter="showGanttTip(event,this)"
          onmousemove="_posGanttTip(event)"
          onmouseleave="hideGanttTip()"
          style="left:${left.toFixed(1)}%;width:${Math.max(width,1).toFixed(1)}%;background:${cls.color};opacity:0.88">
          <span class="gantt-bar-lbl">${dIni} — ${dFin} · ${r.pct}%${r.horas > 0 ? ` · ${fmtN(Math.round(r.horas))}h` : ''}</span>
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
