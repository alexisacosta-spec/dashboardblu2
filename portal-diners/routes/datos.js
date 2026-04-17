'use strict';
const express = require('express');
const router  = express.Router();

const db                    = require('../db/connection');
const { authMiddleware, vc } = require('../middleware/auth');

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function buildWhere(q) {
  const c = [], p = [];
  if (q.anio)      { c.push('anio=?');              p.push(parseInt(q.anio)); }
  if (q.mes)       { c.push('mes=?');               p.push(parseInt(q.mes)); }
  if (q.empresa)   { c.push('empresa=?');           p.push(q.empresa); }
  if (q.categoria) { c.push('categoria_negocio=?'); p.push(q.categoria); }
  if (q.iniciativa){ c.push('id_iniciativa=?');     p.push(String(q.iniciativa)); }
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}

const fmt = (rows, u) => rows.map(r => ({
  ...r,
  costo: vc(u) ? Math.round(r.costo || 0) : null,
  horas: Math.round((r.horas || 0) * 10) / 10
}));

// ─── KPIs GLOBALES ────────────────────────────────────────────────────────────
router.get('/kpis', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  const t = db.get(`SELECT SUM(horas_completadas) as horas, SUM(costo) as costo FROM datos_horas ${where}`, params) || {};
  const i = db.get(`SELECT COUNT(DISTINCT id_iniciativa) as total FROM datos_horas ${where}`, params) || {};
  const p = db.get(`SELECT COUNT(DISTINCT nombre_persona) as total FROM datos_horas ${where}`, params) || {};
  res.json({
    horas:      Math.round((t.horas || 0) * 10) / 10,
    costo:      vc(req.user) ? Math.round(t.costo || 0) : null,
    iniciativas: i.total || 0,
    personas:    p.total || 0
  });
});

// ─── POR MES ──────────────────────────────────────────────────────────────────
router.get('/por-mes', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  res.json(fmt(
    db.all(`SELECT anio, mes, SUM(horas_completadas) as horas, SUM(costo) as costo
            FROM datos_horas ${where} GROUP BY anio, mes ORDER BY anio, mes`, params),
    req.user
  ));
});

// ─── POR EMPRESA ──────────────────────────────────────────────────────────────
router.get('/por-empresa', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  res.json(fmt(
    db.all(`SELECT empresa, SUM(horas_completadas) as horas, SUM(costo) as costo
            FROM datos_horas ${where} GROUP BY empresa ORDER BY horas DESC`, params),
    req.user
  ));
});

// ─── POR ROL ──────────────────────────────────────────────────────────────────
router.get('/por-rol', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  res.json(fmt(
    db.all(`SELECT rol, SUM(horas_completadas) as horas, SUM(costo) as costo
            FROM datos_horas ${where} GROUP BY rol ORDER BY horas DESC`, params),
    req.user
  ));
});

// ─── POR CATEGORÍA ────────────────────────────────────────────────────────────
router.get('/por-categoria', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  res.json(fmt(
    db.all(`SELECT categoria_negocio, SUM(horas_completadas) as horas, SUM(costo) as costo
            FROM datos_horas ${where} GROUP BY categoria_negocio ORDER BY horas DESC`, params),
    req.user
  ));
});

// ─── POR INICIATIVA ───────────────────────────────────────────────────────────
router.get('/por-iniciativa', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  const rows = db.all(`
    SELECT id_iniciativa, nombre_iniciativa, categoria_negocio,
           SUM(horas_completadas) as horas, SUM(costo) as costo,
           COUNT(DISTINCT nombre_persona) as personas
    FROM datos_horas ${where}
    GROUP BY id_iniciativa, nombre_iniciativa ORDER BY horas DESC`, params);
  const total = rows.reduce((s, r) => s + (r.horas || 0), 0);
  res.json(rows.map(r => ({
    ...r,
    costo: vc(req.user) ? Math.round(r.costo || 0) : null,
    horas: Math.round((r.horas || 0) * 10) / 10,
    pct:   total > 0 ? Math.round((r.horas / total) * 1000) / 10 : 0
  })));
});

