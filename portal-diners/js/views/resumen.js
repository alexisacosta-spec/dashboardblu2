// ─── RESUMEN ──────────────────────────────────────────────────────────────────
async function loadResumen() {
  const q = getFilters();
  ['kpi-h','kpi-c','kpi-i','kpi-p','kpi-bugs-crit','kpi-precision'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skelKpi();
  });
  ['pbar-iniciativas','pbar-roles','resumen-estado-wrap','resumen-cat-wrap',
   'resumen-bugs-body','resumen-riesgo-body','resumen-vel-wrap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="loader">Cargando…</div>`;
  });
  try {
    const [kpis, mes, ini, roles, avance, cat, resEjec] = await Promise.all([
      api('/api/datos/kpis'+q),
      api('/api/datos/por-mes'+q),
      api('/api/datos/por-iniciativa'+q),
      api('/api/datos/por-rol'+q),
      api('/api/datos/avance-iniciativas'),
      api('/api/datos/por-categoria'+q),
      api('/api/datos/resumen-ejecutivo')
    ]);

    document.getElementById('kpi-h').textContent = fmtH(kpis.horas);
    if (kpis.costo !== null) document.getElementById('kpi-c').textContent = '$' + fmtN(kpis.costo);
    document.getElementById('kpi-i').textContent = kpis.iniciativas;
    document.getElementById('kpi-p').textContent = kpis.personas;

    const bugsCritEl = document.getElementById('kpi-bugs-crit');
    if (bugsCritEl) {
      bugsCritEl.textContent = resEjec.bugs.criticos;
      bugsCritEl.style.color = resEjec.bugs.criticos > 0 ? 'var(--error)' : 'var(--success)';
    }
    const precEl = document.getElementById('kpi-precision');
    if (precEl) {
      const p = resEjec.precision;
      precEl.textContent = p != null ? p + '%' : '—';
      precEl.style.color = p == null ? '' : (p >= 80 && p <= 120) ? 'var(--success)' : (p < 60 || p > 150) ? 'var(--error)' : 'var(--warn)';
    }

    const meses = [...new Set(mes.map(r => `${MESES[r.mes]||r.mes} ${r.anio}`))];
    document.getElementById('resumen-sub').textContent = `Periodo: ${meses[0]||'—'} — ${meses[meses.length-1]||'—'} · Portal Canales`;

    _cacheResumen.roles  = roles.map(r=>({label:r.rol, horas:r.horas}));
    _cacheResumen.topIni = ini.slice(0,8).map(r=>({label:r.nombre_iniciativa, horas:r.horas}));
    document.getElementById('pbar-iniciativas').innerHTML = renderPbars(ini.slice(0,8), 'horas');
    document.getElementById('pbar-roles').innerHTML       = renderPbars(roles, 'horas', 'rol');

    renderResumenEstadoTasks(avance);
    renderResumenCat(cat);
    renderResumenRiesgo(avance);
    renderResumenBugs(resEjec.bugs);
    renderResumenVelocidad(resEjec.velocidad);

  } catch(e) { console.error('loadResumen error:', e); }
}

// ── Tooltip flotante para barras apiladas ─────────────────────────────────────
let _segTipEl = null;

function _initSegTip() {
  if (_segTipEl) return;
  _segTipEl = document.createElement('div');
  _segTipEl.className = 'seg-tip';
  document.body.appendChild(_segTipEl);
}

function showStackRowTip(event, el) {
  _initSegTip();
  const cerr  = +(el.dataset.cerr  || 0);
  const actv  = +(el.dataset.actv  || 0);
  const newt  = +(el.dataset.new   || 0);
  const other = +(el.dataset.other || 0);
  const tot   = +(el.dataset.total || 1);
  const cats  = [
    { label:'Cerradas', count:cerr,  pct:Math.round(cerr /tot*100), color:'#16A34A' },
    { label:'Activas',  count:actv,  pct:Math.round(actv /tot*100), color:'#2B5FE8' },
    { label:'Nuevas',   count:newt,  pct:Math.round(newt /tot*100), color:'#9CA3AF' },
    { label:'Otros',    count:other, pct:Math.round(other/tot*100), color:'#D97706' },
  ].filter(c => c.count > 0);
  _segTipEl.innerHTML =
    `<div class="seg-tip-title">Total: ${tot} tasks</div>` +
    cats.map(c =>
      `<div class="seg-tip-row">
        <span class="seg-tip-dot" style="background:${c.color}"></span>
        <span class="seg-tip-lbl">${c.label}</span>
        <span class="seg-tip-val">${c.count}</span>
        <span class="seg-tip-pct">${c.pct}%</span>
      </div>`
    ).join('');
  _segTipEl.style.display = 'block';
  _moveStackTip(event);
}

