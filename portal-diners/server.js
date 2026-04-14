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
const crypto     = require('crypto');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app        = express();
const PORT       = process.env.PORT || 3000;
const DEV_MODE   = process.env.DEV_MODE === 'true';
const DB_PATH    = path.join(__dirname, 'portal.db');

// ─── SEC-02: Validar JWT_SECRET antes de arrancar ─────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret_change_me') {
  if (process.env.NODE_ENV === 'production') {
    console.error('\n❌ FATAL: JWT_SECRET no está configurado. El servidor no puede arrancar en producción.\n');
    process.exit(1);
  }
  console.warn('\n⚠️  ADVERTENCIA: Usando JWT_SECRET de desarrollo. No usar en producción.\n');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ─── SEC-08: Headers de seguridad HTTP (Helmet) ───────────────────────────────
// CSP deshabilitada: el portal usa archivos estáticos con scripts inline (onclick),
// lo que requiere nonces por request para ser compatible con CSP — complejidad innecesaria
// para un portal interno. Los demás headers de Helmet sí se aplican:
// X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, etc.
app.use(helmet({
  contentSecurityPolicy:      false,
  crossOriginEmbedderPolicy:  false
}));

// ─── SEC-04: Rate limiting en endpoints de autenticación ─────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Por favor espera 15 minutos antes de intentarlo de nuevo.' }
});
const resendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3,
  message: { error: 'Demasiadas solicitudes de reenvío. Espera un minuto.' }
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: { error: 'Demasiadas solicitudes de recuperación. Espera una hora.' }
});

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
  user_id INTEGER, email TEXT, evento TEXT, ip TEXT, detalle TEXT,
  fecha TEXT DEFAULT (datetime('now'))
)`);
// SEC-06: Tabla para invalidar tokens JWT en logout
db.run(`CREATE TABLE IF NOT EXISTS token_blocklist (
  jti  TEXT PRIMARY KEY,
  expira INTEGER NOT NULL
)`);
// Recuperación de contraseña
db.run(`CREATE TABLE IF NOT EXISTS password_reset_codes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  codigo    TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  usado     INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
)`);
// Invitaciones para nuevos usuarios (token 256-bit, 48h vigencia)
// Un usuario puede tener múltiples invitaciones (reinvitaciones); UNIQUE solo en token
db.run(`CREATE TABLE IF NOT EXISTS invitaciones (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  expira_en TEXT NOT NULL,
  usado     INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
)`);
// ─── MIGRACIONES SILENCIOSAS ──────────────────────────────────────────────────
// Añaden columnas que no existían en versiones anteriores de la BD.
// SQLite lanza error si la columna ya existe — se ignora con try/catch.
try { db.run(`ALTER TABLE sesiones_log ADD COLUMN detalle TEXT`); } catch(_) {}

// Limpiar tokens expirados al arrancar
db.run(`DELETE FROM token_blocklist WHERE expira < ${Math.floor(Date.now()/1000)}`);
// Migración silenciosa: password_hash puede ser cadena vacía en cuentas pendientes
// (SQLite acepta '' en columnas TEXT NOT NULL — el constraint solo bloquea NULL)

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
const SCHEMA_VERSION = 7;
db.run("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)");
db.run("INSERT OR IGNORE INTO _meta VALUES ('schema_version','0')");
const currentVersion = parseInt((db.get("SELECT value FROM _meta WHERE key='schema_version'") || {value:'0'}).value);

if (currentVersion < SCHEMA_VERSION) {
  console.log(`🔄 Migrando BD de v${currentVersion} a v${SCHEMA_VERSION}…`);
  db.run('DROP TABLE IF EXISTS datos_horas');
  db.run('DROP TABLE IF EXISTS tasks_plan');
  db.run('DROP TABLE IF EXISTS test_cases');
  db.run('DROP TABLE IF EXISTS bugs_csv');
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
  mes INTEGER, anio INTEGER, estado TEXT,
  sprint TEXT,
  horas_estimadas REAL DEFAULT 0,
  area_path TEXT DEFAULT ''
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

db.run(`CREATE TABLE IF NOT EXISTS bugs_csv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_bug TEXT,
  titulo TEXT,
  estado TEXT,
  sprint TEXT,
  ambiente TEXT,
  id_iniciativa TEXT, nombre_iniciativa TEXT,
  id_epic TEXT,       nombre_epic TEXT,
  id_hu TEXT,         nombre_hu TEXT,
  created_date TEXT,
  closed_date TEXT
)`);
// Migraciones silenciosas bugs_csv
try { db.run(`ALTER TABLE bugs_csv ADD COLUMN severity     TEXT DEFAULT ''`); } catch(_) {}
try { db.run(`ALTER TABLE bugs_csv ADD COLUMN categoria_bug TEXT DEFAULT ''`); } catch(_) {}

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

// ─── SEC-01: Admin inicial desde variables de entorno (nunca hardcodeado) ─────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NOMBRE   = process.env.ADMIN_NOMBRE || 'Administrador';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn('⚠️  ADVERTENCIA: ADMIN_EMAIL o ADMIN_PASSWORD no están en .env. No se creará el usuario admin inicial.');
} else {
  const adminExiste = db.get('SELECT id FROM usuarios WHERE email = ?', [ADMIN_EMAIL.toLowerCase()]);
  if (!adminExiste) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.run('INSERT INTO usuarios (nombre,email,password_hash,perfil) VALUES (?,?,?,?)',
      [ADMIN_NOMBRE, ADMIN_EMAIL.toLowerCase(), hash, 'admin']);
    console.log(`\n✅ Usuario admin creado: ${ADMIN_EMAIL}\n`);
  }
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
    subject: 'Código de verificación — Portal Canales',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Tu código de verificación es:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#2B5FE8;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#fff">⏱ Expira en 5 minutos</span></div></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

async function enviarResetPassword(email, nombre, codigo) {
  if (DEV_MODE) { console.log(`\n🔑 RESET PASSWORD para ${email}: ${codigo}\n`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Restablecimiento de contraseña — Portal Canales',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales · Recuperación de contraseña</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 8px;font-size:14px;color:#5A6E8A">Recibimos una solicitud para restablecer tu contraseña.</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Usa este código para continuar:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#C9A84C;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#0D1B2E">⏱ Expira en 5 minutos</span></div><p style="margin:24px 0 0;font-size:12px;color:#8A9BB0">Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no será modificada.</p></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

async function enviarInvitacion(email, nombre, token, portalUrl) {
  const link = `${portalUrl}?invite=${token}`;
  if (DEV_MODE) { console.log(`\n✉️  INVITACIÓN para ${email}: ${link}\n`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Bienvenido al Portal Canales — Activa tu cuenta',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales · Invitación de acceso</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 8px;font-size:14px;color:#5A6E8A">Has sido invitado a acceder al <strong>Portal Canales</strong> de Diners Club del Ecuador.</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Haz clic en el botón para crear tu contraseña y activar tu cuenta:</p><div style="text-align:center;margin:0 0 28px"><a href="${link}" style="display:inline-block;background:#2B5FE8;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:8px">Activar mi cuenta →</a></div><div style="background:#F2F5FA;border:1px solid #D0DCF0;border-radius:8px;padding:12px 16px;font-size:11px;color:#8A9BB0;word-break:break-all"><strong>O copia este enlace en tu navegador:</strong><br>${link}</div><div style="background:#C9A84C;border-radius:8px;padding:10px 16px;text-align:center;margin-top:20px"><span style="font-size:12px;font-weight:700;color:#0D1B2E">⏱ Este enlace expira en 48 horas</span></div><p style="margin:20px 0 0;font-size:12px;color:#8A9BB0">Si no esperabas esta invitación, puedes ignorar este mensaje.</p></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

// ─── HELPERS DE SEGURIDAD ─────────────────────────────────────────────────────

// SEC-03: Validar fortaleza de contraseña (mayúscula, minúscula, dígito, símbolo, 8+ chars)
function validatePassword(password) {
  if (!password || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password))          return 'Debe contener al menos una letra mayúscula';
  if (!/[a-z]/.test(password))          return 'Debe contener al menos una letra minúscula';
  if (!/[0-9]/.test(password))          return 'Debe contener al menos un número';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return 'Debe contener al menos un símbolo especial (!@#$%^&*...)';
  return null; // null = válida
}

// SEC-12: Registro de auditoría para acciones sensibles
function auditLog(email, evento, detalle, ip) {
  try {
    db.run(
      `INSERT INTO sesiones_log (email, evento, ip, detalle) VALUES (?,?,?,?)`,
      [email || '', evento, ip || '', detalle ? JSON.stringify(detalle) : null]
    );
  } catch(e) { console.error('auditLog error:', e.message); }
}

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────

// SEC-06: authMiddleware verifica token Y que no esté en la blocklist
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verificar que el token no haya sido invalidado en logout
    if (decoded.jti) {
      const bloqueado = db.get('SELECT jti FROM token_blocklist WHERE jti=?', [decoded.jti]);
      if (bloqueado) return res.status(401).json({ error: 'Sesión cerrada. Por favor inicia sesión de nuevo.' });
    }
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'Sesión expirada' }); }
}
function adminOnly(req, res, next) {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}
const vc = u => ['admin','gerente'].includes(u.perfil);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  // Buscar sin filtrar activo para distinguir pendiente vs inactivo
  const user = db.get('SELECT * FROM usuarios WHERE email=?', [email?.toLowerCase().trim()]);
  // Cuenta pendiente de activación (sin contraseña)
  if (user && user.activo === 0 && !user.password_hash) {
    db.run('INSERT INTO sesiones_log (email,evento,ip) VALUES (?,?,?)', [email,'LOGIN_PENDIENTE',req.ip]);
    return res.status(403).json({ error: 'Tu cuenta aún no ha sido activada. Revisa tu correo para el enlace de invitación.' });
  }
  if (!user || user.activo === 0 || !bcrypt.compareSync(password, user.password_hash)) {
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
app.post('/api/auth/verify-otp', authLimiter, (req, res) => {
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
  // SEC-06: Incluir jti (JWT ID único) para poder invalidar el token en logout
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({id:user.id,email:user.email,nombre:user.nombre,perfil:user.perfil,jti}, JWT_SECRET, {expiresIn:'8h'});
  res.json({ ok:true, token, user:{nombre:user.nombre,email:user.email,perfil:user.perfil} });
});

// SEC-06: Endpoint de logout — invalida el token en la blocklist
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  try {
    if (req.user?.jti) {
      // Guardar el jti hasta que el token expire (8h = 28800 segundos)
      const expira = Math.floor(Date.now()/1000) + 28800;
      db.run('INSERT OR IGNORE INTO token_blocklist (jti, expira) VALUES (?,?)', [req.user.jti, expira]);
      // Limpiar tokens expirados de la blocklist (mantenimiento)
      db.run(`DELETE FROM token_blocklist WHERE expira < ${Math.floor(Date.now()/1000)}`);
    }
    auditLog(req.user?.email, 'LOGOUT', null, req.ip);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true }); // Logout siempre exitoso aunque falle el registro
  }
});
app.post('/api/auth/resend-otp', resendLimiter, (req, res) => {
  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [req.body.email?.toLowerCase().trim()]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.run('DELETE FROM otp_codes WHERE user_id=?', [user.id]);
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO otp_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id,codigo,expira]);
  enviarOTP(user.email, user.nombre, codigo).catch(console.error);
  res.json({ ok:true });
});

// ─── RECUPERACIÓN DE CONTRASEÑA ───────────────────────────────────────────────

// Paso 1: Solicitar código de reset (siempre responde ok:true para no revelar emails registrados)
app.post('/api/auth/forgot-password', forgotLimiter, (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'El correo es requerido' });
  try {
    const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email]);
    if (user) {
      // Invalidar códigos anteriores del mismo usuario
      db.run('UPDATE password_reset_codes SET usado=1 WHERE user_id=?', [user.id]);
      const codigo = Math.floor(100000 + Math.random() * 900000).toString();
      const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
      db.run('INSERT INTO password_reset_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id,codigo,expira]);
      enviarResetPassword(user.email, user.nombre, codigo).catch(e => console.error('Reset email error:',e.message));
      auditLog(email, 'PASSWORD_RESET_SOLICITADO', null, req.ip);
    }
  } catch(e) { console.error('forgot-password error:', e.message); }
  // Siempre responde igual — nunca revelar si el email existe
  res.json({ ok: true });
});

// Paso 2: Validar código y establecer nueva contraseña
app.post('/api/auth/reset-password', forgotLimiter, (req, res) => {
  const { email, codigo, nueva_password, confirmar_password } = req.body;
  if (!email || !codigo || !nueva_password || !confirmar_password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (nueva_password !== confirmar_password)
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  // SEC-03: Validar fortaleza de la nueva contraseña
  const pwError = validatePassword(nueva_password);
  if (pwError) return res.status(400).json({ error: pwError });

  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email.toLowerCase().trim()]);
  if (!user) return res.status(400).json({ error: 'Código incorrecto o expirado' });

  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const reset = db.get(
    'SELECT * FROM password_reset_codes WHERE user_id=? AND codigo=? AND usado=0 AND expira_en>? ORDER BY id DESC LIMIT 1',
    [user.id, codigo, now]
  );
  if (!reset) {
    auditLog(email, 'PASSWORD_RESET_FALLIDO', { razon: 'codigo_invalido' }, req.ip);
    return res.status(400).json({ error: 'Código incorrecto o expirado' });
  }

  // Actualizar contraseña e invalidar el código
  db.run('UPDATE usuarios SET password_hash=? WHERE id=?', [bcrypt.hashSync(nueva_password,10), user.id]);
  db.run('UPDATE password_reset_codes SET usado=1 WHERE id=?', [reset.id]);
  auditLog(email, 'PASSWORD_RESET_OK', null, req.ip);
  res.json({ ok: true });
});

// ─── ADMIN USUARIOS ───────────────────────────────────────────────────────────
app.get('/api/admin/usuarios', authMiddleware, adminOnly, (req, res) => {
  const rows = db.all('SELECT id,nombre,email,perfil,activo,password_hash,creado_en,ultimo_acceso FROM usuarios ORDER BY creado_en DESC');
  // Marcar como pendiente si activo=0 y no tiene password (invitación no aceptada)
  res.json(rows.map(u => ({ ...u, pendiente: u.activo === 0 && !u.password_hash, password_hash: undefined })));
});
app.post('/api/admin/usuarios', authMiddleware, adminOnly, async (req, res) => {
  const {nombre, email, perfil} = req.body;
  if (!nombre||!email||!perfil) return res.status(400).json({error:'Nombre, email y perfil son requeridos'});
  if (!['admin','gerente','gestor'].includes(perfil)) return res.status(400).json({error:'Perfil inválido'});
  const emailLower = email.toLowerCase().trim();
  try {
    // Crear usuario inactivo sin contraseña
    db.run('INSERT INTO usuarios (nombre,email,password_hash,perfil,activo) VALUES (?,?,?,?,0)',
      [nombre, emailLower, '', perfil]);
    const newUser = db.get('SELECT id FROM usuarios WHERE email=?', [emailLower]);
    // Generar token de invitación (256-bit, 48h)
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 48*60*60*1000).toISOString().replace('T',' ').split('.')[0];
    db.run('INSERT INTO invitaciones (user_id,token,expira_en) VALUES (?,?,?)', [newUser.id, token, expira]);
    const portalUrl = process.env.PORTAL_URL || `http://localhost:${PORT}`;
    await enviarInvitacion(emailLower, nombre, token, portalUrl);
    auditLog(req.user.email, 'USUARIO_INVITADO', { nuevo_email: emailLower, perfil }, req.ip);
    res.json({ok:true});
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({error:'El email ya existe'});
    console.error('createUser error:', e.message);
    res.status(500).json({error:'Error al crear el usuario'});
  }
});
app.patch('/api/admin/usuarios/:id', authMiddleware, adminOnly, (req, res) => {
  const {activo,perfil,password} = req.body; const {id} = req.params;
  // SEC-03: Validar fortaleza si se cambia la contraseña
  if (password) {
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });
  }
  if (activo!==undefined) db.run('UPDATE usuarios SET activo=? WHERE id=?', [activo?1:0, id]);
  if (perfil) db.run('UPDATE usuarios SET perfil=? WHERE id=?', [perfil, id]);
  if (password) db.run('UPDATE usuarios SET password_hash=? WHERE id=?', [bcrypt.hashSync(password,10), id]);
  // SEC-12: Auditoría de modificación de usuario
  auditLog(req.user.email, 'USUARIO_MODIFICADO', { id, activo, perfil, cambio_password: !!password }, req.ip);
  res.json({ok:true});
});
app.delete('/api/admin/usuarios/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id)===req.user.id) return res.status(400).json({error:'No puedes eliminar tu propia cuenta'});
  const target = db.get('SELECT email FROM usuarios WHERE id=?', [req.params.id]);
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id]);
  // SEC-12: Auditoría de eliminación de usuario
  auditLog(req.user.email, 'USUARIO_ELIMINADO', { eliminado_email: target?.email }, req.ip);
  res.json({ok:true});
});
// Reinvitar usuario pendiente
app.post('/api/admin/usuarios/:id/reinvitar', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const user = db.get('SELECT * FROM usuarios WHERE id=?', [id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.activo === 1 || user.password_hash) return res.status(400).json({ error: 'El usuario ya activó su cuenta' });
  // Invalida invitaciones anteriores y genera nueva
  db.run('UPDATE invitaciones SET usado=1 WHERE user_id=?', [id]);
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 48*60*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO invitaciones (user_id,token,expira_en) VALUES (?,?,?)', [id, token, expira]);
  const portalUrl = process.env.PORTAL_URL || `http://localhost:${PORT}`;
  await enviarInvitacion(user.email, user.nombre, token, portalUrl).catch(e => console.error('reinvite error:', e.message));
  auditLog(req.user.email, 'USUARIO_REINVITADO', { email: user.email }, req.ip);
  res.json({ ok: true });
});

