// ─── INDICADORES ──────────────────────────────────────────────────────────────

const IND_TABS = ['lt', 'bugs', 'rend'];
const IND_LABELS = {
  lt:   'Indicadores · Lead Time',
  bugs: 'Indicadores · Bugs',
  rend: 'Indicadores · Rendimiento'
};
const IND_SUBS = {
  lt:   'Métricas de proceso',
  bugs: 'Bugs reportados · Densidad · MTTR',
  rend: 'Precisión · Desvío · Velocidad · Burn-up'
};

function switchIndTab(tab) {
  _indActiveTab = tab;
  IND_TABS.forEach(t => {
    const panel = document.getElementById(`ind-panel-${t}`);
    const btn   = document.getElementById(`ind-tab-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
  VIEW_LABELS['indicadores'] = IND_LABELS[tab] || 'Indicadores';
  const bcLabel = document.getElementById('global-bc-label');
  if (bcLabel) bcLabel.textContent = VIEW_LABELS['indicadores'];
  const pageSub = document.querySelector('#view-indicadores .page-sub');
  if (pageSub) pageSub.textContent = IND_SUBS[tab] || '';
  if (tab === 'bugs') { loadBugsFiltros(); loadBugs(); }
  if (tab === 'rend') { loadRendFiltros(); loadRendimiento(); }
}

// ─── LEAD TIME ────────────────────────────────────────────────────────────────
async function loadIndicadores() {
  if (_indActiveTab !== 'lt') {
    switchIndTab(_indActiveTab);
    return;
  }
  document.getElementById('lt-tabla-content').innerHTML   = `<table class="tbl"><thead><tr><th>#</th><th>Iniciativa</th><th>Fecha inicio</th><th>Lead Time</th><th>Avance</th></tr></thead><tbody>${skelTable([24,180,80,60,80], 7)}</tbody></table>`;
  document.getElementById('lt-chart-dist-wrap').innerHTML = `<div style="height:180px;display:flex;align-items:center;justify-content:center"><span class="skel" style="width:80%;height:140px;border-radius:8px"></span></div>`;
  document.getElementById('lt-chart-bar-wrap').innerHTML  = `<div style="height:180px;display:flex;align-items:center;justify-content:center"><span class="skel" style="width:80%;height:140px;border-radius:8px"></span></div>`;
  document.getElementById('lt-kpi-total').textContent          = '—';
  document.getElementById('lt-kpi-prom').textContent           = '—';
  document.getElementById('lt-kpi-med').textContent            = '—';
  document.getElementById('lt-kpi-min').textContent            = '—';
  document.getElementById('lt-kpi-max').textContent            = '—';
  try {
    _ltData = await api('/api/indicadores/lead-time');
    if (!_ltData.iniciativas.length) {
      const es = emptyState('Sin datos de iniciativas','Ve a <strong>Admin → Cargar Excel</strong> para ver indicadores de Lead Time.','📊');
      ['lt-tabla-content','lt-chart-dist-wrap','lt-chart-bar-wrap'].forEach(id => {
        document.getElementById(id).innerHTML = es;
      });
      return;
    }
    renderLTKpis(_ltData.kpis);
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

  renderLTKpis(calcLTKpis(filtradas));

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

function sortLT(col) {
  _toggleSort(_sortLT, col);
  if (_ltData) _runLTFiltro();
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

  const thMapLT = { nombre:'th-lt-nombre', fecha_ini:'th-lt-ini', fecha_fin:'th-lt-fin',
                    lead_time:'th-lt-lt', pct:'th-lt-pct' };
  _applySortArrows('lt', _sortLT, Object.keys(thMapLT), thMapLT);
  const sorted = _sortRows(iniciativas, _sortLT);

  if (!sorted.length) {
    document.getElementById('lt-tabla-content').innerHTML =
      emptyState('Sin iniciativas','Prueba con otro texto de búsqueda o categoría.','🔍');
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

// ─── BUGS ─────────────────────────────────────────────────────────────────────
function buildBugsParams() {
  const ids = ['bug-fil-estado','bug-fil-ambiente','bug-fil-sprint','bug-fil-severity','bug-fil-categoria','bug-fil-iniciativa'];
  const keys = ['estado','ambiente','sprint','severity','categoria','iniciativa'];
  const p = [];
  ids.forEach((id, i) => {
    const v = document.getElementById(id)?.value || '';
    if (v) p.push(`${keys[i]}=${encodeURIComponent(v)}`);
  });
  return p.length ? '?' + p.join('&') : '';
}

async function loadBugsFiltros() {
  function repoblar(id, opciones, placeholder) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` + opciones;
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  try {
    const d = await api('/api/indicadores/bugs/filtros');
    repoblar('bug-fil-estado',     d.estados.map(v    => `<option value="${v}">${v}</option>`).join(''),                         'Todos los estados');
    repoblar('bug-fil-ambiente',   d.ambientes.map(v   => `<option value="${v}">${v}</option>`).join(''),                         'Todos los ambientes');
    repoblar('bug-fil-sprint',     d.sprints.map(v     => `<option value="${v}">${v}</option>`).join(''),                         'Todos los sprints');
    repoblar('bug-fil-severity',   d.severidades.map(v => `<option value="${v}">${v}</option>`).join(''),                         'Todas las severidades');
    repoblar('bug-fil-categoria',  d.categorias.map(v  => `<option value="${v}">${v}</option>`).join(''),                         'Todas las categorías');
    repoblar('bug-fil-iniciativa', d.iniciativas.map(i => `<option value="${i.id}">${i.nombre}</option>`).join(''),               'Todas las iniciativas');
  } catch(e) { console.warn('loadBugsFiltros:', e.message); }
}

function applyBugsFiltro() { loadBugs(); }

function clearBugsFiltros() {
  ['bug-fil-estado','bug-fil-ambiente','bug-fil-sprint','bug-fil-severity','bug-fil-categoria','bug-fil-iniciativa']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  loadBugs();
}

async function loadBugs() {
  const kpis = ['bug-kpi-total','bug-kpi-prod','bug-kpi-mttr','bug-kpi-ini','bug-kpi-criticos'];
  kpis.forEach(id => { document.getElementById(id).textContent = '—'; });
  document.getElementById('bug-mttr-content').innerHTML = `<div class="loader">Cargando…</div>`;
  document.getElementById('bug-cat-content').innerHTML  = `<div class="loader">Cargando…</div>`;

  const params = buildBugsParams();
  try {
    const [dProd, dIni, dSprint, dMttr, dSev, dCat, dDetalle] = await Promise.all([
      api(`/api/indicadores/bugs/produccion${params}`),
      api(`/api/indicadores/bugs/por-iniciativa${params}`),
      api(`/api/indicadores/bugs/por-sprint${params}`),
      api(`/api/indicadores/bugs/mttr${params}`),
      api(`/api/indicadores/bugs/severidad${params}`),
      api(`/api/indicadores/bugs/por-categoria${params}`),
      api(`/api/indicadores/bugs/detalle${params}`)
    ]);
    _bugsData = { raw: dDetalle.bugs };

    document.getElementById('bug-kpi-total').textContent    = dProd.total;
    document.getElementById('bug-kpi-prod').textContent     = dProd.enProduccion.reduce((s,r) => s+r.total, 0);
    document.getElementById('bug-kpi-mttr').textContent     = dMttr.total_cerrados > 0 ? dMttr.mttr_promedio + 'd' : '—';
    document.getElementById('bug-kpi-ini').textContent      = dIni.iniciativas.length;
    const critEl = document.getElementById('bug-kpi-criticos');
    critEl.textContent = dProd.criticos ?? '—';
    critEl.style.color = (dProd.criticos > 0) ? '#8C2A2A' : '#2D7A4F';

    renderBugProd(dProd);
    renderBugIni(dIni.iniciativas);
    renderBugSprint(dSprint.sprints);
    renderBugMttr(dMttr);
    renderBugSeveridad(dSev.severidades);
    renderBugCategoria(dCat.categorias);
  } catch(e) {
    ['bug-chart-prod-wrap','bug-chart-ini-wrap','bug-chart-sprint-wrap','bug-mttr-content','bug-chart-sev-wrap','bug-cat-content'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="no-data">Error: ${e.message}</div>`;
    });
  }
}

function renderBugProd(data) {
  const wrap = document.getElementById('bug-chart-prod-wrap');
  wrap.innerHTML = '<canvas id="chart-bug-prod"></canvas>';
  const ctx = document.getElementById('chart-bug-prod');
  if (chartBugProd) { chartBugProd.destroy(); chartBugProd = null; }

  if (!data.resumen.length) {
    wrap.innerHTML = emptyState('Sin bugs registrados','Carga un CSV con bugs para ver este panel.','🐛');
    return;
  }
  const ambColors = {'PRODUCCION':'#8C2A2A','EXTERNO_PRODUCCION':'#C05B2D','GSF':'#3B5EA6','CALIDAD':'#2D7A4F'};
  chartBugProd = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.resumen.map(r => r.ambiente || 'Sin ambiente'),
      datasets: [{ data: data.resumen.map(r => r.total),
        backgroundColor: data.resumen.map(r => ambColors[r.ambiente] || '#8FA3BE'),
        borderWidth: 2, borderColor: '#F2F5FA' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} bug${c.raw !== 1 ? 's' : ''}` } }
      }
    }
  });
}

function renderBugIni(iniciativas) {
  const wrap = document.getElementById('bug-chart-ini-wrap');
  wrap.innerHTML = '<canvas id="chart-bug-ini"></canvas>';
  const ctx = document.getElementById('chart-bug-ini');
  if (chartBugIni) { chartBugIni.destroy(); chartBugIni = null; }

  if (!iniciativas.length) {
    wrap.innerHTML = emptyState('Sin datos','Carga un CSV con bugs para ver este panel.','🐛');
    return;
  }
  const top = iniciativas.slice(0, 10);
  chartBugIni = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(r => r.nombre.length > 28 ? r.nombre.slice(0,28)+'…' : r.nombre),
      datasets: [{ label: 'Bugs', data: top.map(r => r.total_bugs),
        backgroundColor: '#C05B2D', borderRadius: 4, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => top[items[0].dataIndex].nombre,
          label: c => {
            const r = top[c.dataIndex];
            const den = r.densidad != null ? ` · densidad: ${r.densidad}` : '';
            return ` ${c.raw} bug${c.raw !== 1 ? 's' : ''}${den}`;
          }
        } }
      },
      scales: {
        x: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderBugSprint(sprints) {
  const wrap = document.getElementById('bug-chart-sprint-wrap');
  wrap.innerHTML = '<canvas id="chart-bug-sprint"></canvas>';
  const ctx = document.getElementById('chart-bug-sprint');
  if (chartBugSprint) { chartBugSprint.destroy(); chartBugSprint = null; }

  if (!sprints.length) {
    wrap.innerHTML = emptyState('Sin datos por sprint','El CSV no tiene columna Iteration Path.','📊');
    return;
  }
  chartBugSprint = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sprints.map(r => r.sprint),
      datasets: [
        { label: 'Cerrados', data: sprints.map(r => r.cerrados),
          backgroundColor: '#2D7A4F', borderRadius: 4, borderSkipped: false },
        { label: 'Abiertos', data: sprints.map(r => r.abiertos),
          backgroundColor: '#8C2A2A', borderRadius: 4, borderSkipped: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { mode: 'index' }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { stacked: true, grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, stepSize: 1 } }
      }
    }
  });
}

function renderBugMttr(data) {
  const el = document.getElementById('bug-mttr-content');
  if (!data.bugs.length) {
    el.innerHTML = emptyState('Sin bugs cerrados','No hay bugs con fecha de cierre registrada.','✅');
    return;
  }
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function fmtD(s) {
    if (!s) return '—';
    const d = new Date(s + 'T12:00:00');
    return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
  }
  const rows = data.bugs.map(r => {
    const color = r.dias > 14 ? '#8C2A2A' : r.dias > 7 ? '#8C6A1A' : '#2D7A4F';
    return `<tr>
      <td style="font-weight:600;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.titulo || r.id_bug}</td>
      <td class="muted" style="font-size:11px">${r.sprint || '—'}</td>
      <td class="muted" style="font-size:11px">${r.ambiente || '—'}</td>
      <td class="muted" style="white-space:nowrap;font-size:11px">${fmtD(r.created_date)}</td>
      <td class="muted" style="white-space:nowrap;font-size:11px">${fmtD(r.closed_date)}</td>
      <td style="white-space:nowrap">
        <span style="background:${color}18;color:${color};border:1px solid ${color}44;
          font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${r.dias}d</span>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">
      Mediana: <strong>${data.mttr_mediana}d</strong> &nbsp;·&nbsp; Promedio: <strong>${data.mttr_promedio}d</strong> &nbsp;·&nbsp; ${data.total_cerrados} bug${data.total_cerrados !== 1 ? 's' : ''} cerrado${data.total_cerrados !== 1 ? 's' : ''}
    </div>
    <div style="overflow-x:auto">
    <table class="tbl">
      <thead><tr>
        <th>Título</th><th>Sprint</th><th>Ambiente</th><th>Creado</th><th>Cerrado</th><th>Días</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function renderBugSeveridad(severidades) {
  const wrap = document.getElementById('bug-chart-sev-wrap');
  wrap.innerHTML = '<canvas id="chart-bug-sev"></canvas>';
  if (chartBugSev) { chartBugSev.destroy(); chartBugSev = null; }
  if (!severidades.length) {
    wrap.innerHTML = emptyState('Sin datos de severidad','El CSV necesita columna Severity.','📊');
    return;
  }
  const SEV_COLOR = { '1 - Critical':'#8C2A2A', '2 - High':'#C05B2D', '3 - Medium':'#8C6A1A', '4 - Low':'#3B5EA6' };
  const ctx = document.getElementById('chart-bug-sev');
  chartBugSev = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: severidades.map(r => r.severity),
      datasets: [
        { label: 'Abiertos', data: severidades.map(r => r.abiertos),
          backgroundColor: severidades.map(r => (SEV_COLOR[r.severity] || '#8FA3BE') + 'CC'),
          borderColor:     severidades.map(r =>  SEV_COLOR[r.severity] || '#8FA3BE'),
          borderWidth: 1, borderRadius: 4, borderSkipped: false },
        { label: 'Cerrados', data: severidades.map(r => r.cerrados),
          backgroundColor: '#2D7A4F55', borderColor: '#2D7A4F',
          borderWidth: 1, borderRadius: 4, borderSkipped: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { mode: 'index', callbacks: {
          afterBody: items => {
            const r = severidades[items[0].dataIndex];
            return r.mttr != null ? [`MTTR: ${r.mttr}d promedio`] : [];
          }
        }}
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

function renderBugCategoria(categorias) {
  const el = document.getElementById('bug-cat-content');
  if (!categorias.length) {
    el.innerHTML = emptyState('Sin datos por categoría','El CSV necesita columna Categoria_Bug.','📋');
    return;
  }
  const SEV_ORDER = ['1 - Critical','2 - High','3 - Medium','4 - Low'];
  const SEV_COLOR = { '1 - Critical':'#8C2A2A','2 - High':'#C05B2D','3 - Medium':'#8C6A1A','4 - Low':'#3B5EA6' };
  const SEV_LABEL = { '1 - Critical':'Crítico','2 - High':'Alto','3 - Medium':'Medio','4 - Low':'Bajo' };
  const sevsPresentes = [...new Set(categorias.flatMap(c => Object.keys(c.bySeverity)))].sort();

  const rows = categorias.map(c => {
    const sevCells = sevsPresentes.map(sev => {
      const d = c.bySeverity[sev] || { abiertos: 0, cerrados: 0 };
      const tot = d.abiertos + d.cerrados;
      if (!tot) return `<td class="muted" style="text-align:center;font-size:11px">—</td>`;
      const col = SEV_COLOR[sev] || '#8FA3BE';
      return `<td style="text-align:center">
        <span style="background:${col}18;color:${col};border:1px solid ${col}44;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${tot}</span>
        <div style="font-size:9px;color:var(--muted);margin-top:2px">${d.abiertos}a · ${d.cerrados}c</div>
      </td>`;
    }).join('');
    const pctCerrado = c.total > 0 ? Math.round(c.cerrados/c.total*100) : 0;
    const pColor = pctCerrado >= 80 ? '#2D7A4F' : pctCerrado >= 50 ? '#8C6A1A' : '#8C2A2A';
    return `<tr>
      <td style="font-weight:600;font-size:12px">${c.nombre}</td>
      <td style="text-align:center;font-weight:700;font-size:13px">${c.total}</td>
      <td style="text-align:center">
        <div style="display:flex;align-items:center;gap:6px">
          <div class="lt-pbar-track" style="width:60px"><div class="lt-pbar-fill" style="width:${pctCerrado}%;background:${pColor}"></div></div>
          <span style="font-size:11px;font-weight:700;color:${pColor}">${pctCerrado}%</span>
        </div>
      </td>
      ${sevCells}
    </tr>`;
  }).join('');

  const sevHeaders = sevsPresentes.map(s => {
    const col = SEV_COLOR[s] || '#8FA3BE';
    return `<th style="text-align:center"><span style="color:${col};font-weight:700">${SEV_LABEL[s]||s}</span></th>`;
  }).join('');

  el.innerHTML = `<div style="overflow-x:auto"><table class="tbl">
    <thead><tr>
      <th>Categoría</th><th style="text-align:center">Total</th><th>% Resuelto</th>${sevHeaders}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ─── RENDIMIENTO ──────────────────────────────────────────────────────────────
async function loadRendimiento() {
  ['rend-kpi-prec','rend-kpi-desv','rend-kpi-vel','rend-kpi-plan'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  ['rend-chart-prec-wrap','rend-chart-desv-wrap','rend-chart-vel-wrap','rend-chart-burnup-wrap'].forEach(id => {
    document.getElementById(id).innerHTML = `<div style="height:180px;display:flex;align-items:center;justify-content:center"><span class="skel" style="width:80%;height:140px;border-radius:8px"></span></div>`;
  });

  const params = buildRendParams();
  try {
    const [dEst, dVel, dBurnup] = await Promise.all([
      api(`/api/indicadores/rendimiento/estimacion${params}`),
      api(`/api/indicadores/rendimiento/velocidad${params}`),
      api(`/api/indicadores/rendimiento/burnup${params}`)
    ]);
    _rendData = { estimacion: dEst, velocidad: dVel, burnup: dBurnup };
    renderRendKpis(dEst, dVel, dBurnup);
    renderRendPrec(dEst.areas);
    renderRendDesv(dEst.areas);
    renderRendVel(dVel.sprints);
    renderRendBurnup(dBurnup);
  } catch(e) {
    ['rend-chart-prec-wrap','rend-chart-desv-wrap','rend-chart-vel-wrap','rend-chart-burnup-wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="no-data">Error al cargar: ${e.message}</div>`;
    });
  }
}

function buildRendParams() {
  const vals = {
    iniciativa: document.getElementById('rend-fil-iniciativa')?.value || '',
    equipo:     document.getElementById('rend-fil-equipo')?.value     || '',
    area:       document.getElementById('rend-fil-area')?.value       || '',
    anio:       document.getElementById('rend-fil-anio')?.value       || '',
    mes:        document.getElementById('rend-fil-mes')?.value        || '',
    sprint:     document.getElementById('rend-fil-sprint')?.value     || ''
  };
  const p = Object.entries(vals).filter(([,v]) => v).map(([k,v]) => `${k}=${encodeURIComponent(v)}`);
  return p.length ? '?' + p.join('&') : '';
}

async function loadRendFiltros() {
  const MES_NOMBRE = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function repoblar(id, opciones, placeholder) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` + opciones;
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }

  try {
    const d = await api('/api/indicadores/rendimiento/filtros');
    repoblar('rend-fil-iniciativa', (d.iniciativas||[]).map(i => `<option value="${i.id}">${i.nombre}</option>`).join(''), 'Todas las iniciativas');
    repoblar('rend-fil-area',       d.areas.map(a   => `<option value="${a.area_path}">${a.label}</option>`).join(''),     'Todas las áreas');
    repoblar('rend-fil-anio',       d.anios.map(a   => `<option value="${a}">${a}</option>`).join(''),                     'Todos los años');
    repoblar('rend-fil-mes',        d.meses.map(m   => `<option value="${m}">${MES_NOMBRE[m] || m}</option>`).join(''),    'Todos los meses');
    repoblar('rend-fil-sprint',     d.sprints.map(s => `<option value="${s}">${s}</option>`).join(''),                     'Todos los sprints');
    const iniSel = document.getElementById('rend-fil-iniciativa');
    if (iniSel) iniSel.classList.toggle('filter-sel-active', !!iniSel.value);
    _updateRendAviso();
  } catch(e) {
    console.warn('loadRendFiltros error:', e.message);
  }
}

function applyRendFiltro() {
  const iniSel = document.getElementById('rend-fil-iniciativa');
  if (iniSel) iniSel.classList.toggle('filter-sel-active', !!iniSel.value);
  _updateRendAviso();
  loadRendimiento();
}

function clearRendFiltros() {
  ['rend-fil-iniciativa','rend-fil-equipo','rend-fil-area','rend-fil-anio','rend-fil-mes','rend-fil-sprint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('filter-sel-active'); }
  });
  _updateRendAviso();
  loadRendimiento();
}

function _updateRendAviso() {
  const aviso = document.getElementById('rend-filtros-aviso');
  if (!aviso) return;
  const anio   = document.getElementById('rend-fil-anio')?.value   || '';
  const mes    = document.getElementById('rend-fil-mes')?.value    || '';
  const sprint = document.getElementById('rend-fil-sprint')?.value || '';
  const iniSel = document.getElementById('rend-fil-iniciativa');
  const iniVal = iniSel?.value || '';
  const iniTxt = iniVal && iniSel.selectedIndex >= 0 ? (iniSel.options[iniSel.selectedIndex]?.text || iniVal) : '';
  const MES_NOMBRE = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const avisos = [];
  if (iniTxt)          avisos.push(`📌 Iniciativa: ${iniTxt}`);
  if (mes && !anio)    avisos.push(`Mostrando ${MES_NOMBRE[parseInt(mes)] || 'mes ' + mes} de todos los años disponibles`);
  if (sprint && anio)  avisos.push(`Filtro sprint + año activos — los datos de velocidad muestran solo este sprint`);
  aviso.textContent = avisos.join(' · ');
}

function renderRendKpis(dEst, dVel, dBurnup) {
  const prec = dEst.kpis.precisionGlobal;
  const desv = dEst.kpis.desvioGlobal;
  const precEl = document.getElementById('rend-kpi-prec');
  const desvEl = document.getElementById('rend-kpi-desv');
  if (precEl) {
    precEl.textContent = prec != null ? prec + '%' : '—';
    precEl.style.color = prec == null ? '' : prec >= 80 && prec <= 120 ? '#2D7A4F' : prec < 60 || prec > 150 ? '#8C2A2A' : '#8C6A1A';
  }
  if (desvEl) {
    desvEl.textContent = desv != null ? (desv > 0 ? '+' : '') + desv + '%' : '—';
    desvEl.style.color = desv == null ? '' : Math.abs(desv) <= 20 ? '#2D7A4F' : Math.abs(desv) <= 50 ? '#8C6A1A' : '#8C2A2A';
  }
  document.getElementById('rend-kpi-vel').textContent     = dVel.promedio_horas ? dVel.promedio_horas + 'h' : '—';
  document.getElementById('rend-kpi-plan').textContent    = dBurnup.total_plan  ? dBurnup.total_plan + 'h'  : '—';
  document.getElementById('rend-kpi-personas').textContent = dEst.kpis.personas ?? '—';
  document.getElementById('rend-counter').textContent     = `${dEst.areas.length} área${dEst.areas.length !== 1 ? 's' : ''}`;
}

function rendPrecColor(pct) {
  if (pct == null) return '#8FA3BE';
  if (pct >= 80 && pct <= 120) return '#2D7A4F';
  if (pct < 60  || pct > 150)  return '#8C2A2A';
  return '#8C6A1A';
}

function renderRendPrec(areas) {
  const wrap = document.getElementById('rend-chart-prec-wrap');
  wrap.innerHTML = '<canvas id="chart-rend-prec"></canvas>';
  if (chartRendPrec) { chartRendPrec.destroy(); chartRendPrec = null; }
  if (!areas.length) { wrap.innerHTML = emptyState('Sin datos','Carga un CSV para ver este panel.','📊'); return; }

  const ctx = document.getElementById('chart-rend-prec');
  chartRendPrec = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: areas.map(a => a.label),
      datasets: [{
        label: 'Precisión (%)',
        data: areas.map(a => a.precisionPct ?? 0),
        backgroundColor: areas.map(a => rendPrecColor(a.precisionPct) + 'CC'),
        borderColor:     areas.map(a => rendPrecColor(a.precisionPct)),
        borderWidth: 1, borderRadius: 4, borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: c => {
            const a = areas[c.dataIndex];
            return [` Precisión: ${c.raw}%`, ` Estimado: ${a.estimadas}h · Real: ${a.completadas}h`];
          }
        }},
        annotation: { annotations: {
          line100: { type: 'line', scaleID: 'x', value: 100,
            borderColor: '#3B5EA6', borderWidth: 1.5, borderDash: [4,4] }
        }}
      },
      scales: {
        x: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, callback: v => v + '%' }, min: 0 },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderRendDesv(areas) {
  const wrap = document.getElementById('rend-chart-desv-wrap');
  wrap.innerHTML = '<canvas id="chart-rend-desv"></canvas>';
  if (chartRendDesv) { chartRendDesv.destroy(); chartRendDesv = null; }
  if (!areas.length) { wrap.innerHTML = emptyState('Sin datos','Carga un CSV para ver este panel.','📊'); return; }

  const ctx = document.getElementById('chart-rend-desv');
  chartRendDesv = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: areas.map(a => a.label),
      datasets: [{
        label: 'Desvío (%)',
        data: areas.map(a => a.desvioPct ?? 0),
        backgroundColor: areas.map(a => (a.desvioPct ?? 0) > 0 ? '#8C2A2ACC' : '#2D7A4FCC'),
        borderColor:     areas.map(a => (a.desvioPct ?? 0) > 0 ? '#8C2A2A'   : '#2D7A4F'),
        borderWidth: 1, borderRadius: 4, borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: c => {
            const sign = c.raw > 0 ? '+' : '';
            return ` Desvío: ${sign}${c.raw}%  (${c.raw > 0 ? 'sobre-estimado' : 'bajo-estimado'})`;
          }
        }}
      },
      scales: {
        x: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, callback: v => (v > 0 ? '+' : '') + v + '%' } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderRendVel(sprints) {
  const wrap = document.getElementById('rend-chart-vel-wrap');
  wrap.innerHTML = '<canvas id="chart-rend-vel"></canvas>';
  if (chartRendVel) { chartRendVel.destroy(); chartRendVel = null; }
  if (!sprints.length) { wrap.innerHTML = emptyState('Sin datos por sprint','El CSV necesita columna Iteration Path.','📊'); return; }

  const ctx = document.getElementById('chart-rend-vel');
  const avg = sprints.reduce((s, r) => s + r.horas, 0) / sprints.length;
  chartRendVel = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sprints.map(r => r.sprint),
      datasets: [
        { label: 'Horas completadas', data: sprints.map(r => Math.round(r.horas * 10) / 10),
          backgroundColor: '#3B5EA6CC', borderColor: '#3B5EA6', borderWidth: 1,
          borderRadius: 4, borderSkipped: false, yAxisID: 'yH' },
        { label: 'Tasks cerradas', data: sprints.map(r => r.tasks),
          type: 'line', borderColor: '#2D7A4F', backgroundColor: '#2D7A4F22',
          borderWidth: 2, pointRadius: 4, fill: true, tension: 0.3, yAxisID: 'yT' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { mode: 'index' },
        annotation: { annotations: {
          avgLine: { type: 'line', scaleID: 'yH', value: Math.round(avg * 10) / 10,
            borderColor: '#8C6A1A', borderWidth: 1.5, borderDash: [4,4],
            label: { content: `Prom: ${Math.round(avg)}h`, display: true, position: 'end',
              backgroundColor: '#8C6A1A', color: '#fff', font: { size: 9 }, padding: 3 } }
        }}
      },
      scales: {
        x:  { grid: { display: false }, ticks: { font: { size: 10 } } },
        yH: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, callback: v => v + 'h' },
              title: { display: true, text: 'Horas', font: { size: 9 } } },
        yT: { position: 'right', grid: { display: false },
              ticks: { font: { size: 10 }, stepSize: 1 },
              title: { display: true, text: 'Tasks', font: { size: 9 } } }
      }
    }
  });
}

function renderRendBurnup(data) {
  const wrap = document.getElementById('rend-chart-burnup-wrap');
  wrap.innerHTML = '<canvas id="chart-rend-burnup"></canvas>';
  if (chartRendBurnup) { chartRendBurnup.destroy(); chartRendBurnup = null; }
  if (!data.sprints.length) { wrap.innerHTML = emptyState('Sin datos','Carga un CSV con sprints para ver el burn-up.','📈'); return; }

  const ctx = document.getElementById('chart-rend-burnup');
  const planData = data.sprints.map(() => data.total_plan);

  chartRendBurnup = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.sprints.map(r => r.sprint),
      datasets: [
        { label: 'Real acumulado', data: data.sprints.map(r => r.acumulado),
          borderColor: '#2D7A4F', backgroundColor: '#2D7A4F22',
          borderWidth: 2.5, pointRadius: 4, fill: true, tension: 0.3 },
        { label: 'Plan (total estimado)', data: planData,
          borderColor: '#3B5EA6', backgroundColor: 'transparent',
          borderWidth: 1.5, borderDash: [6,4], pointRadius: 0, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { mode: 'index', callbacks: {
          label: c => ` ${c.dataset.label}: ${c.raw}h`
        }}
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#EBF0FA' }, ticks: { font: { size: 10 }, callback: v => v + 'h' }, beginAtZero: true }
      }
    }
  });
}
