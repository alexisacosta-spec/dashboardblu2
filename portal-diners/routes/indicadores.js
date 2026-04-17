'use strict';
const express = require('express');
const router  = express.Router();

const db                   = require('../db/connection');
const { authMiddleware }   = require('../middleware/auth');

// ─── HELPER: areaLabel ────────────────────────────────────────────────────────
function areaLabel(ap) {
  if (!ap) return 'Sin área';
  const parts = ap.split('\\');
  return parts[parts.length - 1] || ap;
}

// ─── HELPER: buildBugsWhere ───────────────────────────────────────────────────
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

// ─── HELPER: buildRendWhere ───────────────────────────────────────────────────
function buildRendWhere(q) {
  const c = [], p = [];
  if (q.iniciativa) { c.push('id_iniciativa = ?');  p.push(String(q.iniciativa)); }
  if (q.equipo)     { c.push('area_path LIKE ?');    p.push(`Gestion Blu\\${q.equipo}%`); }
  if (q.area)       { c.push('area_path = ?');       p.push(q.area); }
  if (q.anio)       { c.push('anio = ?');            p.push(parseInt(q.anio)); }
  if (q.mes)        { c.push('mes = ?');             p.push(parseInt(q.mes)); }
  if (q.sprint)     { c.push('sprint = ?');          p.push(q.sprint); }
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAD TIME
// ══════════════════════════════════════════════════════════════════════════════
router.get('/lead-time', authMiddleware, (req, res) => {
  const rows = db.all(`
    SELECT id_iniciativa, nombre_iniciativa, categoria_negocio,
           total_tasks, cerradas, activas, nuevas, fecha_ini, fecha_fin
    FROM tasks_plan
    WHERE id_iniciativa NOT IN ('SIN_INI','SIN PARENT','')
      AND fecha_ini IS NOT NULL AND fecha_fin IS NOT NULL
      AND fecha_ini != '' AND fecha_fin != ''
    ORDER BY nombre_iniciativa`);

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
      cerradas:  r.cerradas   || 0,
      total:     r.total_tasks || 0
    };
  });

  const lts = iniciativas.map(r => r.lead_time).sort((a, b) => a - b);
  const n   = lts.length;
  const promedio = n > 0 ? Math.round(lts.reduce((s, v) => s + v, 0) / n) : 0;
  const mediana  = n > 0
    ? (n % 2 === 0 ? Math.round((lts[n/2-1] + lts[n/2]) / 2) : lts[Math.floor(n/2)])
    : 0;
  const minimo = n > 0 ? lts[0]     : 0;
  const maximo = n > 0 ? lts[n - 1] : 0;

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

// ══════════════════════════════════════════════════════════════════════════════
// BUGS
// ══════════════════════════════════════════════════════════════════════════════
router.get('/bugs/filtros', authMiddleware, (req, res) => {
  res.json({
    estados:    db.all(`SELECT DISTINCT estado       FROM bugs_csv WHERE estado != ''       ORDER BY estado`).map(r => r.estado),
    ambientes:  db.all(`SELECT DISTINCT ambiente     FROM bugs_csv WHERE ambiente != ''     ORDER BY ambiente`).map(r => r.ambiente),
    sprints:    db.all(`SELECT DISTINCT sprint       FROM bugs_csv WHERE sprint != ''       ORDER BY sprint`).map(r => r.sprint),
    severidades:db.all(`SELECT DISTINCT severity     FROM bugs_csv WHERE severity != ''     ORDER BY severity`).map(r => r.severity),
    categorias: db.all(`SELECT DISTINCT categoria_bug FROM bugs_csv WHERE categoria_bug != '' ORDER BY categoria_bug`).map(r => r.categoria_bug),
    iniciativas:db.all(`SELECT DISTINCT id_iniciativa, nombre_iniciativa FROM bugs_csv WHERE id_iniciativa NOT IN ('SIN_INI','') ORDER BY nombre_iniciativa`)
                  .map(r => ({ id: r.id_iniciativa, nombre: r.nombre_iniciativa }))
  });
});