// Endpoint público: verificar token de invitación
app.get('/api/auth/invitacion/:token', (req, res) => {
  const { token } = req.params;
  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const inv = db.get('SELECT * FROM invitaciones WHERE token=? AND usado=0 AND expira_en>?', [token, now]);
  if (!inv) return res.status(400).json({ error: 'El enlace de invitación es inválido o ya expiró.' });
  const user = db.get('SELECT id,nombre,email,perfil FROM usuarios WHERE id=?', [inv.user_id]);
  if (!user) return res.status(400).json({ error: 'Usuario no encontrado.' });
  res.json({ ok: true, nombre: user.nombre, email: user.email, perfil: user.perfil });
});

// Endpoint público: activar cuenta con contraseña propia
app.post('/api/auth/invitacion/activar', authLimiter, (req, res) => {
  const { token, password, confirmar_password } = req.body;
  if (!token || !password || !confirmar_password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password !== confirmar_password)
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });
  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const inv = db.get('SELECT * FROM invitaciones WHERE token=? AND usado=0 AND expira_en>?', [token, now]);
  if (!inv) return res.status(400).json({ error: 'El enlace de invitación es inválido o ya expiró.' });
  const hash = bcrypt.hashSync(password, 10);
  const ahora = new Date().toISOString().replace('T',' ').split('.')[0];
  db.run('UPDATE usuarios SET password_hash=?, activo=1, ultimo_acceso=? WHERE id=?', [hash, ahora, inv.user_id]);
  db.run('UPDATE invitaciones SET usado=1 WHERE id=?', [inv.id]);
  const user = db.get('SELECT id,nombre,email,perfil FROM usuarios WHERE id=?', [inv.user_id]);
  db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id, user.email, 'CUENTA_ACTIVADA', req.ip]);
  auditLog(user.email, 'CUENTA_ACTIVADA', null, req.ip);
  // Generar token JWT para login inmediato
  const jti = crypto.randomBytes(16).toString('hex');
  const jwtToken = jwt.sign({id:user.id,email:user.email,nombre:user.nombre,perfil:user.perfil,jti}, JWT_SECRET, {expiresIn:'8h'});
  res.json({ ok: true, token: jwtToken, user: { nombre: user.nombre, email: user.email, perfil: user.perfil } });
});

