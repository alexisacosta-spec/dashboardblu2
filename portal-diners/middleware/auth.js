'use strict';
const jwt    = require('jsonwebtoken');
const db     = require('../db/connection');
const logger = require('../lib/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ─── SEC-03: Validar fortaleza de contraseña ──────────────────────────────────
function validatePassword(password) {
  if (!password || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password))          return 'Debe contener al menos una letra mayúscula';
  if (!/[a-z]/.test(password))          return 'Debe contener al menos una letra minúscula';
  if (!/[0-9]/.test(password))          return 'Debe contener al menos un número';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return 'Debe contener al menos un símbolo especial (!@#$%^&*...)';
  return null; // null = válida
}

// ─── SEC-12: Registro de auditoría para acciones sensibles ───────────────────
function auditLog(email, evento, detalle, ip) {
  try {
    db.run(
      `INSERT INTO sesiones_log (email, evento, ip, detalle) VALUES (?,?,?,?)`,
      [email || '', evento, ip || '', detalle ? JSON.stringify(detalle) : null]
    );
  } catch(e) { logger.error('auditLog error', e); }
}

// ─── SEC-06: authMiddleware verifica token Y blocklist ───────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.jti) {
      const bloqueado = db.get('SELECT jti FROM token_blocklist WHERE jti=?', [decoded.jti]);
      if (bloqueado) return res.status(401).json({ error: 'Sesión cerrada. Por favor inicia sesión de nuevo.' });
    }
    req.user = decoded;
    next();
  } catch {
    logger.warn(`Token inválido o expirado — ${req.method} ${req.originalUrl}`);
    res.status(401).json({ error: 'Sesión expirada' });
  }
}

// ─── adminOnly: solo perfil admin ────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (req.user.perfil !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// ─── vc: perfiles con acceso a costos ────────────────────────────────────────
const vc = u => ['admin', 'gerente'].includes(u.perfil);

module.exports = { JWT_SECRET, validatePassword, auditLog, authMiddleware, adminOnly, vc };
