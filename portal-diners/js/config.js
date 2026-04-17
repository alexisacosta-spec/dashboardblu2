// ─── CONFIG / GLOBAL STATE ───────────────────────────────────────────────────

// ─── TOOLTIP SISTEMA INFO ─────────────────────────────────────────────────────
const TOOLTIPS = {
  'horas-mes':    { title: 'Horas por mes', body: 'Suma de horas completadas de todas las tasks cerradas agrupadas por mes y año de registro.', formula: 'Σ HORAS_COMPLETADAS por MES/AÑO' },
  'empresa-donut':{ title: 'Distribución por empresa', body: 'Porcentaje de horas aportadas por cada empresa proveedora, calculado sobre el total del período seleccionado.', formula: 'Horas empresa / Horas totales × 100' },
  'top-ini':      { title: 'Top iniciativas', body: 'Las 5 iniciativas con mayor número de horas registradas en el período. Haz clic en "Ver todas" para el detalle completo.', formula: 'Rank por Σ HORAS_COMPLETADAS' },
  'horas-rol':    { title: 'Horas por rol', body: 'Distribución de horas por perfil de colaborador (LT, Desarrollador, QA, etc.) en el período filtrado.', formula: 'Σ HORAS_COMPLETADAS por ROL' },
  'horas-emp-bar':{ title: 'Horas por empresa', body: 'Barras horizontales con el total de horas por empresa. Considera los filtros de año, mes y categoría activos.', formula: 'Σ HORAS_COMPLETADAS por EMPRESA' },
  'matriz-emp-rol':{ title: 'Matriz empresa × rol', body: 'Cruce entre empresa y rol técnico. Cada celda muestra las horas sumadas para esa combinación. El color indica intensidad relativa.', formula: 'Σ HORAS por (EMPRESA, ROL)' },
  'detalle-emp':  { title: 'Detalle por empresa', body: 'Tabla con horas, costo y colaboradores únicos por empresa. El costo visible solo para perfiles con acceso a costos.', formula: 'Σ HORAS · Σ COSTO · COUNT(personas)' },
  'equipo':       { title: 'Equipo completo', body: 'Lista de todos los colaboradores con horas registradas. Se puede buscar por nombre, empresa o rol. Ordenable por columna.', formula: 'Σ HORAS y COSTO por NOMBRE_PERSONA' },
  'cat-donut':    { title: 'Horas por categoría', body: 'Distribución de horas según la categoría de negocio asignada en ADO. Las categorías vacías o con "SIN" se agrupan como "Sin Clasificar".', formula: 'Σ HORAS_COMPLETADAS por CATEGORÍA_NEGOCIO' },
  'cat-detalle':  { title: 'Detalle por categoría', body: 'Barras proporcionales de horas por categoría de negocio. El ancho representa el % sobre el total de horas del período.', formula: 'HORAS_CAT / HORAS_TOTALES × 100' },
  'ini-tabla':    { title: 'Por iniciativa', body: 'Tabla con el total de horas, porcentaje del total y personas únicas por iniciativa. Haz clic en una iniciativa para ver el desglose por Epic → HU → Task.', formula: 'Σ HORAS por ID_INICIATIVA' },
  'avance-ini':   { title: '% Avance por iniciativa', body: 'Porcentaje de tasks cerradas sobre el total de tasks planificadas. El total incluye tasks en todos los estados (Closed, Active, New). El color indica el nivel de avance.', formula: 'Tasks Closed / Tasks totales × 100' },
  'delivery':     { title: 'Delivery plan', body: 'Diagrama de Gantt con la duración real de cada iniciativa. El inicio es la fecha de inicio más temprana de sus tasks, el fin es la más tardía. La línea roja marca hoy.', formula: 'Inicio = MIN(FECHA_INICIO tasks) · Fin = MAX(FECHA_FIN tasks)' },
  // ── Lead Time KPIs ──
  'lt-total':     { title: 'Iniciativas con datos', body: 'Número de iniciativas que tienen al menos una task con fecha de inicio y fecha de fin registradas. Sin ambas fechas no se puede calcular el lead time.', formula: 'COUNT(iniciativas) WHERE fecha_ini ≠ NULL AND fecha_fin ≠ NULL' },
  'lt-prom':      { title: 'Lead Time Promedio', body: 'Promedio aritmético de los lead times de todas las iniciativas visibles con el filtro activo. Sensible a valores extremos; compara con la mediana para detectar outliers.', formula: 'Σ Lead Time / N iniciativas' },
  'lt-med':       { title: 'Lead Time Mediana', body: 'Valor central al ordenar los lead times de menor a mayor. Más representativo que el promedio cuando hay iniciativas muy largas o muy cortas que distorsionan la media.', formula: 'Valor central de [Lead Times ordenados asc]' },
  'lt-min':       { title: 'Lead Time Mínimo', body: 'La iniciativa más corta del subconjunto filtrado. Sirve como referencia del mejor caso real observado en el proyecto.', formula: 'MIN(Lead Time) sobre el filtro activo' },
  'lt-max':       { title: 'Lead Time Máximo', body: 'La iniciativa más larga del subconjunto filtrado. Valores muy altos pueden indicar iniciativas bloqueadas o con scope excesivo.', formula: 'MAX(Lead Time) sobre el filtro activo' },
  // ── Bugs KPIs ──
  'bug-total':    { title: 'Total bugs registrados', body: 'Conteo de todos los ítems con Work Item Type = Bug en el CSV cargado, sin importar su estado o ambiente. Es el universo completo de bugs del proyecto.', formula: 'COUNT(*) WHERE Work Item Type = "Bug"' },
  'bug-prod':     { title: 'Bugs en producción', body: 'Bugs cuyo ambiente es PRODUCCION, EXTERNO_PRODUCCION o GSF. Representan defectos con impacto directo en usuarios finales o sistemas productivos.', formula: 'COUNT WHERE ambiente IN (PRODUCCION, EXTERNO_PRODUCCION, GSF)' },
  'bug-mttr':     { title: 'MTTR Promedio', body: 'Mean Time To Resolve: promedio de días transcurridos entre la fecha de creación y la fecha de cierre de los bugs resueltos. Solo incluye bugs con ambas fechas registradas.', formula: 'Σ (Closed Date − Created Date) / N bugs cerrados' },
  'bug-ini':      { title: 'Iniciativas afectadas', body: 'Número de iniciativas distintas que tienen al menos un bug vinculado en su jerarquía (Iniciativa → Epic → HU → Bug). Mide el alcance del impacto de la calidad.', formula: 'COUNT DISTINCT id_iniciativa FROM bugs donde id_iniciativa ≠ SIN_INI' },
  // ── Bugs · Gráficos ──
  'bug-chart-prod':   { title: 'Bugs en producción', body: 'Distribución de bugs por ambiente. Los ambientes PRODUCCION, EXTERNO_PRODUCCION y GSF representan incidencias con impacto en usuarios reales. CALIDAD corresponde a bugs detectados antes del pase.', formula: 'COUNT(*) GROUP BY ambiente WHERE ambiente ≠ ""' },
  'bug-chart-ini':    { title: 'Densidad bugs / Iniciativa', body: 'Número absoluto de bugs por iniciativa. La densidad (bugs/tasks) en el tooltip indica qué tan propensa a defectos es cada iniciativa en relación a su tamaño. Valores altos sugieren riesgo de calidad.', formula: 'Densidad = total_bugs / total_tasks · Top 10 por volumen' },
  'bug-chart-sprint': { title: 'Densidad bugs / Sprint', body: 'Bugs por sprint agrupados en abiertos (New/Active) y cerrados (Closed). Permite identificar en qué sprints se introdujeron o resolvieron más defectos y evaluar la tendencia del equipo.', formula: 'COUNT(*) GROUP BY sprint · Apilado: cerrados + abiertos' },
  'bug-chart-mttr':   { title: 'MTTR bugs (detalle)', body: 'Tabla de bugs resueltos ordenados por tiempo de resolución descendente. El MTTR (Mean Time To Resolve) refleja la velocidad de respuesta ante defectos. Bugs con > 14 días indican riesgo operativo.', formula: 'Días = Closed Date − Created Date · Solo bugs con ambas fechas' },
  'bug-criticos':     { title: 'Bugs críticos abiertos', body: 'Bugs con Severity = 1 - Critical que aún no han sido cerrados. Son el riesgo más alto para el proyecto y requieren atención inmediata. El color cambia a rojo cuando hay al menos uno activo.', formula: 'COUNT WHERE severity="1 - Critical" AND estado ≠ "Closed"' },
  'bug-chart-sev':    { title: 'Severidad de bugs', body: 'Distribución de bugs por nivel de severidad (Critical, High, Medium, Low). Las barras muestran abiertos vs cerrados por nivel. El tooltip incluye el MTTR promedio de resolución para cada nivel.', formula: 'COUNT GROUP BY severity · MTTR promedio = AVG(Closed Date − Created Date)' },
  'bug-chart-cat':    { title: 'Bugs por categoría', body: 'Tabla que cruza Categoria_Bug con nivel de severidad. Muestra total de bugs por categoría, porcentaje resuelto y desglose por severidad. Cada celda indica abiertos (a) y cerrados (c).', formula: 'COUNT GROUP BY (categoria_bug, severity, estado)' },
  // ── Rendimiento · KPIs ──
  'rend-precision':   { title: 'Precisión global de estimación', body: 'Qué tan cerca estuvo el equipo de estimar correctamente. 100% = estimación perfecta. Por debajo de 80% indica subestimación sistemática; por encima de 120% indica sobreestimación.', formula: 'Σ horas reales / Σ horas estimadas × 100 (sobre todas las tasks del filtro)' },
  'rend-desvio':      { title: 'Desvío de esfuerzo', body: 'Diferencia porcentual entre horas reales y estimadas. Positivo (+) = el equipo tardó más de lo estimado (sobrecoste). Negativo (−) = terminó antes de lo planificado.', formula: '(Σ real − Σ estimado) / Σ estimado × 100' },
  'rend-velocidad':   { title: 'Velocidad promedio', body: 'Promedio de horas completadas por sprint en el período filtrado. Métrica clave para planificar capacidad futura. Compara con sprints individuales para detectar caídas de ritmo.', formula: 'Σ horas_completadas / N sprints (del filtro activo)' },
  'rend-burnup':      { title: 'Total estimado (Plan)', body: 'Suma de horas estimadas de todas las tasks bajo el filtro activo. Representa el alcance total planificado y sirve como meta horizontal en el gráfico burn-up.', formula: 'Σ Original Estimate de tasks en el filtro' },
  // ── Rendimiento · Gráficos ──
  'rend-chart-prec':  { title: 'Precisión por área', body: 'Barras horizontales con el % de precisión por célula. La línea punteada azul marca el 100% (estimación perfecta). Verde = rango aceptable (80–120%), naranja = riesgo moderado, rojo = desviación crítica.', formula: 'Σ horas_completadas / Σ horas_estimadas × 100 · por area_path' },
  'rend-chart-desv':  { title: 'Desvío de esfuerzo por área', body: 'Muestra el porcentaje de sobre (+) o sub (−) estimación por célula. Barras rojas = el área tardó más de lo estimado. Barras verdes = terminó con menos esfuerzo del planificado.', formula: '(real − estimado) / estimado × 100 · por area_path' },
  'rend-chart-vel':   { title: 'Velocidad por sprint', body: 'Barras de horas completadas por sprint (eje izquierdo) con línea de tasks cerradas superpuesta (eje derecho). La línea dorada horizontal muestra la velocidad promedio del período.', formula: 'Σ horas_completadas GROUP BY sprint · Tasks = COUNT WHERE estado=Closed' },
  'rend-chart-burnup':{ title: 'Burn-up acumulado', body: 'La línea verde muestra el progreso real acumulado sprint a sprint. La línea azul punteada es la meta total (Σ estimado). Cuando ambas se tocan el alcance está completo.', formula: 'Real acumulado = Σ progresivo de horas_completadas · Meta = Σ horas_estimadas total' },
  'rend-personas':    { title: 'Personas activas', body: 'Número de colaboradores únicos con al menos una task registrada bajo el filtro activo. Se actualiza en tiempo real al cambiar equipo, área, año, mes o sprint.', formula: 'COUNT DISTINCT correo FROM datos_horas WHERE [filtros activos]' },
  // ── Resumen ejecutivo · paneles nuevos ──
  'resumen-estado-tasks': { title: 'Estado de tasks por iniciativa', body: 'Barras apiladas que muestran la proporción de tasks Cerradas, Activas, Nuevas y en otros estados por iniciativa. Permite detectar qué iniciativas están avanzadas y cuáles acumulan trabajo pendiente.', formula: 'Cerradas + Activas + Nuevas + Otros = Total tasks · Fuente: tasks_plan' },
  'resumen-cat':          { title: 'Distribución por categoría de negocio', body: 'Horas completadas agrupadas por categoría de negocio asignada en ADO. Muestra en qué línea estratégica se concentra el esfuerzo del equipo en el período seleccionado.', formula: 'Σ horas_completadas GROUP BY categoria_negocio · Fuente: datos_horas' },
  'resumen-riesgo':       { title: 'Iniciativas en riesgo', body: 'Iniciativas cuya fecha de fin planificada ya venció y cuyo avance aún no llegó al 100%. Los días vencidos se calculan desde fecha_fin hasta hoy. Requieren replanificación inmediata.', formula: 'fecha_fin < HOY AND cerradas / total_tasks < 1 · Fuente: tasks_plan' },
  'resumen-bugs':         { title: 'Bugs abiertos por iniciativa', body: 'Top 5 iniciativas con mayor cantidad de bugs en estado abierto (New o Active). El panel inferior muestra el total de críticos, abiertos y cerrados del portfolio completo.', formula: 'COUNT(*) WHERE estado ≠ Closed GROUP BY id_iniciativa · Fuente: bugs_csv' },
  'resumen-velocidad':    { title: 'Velocidad del equipo', body: 'Horas completadas por sprint en los últimos 6 sprints. La línea dorada muestra el promedio del período. Permite detectar si el equipo está acelerando o desacelerando su ritmo de entrega.', formula: 'Σ horas_completadas GROUP BY sprint · Promedio = Σ horas / N sprints' },
};

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
let TOKEN = localStorage.getItem('dc_token');
let USER = JSON.parse(localStorage.getItem('dc_user') || 'null');
let currentEmail = '';
let resetEmail = '';
let otpTimer = null;
let _inviteToken = null;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MESES = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'};
const BADGE_EMPRESA = {Opinno:'badge-opinno',Sofka:'badge-sofka',Byteq:'badge-byteq',Digital:'badge-digital'};

