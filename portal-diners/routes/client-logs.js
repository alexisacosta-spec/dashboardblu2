'use strict';
const express = require('express');
const router  = express.Router();

const db      = require('../db/connection');
const logger  = require('../lib/logger');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const MAX_BATCH    = 20;   // max eventos por request
const TIPOS_VALIDOS = new Set([
  'JS_ERROR','UNHANDLED_PROMISE','API_ERROR',
  'VIEW','FILTER_APPLIED',
  'CSV_UPLOAD_INICIADO','CSV_UPLOAD_OK','CSV_UPLOAD_ERROR',
  'SNAPSHOT_RESTAURADO',
]);

// ─── POST /api/logs/client ────────────────────────────────────────────────────
// Recibe lotes de eventos del browser. Responde de inmediato (204) y procesa
// de forma síncrona pero sin bloquear la respuesta.
router.post('/', (req, res) => {
  // Responder de inmediato — nunca hacer esperar al cliente
  res.status(204).end();

  const { sid, eventos } = req.body || {};
  if (!sid || !Array.isArray(eventos) || !eventos.length) return;

  const ip = req.ip || '—';
  const ua = (req.headers['user-agent'] || '').slice(0, 200);

  const batch = eventos.slice(0, MAX_BATCH);
  for (const ev of batch) {
    const { tipo, datos, ts } = ev || {};
    if (!tipo || typeof tipo !== 'string') continue;
    if (!TIPOS_VALIDOS.has(tipo)) continue;
    const datos_obj = (datos && typeof datos === 'object') ? datos : {};

    // ── Terminal ──────────────────────────────────────────────────────────────
    logger.clientEvent(sid, req, tipo, datos_obj);

    // ── Persistencia ──────────────────────────────────────────────────────────
    try {
      const u = req.user;
      db.run(
        `INSERT INTO client_logs (sesion_id, email, perfil, evento, datos, ip, user_agent, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sid,
          u?.email || null,
          u?.perfil || null,
          tipo,
          JSON.stringify(datos_obj),
          ip,
          ua,
          ts || new Date().toISOString().replace('T', ' ').split('.')[0],
        ]
      );
    } catch (_) { /* no propagamos errores de logging */ }
  }
});

// ─── GET /api/logs/client ─────────────────────────────────────────────────────
// Solo admin — últimos N registros con filtros opcionales.
router.get('/', authMiddleware, adminOnly, (req, res) => {
  const { email, tipo, desde, hasta, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 200, 500);
  const conds = [], params = [];
  if (email) { conds.push('email LIKE ?');  params.push(`%${email}%`); }
  if (tipo)  { conds.push('evento = ?');    params.push(tipo); }
  if (desde) { conds.push('fecha >= ?');    params.push(desde); }
  if (hasta) { conds.push('fecha <= ?');    params.push(hasta + ' 23:59:59'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  res.json(db.all(
    `SELECT id, fecha, sesion_id, email, perfil, evento, datos, ip
     FROM client_logs ${where} ORDER BY fecha DESC LIMIT ${maxLimit}`,
    params
  ));
});

module.exports = router;