// ─── DRILL-DOWN: Iniciativa → Epics ──────────────────────────────────────────
router.get('/iniciativa/:idIni/epics', authMiddleware, (req, res) => {
  const idIni = String(req.params.idIni).trim();
  const q = { ...req.query }; delete q.iniciativa;
  const { where: ew, params: ep } = buildWhere(q);
  const where = ew ? ew + ' AND id_iniciativa=?' : 'WHERE id_iniciativa=?';
  res.json(fmt(
    db.all(`SELECT id_epic, nombre_epic, SUM(horas_completadas) as horas, SUM(costo) as costo,
                   COUNT(DISTINCT nombre_persona) as personas
            FROM datos_horas ${where} GROUP BY id_epic, nombre_epic ORDER BY horas DESC`,
      [...ep, idIni]),
    req.user
  ));
});

// ─── DRILL-DOWN: Epic → HUs ───────────────────────────────────────────────────
router.get('/epic/:idEpic/hus', authMiddleware, (req, res) => {
  const idEpic = String(req.params.idEpic).trim();
  const { where: ew, params: ep } = buildWhere(req.query);
  const where = ew ? ew + ' AND id_epic=?' : 'WHERE id_epic=?';
  res.json(fmt(
    db.all(`SELECT id_hu, nombre_hu, SUM(horas_completadas) as horas, SUM(costo) as costo,
                   COUNT(DISTINCT nombre_persona) as personas
            FROM datos_horas ${where} GROUP BY id_hu, nombre_hu ORDER BY horas DESC`,
      [...ep, idEpic]),
    req.user
  ));
});

// ─── DRILL-DOWN: HU → Tasks ───────────────────────────────────────────────────
router.get('/hu/:idHu/tasks', authMiddleware, (req, res) => {
  const idHu = String(req.params.idHu).trim();
  const rows = db.all(
    `SELECT id_task, nombre_task, nombre_persona, empresa, rol, horas_completadas, costo, mes, anio
     FROM datos_horas WHERE id_hu=? ORDER BY horas_completadas DESC`, [idHu]);
  res.json(rows.map(r => ({
    ...r,
    costo:             vc(req.user) ? Math.round(r.costo || 0) : null,
    horas_completadas: Math.round((r.horas_completadas || 0) * 10) / 10
  })));
});

// ─── POR PERSONA ──────────────────────────────────────────────────────────────
router.get('/por-persona', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  res.json(fmt(
    db.all(`SELECT nombre_persona, correo, empresa, rol,
                   SUM(horas_completadas) as horas, SUM(costo) as costo
            FROM datos_horas ${where} GROUP BY nombre_persona ORDER BY horas DESC`, params),
    req.user
  ));
});

// ─── DRILL-DOWN: Persona → Tasks ─────────────────────────────────────────────
router.get('/persona/:nombre/tasks', authMiddleware, (req, res) => {
  const nombre = decodeURIComponent(req.params.nombre);
  const q = { ...req.query }; delete q.iniciativa;
  const { where: ew, params: ep } = buildWhere(q);
  const where = ew ? ew + ' AND nombre_persona=?' : 'WHERE nombre_persona=?';
  const rows  = db.all(`
    SELECT id_task, nombre_task, nombre_iniciativa, nombre_epic, nombre_hu,
           horas_completadas, costo, mes, anio, estado
    FROM datos_horas ${where} ORDER BY anio DESC, mes DESC, horas_completadas DESC`,
    [...ep, nombre]);
  res.json(rows.map(r => ({
    ...r,
    costo:             vc(req.user) ? Math.round(r.costo || 0) : null,
    horas_completadas: Math.round((r.horas_completadas || 0) * 10) / 10
  })));
});

