// ─── CLIENT LOG ───────────────────────────────────────────────────────────────
// Captura eventos del browser (errores, navegación, acciones clave) y los envía
// al backend en lotes. No depende de TOKEN al cargar — lo lee en el momento
// del envío para funcionar tanto antes como después del login.

(function () {
  'use strict';

  // ID único de esta sesión de pestaña (8 hex chars, ej. "f3a1b2c9")
  var _arr = new Uint8Array(4);
  (window.crypto || window.msCrypto).getRandomValues(_arr);
  var _sid = Array.from(_arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');

  // Throttle por tipo de evento — evita spam en errores en cascada (ms)
  var _throttle = { JS_ERROR: 3000, UNHANDLED_PROMISE: 3000, API_ERROR: 1500 };
  var _lastSent  = {};

  // Cola y timer de flush
  var _queue = [];
  var _timer = null;

  function _flush() {
    _timer = null;
    if (!_queue.length) return;
    var batch = _queue.splice(0, 15);
    var token = (typeof TOKEN !== 'undefined') ? TOKEN : null;
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    fetch('/api/logs/client', {
      method:    'POST',
      keepalive: true,          // funciona en beforeunload
      headers:   headers,
      body:      JSON.stringify({ sid: _sid, eventos: batch })
    }).catch(function () {}); // silencioso — nunca debe interferir con la app
  }

  function _enqueue(tipo, datos) {
    var now  = Date.now();
    var wait = _throttle[tipo];
    if (wait && _lastSent[tipo] && (now - _lastSent[tipo]) < wait) return;
    _lastSent[tipo] = now;
    _queue.push({ tipo: tipo, datos: datos || {}, ts: new Date().toISOString() });
    if (!_timer) _timer = setTimeout(_flush, 400);
  }

  // ─── API PÚBLICA ─────────────────────────────────────────────────────────────
  window.clientLog = function (tipo, datos) { _enqueue(tipo, datos); };
  window._clientSid = _sid; // expuesto para debug / correlación

  // ─── AUTO: errores JS no capturados ──────────────────────────────────────────
  window.addEventListener('error', function (e) {
    if (!e.message) return; // errores de recursos (img/font/css no encontrados)
    _enqueue('JS_ERROR', {
      msg:   e.message,
      src:   (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno,
      stack: e.error && e.error.stack
        ? e.error.stack.split('\n').slice(0, 4).join(' ← ')
        : undefined
    });
  });

  // ─── AUTO: promesas rechazadas sin catch ──────────────────────────────────────
  window.addEventListener('unhandledrejection', function (e) {
    _enqueue('UNHANDLED_PROMISE', {
      msg: String(e.reason && e.reason.message ? e.reason.message : e.reason).slice(0, 300)
    });
  });

  // ─── AUTO: flush al cerrar / navegar fuera de la página ─────────────────────
  window.addEventListener('beforeunload', _flush);

})();