// SEC-13: Logs con filtros opcionales por email, evento, desde/hasta y límite
app.get('/api/admin/logs', authMiddleware, adminOnly, (req, res) => {
  const { email, evento, desde, hasta, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit)||200, 500);
  const conds = [], params = [];
  if (email)  { conds.push('email LIKE ?');  params.push(`%${email}%`); }
  if (evento) { conds.push('evento = ?');    params.push(evento); }
  if (desde)  { conds.push('fecha >= ?');    params.push(desde); }
  if (hasta)  { conds.push('fecha <= ?');    params.push(hasta + ' 23:59:59'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  res.json(db.all(`SELECT * FROM sesiones_log ${where} ORDER BY fecha DESC LIMIT ${maxLimit}`, params));
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

// ─── SEC-09: Multer con validación de tipo MIME y límite de tamaño ───────────
const ALLOWED_MIME_CSV  = ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'];
const ALLOWED_MIME_XLSX = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           'application/vnd.ms-excel', 'application/octet-stream'];

const uploadCSV = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_CSV.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV'));
    }
  }
});
const uploadXLSX = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_XLSX.includes(file.mimetype) ||
        file.originalname.toLowerCase().endsWith('.xlsx') ||
        file.originalname.toLowerCase().endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx / .xls)'));
    }
  }
});

