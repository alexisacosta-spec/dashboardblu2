'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const fs      = require('fs');
const router  = express.Router();

const db                               = require('../db/connection');
const { authMiddleware, adminOnly, auditLog, validatePassword } = require('../middleware/auth');
const { uploadCSV, uploadXLSX }        = require('../middleware/security');
const { enviarInvitacion }             = require('../lib/email');
const logger                           = require('../lib/logger');

const PORT = process.env.PORT || 3000;

// ─── LOGS ─────────────────────────────────────────────────────────────────────
router.get('/logs', authMiddleware, adminOnly, (req, res) => {
  const { email, evento, desde, hasta, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 200, 500);
  const conds = [], params = [];
  if (email)  { conds.push('email LIKE ?');  params.push(`%${email}%`); }
  if (evento) { conds.push('evento = ?');    params.push(evento); }
  if (desde)  { conds.push('fecha >= ?');    params.push(desde); }
  if (hasta)  { conds.push('fecha <= ?');    params.push(hasta + ' 23:59:59'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  res.json(db.all(`SELECT * FROM sesiones_log ${where} ORDER BY fecha DESC LIMIT ${maxLimit}`, params));
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
router.get('/usuarios', authMiddleware, adminOnly, (req, res) => {
  const rows = db.all('SELECT id,nombre,email,perfil,activo,password_hash,creado_en,ultimo_acceso FROM usuarios ORDER BY creado_en DESC');
  res.json(rows.map(u => ({ ...u, pendiente: u.activo === 0 && !u.password_hash, password_hash: undefined })));
});

router.post('/usuarios', authMiddleware, adminOnly, async (req, res) => {
  const { nombre, email, perfil } = req.body;
  if (!nombre || !email || !perfil) return res.status(400).json({ error: 'Nombre, email y perfil son requeridos' });
  if (!['admin','gerente','gestor','visor'].includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
  const emailLower = email.toLowerCase().trim();
  try {
    db.run('INSERT INTO usuarios (nombre,email,password_hash,perfil,activo) VALUES (?,?,?,?,0)',
      [nombre, emailLower, '', perfil]);
    const newUser = db.get('SELECT id FROM usuarios WHERE email=?', [emailLower]);
    const token  = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 48*60*60*1000).toISOString().replace('T',' ').split('.')[0];
    db.run('INSERT INTO invitaciones (user_id,token,expira_en) VALUES (?,?,?)', [newUser.id, token, expira]);
    const portalUrl = process.env.PORTAL_URL || `http://localhost:${PORT}`;
    await enviarInvitacion(emailLower, nombre, token, portalUrl);
    auditLog(req.user.email, 'USUARIO_INVITADO', { nuevo_email: emailLower, perfil }, req.ip);
    res.json({ ok: true });
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'El email ya existe' });
    logger.error('createUser error', e);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

router.patch('/usuarios/:id', authMiddleware, adminOnly, (req, res) => {
  const { activo, perfil, password } = req.body;
  const { id } = req.params;
  if (password) {
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });
  }
  if (activo !== undefined) db.run('UPDATE usuarios SET activo=? WHERE id=?', [activo ? 1 : 0, id]);
  if (perfil)   db.run('UPDATE usuarios SET perfil=? WHERE id=?', [perfil, id]);
  if (password) db.run('UPDATE usuarios SET password_hash=? WHERE id=?', [bcrypt.hashSync(password, 10), id]);
  auditLog(req.user.email, 'USUARIO_MODIFICADO', { id, activo, perfil, cambio_password: !!password }, req.ip);
  res.json({ ok: true });
});

router.delete('/usuarios/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  const target = db.get('SELECT email FROM usuarios WHERE id=?', [req.params.id]);
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id]);
  auditLog(req.user.email, 'USUARIO_ELIMINADO', { eliminado_email: target?.email }, req.ip);
  res.json({ ok: true });
});