function _moveStackTip(event) {
  if (!_segTipEl) return;
  const tw = _segTipEl.offsetWidth  || 180;
  const th = _segTipEl.offsetHeight || 120;
  let x = event.clientX + 16;
  let y = event.clientY - Math.round(th / 2);
  if (x + tw > window.innerWidth  - 8) x = event.clientX - tw - 16;
  if (y < 8) y = 8;
  if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
  _segTipEl.style.left = x + 'px';
  _segTipEl.style.top  = y + 'px';
}

function hideStackTip() {
  if (_segTipEl) _segTipEl.style.display = 'none';
}

// ── Stacked bars: estado de tasks por iniciativa ───────────────────────────────
function renderResumenEstadoTasks(avance) {
  const el = document.getElementById('resumen-estado-wrap');
  if (!el) return;
  const rows = (avance || [])
    .filter(r => r.total > 0)
    .sort((a,b) => b.total - a.total)
    .slice(0, 10);
  if (!rows.length) { el.innerHTML = '<div class="no-data">Sin datos de avance. Carga un CSV.</div>'; return; }
  const leyHTML = [
    {cls:'cerr', label:'Cerradas', color:'#16A34A'},
    {cls:'actv', label:'Activas',  color:'#2B5FE8'},
    {cls:'new',  label:'Nuevas',   color:'#9CA3AF'},
    {cls:'other',label:'Otros',    color:'#D97706'}
  ].map(c => `<div class="stack-leg-item"><div class="stack-leg-dot" style="background:${c.color}"></div>${c.label}</div>`).join('');

  const barsHTML = rows.map(r => {
    const tot   = r.total || 1;
    const cerr  = r.cerradas || 0;
    const actv  = r.activas  || 0;
    const newt  = r.nuevas   || 0;
    const other = Math.max(0, r.total - cerr - actv - newt);
    const pC    = Math.round(cerr /tot*100);
    const pA    = Math.round(actv /tot*100);
    const pN    = Math.round(newt /tot*100);
    const pO    = Math.max(0, 100 - pC - pA - pN);
    const nom   = (r.nombre||r.id||'').replace(/</g,'&lt;');
    return `<div class="stack-row"
        data-cerr="${cerr}" data-actv="${actv}" data-new="${newt}" data-other="${other}" data-total="${r.total}"
        onmouseenter="showStackRowTip(event,this)"
        onmousemove="_moveStackTip(event)"
        onmouseleave="hideStackTip()">
      <div class="stack-label" title="${nom}">${nom}</div>
      <div class="stack-track">
        ${pC>0?`<div class="stack-seg cerr"  style="width:${pC}%"></div>`:''}
        ${pA>0?`<div class="stack-seg actv"  style="width:${pA}%"></div>`:''}
        ${pN>0?`<div class="stack-seg new"   style="width:${pN}%"></div>`:''}
        ${pO>0?`<div class="stack-seg other" style="width:${pO}%"></div>`:''}
      </div>
      <div class="stack-total">${r.total}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="stack-legend">${leyHTML}</div>${barsHTML}
    <div style="text-align:right;margin-top:6px;font-size:9px;color:var(--muted)">
      Top ${rows.length} por total de tasks ·
      <button class="link-btn" onclick="showView('avance')" style="font-size:9px">ver todas en Avance →</button>
    </div>`;
}

// ── Donut: categoría de negocio ────────────────────────────────────────────────
function renderResumenCat(rows) {
  const el = document.getElementById('resumen-cat-wrap');
  if (!el) return;
  const top = (rows || []).slice(0, 6);
  if (!top.length) { el.innerHTML = '<div class="no-data">Sin datos de categoría.</div>'; return; }
  const colores = ['#2B5FE8','#0D1B2E','#6B7280','#B4B2A9','#D3D1C7','#C9A84C'];
  const total   = top.reduce((s,r) => s + (r.horas||0), 0);
  el.innerHTML  = `<div style="position:relative;height:160px"><canvas id="chart-resumen-cat"></canvas></div>
    <div class="res-donut-leg" id="resumen-cat-legend"></div>`;
  if (chartResumenCat) { chartResumenCat.destroy(); chartResumenCat = null; }
  chartResumenCat = new Chart(document.getElementById('chart-resumen-cat'), {
    type: 'doughnut',
    data: {
      labels: top.map(r => r.categoria_negocio||'Sin Clasificar'),
      datasets: [{ data: top.map(r => r.horas||0), backgroundColor: colores, borderWidth:0, hoverOffset:5 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtH(c.raw)}h · ${Math.round((c.raw||0)/(total||1)*100)}%` }}
      }
    }
  });
  document.getElementById('resumen-cat-legend').innerHTML = top.map((r,i) =>
    `<div class="res-donut-row">
      <div class="res-donut-dot" style="background:${colores[i]}"></div>
      <span class="res-donut-lbl">${r.categoria_negocio||'Sin Clasificar'}</span>
      <span class="res-donut-val">${fmtH(r.horas||0)}h · ${Math.round((r.horas||0)/(total||1)*100)}%</span>
    </div>`
  ).join('');
}

// ── Tabla: iniciativas en riesgo ───────────────────────────────────────────────
function renderResumenRiesgo(avance) {
  const el = document.getElementById('resumen-riesgo-body');
  const badge = document.getElementById('resumen-riesgo-badge');
  if (!el) return;
  const hoy    = new Date().toISOString().slice(0,10);
  const riesgo = (avance || [])
    .filter(r => r.fecha_fin && r.fecha_fin < hoy && r.pct < 100)
    .sort((a,b) => a.fecha_fin.localeCompare(b.fecha_fin))
    .slice(0, 6);
  if (!riesgo.length) {
    el.innerHTML = '<div style="font-size:11px;padding:16px 0;text-align:center;color:var(--success)">✅ Sin iniciativas vencidas</div>';
    if (badge) { badge.textContent='0 vencidas'; badge.style.background='#ECFDF5'; badge.style.color='#065F46'; badge.style.borderColor='#A7F3D0'; }
    return;
  }
  if (badge) badge.textContent = `${riesgo.length} vencida${riesgo.length>1?'s':''}`;
  const dias = f => Math.round((new Date(hoy) - new Date(f)) / (1000*60*60*24));
  el.innerHTML = `<table class="risk-tbl">
    <thead><tr><th>Iniciativa</th><th style="text-align:center">Avance</th><th style="text-align:right">Días</th></tr></thead>
    <tbody>${riesgo.map(r => {
      const color = r.pct < 40 ? '#DC2626' : r.pct < 80 ? '#D97706' : '#16A34A';
      const nom   = (r.nombre||r.id||'').replace(/</g,'&lt;');
      return `<tr>
        <td style="font-size:11px;font-weight:600">${nom}</td>
        <td style="text-align:center">
          <div style="display:flex;align-items:center;gap:5px;justify-content:center">
            <div style="width:48px;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
              <div style="width:${r.pct}%;height:100%;background:${color};border-radius:3px"></div>
            </div>
            <span style="font-size:10px;color:var(--muted)">${r.pct}%</span>
          </div>
        </td>
        <td style="text-align:right"><span class="risk-days">+${dias(r.fecha_fin)}d</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>
  <div style="margin-top:8px;font-size:9px;color:var(--muted)">
    Fecha fin vencida · <button class="link-btn" onclick="showView('avance')" style="font-size:9px">ver en Avance →</button>
  </div>`;
}

// ── Barras: bugs abiertos por iniciativa ──────────────────────────────────────
function renderResumenBugs(bugs) {
  const el = document.getElementById('resumen-bugs-body');
  if (!el) return;
  const rows = (bugs.porIniciativa || []);
  if (!rows.length) {
    el.innerHTML = '<div style="padding:12px 0;text-align:center;font-size:11px;color:var(--success)">✅ Sin bugs abiertos</div>';
    return;
  }
  const max = rows[0].abiertos || 1;
  el.innerHTML = rows.map(r => {
    const color = r.abiertos > 10 ? '#DC2626' : '#D97706';
    const nom   = (r.nombre_iniciativa || r.id_iniciativa || '').replace(/</g,'&lt;');
    return `<div class="pbar-row">
      <div class="pbar-label" title="${nom}">${nom}</div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${Math.round(r.abiertos/max*100)}%;background:${color}"></div></div>
      <div class="pbar-val" style="color:${color}">${r.abiertos}</div>
    </div>`;
  }).join('')
  + `<div class="bugs-strip">
      <div class="bugs-strip-box">
        <div class="bugs-strip-val" style="color:${bugs.criticos>0?'var(--error)':'var(--bg-dark)'}">${bugs.criticos}</div>
        <div class="bugs-strip-lbl">Críticos</div>
      </div>
      <div class="bugs-strip-box">
        <div class="bugs-strip-val">${bugs.abiertos}</div>
        <div class="bugs-strip-lbl">Abiertos</div>
      </div>
      <div class="bugs-strip-box">
        <div class="bugs-strip-val" style="color:var(--success)">${bugs.cerrados}</div>
        <div class="bugs-strip-lbl">Cerrados</div>
      </div>
    </div>`;
}

// ── Línea: velocidad del equipo ────────────────────────────────────────────────
function renderResumenVelocidad(vel) {
  const el = document.getElementById('resumen-vel-wrap');
  if (!el) return;
  const sprints = (vel && vel.sprints) || [];
  if (!sprints.length) { el.innerHTML = '<div class="no-data" style="padding:12px 0;text-align:center;font-size:11px">Sin datos de sprint</div>'; return; }
  el.innerHTML = `<div style="position:relative;height:120px"><canvas id="chart-resumen-vel"></canvas></div>
    <div class="vel-kpi-strip" id="resumen-vel-kpis"></div>`;
  if (chartResumenVel) { chartResumenVel.destroy(); chartResumenVel = null; }
  chartResumenVel = new Chart(document.getElementById('chart-resumen-vel'), {
    type: 'line',
    data: {
      labels: sprints.map(s => s.sprint),
      datasets: [
        { label:'Horas', data:sprints.map(s=>s.horas),
          borderColor:'#2B5FE8', backgroundColor:'rgba(43,95,232,.08)',
          borderWidth:2, pointRadius:4, pointBackgroundColor:'#2B5FE8',
          fill:true, tension:0.35 },
        { label:'Promedio', data:sprints.map(()=>vel.promedio),
          borderColor:'#C9A84C', borderWidth:1.5, borderDash:[5,3],
          pointRadius:0, fill:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ display:false },
        tooltip:{ callbacks:{ label: c => c.datasetIndex===0 ? ` ${c.raw}h completadas` : ` ${c.raw}h promedio` }}
      },
      scales: {
        y:{ grid:{color:'rgba(0,0,0,.05)'}, ticks:{font:{size:9}, callback:v=>v+'h'} },
        x:{ grid:{display:false}, ticks:{font:{size:9}} }
      }
    }
  });
  const prom   = vel.promedio || 0;
  const ultimo = vel.ultimo   || 0;
  const vs     = vel.vsProm;
  const vsColor = vs==null ? 'var(--muted)' : vs>=0 ? 'var(--success)' : 'var(--error)';
  const vsText  = vs==null ? '—' : (vs>0?'+':'')+vs+'%';
  document.getElementById('resumen-vel-kpis').innerHTML = `
    <div class="vel-kpi-box"><div class="vel-kpi-box-val">${fmtH(prom)}h</div><div class="vel-kpi-box-lbl">Prom. / sprint</div></div>
    <div class="vel-kpi-box"><div class="vel-kpi-box-val" style="color:var(--blue-el)">${fmtH(ultimo)}h</div><div class="vel-kpi-box-lbl">Último sprint</div></div>
    <div class="vel-kpi-box"><div class="vel-kpi-box-val" style="color:${vsColor}">${vsText}</div><div class="vel-kpi-box-lbl">vs promedio</div></div>`;
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
