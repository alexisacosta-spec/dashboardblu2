'use strict';

const crypto = require('crypto');

// ─── COLORES ANSI ─────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

// ─── NIVELES ──────────────────────────────────────────────────────────────────
const LEVELS = {
  debug: { label: 'DEBUG', color: C.gray,    icon: '·' },
  info:  { label: 'INFO ', color: C.green,   icon: '●' },
  warn:  { label: 'WARN ', color: C.yellow,  icon: '▲' },
  error: { label: 'ERROR', color: C.red,     icon: '✖' },
  http:  { label: 'HTTP ', color: C.cyan,    icon: '→' },
  audit: { label: 'AUDIT', color: C.magenta, icon: '◈' },
};

// ─── TIMESTAMP ────────────────────────────────────────────────────────────────
function ts() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── ID de correlación — 4 hex chars, ej. "a4f2" ─────────────────────────────
function _uid() {
  return crypto.randomBytes(2).toString('hex');
}

// ─── Formatear datos estructurados como "  key=val  key2=val2" ───────────────
function _kv(data) {
  if (!data || typeof data !== 'object') return '';
  const pairs = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  return pairs.length ? '  ' + pairs.join('  ') : '';
}

// ─── FORMATEADOR BASE ─────────────────────────────────────────────────────────
function write(level, msg, extra) {
  const l      = LEVELS[level];
  const prefix = `${C.gray}[${ts()}]${C.reset} ${l.color}${C.bold}${l.icon} ${l.label}${C.reset}`;
  const line   = `${prefix} ${C.gray}|${C.reset} ${msg}`;
  if (level === 'error') {
    process.stderr.write(line + (extra ? `\n${C.red}${extra}${C.reset}` : '') + '\n');
  } else {
    process.stdout.write(line + '\n');
    if (extra) process.stdout.write(`${C.yellow}${extra}${C.reset}\n`);
  }
}

// ─── COLOREADO DE STATUS HTTP ─────────────────────────────────────────────────
function statusColor(code) {
  if (code >= 500) return C.red;
  if (code >= 400) return C.yellow;
  if (code >= 300) return C.cyan;
  return C.green;
}

// ─── LOGGER CONTEXTUAL — atado a un req específico ───────────────────────────
function _makeReqLog(req) {
  const pfx = () => {
    const u = req.user;
    return u ? `[${req.id}] ${u.email} · ${u.perfil} | ` : `[${req.id}] `;
  };
  return {
    debug: (msg)       => { if (process.env.DEBUG === 'true') write('debug', pfx() + msg); },
    info:  (msg)       => write('info',  pfx() + msg),
    warn:  (msg, err)  => write('warn',  pfx() + msg, err?.stack || (typeof err === 'string' ? err : undefined)),
    error: (msg, err)  => write('error', pfx() + msg, err?.stack || err),
    audit: (evento, data) => {
      const u = req.user;
      const who = u ? `${u.email} · ${u.perfil}` : '—';
      write('audit', `[${req.id}] ${who}  ${evento}${_kv(data)}`);
    },
  };
}

// ─── API PÚBLICA ──────────────────────────────────────────────────────────────
const logger = {
  debug: (msg)           => { if (process.env.DEBUG === 'true') write('debug', msg); },
  info:  (msg)           => write('info',  msg),
  warn:  (msg, err)      => write('warn',  msg, err?.stack || (typeof err === 'string' ? err : undefined)),
  error: (msg, err)      => write('error', msg, err?.stack || err),
  audit: (evento, data)  => write('audit', `${evento}${_kv(data)}`),

  /** Log de evento del cliente — usa [FRONT:sid] como prefijo de correlación */
  clientEvent(sid, req, tipo, datos) {
    const u   = req?.user;
    const who = u ? `${u.email} · ${u.perfil}` : '—';
    const pfx = `[FRONT:${sid}] ${who}`;
    const kv  = _kv(datos);
    const ERR = new Set(['JS_ERROR', 'UNHANDLED_PROMISE', 'API_ERROR']);
    write(ERR.has(tipo) ? 'error' : 'audit', `${pfx}  ${tipo}${kv}`);
  },

  /** Middleware Express — genera req.id, req.log y loguea cada request al terminar */
  httpMiddleware() {
    return (req, res, next) => {
      req.id  = _uid();
      req.log = _makeReqLog(req);
      req.audit = (evento, data) => req.log.audit(evento, data);

      const start = Date.now();
      res.on('finish', () => {
        const ms     = Date.now() - start;
        const code   = res.statusCode;
        const sc     = statusColor(code);
        const method = req.method.padEnd(4);
        const ip     = req.ip || req.connection?.remoteAddress || '—';
        const route  = req.originalUrl || req.url;

        // Ignorar assets estáticos (js, css, img, fonts) para no saturar el log
        if (/\.(js|css|png|jpg|ico|svg|woff2?|ttf|map)(\?|$)/.test(route)) return;

        const u = req.user;
        const userCtx = u
          ? `  ${C.dim}${u.email} · ${u.perfil} · ${ip}${C.reset}`
          : `  ${C.dim}${ip}${C.reset}`;

        write('http',
          `${C.gray}[${req.id}]${C.reset} ${C.bold}${method}${C.reset} ${route.padEnd(40)} ` +
          `${sc}${C.bold}${code}${C.reset} ${C.gray}${String(ms).padStart(4)}ms${C.reset}${userCtx}`
        );
      });
      next();
    };
  },

  /** Global error handler para Express — úsalo DESPUÉS de las rutas */
  errorHandler() {
    // eslint-disable-next-line no-unused-vars
    return (err, req, res, next) => {
      const code = err.status || err.statusCode || 500;
      (req.log || logger).error(
        `Unhandled ${err.name || 'Error'} en ${req.method} ${req.originalUrl}`,
        err
      );
      res.status(code).json({ error: 'Error interno del servidor' });
    };
  },
};

module.exports = logger;
