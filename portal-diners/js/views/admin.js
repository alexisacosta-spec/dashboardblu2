// ─── ADMIN ────────────────────────────────────────────────────────────────────

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
async function loadUsuarios() {
  const users = await api('/api/admin/usuarios');
  const PERFILES = {admin:'Administrador',gerente:'Gte. con costos',gestor:'Gestor',visor:'Visor'};
  document.getElementById('users-tbody').innerHTML = users.map(u=>`
    <tr>
      <td>${u.nombre}</td>
      <td class="muted" style="font-size:11px">${u.email}</td>
      <td><span class="perfil-badge perfil-${u.perfil}">${PERFILES[u.perfil]||u.perfil}</span></td>
      <td>${u.pendiente
        ? `<span class="dot dot-pending"></span> Pendiente`
        : `<span class="dot ${u.activo?'dot-ok':'dot-err'}"></span> ${u.activo?'Activo':'Inactivo'}`
      }</td>
      <td class="muted" style="font-size:11px">${u.ultimo_acceso?new Date(u.ultimo_acceso).toLocaleString('es-EC'):'Nunca'}</td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        ${u.id !== USER?.id ? `<button class="btn-sm" onclick="editarUsuario(${u.id},'${u.nombre.replace(/'/g,"\\'")}','${u.email}','${u.perfil}')">✎ Perfil</button>` : ''}
        ${u.pendiente
          ? `<button class="btn-sm" onclick="reinvitarUsuario(${u.id},'${u.nombre.replace(/'/g,"\\'")}')">Reinvitar</button>`
          : `<button class="btn-sm" onclick="toggleUser(${u.id},${u.activo})">${u.activo?'Desactivar':'Activar'}</button>`
        }
        ${u.email!=='admin@dinersclub.com.ec'?`<button class="btn-sm del" onclick="deleteUser(${u.id},'${u.nombre.replace(/'/g,"\\'")}')">Eliminar</button>`:''}
      </td>
    </tr>`).join('');
}

function openModalNuevoUsuario() {
  ['u-nombre','u-email'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-perfil').value = 'gestor';
  document.getElementById('u-err').classList.remove('show');
  document.getElementById('modal-usuario').classList.add('show');
}

function editarUsuario(id, nombre, email, perfilActual) {
  document.getElementById('edit-user-id').value    = id;
  document.getElementById('edit-user-nombre').textContent = nombre;
  document.getElementById('edit-user-email').textContent  = email;
  document.getElementById('edit-user-perfil').value = perfilActual;
  const errEl = document.getElementById('edit-user-err');
  errEl.textContent = ''; errEl.classList.remove('show');
  document.getElementById('modal-editar-usuario').classList.add('show');
}

async function guardarEditarUsuario() {
  const id     = document.getElementById('edit-user-id').value;
  const perfil = document.getElementById('edit-user-perfil').value;
  const errEl  = document.getElementById('edit-user-err');
  errEl.textContent = ''; errEl.classList.remove('show');
  try {
    await api(`/api/admin/usuarios/${id}`, 'PATCH', { perfil });
    closeModal('modal-editar-usuario');
    toast('Perfil actualizado correctamente', 'ok');
    loadUsuarios();
  } catch(e) {
    errEl.textContent = e.message || 'Error al actualizar el perfil';
    errEl.classList.add('show');
  }
}

async function createUser() {
  const nombre = document.getElementById('u-nombre').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const perfil = document.getElementById('u-perfil').value;
  const err = document.getElementById('u-err');
  const btn = document.getElementById('btn-crear-user');
  err.classList.remove('show');
  if (!nombre||!email) { err.textContent='Nombre y correo son requeridos'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    await api('/api/admin/usuarios','POST',{nombre,email,perfil});
    closeModal('modal-usuario');
    toast(`Invitación enviada a ${email}`, 'ok');
    loadUsuarios();
  } catch(e) {
    err.textContent = e.message||'Error al enviar la invitación';
    err.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar invitación';
  }
}

async function reinvitarUsuario(id, nombre) {
  if (!confirm(`¿Reenviar invitación a ${nombre}?`)) return;
  try {
    await api(`/api/admin/usuarios/${id}/reinvitar`, 'POST');
    toast(`Invitación reenviada a ${nombre}`, 'ok');
  } catch(e) {
    toast(e.message || 'Error al reenviar la invitación', 'err');
  }
}

async function toggleUser(id, activo) {
  await api(`/api/admin/usuarios/${id}`,'PATCH',{activo:!activo});
  toast(activo?'Usuario desactivado':'Usuario activado','ok');
  loadUsuarios();
}

async function deleteUser(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
  await api(`/api/admin/usuarios/${id}`,'DELETE');
  toast('Usuario eliminado','ok');
  loadUsuarios();
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────
async function loadLogs() {
  const EVT = {
    LOGIN_OK:'✅ Ingreso exitoso', LOGIN_FALLIDO:'❌ Contraseña incorrecta',
    OTP_ENVIADO:'📧 OTP enviado', OTP_FALLIDO:'⚠️ OTP incorrecto',
    LOGOUT:'🔒 Cierre de sesión', RESET_PASSWORD:'🔑 Cambio de contraseña'
  };
  const tbody = document.getElementById('logs-tbody');
  if (tbody) tbody.innerHTML = skelTable([120,180,160,80], 8);

  const emailFilter  = document.getElementById('log-email')?.value.trim()  || '';
  const eventoFilter = document.getElementById('log-evento')?.value || '';
  const qs = new URLSearchParams();
  if (emailFilter)  qs.set('email',  emailFilter);
  if (eventoFilter) qs.set('evento', eventoFilter);
  const q = qs.toString() ? '?' + qs.toString() : '';

  const logs = await api('/api/admin/logs' + q);

  const subEl = document.getElementById('logs-sub');
  if (subEl) subEl.textContent = logs.length + ' eventos' + (emailFilter||eventoFilter ? ' (filtrados)' : '');

  if (!tbody) return;
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="4">${emptyState('Sin eventos registrados','Intenta con otros filtros o espera a que haya actividad de acceso.','📋')}</td></tr>`;
    return;
  }
  tbody.innerHTML = logs.map(l=>`
    <tr>
      <td class="muted" style="font-size:11px;white-space:nowrap">${new Date(l.fecha).toLocaleString('es-EC')}</td>
      <td style="font-size:12px">${l.email||'—'}</td>
      <td style="font-size:12px">${EVT[l.evento]||l.evento}</td>
      <td class="muted" style="font-size:11px">${l.ip||'—'}</td>
    </tr>`).join('');
}