router.get('/bugs/produccion', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const resumen     = db.all(`SELECT ambiente, COUNT(*) as total FROM bugs_csv ${bugsAnd(where,'ambiente != \'\'')} GROUP BY ambiente ORDER BY total DESC`, params);
  const porEstado   = db.all(`SELECT estado, COUNT(*) as total FROM bugs_csv ${where} GROUP BY estado ORDER BY total DESC`, params);
  const enProduccion = db.all(`SELECT ambiente, estado, COUNT(*) as total FROM bugs_csv ${bugsAnd(where,"ambiente IN ('PRODUCCION','EXTERNO_PRODUCCION','GSF')")} GROUP BY ambiente, estado ORDER BY ambiente, estado`, params);
  const total    = (db.get(`SELECT COUNT(*) as n FROM bugs_csv ${where}`, params) || {n:0}).n;
  const criticos = (db.get(`SELECT COUNT(*) as n FROM bugs_csv ${bugsAnd(where,"severity='1 - Critical' AND estado != 'Closed'")}`, params) || {n:0}).n;
  res.json({ resumen, porEstado, enProduccion, total, criticos });
});

router.get('/bugs/por-iniciativa', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const bugs  = db.all(`SELECT id_iniciativa, nombre_iniciativa, COUNT(*) as total_bugs FROM bugs_csv ${bugsAnd(where,"id_iniciativa NOT IN ('SIN_INI','')")} GROUP BY id_iniciativa ORDER BY total_bugs DESC`, params);
  const tasks = db.all(`SELECT id_iniciativa, nombre_iniciativa, total_tasks, cerradas FROM tasks_plan WHERE id_iniciativa NOT IN ('SIN_INI','')`);
  const taskMap = {};
  tasks.forEach(t => { taskMap[t.id_iniciativa] = t; });
  res.json({
    iniciativas: bugs.map(b => ({
      id_iniciativa: b.id_iniciativa,
      nombre:        b.nombre_iniciativa,
      total_bugs:    b.total_bugs,
      total_tasks:   taskMap[b.id_iniciativa]?.total_tasks || 0,
      cerradas:      taskMap[b.id_iniciativa]?.cerradas    || 0,
      densidad:      taskMap[b.id_iniciativa]?.total_tasks > 0
                       ? Math.round(b.total_bugs / taskMap[b.id_iniciativa].total_tasks * 100) / 100 : null
    }))
  });
});

router.get('/bugs/por-sprint', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const sprints = db.all(`
    SELECT sprint, COUNT(*) as total,
           SUM(CASE WHEN estado='Closed' THEN 1 ELSE 0 END) as cerrados,
           SUM(CASE WHEN estado!='Closed' THEN 1 ELSE 0 END) as abiertos
    FROM bugs_csv ${bugsAnd(where,"sprint IS NOT NULL AND sprint != ''")}
    GROUP BY sprint ORDER BY sprint`, params);
  res.json({ sprints });
});

router.get('/bugs/mttr', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const cerrados = db.all(`
    SELECT id_bug, titulo, sprint, ambiente, severity, categoria_bug, created_date, closed_date,
           CAST(ROUND(julianday(closed_date) - julianday(created_date)) AS INTEGER) as dias
    FROM bugs_csv
    ${bugsAnd(where,"closed_date IS NOT NULL AND closed_date != '' AND created_date IS NOT NULL AND created_date != '' AND julianday(closed_date) >= julianday(created_date)")}
    ORDER BY dias DESC`, params);
  const n        = cerrados.length;
  const promedio = n > 0 ? Math.round(cerrados.reduce((s,r) => s+(r.dias||0),0)/n) : 0;
  const mediana  = (() => {
    if (!n) return 0;
    const sorted = [...cerrados].map(r => r.dias).sort((a,b) => a-b);
    return n%2===0 ? Math.round((sorted[n/2-1]+sorted[n/2])/2) : sorted[Math.floor(n/2)];
  })();
  res.json({ bugs: cerrados, mttr_promedio: promedio, mttr_mediana: mediana, total_cerrados: n });
});