// ─── CARGA MASIVA DE EQUIPO ───────────────────────────────────────────────────
app.post('/api/admin/equipo/importar', authMiddleware, adminOnly, uploadXLSX.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  // SEC-10: Limpieza garantizada del archivo temporal en cualquier escenario
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(req.file.path);

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
  } finally {
    // SEC-10: Siempre eliminar el archivo temporal, haya o no error
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch(_) {} }
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
    // SEC-12: Auditoría de creación de tarifa
    auditLog(req.user.email, 'TARIFA_CREADA', { empresa, rol, tarifa }, req.ip);
    res.json({ok:true});
  } catch(e) { res.status(409).json({error:'Ya existe una tarifa para esa empresa + rol'}); }
});
app.patch('/api/admin/tarifas/:id', authMiddleware, adminOnly, (req, res) => {
  const { empresa, rol, tarifa } = req.body;
  const id = req.params.id;
  if (empresa)             db.run('UPDATE tarifas SET empresa=? WHERE id=?', [empresa.trim(), id]);
  if (rol)                 db.run('UPDATE tarifas SET rol=?     WHERE id=?', [rol.trim(), id]);
  if (tarifa!==undefined)  db.run('UPDATE tarifas SET tarifa=? WHERE id=?', [parseFloat(tarifa), id]);
  // SEC-12: Auditoría de modificación de tarifa
  auditLog(req.user.email, 'TARIFA_MODIFICADA', { id, empresa, rol, tarifa }, req.ip);
  res.json({ok:true});
});
app.delete('/api/admin/tarifas/:id', authMiddleware, adminOnly, (req, res) => {
  const target = db.get('SELECT * FROM tarifas WHERE id=?', [req.params.id]);
  db.run('DELETE FROM tarifas WHERE id=?', [req.params.id]);
  // SEC-12: Auditoría de eliminación de tarifa
  auditLog(req.user.email, 'TARIFA_ELIMINADA', { empresa: target?.empresa, rol: target?.rol, tarifa: target?.tarifa }, req.ip);
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

app.post('/api/admin/cargar-csv', authMiddleware, adminOnly, uploadCSV.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({error:'No se recibió archivo'});
  try {
    // Leer CSV eliminando BOM si existe
    let contenido = fs.readFileSync(req.file.path, 'utf-8');
    if (contenido.charCodeAt(0) === 0xFEFF) contenido = contenido.slice(1); // strip BOM

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

      // Sprint desde Iteration Path (último segmento)
      const itPath = (r['Iteration Path'] || '').trim();
      const sprint = itPath ? itPath.split('\\').pop().trim() : '';

      // Area Path y horas estimadas
      const area_path      = (r['Area Path'] || '').trim();
      const horas_estimadas = parseFloat(r['Original Estimate'] || 0) || 0;

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
        fecha_ini: fechaIni, fecha_fin: fechaFin, sprint, area_path, horas_estimadas,
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

    // ── Procesar bugs ──
    const bugsRaw = raw.filter(r => (r['Work Item Type']||'').trim() === 'Bug');
    console.log(`  Bugs en CSV: ${bugsRaw.length}`);

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
      const state    = (r['State'] || '').trim();
      const itPath   = (r['Iteration Path'] || '').trim();
      const sprint   = itPath ? itPath.split('\\').pop().trim() : '';
      const ambiente     = (r['Ambiente_Bug']   || '').trim();
      const created      = parseFecha(r['Created Date']);
      const closed       = parseFecha(r['Closed Date']);
      const severity     = (r['Severity']       || '').trim();
      const categoria_bug = (r['Categoria_Bug']  || '').trim();
      const jer          = resolverJerarquia(id);

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
    console.log(`  Bugs insertados: ${bugsInsertados}`);

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

    // SEC-12: Auditoría de carga de CSV
    auditLog(req.user.email, 'CSV_CARGADO', {
      archivo: req.file?.originalname,
      tasks: insertadas,
      iniciativas: checkP,
      sin_lookup: noValidos
    }, req.ip);
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
  } finally {
    // SEC-10: Siempre eliminar el archivo temporal, haya o no error
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch(_) {} }
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

// Helper filtros bugs
function buildBugsWhere(q) {
  const c = [], p = [];
  if (q.estado)    { c.push('estado = ?');       p.push(q.estado); }
  if (q.ambiente)  { c.push('ambiente = ?');      p.push(q.ambiente); }
  if (q.sprint)    { c.push('sprint = ?');        p.push(q.sprint); }
  if (q.iniciativa){ c.push('id_iniciativa = ?'); p.push(q.iniciativa); }
  if (q.severity)  { c.push('severity = ?');      p.push(q.severity); }
  if (q.categoria) { c.push('categoria_bug = ?'); p.push(q.categoria); }
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}
function bugsAnd(where, extra) {
  return where ? `${where} AND ${extra}` : `WHERE ${extra}`;
}

app.get('/api/indicadores/bugs/filtros', authMiddleware, (req, res) => {
  const estados    = db.all(`SELECT DISTINCT estado       FROM bugs_csv WHERE estado != ''       ORDER BY estado`).map(r => r.estado);
  const ambientes  = db.all(`SELECT DISTINCT ambiente     FROM bugs_csv WHERE ambiente != ''     ORDER BY ambiente`).map(r => r.ambiente);
  const sprints    = db.all(`SELECT DISTINCT sprint       FROM bugs_csv WHERE sprint != ''       ORDER BY sprint`).map(r => r.sprint);
  const severidades= db.all(`SELECT DISTINCT severity     FROM bugs_csv WHERE severity != ''     ORDER BY severity`).map(r => r.severity);
  const categorias = db.all(`SELECT DISTINCT categoria_bug FROM bugs_csv WHERE categoria_bug != '' ORDER BY categoria_bug`).map(r => r.categoria_bug);
  const iniciativas= db.all(`SELECT DISTINCT id_iniciativa, nombre_iniciativa FROM bugs_csv WHERE id_iniciativa NOT IN ('SIN_INI','') ORDER BY nombre_iniciativa`)
                       .map(r => ({ id: r.id_iniciativa, nombre: r.nombre_iniciativa }));
  res.json({ estados, ambientes, sprints, severidades, categorias, iniciativas });
});

app.get('/api/indicadores/bugs/produccion', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const resumen = db.all(`SELECT ambiente, COUNT(*) as total FROM bugs_csv ${bugsAnd(where,'ambiente != \'\'')} GROUP BY ambiente ORDER BY total DESC`, params);
  const porEstado = db.all(`SELECT estado, COUNT(*) as total FROM bugs_csv ${where} GROUP BY estado ORDER BY total DESC`, params);
  const enProduccion = db.all(`SELECT ambiente, estado, COUNT(*) as total FROM bugs_csv ${bugsAnd(where,"ambiente IN ('PRODUCCION','EXTERNO_PRODUCCION','GSF')")} GROUP BY ambiente, estado ORDER BY ambiente, estado`, params);
  const total = (db.get(`SELECT COUNT(*) as n FROM bugs_csv ${where}`, params) || {n:0}).n;
  const criticos = (db.get(`SELECT COUNT(*) as n FROM bugs_csv ${bugsAnd(where,"severity='1 - Critical' AND estado != 'Closed'")}`, params) || {n:0}).n;
  res.json({ resumen, porEstado, enProduccion, total, criticos });
});

app.get('/api/indicadores/bugs/por-iniciativa', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const bugs = db.all(`SELECT id_iniciativa, nombre_iniciativa, COUNT(*) as total_bugs FROM bugs_csv ${bugsAnd(where,"id_iniciativa NOT IN ('SIN_INI','')")} GROUP BY id_iniciativa ORDER BY total_bugs DESC`, params);
  const tasks = db.all(`SELECT id_iniciativa, nombre_iniciativa, total_tasks, cerradas FROM tasks_plan WHERE id_iniciativa NOT IN ('SIN_INI','')`);
  const taskMap = {};
  tasks.forEach(t => { taskMap[t.id_iniciativa] = t; });
  const iniciativas = bugs.map(b => ({
    id_iniciativa: b.id_iniciativa, nombre: b.nombre_iniciativa,
    total_bugs: b.total_bugs,
    total_tasks: taskMap[b.id_iniciativa]?.total_tasks || 0,
    cerradas:    taskMap[b.id_iniciativa]?.cerradas    || 0,
    densidad:    taskMap[b.id_iniciativa]?.total_tasks > 0
                   ? Math.round(b.total_bugs / taskMap[b.id_iniciativa].total_tasks * 100) / 100 : null
  }));
  res.json({ iniciativas });
});

app.get('/api/indicadores/bugs/por-sprint', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const sprints = db.all(`
    SELECT sprint, COUNT(*) as total,
           SUM(CASE WHEN estado='Closed' THEN 1 ELSE 0 END) as cerrados,
           SUM(CASE WHEN estado!='Closed' THEN 1 ELSE 0 END) as abiertos
    FROM bugs_csv ${bugsAnd(where,"sprint IS NOT NULL AND sprint != ''")}
    GROUP BY sprint ORDER BY sprint`, params);
  res.json({ sprints });
});