router.post('/usuarios/:id/reinvitar', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const user = db.get('SELECT * FROM usuarios WHERE id=?', [id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.activo === 1 || user.password_hash) return res.status(400).json({ error: 'El usuario ya activó su cuenta' });
  db.run('UPDATE invitaciones SET usado=1 WHERE user_id=?', [id]);
  const token  = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 48*60*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO invitaciones (user_id,token,expira_en) VALUES (?,?,?)', [id, token, expira]);
  const portalUrl = process.env.PORTAL_URL || `http://localhost:${PORT}`;
  await enviarInvitacion(user.email, user.nombre, token, portalUrl).catch(e => logger.error(`Reinvite email error (${user.email})`, e));
  auditLog(req.user.email, 'USUARIO_REINVITADO', { email: user.email }, req.ip);
  res.json({ ok: true });
});

// ─── EQUIPO (lectura pública para autenticados) ───────────────────────────────
// Nota: esta ruta se monta en /api/equipo directamente desde server.js

// ─── ADMIN EQUIPO ─────────────────────────────────────────────────────────────
router.get('/equipo', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all('SELECT * FROM equipo ORDER BY estado ASC, empresa ASC, nombre ASC'));
});

router.post('/equipo', authMiddleware, adminOnly, (req, res) => {
  const { nombre, correo, empresa, rol } = req.body;
  if (!nombre || !correo || !empresa || !rol) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  try {
    db.run('INSERT INTO equipo (nombre,correo,empresa,rol) VALUES (?,?,?,?)',
      [nombre.trim(), correo.toLowerCase().trim(), empresa.trim(), rol.trim()]);
    res.json({ ok: true });
  } catch(e) { res.status(409).json({ error: 'El correo ya existe en el equipo' }); }
});

router.patch('/equipo/:id', authMiddleware, adminOnly, (req, res) => {
  const { nombre, correo, empresa, rol, estado } = req.body;
  const id = req.params.id;
  if (nombre)  db.run('UPDATE equipo SET nombre=?  WHERE id=?', [nombre.trim(), id]);
  if (correo)  db.run('UPDATE equipo SET correo=?  WHERE id=?', [correo.toLowerCase().trim(), id]);
  if (empresa) db.run('UPDATE equipo SET empresa=? WHERE id=?', [empresa.trim(), id]);
  if (rol)     db.run('UPDATE equipo SET rol=?     WHERE id=?', [rol.trim(), id]);
  if (estado)  db.run('UPDATE equipo SET estado=?  WHERE id=?', [estado, id]);
  res.json({ ok: true });
});

router.post('/equipo/importar', authMiddleware, adminOnly, uploadXLSX.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const XLSX = require('xlsx');
    const wb   = XLSX.readFile(req.file.path);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!raw.length) return res.status(400).json({ error: 'El archivo está vacío' });

    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const firstRow = raw[0];
    const keyMap = {};
    for (const col of Object.keys(firstRow)) {
      const n = norm(col);
      if (n.includes('nombre'))  keyMap.nombre  = col;
      if (n.includes('correo') || n.includes('email') || n.includes('mail')) keyMap.correo = col;
      if (n.includes('empresa') || n.includes('proveedor')) keyMap.empresa = col;
      if (n.includes('rol'))     keyMap.rol     = col;
    }
    const faltantes = ['nombre','correo','empresa','rol'].filter(k => !keyMap[k]);
    if (faltantes.length) return res.status(400).json({ error: `Columnas no encontradas: ${faltantes.join(', ')}` });

    let agregados = 0, actualizados = 0, errores = [];
    for (const r of raw) {
      const nombre  = String(r[keyMap.nombre]  || '').trim();
      const correo  = String(r[keyMap.correo]  || '').trim().toLowerCase();
      const empresa = String(r[keyMap.empresa] || '').trim();
      const rol     = String(r[keyMap.rol]     || '').trim();
      if (!nombre || !correo || !empresa || !rol) {
        if (correo || nombre) errores.push(`Fila incompleta: ${nombre || correo}`);
        continue;
      }
      if (!correo.includes('@')) { errores.push(`Correo inválido: ${correo}`); continue; }
      const existe = db.get('SELECT id FROM equipo WHERE correo=?', [correo]);
      if (existe) {
        db.run('UPDATE equipo SET nombre=?,empresa=?,rol=? WHERE correo=?', [nombre, empresa, rol, correo]);
        actualizados++;
      } else {
        db.run('INSERT INTO equipo (nombre,correo,empresa,rol) VALUES (?,?,?,?)', [nombre, correo, empresa, rol]);
        agregados++;
      }
    }
    logger.info(`Equipo importado: ${agregados} nuevos · ${actualizados} actualizados`);
    res.json({ ok: true, agregados, actualizados, errores });
  } catch(e) {
    logger.error('Error importando equipo', e);
    res.status(500).json({ error: 'Error procesando el archivo: ' + e.message });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch(_) {} }
  }
});