router.get('/bugs/severidad', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const rows = db.all(`
    SELECT severity,
           COUNT(*) as total,
           SUM(CASE WHEN estado='Closed' THEN 1 ELSE 0 END) as cerrados,
           SUM(CASE WHEN estado!='Closed' THEN 1 ELSE 0 END) as abiertos
    FROM bugs_csv ${bugsAnd(where,"severity != ''")}
    GROUP BY severity ORDER BY severity`, params);
  const mttrRows = db.all(`
    SELECT severity,
           CAST(ROUND(AVG(julianday(closed_date)-julianday(created_date))) AS INTEGER) as mttr
    FROM bugs_csv
    ${bugsAnd(where,"severity != '' AND closed_date != '' AND created_date != '' AND julianday(closed_date)>=julianday(created_date)")}
    GROUP BY severity ORDER BY severity`, params);
  const mttrMap = {};
  mttrRows.forEach(r => { mttrMap[r.severity] = r.mttr; });
  res.json({ severidades: rows.map(r => ({ ...r, mttr: mttrMap[r.severity] ?? null })) });
});

router.get('/bugs/por-categoria', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const rows = db.all(`
    SELECT categoria_bug, severity, estado, COUNT(*) as total
    FROM bugs_csv ${bugsAnd(where,"categoria_bug != ''")}
    GROUP BY categoria_bug, severity, estado
    ORDER BY categoria_bug, severity, estado`, params);
  const cats = {};
  rows.forEach(r => {
    if (!cats[r.categoria_bug]) cats[r.categoria_bug] = { total:0, abiertos:0, cerrados:0, bySeverity:{} };
    const c = cats[r.categoria_bug];
    c.total += r.total;
    if (r.estado === 'Closed') c.cerrados += r.total; else c.abiertos += r.total;
    if (!c.bySeverity[r.severity]) c.bySeverity[r.severity] = { abiertos:0, cerrados:0 };
    if (r.estado === 'Closed') c.bySeverity[r.severity].cerrados += r.total;
    else                        c.bySeverity[r.severity].abiertos += r.total;
  });
  res.json({
    categorias: Object.entries(cats)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a,b) => b.total - a.total)
  });
});

router.get('/bugs/detalle', authMiddleware, (req, res) => {
  const { where, params } = buildBugsWhere(req.query);
  const bugs = db.all(`
    SELECT id_bug, titulo, estado, sprint, ambiente, severity, categoria_bug,
           created_date, closed_date,
           id_iniciativa, nombre_iniciativa, id_epic, nombre_epic, id_hu, nombre_hu,
           CASE
             WHEN closed_date != '' AND created_date != ''
                  AND julianday(closed_date) >= julianday(created_date)
             THEN CAST(ROUND(julianday(closed_date) - julianday(created_date)) AS INTEGER)
             ELSE NULL
           END as dias_resolucion
    FROM bugs_csv ${where}
    ORDER BY severity, estado, nombre_iniciativa`, params);
  res.json({ bugs, total: bugs.length });
});

