'use strict';

// ─── COLORES ANSI ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};

// ─── NIVELES ──────────────────────────────────────────────────────────────────
const LEVELS = {
  debug: { label: 'DEBUG', color: C.gray,   icon: '·' },
  info:  { label: 'INFO ', color: C.green,  icon: '●' },
  warn:  { label: 'WARN ', color: C.yellow, icon: '▲' },
  error: { label: 'ERROR', color: C.red,    icon: '✖' },
  http:  { label: 'HTTP ', color: C.cyan,   icon: '→' },
};

// ─── TIMESTAMP ────────────────────────────────────────────────────────────────
function ts() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── FORMATEADOR BASE ─────────────────────────────────────────────────────────
function write(level, msg, extra) {
  const l = LEVELS[level];
  const prefix = `${C.gray}[${ts()}]${C.reset} ${l.color}${C.bold}${l.icon} ${l.label}${C.reset}`;
  const line   = `${prefix} ${C.gray}|${C.reset} ${msg}`;
  if (level === 'error') {
    process.stderr.write(line + (extra ? `\n${C.red}${extra}${C.reset}` : '') + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ─── COLOREADO DE STATUS HTTP ─────────────────────────────────────────────────
function statusColor(code) {
  if (code >= 500) return C.red;
  if (code >= 400) return C.yellow;
  if (code >= 300) return C.cyan;
  return C.green;
}

// ─── API PÚBLICA ──────────────────────────────────────────────────────────────
const logger = {
  debug: (msg)        => { if (process.env.DEBUG === 'true') write('debug', msg); },
  info:  (msg)        => write('info',  msg),
  warn:  (msg)        => write('warn',  msg),
  error: (msg, err)   => write('error', msg, err?.stack || err),

  /** Middleware Express — loguea cada request al terminar la respuesta */
  httpMiddleware() {
    return (req, res, next) => {
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

        write('http',
          `${C.bold}${method}${C.reset} ${route.padEnd(40)} ${sc}${C.bold}${code}${C.reset} ` +
          `${C.gray}${String(ms).padStart(4)}ms${C.reset}  ${C.dim}${ip}${C.reset}`
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
      logger.error(
        `Unhandled ${err.name || 'Error'} en ${req.method} ${req.originalUrl}`,
        err
      );
      res.status(code).json({ error: 'Error interno del servidor' });
    };
  },
};

module.exports = logger;