// ─── TARIFAS ──────────────────────────────────────────────────────────────────
router.get('/tarifas', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all('SELECT * FROM tarifas ORDER BY empresa ASC, rol ASC'));
});

router.post('/tarifas', authMiddleware, adminOnly, (req, res) => {
  const { empresa, rol, tarifa } = req.body;
  if (!empresa || !rol || tarifa === undefined) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  try {
    db.run('INSERT INTO tarifas (empresa,rol,tarifa) VALUES (?,?,?)',
      [empresa.trim(), rol.trim(), parseFloat(tarifa)]);
    auditLog(req.user.email, 'TARIFA_CREADA', { empresa, rol, tarifa }, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(409).json({ error: 'Ya existe una tarifa para esa empresa + rol' }); }
});

router.patch('/tarifas/:id', authMiddleware, adminOnly, (req, res) => {
  const { empresa, rol, tarifa } = req.body;
  const id = req.params.id;
  if (empresa)            db.run('UPDATE tarifas SET empresa=? WHERE id=?', [empresa.trim(), id]);
  if (rol)                db.run('UPDATE tarifas SET rol=?     WHERE id=?', [rol.trim(), id]);
  if (tarifa !== undefined) db.run('UPDATE tarifas SET tarifa=?  WHERE id=?', [parseFloat(tarifa), id]);
  auditLog(req.user.email, 'TARIFA_MODIFICADA', { id, empresa, rol, tarifa }, req.ip);
  res.json({ ok: true });
});

router.delete('/tarifas/:id', authMiddleware, adminOnly, (req, res) => {
  const target = db.get('SELECT * FROM tarifas WHERE id=?', [req.params.id]);
  db.run('DELETE FROM tarifas WHERE id=?', [req.params.id]);
  auditLog(req.user.email, 'TARIFA_ELIMINADA', { empresa: target?.empresa, rol: target?.rol, tarifa: target?.tarifa }, req.ip);
  res.json({ ok: true });
});

// ─── CARGA CSV ────────────────────────────────────────────────────────────────
function parseAssignedTo(s) {
  if (!s || typeof s !== 'string' || !s.trim()) return { nombre: '', correo: '' };
  const emailMatch = s.match(/<([^>]+)>/);
  const correo = emailMatch ? emailMatch[1].trim().toLowerCase() : '';
  const nombre = s.replace(/<[^>]+>/, '').trim();
  return { nombre, correo };
}

function parseFecha(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val) || val.getFullYear() < 1980 ? null : val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
  }
  return null;
}

