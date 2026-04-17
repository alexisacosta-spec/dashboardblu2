// ─── EQUIPO ───────────────────────────────────────────────────────────────────
const EMPRESAS_CONOCIDAS = ['Sofka','Opinno','Byteq','Digital','Diners','CentroHub'];

// ─── TABS ─────────────────────────────────────────────────────────────────────
function loadEquipoView() { switchEquipoTab('dist'); }

function switchEquipoTab(tab) {
  ['colab','dist'].forEach(t => {
    const panel = document.getElementById(`equipo-panel-${t}`);
    const btn   = document.getElementById(`equipo-tab-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
  if (tab === 'colab') loadEquipo();
  else loadCelulas();
}

// ─── DISTRIBUCIÓN DE CÉLULAS ──────────────────────────────────────────────────
const ROL_DEFS = [
  { id:'scrum',   label:'Scrum',        tipo:'scrum' },
  { id:'front',   label:'Dev Front',    tipo:'count' },
  { id:'back',    label:'Dev Back',     tipo:'count' },
  { id:'qa',      label:'QA',           tipo:'count' },
  { id:'lt',      label:'LT',           tipo:'count' },
  { id:'ba',      label:'BA',           tipo:'count' },
  { id:'arq_fab', label:'Arq. Fábrica', tipo:'count' },
  { id:'arq_dce', label:'Arq. DCE',     tipo:'count' },
  { id:'lt_dce',  label:'LT DCE',       tipo:'count' },
  { id:'devops',  label:'Devops',       tipo:'count' },
  { id:'pm',      label:'PM',           tipo:'count' },
];

async function loadCelulas() {
  const content = document.getElementById('celulas-content');
  if (!content) return;
  content.innerHTML = '<div class="loader">Cargando…</div>';
  try {
    const res = await api('/api/celulas');
    _celulasData = res;
    const badge = document.getElementById('celulas-badge');
    if (badge) badge.textContent = res.updated_by ? `Actualizado por ${res.updated_by}` : '';
    content.innerHTML = renderCelulasDist(res.data);
    content.addEventListener('input', e => {
      if (e.target.classList.contains('cg-input') || e.target.classList.contains('cg-checkbox'))
        updateCelulaTotal(e.target.dataset.celula);
    });
  } catch(e) {
    content.innerHTML = '<div style="padding:20px;color:var(--muted);text-align:center">Error al cargar la distribución</div>';
  }
}

function renderCelulasDist(data) {
  const { celulas } = data;

  const thead = `<tr>
    <th class="cg-rol-col cg-rol-col-hdr">ROL</th>
    ${celulas.map(c => `<th class="celula-hdr" style="background:${c.color}">${c.nombre}</th>`).join('')}
  </tr>`;

  let tbodyRows = ROL_DEFS.map(r => `<tr>
    <td class="cg-rol-col">${r.label}</td>
    ${celulas.map(c => {
      const val = c.roles[r.id] ?? 0;
      if (r.tipo === 'scrum') {
        return `<td>
          ${val ? `<span class="cg-scrum" style="background:${c.color}">SCRUM</span>` : `<span class="cg-dash">—</span>`}
          <input type="checkbox" class="cg-checkbox" data-celula="${c.id}" data-rol="scrum" ${val?'checked':''}>
        </td>`;
      }
      return `<td>
        ${val ? `<span class="cg-count" style="color:${c.color}">● ${val}</span>` : `<span class="cg-dash">—</span>`}
        <input type="number" class="cg-input" min="0" max="99" value="${val}" data-celula="${c.id}" data-rol="${r.id}">
      </td>`;
    }).join('')}
  </tr>`).join('');

  const totalRow = `<tr class="cg-total-row">
    <td class="cg-rol-col">TOTAL</td>
    ${celulas.map(c => {
      const t = ROL_DEFS.filter(r => r.tipo === 'count').reduce((s, r) => s + (c.roles[r.id] || 0), 0);
      return `<td id="cg-total-${c.id}">${t}</td>`;
    }).join('')}
  </tr>`;

  const table = `<div class="celulas-wrap"><table class="celulas-grid">
    <thead>${thead}</thead><tbody>${tbodyRows}${totalRow}</tbody>
  </table></div>`;

  const featCards = celulas.map(c => {
    const items = (c.funcionalidades || []).map(f =>
      `<div class="feat-item">
        <span class="feat-item-dot">·</span>
        <span class="feat-item-text">${f}</span>
        <button class="feat-item-del" onclick="deleteFeat(this)" title="Eliminar">×</button>
      </div>`
    ).join('') || `<span style="color:var(--muted);font-size:11px;display:block;padding:2px 0">Sin funcionalidades</span>`;
    return `<div class="celula-feat-card">
      <div class="celula-feat-card-hdr" style="background:${c.color}">${c.nombre}</div>
      <div class="celula-feat-list" id="feat-list-${c.id}">${items}</div>
      <div class="feat-add-wrap"><button class="feat-add-btn" onclick="addFeat('${c.id}')">+ Agregar</button></div>
    </div>`;
  }).join('');

  return `<div class="celulas-container" id="celulas-container">
    ${table}
    <div class="celulas-feat-section">
      <div class="celulas-feat-title">Funcionalidades por célula</div>
      <div class="celulas-wrap"><div class="celulas-feat-row">${featCards}</div></div>
    </div>
  </div>`;
}

function updateCelulaTotal(celulaId) {
  const total = ROL_DEFS.filter(r => r.tipo === 'count').reduce((s, r) => {
    const inp = document.querySelector(`input.cg-input[data-celula="${celulaId}"][data-rol="${r.id}"]`);
    return s + (parseInt(inp?.value || '0') || 0);
  }, 0);
  const el = document.getElementById(`cg-total-${celulaId}`);
  if (el) el.textContent = total;
}

function toggleCelulasEdit() {
  const container = document.getElementById('celulas-container');
  if (!container) return;
  container.classList.add('celulas-edit-mode');
  document.getElementById('celulas-edit-btn').style.display  = 'none';
  document.getElementById('celulas-save-btn').style.display  = '';
  document.getElementById('celulas-cancel-btn').style.display = '';
}

function cancelCelulasEdit() {
  const content = document.getElementById('celulas-content');
  if (_celulasData) content.innerHTML = renderCelulasDist(_celulasData.data);
  const isAdmin = USER.perfil === 'admin';
  document.getElementById('celulas-edit-btn').style.display  = isAdmin ? '' : 'none';
  document.getElementById('celulas-save-btn').style.display  = 'none';
  document.getElementById('celulas-cancel-btn').style.display = 'none';
}

function addFeat(celulaId) {
  const txt = prompt('Nombre de la funcionalidad:');
  if (!txt || !txt.trim()) return;
  const list = document.getElementById(`feat-list-${celulaId}`);
  const placeholder = list.querySelector('span');
  if (placeholder) placeholder.remove();
  const div = document.createElement('div');
  div.className = 'feat-item';
  div.innerHTML = `<span class="feat-item-dot">·</span><span class="feat-item-text">${txt.trim()}</span><button class="feat-item-del" onclick="deleteFeat(this)" title="Eliminar">×</button>`;
  list.appendChild(div);
}

function deleteFeat(btn) { btn.closest('.feat-item').remove(); }

async function saveCelulas() {
  if (!_celulasData) return;
  const newData = {
    celulas: _celulasData.data.celulas.map(c => ({
      ...c,
      roles: Object.fromEntries(ROL_DEFS.map(r => {
        if (r.tipo === 'scrum') {
          const cb = document.querySelector(`input.cg-checkbox[data-celula="${c.id}"][data-rol="scrum"]`);
          return [r.id, cb?.checked ? 1 : 0];
        }
        const inp = document.querySelector(`input.cg-input[data-celula="${c.id}"][data-rol="${r.id}"]`);
        return [r.id, parseInt(inp?.value || '0') || 0];
      })),
      funcionalidades: [...(document.getElementById(`feat-list-${c.id}`)
        ?.querySelectorAll('.feat-item-text') || [])].map(el => el.textContent.trim()).filter(Boolean)
    }))
  };
  const btn = document.getElementById('celulas-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await api('/api/celulas', 'PUT', { data: newData });
    _celulasData = { ..._celulasData, data: newData };
    const badge = document.getElementById('celulas-badge');
    if (badge) badge.textContent = `Actualizado por ${USER.nombre}`;
    cancelCelulasEdit();
    toast('Distribución guardada correctamente');
  } catch(e) {
    toast('Error al guardar la distribución', 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

async function downloadCelulasDist() {
  const container = document.getElementById('celulas-container');
  if (!container) { toast('Carga la distribución primero', 'err'); return; }
  const btn = _activeDlBtn;
  const wraps = [...container.querySelectorAll('.celulas-wrap')];
  wraps.forEach(w => { w.style.overflow = 'visible'; w.style.minWidth = 'none'; });
  try {
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = 'distribucion-celulas.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    flashBtn(btn);
    toast('Imagen descargada');
  } catch(e) {
    toast('Error al generar la imagen', 'err');
  } finally {
    wraps.forEach(w => { w.style.overflow = ''; w.style.minWidth = ''; });
  }
}

// ─── COLABORADORES ────────────────────────────────────────────────────────────
async function loadEquipo() {
  allEquipoRows = await api('/api/equipo');
  renderEquipoTabla(allEquipoRows);
}

function filterEquipo() {
  clearTimeout(_timerEquipo);
  _timerEquipo = setTimeout(() => {
    const q = document.getElementById('equipo-search').value.toLowerCase();
    const filtered = allEquipoRows.filter(r =>
      r.nombre.toLowerCase().includes(q) ||
      r.correo.toLowerCase().includes(q) ||
      r.empresa.toLowerCase().includes(q) ||
      r.rol.toLowerCase().includes(q)
    );
    renderEquipoTabla(filtered, true);
  }, 250);
}

function renderEquipoTabla(rows, preserveSearch = false) {
  const isAdmin       = USER.perfil === 'admin';
  const cols          = isAdmin ? 6 : 5;
  const activos       = rows.filter(r => r.estado === 'activo');
  const otroProyecto  = rows.filter(r => r.estado === 'otro_proyecto');
  const desvinculados = rows.filter(r => r.estado === 'desvinculado');

  const countEl = document.getElementById('equipo-count');
  if (countEl) countEl.textContent = rows.length + ' colaboradores';

  function renderFila(r) {
    let badge, btnEstado = '';
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
      ${isAdmin ? `<td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn-sm" onclick="editarEquipo(${r.id},'${esc(r.nombre)}','${esc(r.correo)}','${esc(r.empresa)}','${esc(r.rol)}')">Editar</button>
        ${btnEstado}
      </td>` : ''}
    </tr>`;
  }

  let html = '';
  if (activos.length) {
    html += `<tr><td colspan="${cols}" style="background:var(--surface2);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:8px 12px">Activos (${activos.length})</td></tr>`;
    html += activos.map(renderFila).join('');
  }
  if (otroProyecto.length) {
    html += `<tr><td colspan="${cols}" style="background:#FAEEDA;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#854F0B;padding:8px 12px">En otro proyecto (${otroProyecto.length})</td></tr>`;
    html += otroProyecto.map(renderFila).join('');
  }
  if (desvinculados.length) {
    html += `<tr><td colspan="${cols}" style="background:#FFF7ED;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#92400E;padding:8px 12px">Desvinculados (${desvinculados.length})</td></tr>`;
    html += desvinculados.map(renderFila).join('');
  }
  if (!html) html = `<tr><td colspan="${cols}"><div class="no-data">Sin colaboradores<div class="no-data-action">Agrega los miembros del equipo para poder procesar los CSVs de ADO</div></div></td></tr>`;

  document.getElementById('equipo-tbody').innerHTML = html;
}

// ── Helpers para combos select + "Otro" ───────────────────────────────────────
function _onComboChange(selId, txtId) {
  const isOtro = document.getElementById(selId).value === '__otro__';
  const txt = document.getElementById(txtId);
  txt.style.display = isOtro ? '' : 'none';
  if (isOtro) { txt.value = ''; txt.focus(); }
}

function _getComboVal(selId, txtId) {
  const sel = document.getElementById(selId);
  return sel.value === '__otro__'
    ? document.getElementById(txtId).value.trim()
    : sel.value;
}

function _populateEquipoDropdowns(empresa = '', rol = '') {
  const empKnown = [...new Set([
    ...EMPRESAS_CONOCIDAS,
    ...allEquipoRows.map(r => r.empresa).filter(Boolean)
  ])].sort();

  const empSel = document.getElementById('eq-empresa-sel');
  const empTxt = document.getElementById('eq-empresa-txt');
  empSel.innerHTML =
    '<option value="">— Selecciona empresa —</option>' +
    empKnown.map(e => `<option value="${e}">${e}</option>`).join('') +
    '<option value="__otro__">Otra empresa…</option>';

  if (empresa && empKnown.includes(empresa)) {
    empSel.value = empresa;
    empTxt.style.display = 'none';
  } else if (empresa) {
    empSel.value = '__otro__';
    empTxt.value = empresa;
    empTxt.style.display = '';
  } else {
    empSel.value = '';
    empTxt.style.display = 'none';
  }

  const rolesBase = [
    'Arquitecto','Business Analyst','Desarrollador .NET','Desarrollador Full Stack',
    'Desarrollador Java','Desarrollador React','DevOps','Líder Técnico','LT',
    'Project Manager','QA','QA Automation','Scrum Master','UX/UI'
  ];
  const rolKnown = [...new Set([
    ...rolesBase,
    ...allEquipoRows.map(r => r.rol).filter(Boolean)
  ])].sort();

  const rolSel = document.getElementById('eq-rol-sel');
  const rolTxt = document.getElementById('eq-rol-txt');
  rolSel.innerHTML =
    '<option value="">— Selecciona rol —</option>' +
    rolKnown.map(r => `<option value="${r}">${r}</option>`).join('') +
    '<option value="__otro__">Otro rol…</option>';

  if (rol && rolKnown.includes(rol)) {
    rolSel.value = rol;
    rolTxt.style.display = 'none';
  } else if (rol) {
    rolSel.value = '__otro__';
    rolTxt.value = rol;
    rolTxt.style.display = '';
  } else {
    rolSel.value = '';
    rolTxt.style.display = 'none';
  }
}

function openModalEquipo() {
  document.getElementById('eq-id').value = '';
  document.getElementById('eq-nombre').value = '';
  document.getElementById('eq-correo').value = '';
  document.getElementById('eq-err').classList.remove('show');
  document.getElementById('modal-equipo-title').textContent = 'Agregar colaborador';
  _populateEquipoDropdowns();
  document.getElementById('modal-equipo').classList.add('show');
  setTimeout(() => document.getElementById('eq-nombre').focus(), 80);
}

function editarEquipo(id, nombre, correo, empresa, rol) {
  document.getElementById('eq-id').value      = id;
  document.getElementById('eq-nombre').value  = nombre;
  document.getElementById('eq-correo').value  = correo;
  document.getElementById('eq-err').classList.remove('show');
  document.getElementById('modal-equipo-title').textContent = 'Editar colaborador';
  _populateEquipoDropdowns(empresa, rol);
  document.getElementById('modal-equipo').classList.add('show');
}

async function saveEquipo() {
  const id      = document.getElementById('eq-id').value;
  const nombre  = document.getElementById('eq-nombre').value.trim();
  const correo  = document.getElementById('eq-correo').value.trim();
  const empresa = _getComboVal('eq-empresa-sel', 'eq-empresa-txt');
  const rol     = _getComboVal('eq-rol-sel',     'eq-rol-txt');
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
