'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const os      = require('os');

const logger  = require('./lib/logger');

// ─── VALIDAR JWT_SECRET antes de arrancar ─────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret_change_me') {
  if (process.env.NODE_ENV === 'production') {
    logger.error('FATAL: JWT_SECRET no está configurado. El servidor no puede arrancar en producción.');
    process.exit(1);
  }
  logger.warn('Usando JWT_SECRET de desarrollo. No usar en producción.');
}

// ─── BASE DE DATOS (singleton — debe iniciarse antes que las rutas) ───────────
const db = require('./db/connection');

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
const { helmetConfig } = require('./middleware/security');
const { authMiddleware } = require('./middleware/auth');

// ─── RUTAS ────────────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const datosRoutes       = require('./routes/datos');
const indicadoresRoutes = require('./routes/indicadores');
const celulasRoutes     = require('./routes/celulas');
const { router: iaeRoutes } = require('./routes/iae');
const clientLogsRoutes      = require('./routes/client-logs');

// ─── APP ──────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// Necesario cuando el servidor corre detrás de un reverse proxy (Railway, Render, Fly, etc.)
app.set('trust proxy', 1);

app.use(logger.httpMiddleware());   // ← log de cada request
app.use(helmetConfig);
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── MONTAR RUTAS ─────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/datos',        datosRoutes);
app.use('/api/indicadores',  indicadoresRoutes);
app.use('/api/celulas',      celulasRoutes);
app.use('/api/iae',          iaeRoutes);
app.use('/api/logs/client', clientLogsRoutes);

// Ruta de equipo para todos los perfiles autenticados (no solo admin)
app.get('/api/equipo', authMiddleware, (req, res) => {
  res.json(db.all('SELECT * FROM equipo ORDER BY estado ASC, empresa ASC, nombre ASC'));
});

// ─── GLOBAL ERROR HANDLER (debe ir DESPUÉS de todas las rutas) ────────────────
app.use(logger.errorHandler());

// ─── ARRANQUE ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(interfaces))
    for (const alias of iface)
      if (alias.family === 'IPv4' && !alias.internal) { localIP = alias.address; break; }

  const total   = (db.get('SELECT COUNT(*) as t FROM datos_horas')  || {}).t || 0;
  const equipo  = (db.get('SELECT COUNT(*) as t FROM equipo')        || {}).t || 0;
  const tarifas = (db.get('SELECT COUNT(*) as t FROM tarifas')       || {}).t || 0;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         PORTAL CANALES — DINERS CLUB         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:  http://localhost:${PORT}                ║`);
  console.log(`║  Red:    http://${localIP}:${PORT}           ║`);
  console.log(`║  BD:     ${total} registros · ${equipo} colaboradores · ${tarifas} tarifas  ║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  logger.info(`Servidor listo en :${PORT} · BD: ${total} registros · ${equipo} colaboradores`);
});
