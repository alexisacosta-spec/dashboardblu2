'use strict';
const path     = require('path');
const { Database } = require('node-sqlite3-wasm');
const bcrypt   = require('bcryptjs');
const logger   = require('../lib/logger');

const DB_PATH = path.join(__dirname, '..', 'portal.db');
const db = new Database(DB_PATH);

// ─── TABLAS DEL SISTEMA (nunca se recrean) ────────────────────────────────────
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
db.run(`CREATE TABLE IF NOT EXISTS token_blocklist (
  jti  TEXT PRIMARY KEY,
  expira INTEGER NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS password_reset_codes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  codigo    TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  usado     INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
)`);
db.run(`CREATE TABLE IF NOT EXISTS invitaciones (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  expira_en TEXT NOT NULL,
  usado     INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
)`);
// Migraciones silenciosas de sistema
try { db.run(`ALTER TABLE sesiones_log ADD COLUMN detalle TEXT`); } catch(_) {}
// Limpiar tokens JWT expirados al arrancar
db.run(`DELETE FROM token_blocklist WHERE expira < ${Math.floor(Date.now()/1000)}`);

// ─── TABLAS DE CONFIGURACIÓN (persistentes — NO se borran en migraciones) ─────
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

// ─── CÉLULAS DISTRIBUCIÓN ─────────────────────────────────────────────────────
db.run(`CREATE TABLE IF NOT EXISTS celulas_config (
  id         INTEGER PRIMARY KEY,
  data_json  TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT
)`);
const _celulasSeed = { celulas: [
  { id:'c1', nombre:'CÉLULA 1', color:'#0047AB',
    roles:{scrum:1,front:2,back:2,qa:2,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['Certificación Actualización RN 0.82 + Compatibilidad 16kb Android','SSL Pinning','Calificación de satisfacción','Mejoras pantallas OTP','Mejoras pantallas Código Dactilar','Ajuste de Pantalla Feedzai']
  },
  { id:'c2', nombre:'CÉLULA 2', color:'#1565C0',
    roles:{scrum:0,front:2,back:2,qa:1,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['Cambio de clave obligatorio','Migración Aprovisionamiento Google Pay','Fortalecimiento y Cambio de llavez','DeUna código único']
  },
  { id:'c3', nombre:'CÉLULA 3', color:'#1976D2',
    roles:{scrum:1,front:3,back:3,qa:2,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['CVV Dinámico','Mejoras pantallas biometría','Integración Blu Benefits']
  },
  { id:'c4', nombre:'CÉLULA 4', color:'#1E88E5',
    roles:{scrum:0,front:2,back:2,qa:2,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['Cash Advance','Estado de cuenta de millas / Cashback','Versión del APP en pantallas de perfil']
  },
  { id:'c5', nombre:'CÉLULA 5 · Producto', color:'#42A5F5',
    roles:{scrum:1,front:2,back:2,qa:1,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['Taggueos']
  },
  { id:'cseg', nombre:'CÉLULA SEGURIDAD', color:'#C0392B',
    roles:{scrum:0,front:2,back:3,qa:2,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['Control de Sesiones','Feedzai','GS']
  },
  { id:'ccr', nombre:'CAUSA RAÍZ', color:'#7B1FA2',
    roles:{scrum:1,front:2,back:2,qa:2,lt:1,ba:0,arq_fab:0,arq_dce:0,lt_dce:0,devops:0,pm:0},
    funcionalidades:['Incidentes levantados por mesa']
  },
  { id:'ctrans', nombre:'TRANSVERSALES', color:'#388E3C',
    roles:{scrum:0,front:0,back:0,qa:0,lt:0,ba:0,arq_fab:1,arq_dce:1,lt_dce:1,devops:2,pm:1},
    funcionalidades:[]
  }
]};
if (!db.get('SELECT id FROM celulas_config WHERE id=1')) {
  db.run('INSERT INTO celulas_config (id,data_json) VALUES (1,?)', [JSON.stringify(_celulasSeed)]);
}

// ─── MIGRACIÓN DE ESQUEMA DE DATOS ───────────────────────────────────────────
const SCHEMA_VERSION = 7;
db.run("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)");
db.run("INSERT OR IGNORE INTO _meta VALUES ('schema_version','0')");
const currentVersion = parseInt(
  (db.get("SELECT value FROM _meta WHERE key='schema_version'") || {value:'0'}).value
);
if (currentVersion < SCHEMA_VERSION) {
  logger.info(`Migrando BD de v${currentVersion} → v${SCHEMA_VERSION}`);
  db.run('DROP TABLE IF EXISTS datos_horas');
  db.run('DROP TABLE IF EXISTS tasks_plan');
  db.run('DROP TABLE IF EXISTS tasks_seguimiento');
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
  activas  INTEGER DEFAULT 0,
  nuevas   INTEGER DEFAULT 0,
  otros    INTEGER DEFAULT 0,
  fecha_ini TEXT,
  fecha_fin TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS tasks_seguimiento (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  id_iniciativa   TEXT, nombre_iniciativa TEXT,
  id_epic         TEXT, nombre_epic       TEXT,
  id_task         TEXT, nombre_task       TEXT,
  nombre_persona  TEXT, correo            TEXT,
  empresa         TEXT, rol               TEXT,
  estado          TEXT, sprint            TEXT,
  horas_estimadas   REAL DEFAULT 0,
  horas_completadas REAL DEFAULT 0,
  fecha_ini TEXT,       fecha_fin TEXT
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_seg_ini ON tasks_seguimiento(id_iniciativa)`);
try { db.run('ALTER TABLE tasks_plan ADD COLUMN otros INTEGER DEFAULT 0'); } catch(_) {}
db.run(`CREATE INDEX IF NOT EXISTS idx_id_ini  ON datos_horas(id_iniciativa)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_id_epic ON datos_horas(id_epic)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_id_hu   ON datos_horas(id_hu)`);

db.run(`CREATE TABLE IF NOT EXISTS bugs_csv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_bug TEXT, titulo TEXT, estado TEXT, sprint TEXT, ambiente TEXT,
  id_iniciativa TEXT, nombre_iniciativa TEXT,
  id_epic TEXT,       nombre_epic TEXT,
  id_hu TEXT,         nombre_hu TEXT,
  created_date TEXT, closed_date TEXT
)`);
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
const colsHist = db.all("PRAGMA table_info(historial_csv)").map(c => c.name);
if (!colsHist.includes('log_error')) {
  db.run("ALTER TABLE historial_csv ADD COLUMN log_error TEXT");
}

db.run(`CREATE TABLE IF NOT EXISTS alertas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo           TEXT NOT NULL,
  severidad      TEXT NOT NULL,
  id_iniciativa  TEXT NOT NULL,
  nombre_ini     TEXT NOT NULL,
  iae            REAL,
  pct_tareas     REAL,
  pct_horas      REAL,
  tasks_json     TEXT DEFAULT '[]',
  estado         TEXT DEFAULT 'nueva',
  nota           TEXT,
  detectada_en   TEXT DEFAULT (datetime('now')),
  reconocida_por TEXT,
  reconocida_en  TEXT,
  resuelta_en    TEXT
)`);
// Índice para consultas frecuentes
db.run(`CREATE INDEX IF NOT EXISTS idx_alertas_estado ON alertas(estado)`);

// ─── ADMIN INICIAL DESDE VARIABLES DE ENTORNO ─────────────────────────────────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NOMBRE   = process.env.ADMIN_NOMBRE || 'Administrador';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  logger.warn('ADMIN_EMAIL o ADMIN_PASSWORD no están en .env — no se creará el usuario admin inicial.');
} else {
  const adminExiste = db.get('SELECT id FROM usuarios WHERE email = ?', [ADMIN_EMAIL.toLowerCase()]);
  if (!adminExiste) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.run('INSERT INTO usuarios (nombre,email,password_hash,perfil) VALUES (?,?,?,?)',
      [ADMIN_NOMBRE, ADMIN_EMAIL.toLowerCase(), hash, 'admin']);
    logger.info(`Usuario admin creado: ${ADMIN_EMAIL}`);
  }
}

module.exports = db;
