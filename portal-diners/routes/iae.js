'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');
const logger  = require('../lib/logger');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function computeIAE(total_tasks, cerradas, h_est, h_ejec) {
  const pct_t = total_tasks > 0 ? (cerradas / total_tasks) * 100 : 0;
  const pct_h = h_est > 0 ? (h_ejec / h_est) * 100 : 0;
  // Eficiencia: sin penalización cuando las horas están bajo presupuesto
  let efficiency = 1;
  if (pct_h > 0 && pct_t > 0) efficiency = Math.min(1, pct_t / pct_h);
  const iae = pct_t * efficiency;
  return {
    pct_tareas: Math.round(pct_t * 10) / 10,
    pct_horas:  Math.round(pct_h * 10) / 10,
    iae:        Math.round(iae   * 10) / 10
  };
}

function semaforo(iae) {
  return iae >= 85 ? 'verde' : iae >= 70 ? 'naranja' : 'rojo';
}

function getIniRows() {
  // Igual que avance-iniciativas: tasks_plan para conteos + datos_horas para horas
  // datos_horas solo tiene tasks Closed, no-Diners, con horas > 0 — evita placeholder inflation
  return db.all(`
    SELECT tp.id_iniciativa, tp.nombre_iniciativa,
      tp.total_tasks, tp.cerradas, tp.activas, tp.nuevas, tp.otros,
      ROUND(COALESCE(SUM(dh.horas_completadas), 0), 1) AS h_ejec,
      ROUND(COALESCE(SUM(dh.horas_estimadas),   0), 1) AS h_est
    FROM tasks_plan tp
    LEFT JOIN datos_horas dh ON dh.id_iniciativa = tp.id_iniciativa
    WHERE tp.id_iniciativa NOT IN ('SIN_INI','SIN PARENT','')
    GROUP BY tp.id_iniciativa
    HAVING tp.total_tasks > 0
  `);
}

// ─── GET /api/iae/resumen ─────────────────────────────────────────────────────

router.get('/resumen', authMiddleware, (req, res) => {
  const rows = getIniRows();

  const iniciativas = rows.map(r => {
    const { pct_tareas, pct_horas, iae } = computeIAE(r.total_tasks, r.cerradas, r.h_est, r.h_ejec);
    return {
      id_iniciativa: r.id_iniciativa,
      nombre:        r.nombre_iniciativa,
      total_tasks:   r.total_tasks,
      cerradas:      r.cerradas,
      activas:       r.activas  || 0,
      nuevas:        r.nuevas   || 0,
      otros:         r.otros    || 0,
      h_est:         r.h_est,
      h_ejec:        r.h_ejec,
      pct_tareas, pct_horas, iae,
      semaforo: semaforo(iae)
    };
  }).sort((a, b) => a.iae - b.iae);

  // KPIs globales
  let totTasks = 0, totCerradas = 0, totHEst = 0, totHEjec = 0;
  for (const r of rows) {
    totTasks    += r.total_tasks;
    totCerradas += r.cerradas;
    totHEst     += r.h_est;
    totHEjec    += r.h_ejec;
  }
  const kpi = computeIAE(totTasks, totCerradas, totHEst, totHEjec);

  const alertas_count = (db.get("SELECT COUNT(*) AS n FROM alertas WHERE estado IN ('nueva','activa')") || { n: 0 }).n;

  res.json({ kpis: { ...kpi, semaforo: semaforo(kpi.iae), alertas_count }, iniciativas });
});

// ─── GET /api/iae/anomalias ───────────────────────────────────────────────────