// ─── CSV UPLOAD ───────────────────────────────────────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv')) uploadCSV(file);
  else toast('Solo se aceptan archivos .csv exportados desde Azure DevOps','err');
}

async function uploadCSV(file) {
  clientLog('CSV_UPLOAD_INICIADO', { archivo: file.name, kb: Math.round(file.size / 1024) });
  const status = document.getElementById('upload-status');
  status.style.display = '';
  status.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:12px">⏳ Procesando CSV… esto puede tomar unos segundos</div>';
  const fd = new FormData();
  fd.append('archivo', file);
  try {
    const r = await fetch('/api/admin/cargar-csv', {
      method:'POST', headers:{'Authorization':'Bearer '+TOKEN}, body:fd
    });
    if (r.status === 401) { sessionExpired(); return; }
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Respuesta inesperada del servidor (${r.status}): ${text.slice(0,200)}`); }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);

    let html = `<div style="font-size:13px;padding:12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;color:var(--success)">
      ✅ <strong>CSV procesado correctamente</strong><br>
      <span style="font-size:12px;color:var(--text2)">
        ${fmtN(data.tasks_con_horas)} tasks con horas cargadas ·
        ${fmtN(data.iniciativas)} iniciativas ·
        ${fmtN(data.tasks_total)} tasks totales procesadas
      </span>
    </div>`;

    if (data.sin_lookup && data.sin_lookup.length > 0) {
      html += `<div style="margin-top:10px;padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-size:12px;color:#92400E">
        ⚠️ <strong>${data.sin_lookup.length} correo(s) sin registro en la tabla de Equipo</strong> — sus horas no se incluyen en el dashboard.<br>
        <div style="margin-top:6px;color:var(--muted)">${data.sin_lookup.map(c=>`<code>${c}</code>`).join(', ')}</div>
        <div style="margin-top:6px">Ve a <strong>Equipo</strong> para agregar estos colaboradores y luego vuelve a cargar el CSV.</div>
      </div>`;
    }

    status.innerHTML = html;
    const sinLookupN = data.sin_lookup?.length || 0;
    clientLog('CSV_UPLOAD_OK', { archivo: file.name, tasks: data.tasks_con_horas, iniciativas: data.iniciativas, sin_lookup: sinLookupN });
    toast(`✓ ${fmtN(data.tasks_con_horas)} tasks · ${data.iniciativas || 0} iniciativas${sinLookupN ? ` · ⚠ ${sinLookupN} sin lookup` : ''}`, sinLookupN ? 'warn' : 'ok');
    await loadFiltros();
  } catch(e) {
    clientLog('CSV_UPLOAD_ERROR', { archivo: file.name, error: e.message });
    status.innerHTML = `<div style="font-size:13px;color:var(--error);padding:12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px">
      ❌ <strong>Error al procesar el CSV</strong><br>
      <span style="font-size:12px;margin-top:4px;display:block">${e.message}</span>
    </div>`;
    toast('Error al procesar el CSV', 'err');
  }
}

// ─── HISTORIAL CSV ────────────────────────────────────────────────────────────
async function loadHistorialCSV() {
  const rows = await api('/api/admin/historial-csv');
  document.getElementById('historial-tbody').innerHTML = rows.length
    ? rows.map((r, i) => {
        const esCurrent = i === 0;
        const tieneError = r.estado === 'error';
        const tieneLog   = !!r.log_error;

        const estadoBadge = tieneError
          ? '<span class="av-tag av-late" style="font-size:9px;margin-right:4px">Error</span>'
          : esCurrent ? '<span class="av-tag av-prog" style="font-size:9px;margin-right:4px">Actual</span>' : '';

        return `<tr>
          <td style="font-size:12px;font-weight:500">${estadoBadge}${r.nombre_archivo}</td>
          <td class="muted" style="font-size:11px;white-space:nowrap">${new Date(r.fecha_carga).toLocaleString('es-EC')}</td>
          <td class="muted" style="font-size:11px">${r.usuario}</td>
          <td class="num">${fmtN(r.tasks_cargadas)}</td>
          <td class="num">${fmtN(r.iniciativas)}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${tieneLog || tieneError ? `<button class="btn-sm" onclick="verLogHistorial(${r.id})" style="color:#185FA5">📋 Ver log</button>` : ''}
            ${!esCurrent ? `<button class="btn-pri" style="font-size:11px;padding:4px 10px" onclick="restaurarCSV(${r.id},'${esc(r.nombre_archivo)}','${esc(r.fecha_carga)}')">↩ Restaurar</button>` : ''}
            <button class="btn-sm del" onclick="eliminarHistorial(${r.id})">Eliminar</button>
          </td>
        </tr>`;
      }).join('') :
    `<tr><td colspan="6"><div class="no-data">Sin cargas registradas<div class="no-data-action">Las próximas cargas de CSV aparecerán aquí</div></div></td></tr>`;
}

async function verLogHistorial(id) {
  const rows = await api('/api/admin/historial-csv');
  const r = rows.find(x => x.id === id);
  if (!r) return;

  const modal   = document.getElementById('modal-log-historial');
  const titulo  = document.getElementById('modal-log-titulo');
  const cuerpo  = document.getElementById('modal-log-cuerpo');

  titulo.textContent = r.nombre_archivo;

  let html = `<div style="font-size:11px;color:var(--muted);margin-bottom:12px">
    Cargado el ${new Date(r.fecha_carga).toLocaleString('es-EC')} por ${r.usuario}
  </div>`;

  if (r.estado === 'error') {
    html += `<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--error);margin-bottom:4px">❌ Error de procesamiento</div>
      <code style="font-size:11px;color:var(--error);white-space:pre-wrap;word-break:break-all">${r.log_error || 'Sin detalle disponible'}</code>
    </div>`;
  }

  if (r.sin_lookup > 0 && r.log_error) {
    const correos = r.log_error.replace(/^.*?:\s*/, '').split(',').map(c => c.trim()).filter(Boolean);
    html += `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px">
      <div style="font-size:11px;font-weight:600;color:#92400E;margin-bottom:8px">
        ⚠ ${r.sin_lookup} correo(s) sin registro en la tabla de Equipo
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Estas personas tienen horas en el CSV pero no están en el Equipo del portal.
        Sus horas aparecen en el dashboard con empresa "Sin asignar" y costo $0.
        Para corregirlo: ve a <strong>Equipo → Agregar colaborador</strong> y luego recarga el CSV.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${correos.map(c => `<code style="background:var(--surface2);border:0.5px solid var(--border);border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text2)">${c}</code>`).join('')}
      </div>
    </div>`;
  }

  if (!r.log_error) {
    html += `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">
      ✅ Esta carga se procesó sin errores ni advertencias.
    </div>`;
  }

  cuerpo.innerHTML = html;
  modal.classList.add('show');
}

async function restaurarCSV(id, nombre, fecha) {
  if (!confirm(`¿Restaurar los datos de "${nombre}" (${new Date(fecha).toLocaleString('es-EC')})?\n\nEsto reemplazará los datos actuales del dashboard.`)) return;
  try {
    const r = await api('/api/admin/historial-csv/' + id + '/restaurar', 'POST');
    clientLog('SNAPSHOT_RESTAURADO', { archivo: nombre, id, tasks: r.tasks, iniciativas: r.iniciativas });
    toast(`Restaurado: ${fmtN(r.tasks)} tasks · ${fmtN(r.iniciativas)} iniciativas`, 'ok');
    await loadFiltros();
    loadHistorialCSV();
  } catch(e) {
    toast('Error al restaurar: ' + e.message, 'err');
  }
}

async function eliminarHistorial(id) {
  if (!confirm('¿Eliminar este registro del historial? No se puede deshacer.')) return;
  await api('/api/admin/historial-csv/' + id, 'DELETE');
  toast('Registro eliminado', 'ok');
  loadHistorialCSV();
}

// ─── TARIFAS ──────────────────────────────────────────────────────────────────
async function loadTarifas() {
  const rows = await api('/api/admin/tarifas');
  document.getElementById('tarifas-tbody').innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${r.empresa}</td>
        <td class="muted" style="font-size:11px">${r.rol}</td>
        <td class="num" style="font-weight:600">$${fmtN(r.tarifa)}/h</td>
        <td style="display:flex;gap:5px">
          <button class="btn-sm" onclick="editarTarifa(${r.id},'${esc(r.empresa)}','${esc(r.rol)}',${r.tarifa})">Editar</button>
          <button class="btn-sm del" onclick="deleteTarifa(${r.id})">Eliminar</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="no-data">Sin tarifas<div class="no-data-action">Agrega las tarifas por empresa y rol para que el portal calcule los costos</div></div></td></tr>`;
}

