'use strict';
const express = require('express');
const router  = express.Router();

const db                            = require('../db/connection');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ─── GET /api/celulas ─────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const row = db.get('SELECT data_json, updated_at, updated_by FROM celulas_config WHERE id=1');
  if (!row) return res.status(404).json({ error: 'Sin datos' });
  res.json({ data: JSON.parse(row.data_json), updated_at: row.updated_at, updated_by: row.updated_by });
});

// ─── PUT /api/celulas ─────────────────────────────────────────────────────────
router.put('/', authMiddleware, adminOnly, (req, res) => {
  const { data } = req.body;
  if (!data || !data.celulas) return res.status(400).json({ error: 'data requerido' });
  db.run(
    "UPDATE celulas_config SET data_json=?, updated_at=datetime('now'), updated_by=? WHERE id=1",
    [JSON.stringify(data), req.user.nombre]
  );
  res.json({ ok: true });
});

module.exports = router;
