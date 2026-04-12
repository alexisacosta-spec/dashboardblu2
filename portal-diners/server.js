require('dotenv').config();
const express    = require('express');
const { Database } = require('node-sqlite3-wasm');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DEV_MODE   = process.env.DEV_MODE === 'true';
const DB_PATH    = path.join(__dirname, 'portal.db');

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── BASE DE DATOS ────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

// Tablas de sistema (nunca se recrean)
db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, perfil TEXT NOT NULL DEFAULT 'gestor',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')), ultimo_acceso TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, codigo TEXT NOT NULL,
  expira_en TEXT NOT NULL, usado INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
)`);
db.run(`CREATE TABLE IF NOT EXISTS sesiones_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, email TEXT, evento TEXT, ip TEXT,
  fecha TEXT DEFAULT (datetime('now'))
)`);

// Tablas de configuración (persistentes — NO se borran en migraciones)
db.run(`CREATE TABLE IF NOT EXISTS equipo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  correo TEXT UNIQUE NOT NULL,
  empresa TEXT NOT NULL,
  rol TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo',
  creado_en TEXT DEFAULT (datetime('now'))
)`);
db.run(`CREATE TABLE IF NOT EXISTS tarifas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  rol TEXT NOT NULL,
  tarifa REAL NOT NULL DEFAULT 0,
  UNIQUE(empresa, rol)
)`);

// Migración de datos: detectar esquema viejo y recrear solo tablas de datos
const SCHEMA_VERSION = 5;
db.run("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)");
db.run("INSERT OR IGNORE INTO _meta VALUES ('schema_version','0')");
const currentVersion = parseInt((db.get("SELECT value FROM _meta WHERE key='schema_version'") || {value:'0'}).value);

if (currentVersion < SCHEMA_VERSION) {
  console.log(`🔄 Migrando BD de v${currentVersion} a v${SCHEMA_VERSION}…`);
  db.run('DROP TABLE IF EXISTS datos_horas');
  db.run('DROP TABLE IF EXISTS tasks_plan');
  db.run('DROP TABLE IF EXISTS test_cases');
  db.run(`UPDATE _meta SET value='${SCHEMA_VERSION}' WHERE key='schema_version'`);
}

db.run(`CREATE TABLE IF NOT EXISTS datos_horas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_iniciativa TEXT, nombre_iniciativa TEXT,
  id_epic TEXT,       nombre_epic TEXT,
  id_hu TEXT,         nombre_hu TEXT,
  id_task TEXT,       nombre_task TEXT,
  nombre_persona TEXT, correo TEXT,
  empresa TEXT, rol TEXT, categoria_negocio TEXT,
  horas_completadas REAL, costo REAL, tarifa REAL,
  mes INTEGER, anio INTEGER, estado TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS tasks_plan (
  id_iniciativa TEXT PRIMARY KEY,
  nombre_iniciativa TEXT,
  categoria_negocio TEXT,
  total_tasks INTEGER DEFAULT 0,
  cerradas INTEGER DEFAULT 0,
  activas INTEGER DEFAULT 0,
  nuevas INTEGER DEFAULT 0,
  fecha_ini TEXT,
  fecha_fin TEXT
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_id_ini  ON datos_horas(id_iniciativa)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_id_epic ON datos_horas(id_epic)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_id_hu   ON datos_horas(id_hu)`);

db.run(`CREATE TABLE IF NOT EXISTS historial_csv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_archivo TEXT NOT NULL,
  fecha_carga TEXT DEFAULT (datetime('now')),
  usuario TEXT,
  tasks_cargadas INTEGER DEFAULT 0,
  iniciativas INTEGER DEFAULT 0,
  sin_lookup INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'ok',
  log_error TEXT,
  snapshot_horas TEXT,
  snapshot_plan TEXT
)`);
// Migración: agregar log_error si no existe
const colsHist = db.all("PRAGMA table_info(historial_csv)").map(c => c.name);
if (!colsHist.includes('log_error')) {
  db.run("ALTER TABLE historial_csv ADD COLUMN log_error TEXT");
}

// Admin por defecto
const adminExiste = db.get('SELECT id FROM usuarios WHERE email = ?', ['alexis.acosta@centrohub.co']);
if (!adminExiste) {
  const hash = bcrypt.hashSync('Admin2026!', 10);
  db.run('INSERT INTO usuarios (nombre,email,password_hash,perfil) VALUES (?,?,?,?)',
    ['Alexis Acosta','alexis.acosta@centrohub.co',hash,'admin']);
  console.log('\n✅ Usuario admin creado: alexis.acosta@centrohub.co / Admin2026!\n');
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.office365.com',
  port: parseInt(process.env.MAIL_PORT || '587'),
  secure: false,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});
async function enviarOTP(email, nombre, codigo) {
  if (DEV_MODE) { console.log(`\n📧 OTP para ${email}: ${codigo}\n`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Código de verificación — Portal Gerencial Diners',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Gerencial · BLU 2.0</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Tu código de verificación es:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#2B5FE8;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#fff">⏱ Expira en 5 minutos</span></div></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Sesión expirada' }); }
}
function adminOnly(req, res, next) {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}
const vc = u => ['admin','gerente'].includes(u.perfil);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email?.toLowerCase().trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    db.run('INSERT INTO sesiones_log (email,evento,ip) VALUES (?,?,?)', [email,'LOGIN_FALLIDO',req.ip]);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  db.run('DELETE FROM otp_codes WHERE user_id=?', [user.id]);
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO otp_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id,codigo,expira]);
  enviarOTP(user.email, user.nombre, codigo).catch(e => console.error('Email error:',e.message));
  db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id,user.email,'OTP_ENVIADO',req.ip]);
  res.json({ ok: true });
});
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, codigo } = req.body;
  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email?.toLowerCase().trim()]);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const otp = db.get('SELECT * FROM otp_codes WHERE user_id=? AND codigo=? AND usado=0 AND expira_en>? ORDER BY id DESC LIMIT 1', [user.id, codigo, now]);
  if (!otp) {
    db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id,user.email,'OTP_FALLIDO',req.ip]);
    return res.status(401).json({ error: 'Código incorrecto o expirado' });
  }
  db.run('UPDATE otp_codes SET usado=1 WHERE id=?', [otp.id]);
  db.run('UPDATE usuarios SET ultimo_acceso=? WHERE id=?', [now, user.id]);
  db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id,user.email,'LOGIN_OK',req.ip]);
  const token = jwt.sign({id:user.id,email:user.email,nombre:user.nombre,perfil:user.perfil}, JWT_SECRET, {expiresIn:'8h'});
  res.json({ ok:true, token, user:{nombre:user.nombre,email:user.email,perfil:user.perfil} });
});
app.post('/api/auth/resend-otp', (req, res) => {
  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [req.body.email?.toLowerCase().trim()]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.run('DELETE FROM otp_codes WHERE user_id=?', [user.id]);
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO otp_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id,codigo,expira]);
  enviarOTP(user.email, user.nombre, codigo).catch(console.error);
  res.json({ ok:true });
});

// ─── ADMIN USUARIOS ───────────────────────────────────────────────────────────
app.get('/api/admin/usuarios', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all('SELECT id,nombre,email,perfil,activo,creado_en,ultimo_acceso FROM usuarios ORDER BY creado_en DESC'));
});
app.post('/api/admin/usuarios', authMiddleware, adminOnly, (req, res) => {
  const {nombre,email,password,perfil} = req.body;
  if (!nombre||!email||!password||!perfil) return res.status(400).json({error:'Todos los campos son requeridos'});
  if (!['admin','gerente','gestor'].includes(perfil)) return res.status(400).json({error:'Perfil inválido'});
  try {
    db.run('INSERT INTO usuarios (nombre,email,password_hash,perfil) VALUES (?,?,?,?)',
      [nombre, email.toLowerCase().trim(), bcrypt.hashSync(password,10), perfil]);
    res.json({ok:true});
  } catch(e) { res.status(409).json({error:'El email ya existe'}); }
});
app.patch('/api/admin/usuarios/:id', authMiddleware, adminOnly, (req, res) => {
  const {activo,perfil,password} = req.body; const {id} = req.params;
  if (activo!==undefined) db.run('UPDATE usuarios SET activo=? WHERE id=?', [activo?1:0, id]);
  if (perfil) db.run('UPDATE usuarios SET perfil=? WHERE id=?', [perfil, id]);
  if (password) db.run('UPDATE usuarios SET password_hash=? WHERE id=?', [bcrypt.hashSync(password,10), id]);
  res.json({ok:true});
});
app.delete('/api/admin/usuarios/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id)===req.user.id) return res.status(400).json({error:'No puedes eliminar tu propia cuenta'});
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id]);
  res.json({ok:true});
});
app.get('/api/admin/logs', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all('SELECT * FROM sesiones_log ORDER BY fecha DESC LIMIT 200'));
});

// ─── ADMIN EQUIPO ─────────────────────────────────────────────────────────────
app.get('/api/admin/equipo', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all('SELECT * FROM equipo ORDER BY estado ASC, empresa ASC, nombre ASC'));
});
app.post('/api/admin/equipo', authMiddleware, adminOnly, (req, res) => {
  const { nombre, correo, empresa, rol } = req.body;
  if (!nombre||!correo||!empresa||!rol) return res.status(400).json({error:'Todos los campos son requeridos'});
  try {
    db.run('INSERT INTO equipo (nombre,correo,empresa,rol) VALUES (?,?,?,?)',
      [nombre.trim(), correo.toLowerCase().trim(), empresa.trim(), rol.trim()]);
    res.json({ok:true});
  } catch(e) { res.status(409).json({error:'El correo ya existe en el equipo'}); }
});
app.patch('/api/admin/equipo/:id', authMiddleware, adminOnly, (req, res) => {
  const { nombre, correo, empresa, rol, estado } = req.body;
  const id = req.params.id;
  if (nombre)  db.run('UPDATE equipo SET nombre=?  WHERE id=?', [nombre.trim(), id]);
  if (correo)  db.run('UPDATE equipo SET correo=?  WHERE id=?', [correo.toLowerCase().trim(), id]);
  if (empresa) db.run('UPDATE equipo SET empresa=? WHERE id=?', [empresa.trim(), id]);
  if (rol)     db.run('UPDATE equipo SET rol=?     WHERE id=?', [rol.trim(), id]);
  if (estado)  db.run('UPDATE equipo SET estado=?  WHERE id=?', [estado, id]);
  res.json({ok:true});
});
// Sin DELETE — el equipo es histórico permanente

// multer para uploads de archivos
const upload = multer({ dest: os.tmpdir() });

// ─── CARGA MASIVA DE EQUIPO ───────────────────────────────────────────────────
app.post('/api/admin/equipo/importar', authMiddleware, adminOnly, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(req.file.path);
    fs.unlinkSync(req.file.path);

    // Buscar la primera hoja con datos
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!raw.length) return res.status(400).json({ error: 'El archivo está vacío' });

    // Detectar columnas de forma flexible (case-insensitive, sin tildes)
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
    if (faltantes.length) {
      return res.status(400).json({ error: `Columnas no encontradas: ${faltantes.join(', ')}` });
    }

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
      if (!correo.includes('@')) {
        errores.push(`Correo inválido: ${correo}`);
        continue;
      }

      const existe = db.get('SELECT id FROM equipo WHERE correo=?', [correo]);
      if (existe) {
        db.run('UPDATE equipo SET nombre=?,empresa=?,rol=? WHERE correo=?',
          [nombre, empresa, rol, correo]);
        actualizados++;
      } else {
        db.run('INSERT INTO equipo (nombre,correo,empresa,rol) VALUES (?,?,?,?)',
          [nombre, correo, empresa, rol]);
        agregados++;
      }
    }

    console.log(`✅ Equipo importado: ${agregados} nuevos · ${actualizados} actualizados`);
    res.json({ ok: true, agregados, actualizados, errores });
  } catch(e) {
    console.error('Error importando equipo:', e);
    res.status(500).json({ error: 'Error procesando el archivo: ' + e.message });
  }
});

// ─── ADMIN TARIFAS ────────────────────────────────────────────────────────────
app.get('/api/admin/tarifas', authMiddleware, adminOnly, (req, res) => {
  res.json(db.all('SELECT * FROM tarifas ORDER BY empresa ASC, rol ASC'));
});
app.post('/api/admin/tarifas', authMiddleware, adminOnly, (req, res) => {
  const { empresa, rol, tarifa } = req.body;
  if (!empresa||!rol||tarifa===undefined) return res.status(400).json({error:'Todos los campos son requeridos'});
  try {
    db.run('INSERT INTO tarifas (empresa,rol,tarifa) VALUES (?,?,?)',
      [empresa.trim(), rol.trim(), parseFloat(tarifa)]);
    res.json({ok:true});
  } catch(e) { res.status(409).json({error:'Ya existe una tarifa para esa empresa + rol'}); }
});
app.patch('/api/admin/tarifas/:id', authMiddleware, adminOnly, (req, res) => {
  const { empresa, rol, tarifa } = req.body;
  const id = req.params.id;
  if (empresa)          db.run('UPDATE tarifas SET empresa=? WHERE id=?', [empresa.trim(), id]);
  if (rol)              db.run('UPDATE tarifas SET rol=?     WHERE id=?', [rol.trim(), id]);
  if (tarifa!==undefined) db.run('UPDATE tarifas SET tarifa=? WHERE id=?', [parseFloat(tarifa), id]);
  res.json({ok:true});
});
app.delete('/api/admin/tarifas/:id', authMiddleware, adminOnly, (req, res) => {
  db.run('DELETE FROM tarifas WHERE id=?', [req.params.id]);
  res.json({ok:true});
});

// ─── CARGA CSV DE ADO ─────────────────────────────────────────────────────────

// Helper: parsear "Apellido, Nombre <email@domain.com>"
function parseAssignedTo(s) {
  if (!s || typeof s !== 'string' || !s.trim()) return { nombre: '', correo: '' };
  const emailMatch = s.match(/<([^>]+)>/);
  const correo = emailMatch ? emailMatch[1].trim().toLowerCase() : '';
  const nombre = s.replace(/<[^>]+>/, '').trim();
  return { nombre, correo };
}

// Helper: parsear fecha en formato "d/m/yyyy h:mm:ss" o ISO
function parseFecha(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const d = val;
    return isNaN(d) || d.getFullYear() < 1980 ? null : d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  // Formato "1/12/2025 2:36:00 p.m."
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
  }
  return null;
}

app.post('/api/admin/cargar-csv', authMiddleware, adminOnly, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({error:'No se recibió archivo'});
  try {
    // Leer CSV eliminando BOM si existe
    let contenido = fs.readFileSync(req.file.path, 'utf-8');
    if (contenido.charCodeAt(0) === 0xFEFF) contenido = contenido.slice(1); // strip BOM
    fs.unlinkSync(req.file.path);

    // Parser CSV robusto (maneja comas dentro de comillas)
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
        headers.forEach((h,i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
    }

    const raw = parseCSV(contenido);
    console.log(`📋 CSV cargado: ${raw.length} filas`);

    // Helper: normalizar ID que puede venir como "96119" o "96119.0" (float del CSV)
    // NO usar rstrip('.0') porque corrompe IDs que terminan en 0 (ej: 96120.0 → '9612')
    const normId = v => {
      const s = String(v || '').trim();
      if (!s || s === 'nan') return '';
      // Si tiene decimal (ej: "96119.0"), convertir a entero limpio
      return s.includes('.') ? String(parseInt(parseFloat(s))) : s;
    };

    // ── Construir índice ID→nodo para resolución de jerarquía ──
    const byId = {};
    raw.forEach(r => {
      const id = normId(r['ID']);
      if (id) byId[id] = r;
    });

    // ── Índice de categoría por ID de Iniciativa ──
    const catPorIniciativa = {};
    raw.forEach(r => {
      if ((r['Work Item Type'] || '').trim() === 'Iniciativa') {
        const id  = normId(r['ID']);
        const cat = (r['neg_Categoria'] || '').trim();
        if (id && cat) catPorIniciativa[id] = cat;
      }
    });

    // ── Subir árbol para encontrar ancestros de una task ──
    function resolverJerarquia(idStr) {
      const result = {
        id_iniciativa:'', nombre_iniciativa:'',
        id_epic:'',       nombre_epic:'',
        id_hu:'',         nombre_hu:'',
        id_task:idStr,    nombre_task:''
      };
      const HU_TYPES = new Set(['User Story','Enabler','Feature','Channel Service']);
      let curr = idStr;
      // Nombre de la task
      const taskNode = byId[curr];
      if (taskNode) {
        for (const t of ['Title 4','Title 3','Title 2','Title 1','Title 5']) {
          if (taskNode[t] && taskNode[t].trim()) { result.nombre_task = taskNode[t].trim(); break; }
        }
      }
      // Subir árbol — usar normId para que los Parent con decimales matcheen el índice
      let visitados = new Set();
      while (curr) {
        if (visitados.has(curr)) break;
        visitados.add(curr);
        const node = byId[curr];
        if (!node) break;
        const parent = normId(node['Parent']);   // ← normId en lugar de String().trim()
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

    // ── Lookups de equipo y tarifas ──
    const equipoMap  = {};
    db.all('SELECT correo,empresa,rol FROM equipo').forEach(r => {
      equipoMap[r.correo.toLowerCase().trim()] = r;
    });
    const tarifaMap = {};
    db.all('SELECT empresa,rol,tarifa FROM tarifas').forEach(r => {
      tarifaMap[`${r.empresa}||${r.rol}`] = r.tarifa;
    });

    // ── Procesar tasks ──
    const tasks = raw.filter(r => (r['Work Item Type']||'').trim() === 'Task');
    console.log(`  Tasks en CSV: ${tasks.length}`);

    const noValidos = [];   // correos sin lookup en equipo
    const procesadas = [];

    for (const r of tasks) {
      const id   = normId(r['ID']);
      const { nombre, correo } = parseAssignedTo(r['Assigned To']);
      const horas = parseFloat(r['Completed Work'] || 0);
      const state = (r['State'] || '').trim();

      // Resolver empresa/rol
      const miembro = correo ? equipoMap[correo.toLowerCase()] : null;
      if (!miembro) {
        if (correo && !noValidos.includes(correo)) noValidos.push(correo);
      }
      const empresa = miembro?.empresa || 'Sin asignar';
      const rol     = miembro?.rol     || 'Sin asignar';
      const tarifa  = miembro ? (tarifaMap[`${empresa}||${rol}`] || 0) : 0;
      const costo   = horas * tarifa;

      // Resolver jerarquía
      const jer = resolverJerarquia(id);

      // Categoría: viene de la Iniciativa, no de la Task
      let cat = '';
      if (jer.id_iniciativa) cat = catPorIniciativa[jer.id_iniciativa] || '';
      if (!cat) cat = (r['neg_Categoria'] || '').trim();
      if (!cat || cat.toUpperCase().startsWith('SIN') || cat.toUpperCase().startsWith('NO')) cat = 'Sin Clasificar';

      // Fechas — Hasta_Task es obligatoria para contar la task
      const fechaIni = parseFecha(r['Desde_task']);
      const fechaFin = parseFecha(r['Hasta_Task']);
      // Mes y año basado en Hasta_Task (mes de entrega real)
      // Si no tiene Hasta_Task → mes=0, anio=0 → task excluida del dashboard (no válida)
      const mes  = fechaFin ? parseInt(fechaFin.split('-')[1]) : 0;
      const anio = fechaFin ? parseInt(fechaFin.split('-')[0]) : 0;

      procesadas.push({
        ...jer, nombre_persona: nombre, correo, empresa, rol,
        categoria_negocio: cat, horas_completadas: horas,
        costo, tarifa, mes, anio, estado: state,
        fecha_ini: fechaIni, fecha_fin: fechaFin,
        // Regla de negocio: Closed + Hasta_Task obligatoria + horas > 0 + no Diners
        // Tasks Closed sin Hasta_Task no cuentan (sin fecha de cierre confirmada)
        valido: state === 'Closed' && !!fechaFin && horas > 0 && empresa !== 'Diners'
      });
    }

    // ── Insertar datos_horas (solo tasks válidas para métricas) ──
    db.run('DELETE FROM datos_horas');
    db.run('BEGIN TRANSACTION');
    let insertadas = 0;
    for (const t of procesadas) {
      if (!t.valido) continue;
      db.run(`INSERT INTO datos_horas
        (id_iniciativa,nombre_iniciativa,id_epic,nombre_epic,id_hu,nombre_hu,
         id_task,nombre_task,nombre_persona,correo,empresa,rol,categoria_negocio,
         horas_completadas,costo,tarifa,mes,anio,estado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [t.id_iniciativa||'SIN_INI', t.nombre_iniciativa||'Sin Iniciativa',
         t.id_epic||'SIN_EPIC',      t.nombre_epic||'Sin Epic',
         t.id_hu||'SIN_HU',          t.nombre_hu||'Sin HU',
         t.id_task, t.nombre_task,   t.nombre_persona, t.correo,
         t.empresa, t.rol, t.categoria_negocio,
         t.horas_completadas, t.costo, t.tarifa,
         t.mes, t.anio, t.estado]);
      insertadas++;
    }
    db.run('COMMIT');

    // ── Calcular tasks_plan (TODAS las tasks, sin filtros) ──
    const planMap = {};
    for (const t of procesadas) {
      const id = t.id_iniciativa || 'SIN_INI';
      if (id === 'SIN_INI') continue;
      if (!planMap[id]) {
        planMap[id] = { id, nom: t.nombre_iniciativa, cat: t.categoria_negocio,
          total:0, cerradas:0, activas:0, nuevas:0, fIni:null, fFin:null };
      }
      planMap[id].total++;
      if (t.estado === 'Closed')  planMap[id].cerradas++;
      if (t.estado === 'Active')  planMap[id].activas++;
      if (t.estado === 'New')     planMap[id].nuevas++;
      if (t.fecha_ini && (!planMap[id].fIni || t.fecha_ini < planMap[id].fIni)) planMap[id].fIni = t.fecha_ini;
      if (t.fecha_fin && (!planMap[id].fFin || t.fecha_fin > planMap[id].fFin)) planMap[id].fFin = t.fecha_fin;
    }
    db.run('DELETE FROM tasks_plan');
    db.run('BEGIN TRANSACTION');
    Object.values(planMap).forEach(p => {
      db.run(`INSERT INTO tasks_plan (id_iniciativa,nombre_iniciativa,categoria_negocio,total_tasks,cerradas,activas,nuevas,fecha_ini,fecha_fin) VALUES (?,?,?,?,?,?,?,?,?)`,
        [p.id, p.nom, p.cat, p.total, p.cerradas, p.activas, p.nuevas, p.fIni, p.fFin]);
    });
    db.run('COMMIT');

    const checkH = db.get('SELECT COUNT(*) as n FROM datos_horas').n;
    const checkP = db.get('SELECT COUNT(*) as n FROM tasks_plan').n;
    console.log(`✅ CSV procesado: ${insertadas} tasks con horas · ${checkP} iniciativas · ${noValidos.length} correos sin lookup`);

    // Guardar snapshot para posible rollback
    const snapHoras = JSON.stringify(db.all('SELECT * FROM datos_horas'));
    const snapPlan  = JSON.stringify(db.all('SELECT * FROM tasks_plan'));

    // Mantener solo los últimos 5 snapshots (los más pesados)
    const histCount = db.get('SELECT COUNT(*) as n FROM historial_csv').n;
    if (histCount >= 5) {
      const oldest = db.get('SELECT id FROM historial_csv ORDER BY id ASC LIMIT 1');
      if (oldest) db.run('DELETE FROM historial_csv WHERE id=?', [oldest.id]);
    }

    // Construir log de advertencias de correos sin lookup
    const logError = noValidos.length > 0
      ? `${noValidos.length} correo(s) sin lookup en equipo: ${noValidos.slice(0,5).join(', ')}${noValidos.length > 5 ? ` y ${noValidos.length-5} más` : ''}`
      : null;

    db.run(`INSERT INTO historial_csv (nombre_archivo,usuario,tasks_cargadas,iniciativas,sin_lookup,estado,log_error,snapshot_horas,snapshot_plan)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.file?.originalname || 'archivo.csv', req.user.email,
       insertadas, checkP, noValidos.length, 'ok', logError, snapHoras, snapPlan]);

    res.json({
      ok: true,
      tasks_total: tasks.length,
      tasks_con_horas: insertadas,
      iniciativas: checkP,
      sin_lookup: noValidos
    });
  } catch(e) {
    try { db.run('ROLLBACK'); } catch(_) {}
    console.error('Error procesando CSV:', e);
    // Registrar el error en el historial para trazabilidad
    try {
      db.run(`INSERT INTO historial_csv (nombre_archivo,usuario,tasks_cargadas,iniciativas,sin_lookup,estado,log_error,snapshot_horas,snapshot_plan)
              VALUES (?,?,?,?,?,?,?,?,?)`,
        [req.file?.originalname || 'archivo.csv', req.user?.email || '',
         0, 0, 0, 'error', e.message, null, null]);
    } catch(_) {}
    res.status(500).json({ error: 'Error procesando el archivo: ' + e.message });
  }
});

// ─── API DASHBOARD ────────────────────────────────────────────────────────────
function buildWhere(q) {
  const c=[], p=[];
  if (q.anio)      { c.push('anio=?');              p.push(parseInt(q.anio)); }
  if (q.mes)       { c.push('mes=?');               p.push(parseInt(q.mes)); }
  if (q.empresa)   { c.push('empresa=?');           p.push(q.empresa); }
  if (q.categoria) { c.push('categoria_negocio=?'); p.push(q.categoria); }
  if (q.iniciativa){ c.push('id_iniciativa=?');     p.push(String(q.iniciativa)); }
  return { where: c.length ? 'WHERE '+c.join(' AND ') : '', params: p };
}
const fmt = (rows, u) => rows.map(r => ({
  ...r,
  costo: vc(u) ? Math.round(r.costo||0) : null,
  horas: Math.round((r.horas||0)*10)/10
}));

app.get('/api/datos/kpis', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  const t = db.get(`SELECT SUM(horas_completadas) as horas, SUM(costo) as costo FROM datos_horas ${where}`, params)||{};
  const i = db.get(`SELECT COUNT(DISTINCT id_iniciativa) as total FROM datos_horas ${where}`, params)||{};
  const p = db.get(`SELECT COUNT(DISTINCT nombre_persona) as total FROM datos_horas ${where}`, params)||{};
  res.json({ horas:Math.round((t.horas||0)*10)/10, costo:vc(req.user)?Math.round(t.costo||0):null, iniciativas:i.total||0, personas:p.total||0 });
});
app.get('/api/datos/por-mes', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  res.json(fmt(db.all(`SELECT anio,mes,SUM(horas_completadas) as horas,SUM(costo) as costo FROM datos_horas ${where} GROUP BY anio,mes ORDER BY anio,mes`, params), req.user));
});
app.get('/api/datos/por-empresa', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  res.json(fmt(db.all(`SELECT empresa,SUM(horas_completadas) as horas,SUM(costo) as costo FROM datos_horas ${where} GROUP BY empresa ORDER BY horas DESC`, params), req.user));
});
app.get('/api/datos/por-rol', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  res.json(fmt(db.all(`SELECT rol,SUM(horas_completadas) as horas,SUM(costo) as costo FROM datos_horas ${where} GROUP BY rol ORDER BY horas DESC`, params), req.user));
});
app.get('/api/datos/por-categoria', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  res.json(fmt(db.all(`SELECT categoria_negocio,SUM(horas_completadas) as horas,SUM(costo) as costo FROM datos_horas ${where} GROUP BY categoria_negocio ORDER BY horas DESC`, params), req.user));
});
app.get('/api/datos/por-iniciativa', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  const rows = db.all(`SELECT id_iniciativa,nombre_iniciativa,categoria_negocio,SUM(horas_completadas) as horas,SUM(costo) as costo,COUNT(DISTINCT nombre_persona) as personas FROM datos_horas ${where} GROUP BY id_iniciativa,nombre_iniciativa ORDER BY horas DESC`, params);
  const total = rows.reduce((s,r)=>s+(r.horas||0),0);
  res.json(rows.map(r=>({...r,costo:vc(req.user)?Math.round(r.costo||0):null,horas:Math.round((r.horas||0)*10)/10,pct:total>0?Math.round((r.horas/total)*1000)/10:0})));
});
app.get('/api/datos/iniciativa/:idIni/epics', authMiddleware, (req,res) => {
  const idIni = String(req.params.idIni).trim();
  const q = {...req.query}; delete q.iniciativa;
  const {where:ew,params:ep} = buildWhere(q);
  const where = ew ? ew+' AND id_iniciativa=?' : 'WHERE id_iniciativa=?';
  res.json(fmt(db.all(`SELECT id_epic,nombre_epic,SUM(horas_completadas) as horas,SUM(costo) as costo,COUNT(DISTINCT nombre_persona) as personas FROM datos_horas ${where} GROUP BY id_epic,nombre_epic ORDER BY horas DESC`, [...ep,idIni]), req.user));
});
app.get('/api/datos/epic/:idEpic/hus', authMiddleware, (req,res) => {
  const idEpic = String(req.params.idEpic).trim();
  const {where:ew,params:ep} = buildWhere(req.query);
  const where = ew ? ew+' AND id_epic=?' : 'WHERE id_epic=?';
  res.json(fmt(db.all(`SELECT id_hu,nombre_hu,SUM(horas_completadas) as horas,SUM(costo) as costo,COUNT(DISTINCT nombre_persona) as personas FROM datos_horas ${where} GROUP BY id_hu,nombre_hu ORDER BY horas DESC`, [...ep,idEpic]), req.user));
});
app.get('/api/datos/hu/:idHu/tasks', authMiddleware, (req,res) => {
  const idHu = String(req.params.idHu).trim();
  const rows = db.all(`SELECT id_task,nombre_task,nombre_persona,empresa,rol,horas_completadas,costo,mes,anio FROM datos_horas WHERE id_hu=? ORDER BY horas_completadas DESC`, [idHu]);
  res.json(rows.map(r=>({...r,costo:vc(req.user)?Math.round(r.costo||0):null,horas_completadas:Math.round((r.horas_completadas||0)*10)/10})));
});
app.get('/api/datos/por-persona', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  res.json(fmt(db.all(`SELECT nombre_persona,correo,empresa,rol,SUM(horas_completadas) as horas,SUM(costo) as costo FROM datos_horas ${where} GROUP BY nombre_persona ORDER BY horas DESC`, params), req.user));
});

// Tasks detalle por persona (drill-down — busca por nombre_persona)
app.get('/api/datos/persona/:nombre/tasks', authMiddleware, (req,res) => {
  const nombre = decodeURIComponent(req.params.nombre);
  const q = {...req.query}; delete q.iniciativa;
  const {where: ew, params: ep} = buildWhere(q);
  const where = ew ? ew + ' AND nombre_persona=?' : 'WHERE nombre_persona=?';
  const rows = db.all(`
    SELECT id_task, nombre_task, nombre_iniciativa, nombre_epic, nombre_hu,
           horas_completadas, costo, mes, anio, estado
    FROM datos_horas ${where}
    ORDER BY anio DESC, mes DESC, horas_completadas DESC`,
    [...ep, nombre]);
  res.json(rows.map(r => ({
    ...r,
    costo: vc(req.user) ? Math.round(r.costo||0) : null,
    horas_completadas: Math.round((r.horas_completadas||0)*10)/10
  })));
});
app.get('/api/datos/personas/export', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  const rows = db.all(`
    SELECT nombre_persona, empresa, rol,
           nombre_iniciativa, nombre_epic, nombre_hu,
           nombre_task, id_task, mes, anio,
           horas_completadas, costo
    FROM datos_horas ${where}
    ORDER BY nombre_persona, anio DESC, mes DESC, horas_completadas DESC
  `, params);
  res.json(rows.map(r => ({
    ...r,
    costo: vc(req.user) ? Math.round(r.costo||0) : null,
    horas_completadas: Math.round((r.horas_completadas||0)*10)/10
  })));
});
app.get('/api/datos/empresa-rol', authMiddleware, (req,res) => {
  const {where,params} = buildWhere(req.query);
  res.json(db.all(`SELECT empresa,rol,SUM(horas_completadas) as horas FROM datos_horas ${where} GROUP BY empresa,rol ORDER BY empresa,horas DESC`, params).map(r=>({...r,horas:Math.round((r.horas||0)*10)/10})));
});
app.get('/api/datos/filtros', authMiddleware, (req,res) => {
  res.json({
    anios:       db.all("SELECT DISTINCT anio FROM datos_horas WHERE anio>0 ORDER BY anio").map(r=>r.anio),
    meses:       db.all("SELECT DISTINCT mes FROM datos_horas WHERE mes>0 ORDER BY mes").map(r=>r.mes),
    empresas:    db.all("SELECT DISTINCT empresa FROM datos_horas WHERE empresa!='' ORDER BY empresa").map(r=>r.empresa),
    categorias:  db.all("SELECT DISTINCT categoria_negocio FROM datos_horas WHERE categoria_negocio!='' ORDER BY categoria_negocio").map(r=>r.categoria_negocio),
    iniciativas: db.all("SELECT DISTINCT id_iniciativa,nombre_iniciativa FROM datos_horas WHERE nombre_iniciativa!='' ORDER BY nombre_iniciativa").map(r=>({id:r.id_iniciativa,nombre:r.nombre_iniciativa})),
  });
});
app.get('/api/datos/estado', authMiddleware, (req,res) => {
  res.json({ total: (db.get('SELECT COUNT(*) as total FROM datos_horas')||{}).total||0 });
});
app.get('/api/datos/avance-iniciativas', authMiddleware, (req,res) => {
  const { desde, hasta } = req.query;
  let sql = `SELECT * FROM tasks_plan WHERE id_iniciativa NOT IN ('SIN_INI','SIN PARENT','')`;
  const params = [];
  if (desde && hasta) {
    sql += ` AND fecha_ini <= ? AND fecha_fin >= ?`;
    params.push(hasta, desde);
  }
  sql += ` ORDER BY cerradas DESC`;
  const rows = db.all(sql, params);
  res.json(rows.map(r => ({
    id: r.id_iniciativa, nombre: r.nombre_iniciativa,
    categoria: r.categoria_negocio || 'Sin Clasificar',
    cerradas: r.cerradas||0, activas: r.activas||0, nuevas: r.nuevas||0,
    total: r.total_tasks||0,
    pct: r.total_tasks>0 ? Math.round(r.cerradas/r.total_tasks*1000)/10 : 0,
    fecha_ini: r.fecha_ini, fecha_fin: r.fecha_fin
  })));
});

// ─── INDICADORES ─────────────────────────────────────────────────────────────
app.get('/api/indicadores/lead-time', authMiddleware, (req, res) => {
  const rows = db.all(`
    SELECT id_iniciativa, nombre_iniciativa, categoria_negocio,
           total_tasks, cerradas, activas, nuevas, fecha_ini, fecha_fin
    FROM tasks_plan
    WHERE id_iniciativa NOT IN ('SIN_INI','SIN PARENT','')
      AND fecha_ini IS NOT NULL AND fecha_fin IS NOT NULL
      AND fecha_ini != '' AND fecha_fin != ''
    ORDER BY nombre_iniciativa
  `);

  const iniciativas = rows.map(r => {
    const ini = new Date(r.fecha_ini);
    const fin = new Date(r.fecha_fin);
    const lt  = Math.max(0, Math.round((fin - ini) / 86400000));
    return {
      id:        r.id_iniciativa,
      nombre:    r.nombre_iniciativa,
      categoria: r.categoria_negocio || 'Sin Clasificar',
      fecha_ini: r.fecha_ini,
      fecha_fin: r.fecha_fin,
      lead_time: lt,
      pct:       r.total_tasks > 0 ? Math.round(r.cerradas / r.total_tasks * 1000) / 10 : 0,
      cerradas:  r.cerradas  || 0,
      total:     r.total_tasks || 0
    };
  });

  // KPIs globales
  const lts = iniciativas.map(r => r.lead_time).sort((a, b) => a - b);
  const n   = lts.length;
  const promedio = n > 0 ? Math.round(lts.reduce((s, v) => s + v, 0) / n) : 0;
  const mediana  = n > 0
    ? (n % 2 === 0 ? Math.round((lts[n/2-1] + lts[n/2]) / 2) : lts[Math.floor(n/2)])
    : 0;
  const minimo = n > 0 ? lts[0]     : 0;
  const maximo = n > 0 ? lts[n - 1] : 0;

  // Distribución por rangos
  const distribucion = { '0–30d': 0, '31–60d': 0, '61–90d': 0, '91–180d': 0, '180+d': 0 };
  for (const lt of lts) {
    if      (lt <= 30)  distribucion['0–30d']++;
    else if (lt <= 60)  distribucion['31–60d']++;
    else if (lt <= 90)  distribucion['61–90d']++;
    else if (lt <= 180) distribucion['91–180d']++;
    else                distribucion['180+d']++;
  }

  res.json({ iniciativas, kpis: { promedio, mediana, minimo, maximo, total: n }, distribucion });
});

// ─── HISTORIAL CSV ───────────────────────────────────────────────────────────
app.get('/api/admin/historial-csv', authMiddleware, adminOnly, (req, res) => {
  // No devolver los snapshots (muy pesados) — solo metadata
  res.json(db.all(`
    SELECT id, nombre_archivo, fecha_carga, usuario,
           tasks_cargadas, iniciativas, sin_lookup, estado, log_error
    FROM historial_csv ORDER BY id DESC`));
});

app.post('/api/admin/historial-csv/:id/restaurar', authMiddleware, adminOnly, (req, res) => {
  const registro = db.get('SELECT * FROM historial_csv WHERE id=?', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!registro.snapshot_horas || !registro.snapshot_plan) {
    return res.status(400).json({ error: 'Este registro no tiene snapshot de datos' });
  }
  try {
    const horasData = JSON.parse(registro.snapshot_horas);
    const planData  = JSON.parse(registro.snapshot_plan);

    db.run('DELETE FROM datos_horas');
    db.run('DELETE FROM tasks_plan');
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
    console.log(`🔄 Restaurado snapshot de: ${registro.nombre_archivo}`);
    res.json({ ok: true, tasks: horasData.length, iniciativas: planData.length });
  } catch(e) {
    try { db.run('ROLLBACK'); } catch(_) {}
    res.status(500).json({ error: 'Error al restaurar: ' + e.message });
  }
});

app.delete('/api/admin/historial-csv/:id', authMiddleware, adminOnly, (req, res) => {
  db.run('DELETE FROM historial_csv WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── ARRANQUE ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(interfaces))
    for (const alias of iface)
      if (alias.family==='IPv4' && !alias.internal) { localIP=alias.address; break; }
  const total = (db.get('SELECT COUNT(*) as t FROM datos_horas')||{}).t||0;
  const equipo = (db.get('SELECT COUNT(*) as t FROM equipo')||{}).t||0;
  const tarifas = (db.get('SELECT COUNT(*) as t FROM tarifas')||{}).t||0;
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      PORTAL GERENCIAL DINERS — BLU 2.0       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:  http://localhost:${PORT}                ║`);
  console.log(`║  Red:    http://${localIP}:${PORT}           ║`);
  console.log(`║  BD:     ${total} registros · ${equipo} colaboradores · ${tarifas} tarifas  ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});
