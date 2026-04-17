// ─── PERSONAS ─────────────────────────────────────────────────────────────────

async function loadPersonas() {
  const q = getFilters();
  _pagePer = 0;
  const tbody = document.getElementById('personas-tbody');
  if (tbody) tbody.innerHTML = skelTable([160,80,100,50,60], 7);
  allPersonas = await api('/api/datos/por-persona'+q);
  _cachePersonas = allPersonas;
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  document.getElementById('personas-sub').textContent = `${allPersonas.length} colaboradores`;
  if (!verCostos) document.getElementById('th-costo-per').style.display = 'none';
  renderPersonasTable(allPersonas);
}

function renderPersonasTable(rows) {
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  _basePersonas = rows;

  const countEl = document.getElementById('personas-count');
  if (countEl) countEl.textContent = rows.length + ' personas';

  const thMap = { nombre_persona:'th-per-nombre', empresa:'th-per-empresa', rol:'th-per-rol',
                  horas:'th-per-horas', costo:'th-costo-per' };
  _applySortArrows('per', _sortPersonas, Object.keys(thMap), thMap);
  const sorted = _sortRows(rows, _sortPersonas);

  const tbody = document.getElementById('personas-tbody');
  const pgEl  = document.getElementById('per-pagination');

  if (!sorted.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5">${emptyState('Sin colaboradores','Ajusta los filtros o agrega colaboradores en la sección Equipo.','👤')}</td></tr>`;
    if (pgEl)  pgEl.innerHTML  = '';
    return;
  }

  const total    = sorted.length;
  const pageRows = sorted.slice(_pagePer * PAGE_SIZE, (_pagePer + 1) * PAGE_SIZE);

  if (tbody) tbody.innerHTML = pageRows.map(r=>`<tr>
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
  </tr>`).join('');

  if (pgEl) pgEl.innerHTML = renderPagination(total, _pagePer,
    `goPagePer(${_pagePer - 1})`, `goPagePer(${_pagePer + 1})`);
}

function sortPersonas(col) {
  _toggleSort(_sortPersonas, col);
  _pagePer = 0;
  const q = document.getElementById('persona-search')?.value?.toLowerCase() || '';
  const filtered = q
    ? allPersonas.filter(r =>
        r.nombre_persona.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q) ||
        r.rol.toLowerCase().includes(q))
    : allPersonas;
  renderPersonasTable(filtered);
}

function goPagePer(n) { _pagePer = n; renderPersonasTable(_basePersonas); }

function filterPersonas() {
  clearTimeout(_timerPersonas);
  _timerPersonas = setTimeout(() => {
    _pagePer = 0;
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

    const search = document.getElementById('persona-search').value.toLowerCase();
    const data = search
      ? rows.filter(r => r.nombre_persona.toLowerCase().includes(search) ||
                         (r.empresa||'').toLowerCase().includes(search) ||
                         (r.rol||'').toLowerCase().includes(search))
      : rows;

    if (!data.length) { alert('No hay datos para exportar con los filtros aplicados.'); return; }

    const MESES_NOMBRE = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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

    const taskHeaders = ['Persona','Empresa','Rol','Iniciativa','Epic','HU','Task','ID Task','Año','Mes','Horas'];
    if (verCostos) taskHeaders.push('Costo ($)');
    const taskRows = data.map(r => {
      const row = [
        r.nombre_persona, r.empresa, r.rol,
        r.nombre_iniciativa || '', r.nombre_epic || '', r.nombre_hu || '',
        r.nombre_task || '', r.id_task || '',
        r.anio, MESES_NOMBRE[r.mes] || r.mes,
        r.horas_completadas
      ];
      if (verCostos) row.push(r.costo || 0);
      return row;
    });
    const wsTasks = XLSX.utils.aoa_to_sheet([taskHeaders, ...taskRows]);
    wsTasks['!cols'] = [{wch:30},{wch:18},{wch:22},{wch:30},{wch:30},{wch:30},{wch:40},{wch:12},{wch:6},{wch:12},{wch:8},{wch:12}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks');

    const params = new URLSearchParams(q.replace(/^\?/,''));
    const partes = [];
    if (params.get('anio'))    partes.push(params.get('anio'));
    if (params.get('mes'))     partes.push(MESES_NOMBRE[parseInt(params.get('mes'))]);
    if (params.get('empresa')) partes.push(params.get('empresa'));
    if (search)                partes.push(search);
    const sufijo = partes.length ? '_' + partes.join('_') : '';
    XLSX.writeFile(wb, `horas_personas${sufijo}.xlsx`);

  } finally {
    btn.disabled = false; btn.textContent = '↓ Exportar Excel';
  }
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