// ══════════════════════════════════════════════════════════════════════════════
// RENDIMIENTO DEL EQUIPO
// ══════════════════════════════════════════════════════════════════════════════
router.get('/rendimiento/filtros', authMiddleware, (req, res) => {
  const anios   = db.all(`SELECT DISTINCT anio   FROM datos_horas WHERE anio   > 0   ORDER BY anio`).map(r => r.anio);
  const meses   = db.all(`SELECT DISTINCT mes    FROM datos_horas WHERE mes    > 0   ORDER BY mes`).map(r => r.mes);
  const sprints = db.all(`SELECT DISTINCT sprint FROM datos_horas WHERE sprint != '' ORDER BY sprint`).map(r => r.sprint);
  const areas   = db.all(`SELECT DISTINCT area_path FROM datos_horas WHERE area_path != '' ORDER BY area_path`)
                    .map(r => ({ area_path: r.area_path, label: areaLabel(r.area_path) }));
  const iniciativas = db.all(`
    SELECT id_iniciativa AS id, nombre_iniciativa AS nombre
    FROM tasks_plan
    WHERE id_iniciativa NOT IN ('SIN_INI','SIN PARENT','')
    ORDER BY nombre_iniciativa`);
  res.json({ anios, meses, sprints, areas, iniciativas });
});

router.get('/rendimiento/estimacion', authMiddleware, (req, res) => {
  const { where, params } = buildRendWhere(req.query);
  const rows = db.all(`
    SELECT area_path,
           SUM(horas_estimadas)   AS estimadas,
           SUM(horas_completadas) AS completadas,
           COUNT(*)               AS tasks
    FROM datos_horas
    ${where ? where + ' AND' : 'WHERE'} area_path != '' AND horas_estimadas > 0
    GROUP BY area_path ORDER BY area_path`, params);

  const areas = rows.map(r => {
    const est  = r.estimadas   || 0;
    const real = r.completadas || 0;
    return {
      area_path:    r.area_path,
      label:        areaLabel(r.area_path),
      estimadas:    Math.round(est  * 10) / 10,
      completadas:  Math.round(real * 10) / 10,
      tasks:        r.tasks,
      desvioPct:    est > 0 ? Math.round((real - est) / est * 1000) / 10 : null,
      precisionPct: est > 0 ? Math.round(real / est * 1000) / 10 : null
    };
  });

  const totEst  = areas.reduce((s, r) => s + r.estimadas,   0);
  const totReal = areas.reduce((s, r) => s + r.completadas, 0);
  const personasWhere = where ? `${where} AND correo != ''` : `WHERE correo != ''`;
  const personas = (db.get(`SELECT COUNT(DISTINCT correo) as n FROM datos_horas ${personasWhere}`, params) || {n:0}).n;

  res.json({
    areas,
    kpis: {
      estimadas:       Math.round(totEst  * 10) / 10,
      completadas:     Math.round(totReal * 10) / 10,
      desvioGlobal:    totEst > 0 ? Math.round((totReal - totEst) / totEst * 1000) / 10 : null,
      precisionGlobal: totEst > 0 ? Math.round(totReal / totEst * 1000) / 10 : null,
      personas
    }
  });
});

router.get('/rendimiento/velocidad', authMiddleware, (req, res) => {
  const { where, params } = buildRendWhere(req.query);
  const rows = db.all(`
    SELECT sprint, SUM(horas_completadas) AS horas, COUNT(*) AS tasks
    FROM datos_horas
    ${where ? where + ' AND' : 'WHERE'} sprint != ''
    GROUP BY sprint ORDER BY sprint`, params);
  const sprintNum = s => { const m = s.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  rows.sort((a, b) => sprintNum(a.sprint) - sprintNum(b.sprint));
  const promHoras = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.horas, 0) / rows.length * 10) / 10
    : 0;
  res.json({ sprints: rows, promedio_horas: promHoras });
});

router.get('/rendimiento/burnup', authMiddleware, (req, res) => {
  const { where, params } = buildRendWhere(req.query);
  const rows = db.all(`
    SELECT sprint, SUM(horas_estimadas) AS estimadas, SUM(horas_completadas) AS completadas
    FROM datos_horas
    ${where ? where + ' AND' : 'WHERE'} sprint != '' AND (horas_estimadas > 0 OR horas_completadas > 0)
    GROUP BY sprint ORDER BY sprint`, params);
  const sprintNum = s => { const m = s.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  rows.sort((a, b) => sprintNum(a.sprint) - sprintNum(b.sprint));
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

module.exports = router;