router.get('/anomalias', authMiddleware, (req, res) => {
  // 1. Horas placeholder (≥ 100h en una sola tarea)
  const placeholder = db.all(`
    SELECT id_task, nombre_task, id_iniciativa, nombre_iniciativa,
           horas_estimadas, horas_completadas, estado
    FROM tasks_seguimiento WHERE horas_estimadas >= 100
    ORDER BY horas_estimadas DESC
  `);

  // 2. Estimación cero con horas ejecutadas
  const zero_estimate = db.all(`
    SELECT id_task, nombre_task, id_iniciativa, nombre_iniciativa,
           horas_estimadas, horas_completadas, estado
    FROM tasks_seguimiento WHERE horas_estimadas = 0 AND horas_completadas > 0
    ORDER BY horas_completadas DESC
  `);

  // 3. Tasks abiertas en iniciativas críticas (IAE < 70%)
  const rows = getIniRows();
  const criticalIds = rows
    .filter(r => computeIAE(r.total_tasks, r.cerradas, r.h_est, r.h_ejec).iae < 70)
    .map(r => r.id_iniciativa);

  let critical_open = [];
  if (criticalIds.length > 0) {
    const ph = criticalIds.map(() => '?').join(',');
    critical_open = db.all(
      `SELECT id_task, nombre_task, id_iniciativa, nombre_iniciativa,
              horas_estimadas, horas_completadas, estado
       FROM tasks_seguimiento
       WHERE id_iniciativa IN (${ph}) AND estado != 'Closed'
       ORDER BY id_iniciativa, estado`,
      criticalIds
    );
  }

  res.json({ placeholder, zero_estimate, critical_open });
});

// ─── GET /api/iae/alertas ─────────────────────────────────────────────────────

router.get('/alertas', authMiddleware, (req, res) => {
  res.json(db.all(`SELECT * FROM alertas ORDER BY
    CASE estado WHEN 'nueva' THEN 0 WHEN 'activa' THEN 1 WHEN 'reconocida' THEN 2 ELSE 3 END,
    detectada_en DESC`));
});

// ─── POST /api/iae/alertas/:id/reconocer ─────────────────────────────────────

router.post('/alertas/:id/reconocer', authMiddleware, (req, res) => {
  const { nota } = req.body;
  const alerta = db.get('SELECT * FROM alertas WHERE id=?', [req.params.id]);
  if (!alerta) return res.status(404).json({ error: 'Alerta no encontrada' });
  if (alerta.estado === 'resuelta') return res.status(400).json({ error: 'Alerta ya resuelta' });
  db.run(
    `UPDATE alertas SET estado='reconocida', nota=?, reconocida_por=?, reconocida_en=datetime('now') WHERE id=?`,
    [nota || null, req.user.email, req.params.id]
  );
  res.json({ ok: true });
});

// ─── POST /api/iae/generar-alertas (llamado también desde admin tras carga CSV) ─

