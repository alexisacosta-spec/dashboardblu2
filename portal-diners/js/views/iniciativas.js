// ─── INICIATIVAS ──────────────────────────────────────────────────────────────

async function loadIniciativas() {
  drillState = {level:'iniciativas', iniciativa:null, epic:null};
  document.getElementById('ini-title').textContent = 'Por iniciativa';
  document.getElementById('ini-sub').textContent = 'Haz clic en una iniciativa para ver el detalle por Epics';
  document.getElementById('ini-breadcrumb').style.display = 'none';
  _pageIni = 0;
  const q = getFilters();
  const tbody = document.getElementById('ini-tbody');
  if (tbody) tbody.innerHTML = skelTable([60,200,100,60,50,60], 8);
  allIniciativas = await api('/api/datos/por-iniciativa'+q);
  renderIniciativasTable(allIniciativas);
}

function renderIniciativasTable(rows) {
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const totalH = rows.reduce((s,r)=>s+r.horas,0);

  _baseIniciativas = rows;

  const existing = document.getElementById('ini-table-panel');
  if (!existing) {
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
            <button class="dl-btn" onclick="showDlMenu(event,[['Excel','xls','exportIniExcel()']])" title="Descargar">${_icoDl()}</button>
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
        <div id="ini-pagination"></div>
      </div>`;
  }

  const countEl = document.getElementById('ini-search-count');
  if (countEl) countEl.textContent = rows.length + ' iniciativas';

  _applySortArrows('ini', _sortIni, ['id_iniciativa','nombre_iniciativa','categoria_negocio','horas','pct','costo','personas'],
    {id_iniciativa:'th-ini-id', nombre_iniciativa:'th-ini-nombre', categoria_negocio:'th-ini-cat',
     horas:'th-ini-horas', pct:'th-ini-pct', costo:'th-ini-costo', personas:'th-ini-personas'});
  const sortedRows = _sortIni.col ? _sortRows(rows, _sortIni) : rows;

  const tbody = document.getElementById('ini-tbody');
  if (!tbody) return;

  const total    = sortedRows.length;
  const pageRows = sortedRows.slice(_pageIni * PAGE_SIZE, (_pageIni + 1) * PAGE_SIZE);

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState('Sin iniciativas','Prueba ajustando los filtros de año, mes o empresa.','🔍')}</td></tr>`;
    const pgEl = document.getElementById('ini-pagination');
    if (pgEl) pgEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = pageRows.map(r=>`
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
      <td></td><td>Total (${total})</td><td></td>
      <td class="num">${fmtH(totalH)}</td>
      <td class="num">100%</td>
      ${verCostos?`<td class="num">$${fmtN(rows.reduce((s,r)=>s+(r.costo||0),0))}</td>`:''}
      <td class="num">${rows.reduce((s,r)=>s+r.personas,0)}</td>
    </tr>`;

  const pgEl = document.getElementById('ini-pagination');
  if (pgEl) pgEl.innerHTML = renderPagination(total, _pageIni,
    `goPageIni(${_pageIni - 1})`, `goPageIni(${_pageIni + 1})`);
}

function sortIniciativas(col) {
  _toggleSort(_sortIni, col);
  _pageIni = 0;
  const q = document.getElementById('ini-search')?.value?.toLowerCase() || '';
  const filtered = q
    ? allIniciativas.filter(r =>
        r.nombre_iniciativa.toLowerCase().includes(q) ||
        String(r.id_iniciativa).includes(q) ||
        r.categoria_negocio.toLowerCase().includes(q))
    : allIniciativas;
  renderIniciativasTable(filtered);
}

function goPageIni(n) { _pageIni = n; renderIniciativasTable(_baseIniciativas); }

function filterIniciativas() {
  clearTimeout(_timerIni);
  _timerIni = setTimeout(() => {
    _pageIni = 0;
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
