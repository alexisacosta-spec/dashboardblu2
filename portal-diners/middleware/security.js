'use strict';
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const multer    = require('multer');
const os        = require('os');

// ─── SEC-08: Headers de seguridad HTTP (Helmet) ───────────────────────────────
// CSP deshabilitada: el portal usa scripts inline (onclick) — complejidad innecesaria
// para un portal interno. Los demás headers de Helmet sí se aplican.
const helmetConfig = helmet({
  contentSecurityPolicy:     false,
  crossOriginEmbedderPolicy: false
});

// ─── SEC-04: Rate limiting para endpoints de autenticación ───────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Por favor espera 15 minutos antes de intentarlo de nuevo.' }
});
const resendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3,
  message: { error: 'Demasiadas solicitudes de reenvío. Espera un minuto.' }
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: { error: 'Demasiadas solicitudes de recuperación. Espera una hora.' }
});

// ─── SEC-09: Multer con validación de tipo MIME y límite de tamaño ───────────
const ALLOWED_MIME_CSV  = ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'];
const ALLOWED_MIME_XLSX = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream'
];

const uploadCSV = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_CSV.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV'));
    }
  }
});

const uploadXLSX = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_XLSX.includes(file.mimetype) ||
        file.originalname.toLowerCase().endsWith('.xlsx') ||
        file.originalname.toLowerCase().endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx / .xls)'));
    }
  }
});

module.exports = { helmetConfig, authLimiter, resendLimiter, forgotLimiter, uploadCSV, uploadXLSX };