router.post('/cargar-csv', authMiddleware, adminOnly, uploadCSV.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    let contenido = fs.readFileSync(req.file.path, 'utf-8');
    if (contenido.charCodeAt(0) === 0xFEFF) contenido = contenido.slice(1);

    function parseCSV(text) {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim());
      return lines.slice(1).map(line => {
        const vals = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { inQ = !inQ; }
          else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
          else cur += c;
        }
        vals.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
    }

    const raw = parseCSV(contenido);
    logger.info(`CSV cargado: ${raw.length} filas`);

    const normId = v => {
      const s = String(v || '').trim();
      if (!s || s === 'nan') return '';
      return s.includes('.') ? String(parseInt(parseFloat(s))) : s;
    };

    const byId = {};
    raw.forEach(r => { const id = normId(r['ID']); if (id) byId[id] = r; });

    const catPorIniciativa = {};
    raw.forEach(r => {
      if ((r['Work Item Type'] || '').trim() === 'Iniciativa') {
        const id  = normId(r['ID']);
        const cat = (r['neg_Categoria'] || '').trim();
        if (id && cat) catPorIniciativa[id] = cat;
      }
    });

    function resolverJerarquia(idStr) {
      const result = {
        id_iniciativa:'', nombre_iniciativa:'',
        id_epic:'',       nombre_epic:'',
        id_hu:'',         nombre_hu:'',
        id_task:idStr,    nombre_task:''
      };
      const HU_TYPES = new Set(['User Story','Enabler','Feature','Channel Service']);
      let curr = idStr;
      const taskNode = byId[curr];
      if (taskNode) {
        for (const t of ['Title 4','Title 3','Title 2','Title 1','Title 5']) {
          if (taskNode[t] && taskNode[t].trim()) { result.nombre_task = taskNode[t].trim(); break; }
        }
      }
      let visitados = new Set();
      while (curr) {
        if (visitados.has(curr)) break;
        visitados.add(curr);
        const node = byId[curr];
        if (!node) break;
        const parent = normId(node['Parent']);
        if (!parent) break;
        const parentNode = byId[parent];
        if (!parentNode) break;
        const tipo = (parentNode['Work Item Type'] || '').trim();
        const titulo = (() => {
          for (const t of ['Title 1','Title 2','Title 3','Title 4','Title 5'])
            if (parentNode[t] && parentNode[t].trim()) return parentNode[t].trim();
          return '';
        })();
        if (tipo === 'Iniciativa' && !result.id_iniciativa) {
          result.id_iniciativa = parent; result.nombre_iniciativa = titulo;
        } else if (tipo === 'Epic' && !result.id_epic) {
          result.id_epic = parent; result.nombre_epic = titulo;
        } else if (HU_TYPES.has(tipo) && !result.id_hu) {
          result.id_hu = parent; result.nombre_hu = titulo;
        }
        curr = parent;
      }
      return result;
    }

    const equipoMap = {};
    db.all('SELECT correo,empresa,rol FROM equipo').forEach(r => {
      equipoMap[r.correo.toLowerCase().trim()] = r;
    });
    const tarifaMap = {};
    db.all('SELECT empresa,rol,tarifa FROM tarifas').forEach(r => {
      tarifaMap[`${r.empresa}||${r.rol}`] = r.tarifa;
    });

    const tasks = raw.filter(r => (r['Work Item Type']||'').trim() === 'Task');
    logger.debug(`Tasks en CSV: ${tasks.length}`);

    const noValidos = [], procesadas = [];
    for (const r of tasks) {
      const id   = normId(r['ID']);
      const { nombre, correo } = parseAssignedTo(r['Assigned To']);
      const horas = parseFloat(r['Completed Work'] || 0);
      const state = (r['State'] || '').trim();
      const itPath = (r['Iteration Path'] || '').trim();
      const sprint = itPath ? itPath.split('\\').pop().trim() : '';
      const area_path       = (r['Area Path'] || '').trim();
      const horas_estimadas = parseFloat(r['Original Estimate'] || 0) || 0;

      const miembro = correo ? equipoMap[correo.toLowerCase()] : null;
      if (!miembro) { if (correo && !noValidos.includes(correo)) noValidos.push(correo); }
      const empresa = miembro?.empresa || 'Sin asignar';
      const rol     = miembro?.rol     || 'Sin asignar';
      const tarifa  = miembro ? (tarifaMap[`${empresa}||${rol}`] || 0) : 0;
      const costo   = horas * tarifa;
      const jer     = resolverJerarquia(id);
      let cat = '';
      if (jer.id_iniciativa) cat = catPorIniciativa[jer.id_iniciativa] || '';
      if (!cat) cat = (r['neg_Categoria'] || '').trim();
      if (!cat || cat.toUpperCase().startsWith('SIN') || cat.toUpperCase().startsWith('NO')) cat = 'Sin Clasificar';
      const fechaIni = parseFecha(r['Desde_task']);
      const fechaFin = parseFecha(r['Hasta_Task']);
      const mes  = fechaFin ? parseInt(fechaFin.split('-')[1]) : 0;
      const anio = fechaFin ? parseInt(fechaFin.split('-')[0]) : 0;
      procesadas.push({
        ...jer, nombre_persona: nombre, correo, empresa, rol,
        categoria_negocio: cat, horas_completadas: horas,
        costo, tarifa, mes, anio, estado: state,
        fecha_ini: fechaIni, fecha_fin: fechaFin, sprint, area_path, horas_estimadas,
        valido: state === 'Closed' && !!fechaFin && horas > 0 && empresa !== 'Diners'
      });
    }

    db.run('DELETE FROM datos_horas');
    db.run('BEGIN TRANSACTION');
    let insertadas = 0;
    for (const t of procesadas) {
      if (!t.valido) continue;
      db.run(`INSERT INTO datos_horas
        (id_iniciativa,nombre_iniciativa,id_epic,nombre_epic,id_hu,nombre_hu,
         id_task,nombre_task,nombre_persona,correo,empresa,rol,categoria_negocio,
         horas_completadas,costo,tarifa,mes,anio,estado,sprint,horas_estimadas,area_path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [t.id_iniciativa||'SIN_INI', t.nombre_iniciativa||'Sin Iniciativa',
         t.id_epic||'SIN_EPIC',      t.nombre_epic||'Sin Epic',
         t.id_hu||'SIN_HU',          t.nombre_hu||'Sin HU',
         t.id_task, t.nombre_task,   t.nombre_persona, t.correo,
         t.empresa, t.rol, t.categoria_negocio,
         t.horas_completadas, t.costo, t.tarifa,
         t.mes, t.anio, t.estado, t.sprint||'',
         t.horas_estimadas||0, t.area_path||'']);
      insertadas++;
    }
    db.run('COMMIT');

    const bugsRaw = raw.filter(r => (r['Work Item Type']||'').trim() === 'Bug');
    logger.debug(`Bugs en CSV: ${bugsRaw.length}`);
    db.run('DELETE FROM bugs_csv');
    db.run('BEGIN TRANSACTION');
    let bugsInsertados = 0;
    for (const r of bugsRaw) {
      const id = normId(r['ID']);
      const titulo = (() => {
        for (const t of ['Title 1','Title 2','Title 3','Title 4','Title 5'])
          if (r[t] && r[t].trim()) return r[t].trim();
        return '';
      })();
      const state      = (r['State'] || '').trim();
      const itPath     = (r['Iteration Path'] || '').trim();
      const sprint     = itPath ? itPath.split('\\').pop().trim() : '';
      const ambiente   = (r['Ambiente_Bug']  || '').trim();
      const created    = parseFecha(r['Created Date']);
      const closed     = parseFecha(r['Closed Date']);
      const severity   = (r['Severity']      || '').trim();
      const categoria_bug = (r['Categoria_Bug'] || '').trim();
      const jer        = resolverJerarquia(id);
      db.run(`INSERT INTO bugs_csv
        (id_bug,titulo,estado,sprint,ambiente,
         id_iniciativa,nombre_iniciativa,id_epic,nombre_epic,id_hu,nombre_hu,
         created_date,closed_date,severity,categoria_bug)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, titulo, state, sprint, ambiente,
         jer.id_iniciativa||'SIN_INI', jer.nombre_iniciativa||'Sin Iniciativa',
         jer.id_epic||'SIN_EPIC',      jer.nombre_epic||'Sin Epic',
         jer.id_hu||'SIN_HU',          jer.nombre_hu||'Sin HU',
         created, closed, severity, categoria_bug]);
      bugsInsertados++;
    }
    db.run('COMMIT');
    logger.debug(`Bugs insertados: ${bugsInsertados}`);

    const planMap = {};
    for (const t of procesadas) {
      const id = t.id_iniciativa || 'SIN_INI';
      if (id === 'SIN_INI') continue;
      if (!planMap[id]) {
        planMap[id] = { id, nom: t.nombre_iniciativa, cat: t.categoria_negocio,
          total:0, cerradas:0, activas:0, nuevas:0, otros:0, fIni:null, fFin:null };
      }
      planMap[id].total++;
      if      (t.estado === 'Closed') planMap[id].cerradas++;
      else if (t.estado === 'Active') planMap[id].activas++;
      else if (t.estado === 'New')    planMap[id].nuevas++;
      else                            planMap[id].otros++;
      if (t.fecha_ini && (!planMap[id].fIni || t.fecha_ini < planMap[id].fIni)) planMap[id].fIni = t.fecha_ini;
      if (t.fecha_fin && (!planMap[id].fFin || t.fecha_fin > planMap[id].fFin)) planMap[id].fFin = t.fecha_fin;
    }
    db.run('DELETE FROM tasks_plan');
    db.run('BEGIN TRANSACTION');
    Object.values(planMap).forEach(p => {
      db.run(`INSERT INTO tasks_plan (id_iniciativa,nombre_iniciativa,categoria_negocio,total_tasks,cerradas,activas,nuevas,otros,fecha_ini,fecha_fin) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.nom, p.cat, p.total, p.cerradas, p.activas, p.nuevas, p.otros, p.fIni, p.fFin]);
    });
    db.run('COMMIT');

    db.run('DELETE FROM tasks_seguimiento');
    db.run('BEGIN TRANSACTION');
    for (const t of procesadas) {
      if (!t.id_iniciativa || t.id_iniciativa === 'SIN_INI') continue;
      db.run(`INSERT INTO tasks_seguimiento
        (id_iniciativa,nombre_iniciativa,id_epic,nombre_epic,id_task,nombre_task,
         nombre_persona,correo,empresa,rol,estado,sprint,horas_estimadas,horas_completadas,fecha_ini,fecha_fin)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [t.id_iniciativa, t.nombre_iniciativa,
         t.id_epic||'', t.nombre_epic||'',
         t.id_task, t.nombre_task||'',
         t.nombre_persona||'', t.correo||'',
         t.empresa||'', t.rol||'',
         t.estado, t.sprint||'',
         t.horas_estimadas||0, t.horas_completadas||0,
         t.fecha_ini||'', t.fecha_fin||'']);
    }
    db.run('COMMIT');

    const checkH = db.get('SELECT COUNT(*) as n FROM datos_horas').n;
    const checkP = db.get('SELECT COUNT(*) as n FROM tasks_plan').n;
    logger.info(`CSV procesado: ${insertadas} tasks · ${checkP} iniciativas · ${noValidos.length} correos sin lookup`);

    const snapHoras = JSON.stringify(db.all('SELECT * FROM datos_horas'));
    const snapPlan  = JSON.stringify(db.all('SELECT * FROM tasks_plan'));
    const histCount = db.get('SELECT COUNT(*) as n FROM historial_csv').n;
    if (histCount >= 5) {
      const oldest = db.get('SELECT id FROM historial_csv ORDER BY id ASC LIMIT 1');
      if (oldest) db.run('DELETE FROM historial_csv WHERE id=?', [oldest.id]);
    }
    const logError = noValidos.length > 0
      ? `${noValidos.length} correo(s) sin lookup en equipo: ${noValidos.slice(0,5).join(', ')}${noValidos.length > 5 ? ` y ${noValidos.length-5} más` : ''}`
      : null;
    db.run(`INSERT INTO historial_csv (nombre_archivo,usuario,tasks_cargadas,iniciativas,sin_lookup,estado,log_error,snapshot_horas,snapshot_plan) VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.file?.originalname || 'archivo.csv', req.user.email, insertadas, checkP, noValidos.length, 'ok', logError, snapHoras, snapPlan]);
    auditLog(req.user.email, 'CSV_CARGADO', { archivo: req.file?.originalname, tasks: insertadas, iniciativas: checkP, sin_lookup: noValidos }, req.ip);

    // Generar / actualizar alertas IAE automáticamente tras cada carga
    try {
      const { generarAlertas } = require('./iae');
      const resAlertas = generarAlertas();
      logger.info(`IAE post-carga: ${resAlertas.nuevas} nuevas alertas · ${resAlertas.total} activas`);
    } catch (eAlertas) {
      logger.warn('No se pudieron generar alertas IAE', eAlertas);
    }

    res.json({ ok: true, tasks_total: tasks.length, tasks_con_horas: insertadas, iniciativas: checkP, sin_lookup: noValidos });
  } catch(e) {
    try { db.run('ROLLBACK'); } catch(_) {}
    logger.error('Error procesando CSV', e);
    try {
      db.run(`INSERT INTO historial_csv (nombre_archivo,usuario,tasks_cargadas,iniciativas,sin_lookup,estado,log_error,snapshot_horas,snapshot_plan) VALUES (?,?,?,?,?,?,?,?,?)`,
        [req.file?.originalname || 'archivo.csv', req.user?.email || '', 0, 0, 0, 'error', e.message, null, null]);
    } catch(_) {}
    res.status(500).json({ error: 'Error procesando el archivo: ' + e.message });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch(_) {} }
  }
});

// ─── HISTORIAL CSV ────────────────────────────────────────────────────────────
router.get('/historial-csv', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all(`
    SELECT id, nombre_archivo, fecha_carga, usuario,
           tasks_cargadas, iniciativas, sin_lookup, estado, log_error
    FROM historial_csv ORDER BY id DESC`));
});

router.post('/historial-csv/:id/restaurar', authMiddleware, adminOnly, (req, res) => {
  const registro = db.get('SELECT * FROM historial_csv WHERE id=?', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!registro.snapshot_horas || !registro.snapshot_plan)
    return res.status(400).json({ error: 'Este registro no tiene snapshot de datos' });
  try {
    const horasData = JSON.parse(registro.snapshot_horas);
    const planData  = JSON.parse(registro.snapshot_plan);
    db.run('DELETE FROM datos_horas');
    db.run('DELETE FROM tasks_plan');
    db.run('DELETE FROM tasks_seguimiento');
    db.run('BEGIN TRANSACTION');
    for (const r of horasData) {
      db.run(`INSERT INTO datos_horas
        (id,id_iniciativa,nombre_iniciativa,id_epic,nombre_epic,id_hu,nombre_hu,
         id_task,nombre_task,nombre_persona,correo,empresa,rol,categoria_negocio,
         horas_completadas,costo,tarifa,mes,anio,estado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [r.id,r.id_iniciativa,r.nombre_iniciativa,r.id_epic,r.nombre_epic,
         r.id_hu,r.nombre_hu,r.id_task,r.nombre_task,r.nombre_persona,
         r.correo,r.empresa,r.rol,r.categoria_negocio,r.horas_completadas,
         r.costo,r.tarifa,r.mes,r.anio,r.estado]);
    }
    for (const r of planData) {
      db.run(`INSERT INTO tasks_plan
        (id_iniciativa,nombre_iniciativa,categoria_negocio,total_tasks,cerradas,activas,nuevas,fecha_ini,fecha_fin)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        [r.id_iniciativa,r.nombre_iniciativa,r.categoria_negocio,
         r.total_tasks,r.cerradas,r.activas,r.nuevas,r.fecha_ini,r.fecha_fin]);
    }
    db.run('COMMIT');
    logger.info(`Snapshot restaurado: ${registro.nombre_archivo}`);
    auditLog(req.user.email, 'CSV_RESTAURADO', { archivo: registro.nombre_archivo, tasks: horasData.length, iniciativas: planData.length }, req.ip);
    res.json({ ok: true, tasks: horasData.length, iniciativas: planData.length });
  } catch(e) {
    try { db.run('ROLLBACK'); } catch(_) {}
    res.status(500).json({ error: 'Error al restaurar: ' + e.message });
  }
});

router.delete('/historial-csv/:id', authMiddleware, adminOnly, (req, res) => {
  db.run('DELETE FROM historial_csv WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