// ─── EXPORT PERSONAS ─────────────────────────────────────────────────────────
router.get('/personas/export', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  const rows = db.all(`
    SELECT nombre_persona, empresa, rol,
           nombre_iniciativa, nombre_epic, nombre_hu,
           nombre_task, id_task, mes, anio,
           horas_completadas, costo
    FROM datos_horas ${where}
    ORDER BY nombre_persona, anio DESC, mes DESC, horas_completadas DESC`, params);
  res.json(rows.map(r => ({
    ...r,
    costo:             vc(req.user) ? Math.round(r.costo || 0) : null,
    horas_completadas: Math.round((r.horas_completadas || 0) * 10) / 10
  })));
});

// ─── EMPRESA × ROL (heatmap) ──────────────────────────────────────────────────
router.get('/empresa-rol', authMiddleware, (req, res) => {
  const { where, params } = buildWhere(req.query);
  res.json(
    db.all(`SELECT empresa, rol, SUM(horas_completadas) as horas
            FROM datos_horas ${where} GROUP BY empresa, rol ORDER BY empresa, horas DESC`, params)
      .map(r => ({ ...r, horas: Math.round((r.horas || 0) * 10) / 10 }))
  );
});

// ─── FILTROS ──────────────────────────────────────────────────────────────────
router.get('/filtros', authMiddleware, (req, res) => {
  res.json({
    anios:       db.all("SELECT DISTINCT anio FROM datos_horas WHERE anio>0 ORDER BY anio").map(r => r.anio),
    meses:       db.all("SELECT DISTINCT mes FROM datos_horas WHERE mes>0 ORDER BY mes").map(r => r.mes),
    empresas:    db.all("SELECT DISTINCT empresa FROM datos_horas WHERE empresa!='' ORDER BY empresa").map(r => r.empresa),
    categorias:  db.all("SELECT DISTINCT categoria_negocio FROM datos_horas WHERE categoria_negocio!='' ORDER BY categoria_negocio").map(r => r.categoria_negocio),
    iniciativas: db.all("SELECT DISTINCT id_iniciativa, nombre_iniciativa FROM datos_horas WHERE nombre_iniciativa!='' ORDER BY nombre_iniciativa")
                   .map(r => ({ id: r.id_iniciativa, nombre: r.nombre_iniciativa }))
  });
});

// ─── ESTADO (conteo rápido) ───────────────────────────────────────────────────
router.get('/estado', authMiddleware, (req, res) => {
  res.json({ total: (db.get('SELECT COUNT(*) as total FROM datos_horas') || {}).total || 0 });
});

// ─── RESUMEN EJECUTIVO ────────────────────────────────────────────────────────
router.get('/resumen-ejecutivo', authMiddleware, (req, res) => {
  const bugsCriticos  = (db.get(`SELECT COUNT(*) as n FROM bugs_csv WHERE severity='1 - Critical' AND estado != 'Closed'`) || {n:0}).n;
  const totalAbiertos = (db.get(`SELECT COUNT(*) as n FROM bugs_csv WHERE estado != 'Closed'`) || {n:0}).n;
  const totalCerrados = (db.get(`SELECT COUNT(*) as n FROM bugs_csv WHERE estado = 'Closed'`) || {n:0}).n;
  const bugsXIni = db.all(`
    SELECT id_iniciativa, nombre_iniciativa,
           COUNT(*) as abiertos,
           SUM(CASE WHEN severity='1 - Critical' THEN 1 ELSE 0 END) as criticos
    FROM bugs_csv
    WHERE estado != 'Closed' AND id_iniciativa NOT IN ('SIN_INI','')
    GROUP BY id_iniciativa ORDER BY abiertos DESC LIMIT 5`);
  const precRow   = db.get(`SELECT SUM(horas_completadas) as real, SUM(horas_estimadas) as est FROM datos_horas WHERE horas_estimadas > 0`) || {};
  const precision = (precRow.est || 0) > 0 ? Math.round((precRow.real || 0) / (precRow.est || 1) * 1000) / 10 : null;
  const velRows   = db.all(`SELECT sprint, ROUND(SUM(horas_completadas),1) AS horas FROM datos_horas WHERE sprint != '' GROUP BY sprint ORDER BY sprint`);
  const sprintNum = s => { const m = s.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; };
  velRows.sort((a, b) => sprintNum(a.sprint) - sprintNum(b.sprint));
  const ultimos6 = velRows.slice(-6);
  const promVel  = ultimos6.length > 0 ? Math.round(ultimos6.reduce((s, r) => s + (r.horas || 0), 0) / ultimos6.length * 10) / 10 : 0;
  const ultimoH  = ultimos6.length > 0 ? (ultimos6[ultimos6.length - 1].horas || 0) : 0;
  const vsProm   = promVel > 0 ? Math.round((ultimoH - promVel) / promVel * 1000) / 10 : null;
  res.json({
    bugs:      { criticos: bugsCriticos, abiertos: totalAbiertos, cerrados: totalCerrados, porIniciativa: bugsXIni },
    precision,
    velocidad: { sprints: ultimos6, promedio: promVel, ultimo: ultimoH, vsProm }
  });
});