router.post('/generar-alertas', authMiddleware, (req, res) => {
  try {
    res.json(generarAlertas());
  } catch (e) {
    logger.error('Error generando alertas IAE', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── FUNCIÓN INTERNA exportada para ser llamada desde admin.js ────────────────

function generarAlertas() {
  const rows = getIniRows();
  const iniMap = {};
  for (const r of rows) {
    const c = computeIAE(r.total_tasks, r.cerradas, r.h_est, r.h_ejec);
    iniMap[r.id_iniciativa] = { ...r, ...c };
  }

  const nuevasAnomalias = [];

  // Tipo 1: Horas placeholder (≥ 100h) agrupadas por iniciativa
  const phByIni = {};
  for (const t of db.all('SELECT id_task, id_iniciativa, nombre_iniciativa, horas_estimadas FROM tasks_seguimiento WHERE horas_estimadas >= 100')) {
    if (!phByIni[t.id_iniciativa]) phByIni[t.id_iniciativa] = { nombre: t.nombre_iniciativa, tasks: [] };
    phByIni[t.id_iniciativa].tasks.push(t.id_task);
  }
  for (const [id, data] of Object.entries(phByIni)) {
    const ini = iniMap[id];
    if (!ini) continue;
    nuevasAnomalias.push({
      tipo: 'HORAS_PLACEHOLDER', severidad: 'advertencia',
      id_iniciativa: id, nombre_ini: data.nombre,
      iae: ini.iae, pct_tareas: ini.pct_tareas, pct_horas: ini.pct_horas,
      tasks_json: JSON.stringify(data.tasks)
    });
  }

  // Tipo 2: Estimación cero con horas ejecutadas
  const zeroByIni = {};
  for (const t of db.all('SELECT id_task, id_iniciativa, nombre_iniciativa FROM tasks_seguimiento WHERE horas_estimadas = 0 AND horas_completadas > 0')) {
    if (!zeroByIni[t.id_iniciativa]) zeroByIni[t.id_iniciativa] = { nombre: t.nombre_iniciativa, tasks: [] };
    zeroByIni[t.id_iniciativa].tasks.push(t.id_task);
  }
  for (const [id, data] of Object.entries(zeroByIni)) {
    const ini = iniMap[id];
    if (!ini) continue;
    nuevasAnomalias.push({
      tipo: 'ZERO_ESTIMATE', severidad: 'info',
      id_iniciativa: id, nombre_ini: data.nombre,
      iae: ini?.iae, pct_tareas: ini?.pct_tareas, pct_horas: ini?.pct_horas,
      tasks_json: JSON.stringify(data.tasks)
    });
  }

  // Tipo 3: Tasks abiertas en iniciativas críticas (IAE < 70%)
  const criticalIds = Object.entries(iniMap).filter(([, v]) => v.iae < 70).map(([k]) => k);
  if (criticalIds.length > 0) {
    const ph = criticalIds.map(() => '?').join(',');
    const openByIni = {};
    for (const t of db.all(
      `SELECT id_task, id_iniciativa, nombre_iniciativa FROM tasks_seguimiento WHERE id_iniciativa IN (${ph}) AND estado != 'Closed'`,
      criticalIds
    )) {
      if (!openByIni[t.id_iniciativa]) openByIni[t.id_iniciativa] = { nombre: t.nombre_iniciativa, tasks: [] };
      openByIni[t.id_iniciativa].tasks.push(t.id_task);
    }
    for (const [id, data] of Object.entries(openByIni)) {
      const ini = iniMap[id];
      nuevasAnomalias.push({
        tipo: 'TASKS_ABIERTAS_CRITICO', severidad: 'critica',
        id_iniciativa: id, nombre_ini: data.nombre,
        iae: ini?.iae, pct_tareas: ini?.pct_tareas, pct_horas: ini?.pct_horas,
        tasks_json: JSON.stringify(data.tasks)
      });
    }
  }

  // Actualizar tabla alertas
  const existentes = db.all("SELECT * FROM alertas WHERE estado IN ('nueva','activa','reconocida')");
  const nuevasKeys = new Set(nuevasAnomalias.map(a => `${a.tipo}::${a.id_iniciativa}`));
  const existentesMap = {};
  for (const e of existentes) existentesMap[`${e.tipo}::${e.id_iniciativa}`] = e;

  // Auto-resolver alertas que ya no tienen anomalía
  for (const e of existentes) {
    if (!nuevasKeys.has(`${e.tipo}::${e.id_iniciativa}`)) {
      db.run(`UPDATE alertas SET estado='resuelta', resuelta_en=datetime('now') WHERE id=?`, [e.id]);
    }
  }

  let nuevas = 0;
  for (const a of nuevasAnomalias) {
    const key = `${a.tipo}::${a.id_iniciativa}`;
    if (!existentesMap[key]) {
      db.run(
        `INSERT INTO alertas (tipo,severidad,id_iniciativa,nombre_ini,iae,pct_tareas,pct_horas,tasks_json,estado)
         VALUES (?,?,?,?,?,?,?,?,'nueva')`,
        [a.tipo, a.severidad, a.id_iniciativa, a.nombre_ini, a.iae, a.pct_tareas, a.pct_horas, a.tasks_json]
      );
      nuevas++;
    } else {
      // Actualizar datos frescos
      db.run(
        `UPDATE alertas SET iae=?, pct_tareas=?, pct_horas=?, tasks_json=?, severidad=? WHERE id=?`,
        [a.iae, a.pct_tareas, a.pct_horas, a.tasks_json, a.severidad, existentesMap[key].id]
      );
    }
  }

  logger.info(`IAE alertas: ${nuevas} nuevas · ${nuevasAnomalias.length} activas · ${existentes.length - nuevasKeys.size + nuevas} resueltas`);
  return { ok: true, nuevas, total: nuevasAnomalias.length };
}

module.exports = { router, generarAlertas };