app.get('/api/indicadores/bugs/mttr', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const cerrados = db.all(`
    SELECT id_bug, titulo, sprint, ambiente, severity, categoria_bug, created_date, closed_date,
           CAST(ROUND(julianday(closed_date) - julianday(created_date)) AS INTEGER) as dias
    FROM bugs_csv
    ${bugsAnd(where,"closed_date IS NOT NULL AND closed_date != '' AND created_date IS NOT NULL AND created_date != '' AND julianday(closed_date) >= julianday(created_date)")}
    ORDER BY dias DESC`, params);
  const n = cerrados.length;
  const promedio = n > 0 ? Math.round(cerrados.reduce((s,r) => s+(r.dias||0),0)/n) : 0;
  const mediana  = (() => {
    if (!n) return 0;
    const sorted = [...cerrados].map(r=>r.dias).sort((a,b)=>a-b);
    return n%2===0 ? Math.round((sorted[n/2-1]+sorted[n/2])/2) : sorted[Math.floor(n/2)];
  })();
  res.json({ bugs: cerrados, mttr_promedio: promedio, mttr_mediana: mediana, total_cerrados: n });
});

app.get('/api/indicadores/bugs/severidad', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const rows = db.all(`
    SELECT severity,
           COUNT(*) as total,
           SUM(CASE WHEN estado='Closed' THEN 1 ELSE 0 END) as cerrados,
           SUM(CASE WHEN estado!='Closed' THEN 1 ELSE 0 END) as abiertos
    FROM bugs_csv ${bugsAnd(where,"severity != ''")}
    GROUP BY severity ORDER BY severity`, params);
  // MTTR promedio por severidad
  const mttrRows = db.all(`
    SELECT severity,
           CAST(ROUND(AVG(julianday(closed_date)-julianday(created_date))) AS INTEGER) as mttr
    FROM bugs_csv
    ${bugsAnd(where,"severity != '' AND closed_date != '' AND created_date != '' AND julianday(closed_date)>=julianday(created_date)")}
    GROUP BY severity ORDER BY severity`, params);
  const mttrMap = {};
  mttrRows.forEach(r => { mttrMap[r.severity] = r.mttr; });
  const severidades = rows.map(r => ({ ...r, mttr: mttrMap[r.severity] ?? null }));
  res.json({ severidades });
});