// ─── AVANCE DE INICIATIVAS ────────────────────────────────────────────────────
router.get('/avance-iniciativas', authMiddleware, (req, res) => {
  const { desde, hasta } = req.query;
  let planWhere = `WHERE tp.id_iniciativa NOT IN ('SIN_INI','SIN PARENT','')`;
  const params = [];
  if (desde && hasta) {
    planWhere += ` AND tp.fecha_ini <= ? AND tp.fecha_fin >= ?`;
    params.push(hasta, desde);
  }
  const rows = db.all(`
    SELECT tp.*,
      ROUND(COALESCE(SUM(dh.horas_completadas), 0), 1) AS horas_completadas,
      ROUND(COALESCE(SUM(dh.horas_estimadas),   0), 1) AS horas_estimadas
    FROM tasks_plan tp
    LEFT JOIN datos_horas dh ON dh.id_iniciativa = tp.id_iniciativa
    ${planWhere}
    GROUP BY tp.id_iniciativa
    ORDER BY tp.cerradas DESC`, params);
  res.json(rows.map(r => ({
    id:       r.id_iniciativa,
    nombre:   r.nombre_iniciativa,
    categoria: r.categoria_negocio || 'Sin Clasificar',
    cerradas: r.cerradas || 0,
    activas:  r.activas  || 0,
    nuevas:   r.nuevas   || 0,
    otros:    r.otros    || 0,
    total:    r.total_tasks || 0,
    pct:      r.total_tasks > 0 ? Math.round(r.cerradas / r.total_tasks * 1000) / 10 : 0,
    fecha_ini: r.fecha_ini,
    fecha_fin: r.fecha_fin,
    horas:     r.horas_completadas || 0,
    horas_est: r.horas_estimadas   || 0
  })));
});

// ─── DRILL-DOWN: Tasks por iniciativa (seguimiento) ──────────────────────────
router.get('/iniciativa/:idIni/tasks-seguimiento', authMiddleware, (req, res) => {
  const idIni = String(req.params.idIni).trim();
  const { tab } = req.query;
  let extra = '';
  if      (tab === 'cerradas')   extra = ` AND estado = 'Closed'`;
  else if (tab === 'pendientes') extra = ` AND estado != 'Closed'`;
  const rows = db.all(`
    SELECT id_task, nombre_task, id_epic, nombre_epic,
           nombre_persona, empresa, rol, estado, sprint,
           horas_estimadas, horas_completadas, fecha_ini, fecha_fin
    FROM tasks_seguimiento
    WHERE id_iniciativa = ?${extra}
    ORDER BY
      CASE estado
        WHEN 'Active'          THEN 1
        WHEN 'Returned'        THEN 2
        WHEN 'Ready_to_Deploy' THEN 3
        WHEN 'Resolved'        THEN 4
        WHEN 'New'             THEN 5
        WHEN 'Closed'          THEN 6
        ELSE 7
      END,
      sprint, nombre_task`, [idIni]);
  res.json(rows);
});

module.exports = router;