// ─── CHART INSTANCES ──────────────────────────────────────────────────────────
let chartMes = null, chartEmpDonut = null, chartEmpBar = null, chartCat = null;
let chartResumenCat = null, chartResumenVel = null;

// ─── PERSONAS ─────────────────────────────────────────────────────────────────
let allPersonas = [];

// ─── SORT STATE ───────────────────────────────────────────────────────────────
let _sortIni      = { col: null,        dir: 1  };
let _sortPersonas = { col: 'horas',     dir: -1 };
let _sortLT       = { col: 'lead_time', dir: -1 };

// ─── PAGINATION ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;
let _pageIni = 0, _baseIniciativas = [];
let _pagePer = 0, _basePersonas    = [];

// ─── DEBOUNCE TIMERS ──────────────────────────────────────────────────────────
let _timerIni, _timerPersonas, _timerEquipo, _timerLT;

// ─── INICIATIVAS STATE ────────────────────────────────────────────────────────
let drillState = {level:'iniciativas', iniciativa:null, epic:null};
let allIniciativas = [];

// ─── INDICADORES STATE ────────────────────────────────────────────────────────
let _ltData = null;
let chartLTDist = null, chartLTBar = null;
let _indActiveTab = 'lt';
let chartBugProd = null, chartBugIni = null, chartBugSprint = null, chartBugSev = null;
let _bugsData = null;

let _rendData      = null;
let chartRendPrec  = null, chartRendDesv = null;
let chartRendVel   = null, chartRendBurnup = null;

// ─── EQUIPO STATE ─────────────────────────────────────────────────────────────
let _celulasData = null;
let allEquipoRows = [];