app.get('/api/indicadores/bugs/por-categoria', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const rows = db.all(`
    SELECT categoria_bug, severity, estado, COUNT(*) as total
    FROM bugs_csv ${bugsAnd(where,"categoria_bug != ''")}
    GROUP BY categoria_bug, severity, estado
    ORDER BY categoria_bug, severity, estado`, params);
  // Agrupar en estructura { categoria → { severity → { estado → count } } }
  const cats = {};
  rows.forEach(r => {
    if (!cats[r.categoria_bug]) cats[r.categoria_bug] = { total: 0, abiertos: 0, cerrados: 0, bySeverity: {} };
    const c = cats[r.categoria_bug];
    c.total += r.total;
    if (r.estado === 'Closed') c.cerrados += r.total; else c.abiertos += r.total;
    if (!c.bySeverity[r.severity]) c.bySeverity[r.severity] = { abiertos: 0, cerrados: 0 };
    if (r.estado === 'Closed') c.bySeverity[r.severity].cerrados += r.total;
    else                        c.bySeverity[r.severity].abiertos += r.total;
  });
  const categorias = Object.entries(cats).map(([nombre, d]) => ({ nombre, ...d }))
                           .sort((a,b) => b.total - a.total);
  res.json({ categorias });
});

// ─── RENDIMIENTO DEL EQUIPO ───────────────────────────────────────────────────
function buildRendWhere(q) {
  const c = [], p = [];
  if (q.equipo) { c.push("area_path LIKE ?");  p.push(`Gestion Blu\\${q.equipo}%`); }
  if (q.area)   { c.push("area_path = ?");      p.push(q.area); }
  if (q.anio)   { c.push("anio = ?");           p.push(parseInt(q.anio)); }
  if (q.mes)    { c.push("mes = ?");            p.push(parseInt(q.mes)); }
  if (q.sprint) { c.push("sprint = ?");         p.push(q.sprint); }
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}