function openModalTarifa() {
  document.getElementById('tar-id').value = '';
  ['tar-empresa','tar-rol','tar-valor'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tar-err').textContent = '';
  document.getElementById('modal-tarifa-title').textContent = 'Agregar tarifa';
  document.getElementById('modal-tarifa').classList.add('show');
}

function editarTarifa(id, empresa, rol, tarifa) {
  document.getElementById('tar-id').value      = id;
  document.getElementById('tar-empresa').value = empresa;
  document.getElementById('tar-rol').value     = rol;
  document.getElementById('tar-valor').value   = tarifa;
  document.getElementById('tar-err').textContent = '';
  document.getElementById('modal-tarifa-title').textContent = 'Editar tarifa';
  document.getElementById('modal-tarifa').classList.add('show');
}

async function saveTarifa() {
  const id      = document.getElementById('tar-id').value;
  const empresa = document.getElementById('tar-empresa').value.trim();
  const rol     = document.getElementById('tar-rol').value.trim();
  const tarifa  = parseFloat(document.getElementById('tar-valor').value);
  const errEl   = document.getElementById('tar-err');
  if (!empresa || !rol || isNaN(tarifa)) {
    errEl.textContent = 'Todos los campos son requeridos'; errEl.classList.add('show'); return;
  }
  try {
    if (id) {
      await api('/api/admin/tarifas/'+id, 'PATCH', { empresa, rol, tarifa });
    } else {
      await api('/api/admin/tarifas', 'POST', { empresa, rol, tarifa });
    }
    document.getElementById('modal-tarifa').classList.remove('show');
    toast('Tarifa guardada', 'ok');
    loadTarifas();
  } catch(e) {
    errEl.textContent = e.message; errEl.classList.add('show');
  }
}

async function deleteTarifa(id) {
  if (!confirm('¿Eliminar esta tarifa?')) return;
  await api('/api/admin/tarifas/'+id, 'DELETE');
  toast('Tarifa eliminada', 'ok');
  loadTarifas();
}