app.get('/api/indicadores/rendimiento/filtros', authMiddleware, (req, res) => {
  const anios   = db.all(`SELECT DISTINCT anio   FROM datos_horas WHERE anio   > 0   ORDER BY anio`).map(r => r.anio);
  const meses   = db.all(`SELECT DISTINCT mes    FROM datos_horas WHERE mes    > 0   ORDER BY mes`).map(r => r.mes);
  const sprints = db.all(`SELECT DISTINCT sprint FROM datos_horas WHERE sprint != '' ORDER BY sprint`).map(r => r.sprint);
  const areas   = db.all(`SELECT DISTINCT area_path FROM datos_horas WHERE area_path != '' ORDER BY area_path`)
                    .map(r => ({ area_path: r.area_path, label: areaLabel(r.area_path) }));
  res.json({ anios, meses, sprints, areas });
});

// Helper: extraer etiqueta legible del area_path (último segmento)
function areaLabel(ap) {
  if (!ap) return 'Sin área';
  const parts = ap.split('\\');
  return parts[parts.length - 1] || ap;
}

app.get('/api/indicadores/rendimiento/estimacion', authMiddleware, (req, res) => {
  const { where, params } = buildRendWhere(req.query);
  const rows = db.all(`
    SELECT area_path,
           SUM(horas_estimadas)   AS estimadas,
           SUM(horas_completadas) AS completadas,
           COUNT(*)               AS tasks
    FROM datos_horas
    ${where ? where + ' AND' : 'WHERE'} area_path != '' AND horas_estimadas > 0
    GROUP BY area_path
    ORDER BY area_path
  `, params);

  const areas = rows.map(r => {
    const est  = r.estimadas   || 0;
    const real = r.completadas || 0;
    const desvioPct = est > 0 ? Math.round((real - est) / est * 1000) / 10 : null;
    const precisionPct = est > 0 ? Math.round(real / est * 1000) / 10 : null;
    return {
      area_path:  r.area_path,
      label:      areaLabel(r.area_path),
      estimadas:  Math.round(est  * 10) / 10,
      completadas:Math.round(real * 10) / 10,
      tasks:      r.tasks,
      desvioPct,
      precisionPct
    };
  });

  // KPIs globales
  const totEst  = areas.reduce((s, r) => s + r.estimadas,   0);
  const totReal = areas.reduce((s, r) => s + r.completadas, 0);
  const desvioGlobal    = totEst > 0 ? Math.round((totReal - totEst) / totEst * 1000) / 10 : null;
  const precisionGlobal = totEst > 0 ? Math.round(totReal / totEst * 1000) / 10 : null;

  // Personas únicas que trabajaron bajo el filtro activo (reutiliza el mismo where)
  const personasWhere = where ? `${where} AND correo != ''` : `WHERE correo != ''`;
  const personas = (db.get(`SELECT COUNT(DISTINCT correo) as n FROM datos_horas ${personasWhere}`, params) || {n:0}).n;

  res.json({ areas, kpis: { estimadas: Math.round(totEst*10)/10, completadas: Math.round(totReal*10)/10, desvioGlobal, precisionGlobal, personas } });
});

app.get('/api/indicadores/rendimiento/velocidad', authMiddleware, (req, res) => {
  const { where, params } = buildRendWhere(req.query);
  const rows = db.all(`
    SELECT sprint,
           SUM(horas_completadas) AS horas,
           COUNT(*)               AS tasks
    FROM datos_horas
    ${where ? where + ' AND' : 'WHERE'} sprint != ''
    GROUP BY sprint
    ORDER BY sprint
  `, params);

  // Ordenar sprints numéricamente por el número al final del nombre
  const sprintNum = s => { const m = s.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  rows.sort((a, b) => sprintNum(a.sprint) - sprintNum(b.sprint));

  const promHoras = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.horas, 0) / rows.length * 10) / 10
    : 0;

  res.json({ sprints: rows, promedio_horas: promHoras });
});

app.get('/api/indicadores/rendimiento/burnup', authMiddleware, (req, res) => {
  const { where, params } = buildRendWhere(req.query);
  const rows = db.all(`
    SELECT sprint,
           SUM(horas_estimadas)   AS estimadas,
           SUM(horas_completadas) AS completadas
    FROM datos_horas
    ${where ? where + ' AND' : 'WHERE'} sprint != '' AND (horas_estimadas > 0 OR horas_completadas > 0)
    GROUP BY sprint
    ORDER BY sprint
  `, params);

  const sprintNum = s => { const m = s.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  rows.sort((a, b) => sprintNum(a.sprint) - sprintNum(b.sprint));

  // Acumulado real (burn-up)
  const totalPlan = rows.reduce((s, r) => s + (r.estimadas || 0), 0);
  let acum = 0;
  const sprints = rows.map(r => {
    acum += r.completadas || 0;
    return {
      sprint:      r.sprint,
      completadas: Math.round((r.completadas || 0) * 10) / 10,
      estimadas:   Math.round((r.estimadas   || 0) * 10) / 10,
      acumulado:   Math.round(acum * 10) / 10
    };
  });

  res.json({ sprints, total_plan: Math.round(totalPlan * 10) / 10 });
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
    // SEC-12: Auditoría de restauración de CSV
    auditLog(req.user.email, 'CSV_RESTAURADO', {
      archivo: registro.nombre_archivo,
      tasks: horasData.length,
      iniciativas: planData.length
    }, req.ip);
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
  console.log('║         PORTAL CANALES — DINERS CLUB         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:  http://localhost:${PORT}                ║`);
  console.log(`║  Red:    http://${localIP}:${PORT}           ║`);
  console.log(`║  BD:     ${total} registros · ${equipo} colaboradores · ${tarifas} tarifas  ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});
