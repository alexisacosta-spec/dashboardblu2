'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const router   = express.Router();

const db                 = require('../db/connection');
const { JWT_SECRET, validatePassword, auditLog, authMiddleware } = require('../middleware/auth');
const { authLimiter, resendLimiter, forgotLimiter }              = require('../middleware/security');
const { enviarOTP, enviarResetPassword, enviarInvitacion }       = require('../lib/email');
const logger             = require('../lib/logger');

const PORT = process.env.PORT || 3000;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = db.get('SELECT * FROM usuarios WHERE email=?', [email?.toLowerCase().trim()]);
  if (user && user.activo === 0 && !user.password_hash) {
    db.run('INSERT INTO sesiones_log (email,evento,ip) VALUES (?,?,?)', [email,'LOGIN_PENDIENTE',req.ip]);
    return res.status(403).json({ error: 'Tu cuenta aún no ha sido activada. Revisa tu correo para el enlace de invitación.' });
  }
  if (!user || user.activo === 0 || !bcrypt.compareSync(password, user.password_hash)) {
    db.run('INSERT INTO sesiones_log (email,evento,ip) VALUES (?,?,?)', [email,'LOGIN_FALLIDO',req.ip]);
    logger.warn(`Login fallido: ${email} — credenciales incorrectas`);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  db.run('DELETE FROM otp_codes WHERE user_id=?', [user.id]);
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO otp_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id, codigo, expira]);
  enviarOTP(user.email, user.nombre, codigo).catch(e => logger.error(`OTP email error (${email})`, e));
  logger.info(`OTP enviado → ${user.email} (${user.perfil})`);
  db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id,user.email,'OTP_ENVIADO',req.ip]);
  res.json({ ok: true });
});

// ─── VERIFICAR OTP ────────────────────────────────────────────────────────────
router.post('/verify-otp', authLimiter, (req, res) => {
  const { email, codigo } = req.body;
  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email?.toLowerCase().trim()]);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const otp = db.get(
    'SELECT * FROM otp_codes WHERE user_id=? AND codigo=? AND usado=0 AND expira_en>? ORDER BY id DESC LIMIT 1',
    [user.id, codigo, now]
  );
  if (!otp) {
    db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id,user.email,'OTP_FALLIDO',req.ip]);
    return res.status(401).json({ error: 'Código incorrecto o expirado' });
  }
  db.run('UPDATE otp_codes SET usado=1 WHERE id=?', [otp.id]);
  db.run('UPDATE usuarios SET ultimo_acceso=? WHERE id=?', [now, user.id]);
  db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)', [user.id,user.email,'LOGIN_OK',req.ip]);
  logger.info(`Login exitoso: ${user.email} (${user.perfil})`);
  const jti   = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ id:user.id, email:user.email, nombre:user.nombre, perfil:user.perfil, jti }, JWT_SECRET, { expiresIn:'8h' });
  res.json({ ok:true, token, user:{ nombre:user.nombre, email:user.email, perfil:user.perfil } });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post('/logout', authMiddleware, (req, res) => {
  try {
    if (req.user?.jti) {
      const expira = Math.floor(Date.now()/1000) + 28800;
      db.run('INSERT OR IGNORE INTO token_blocklist (jti, expira) VALUES (?,?)', [req.user.jti, expira]);
      db.run(`DELETE FROM token_blocklist WHERE expira < ${Math.floor(Date.now()/1000)}`);
    }
    auditLog(req.user?.email, 'LOGOUT', null, req.ip);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true }); // Logout siempre exitoso aunque falle el registro
  }
});

// ─── REENVIAR OTP ─────────────────────────────────────────────────────────────
router.post('/resend-otp', resendLimiter, (req, res) => {
  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [req.body.email?.toLowerCase().trim()]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.run('DELETE FROM otp_codes WHERE user_id=?', [user.id]);
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
  db.run('INSERT INTO otp_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id, codigo, expira]);
  enviarOTP(user.email, user.nombre, codigo).catch(e => logger.error(`Resend OTP error (${user.email})`, e));
  res.json({ ok: true });
});

// ─── RECUPERACIÓN DE CONTRASEÑA — Paso 1: solicitar código ───────────────────
router.post('/forgot-password', forgotLimiter, (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'El correo es requerido' });
  try {
    const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email]);
    if (user) {
      db.run('UPDATE password_reset_codes SET usado=1 WHERE user_id=?', [user.id]);
      const codigo = Math.floor(100000 + Math.random() * 900000).toString();
      const expira = new Date(Date.now() + 5*60*1000).toISOString().replace('T',' ').split('.')[0];
      db.run('INSERT INTO password_reset_codes (user_id,codigo,expira_en) VALUES (?,?,?)', [user.id, codigo, expira]);
      enviarResetPassword(user.email, user.nombre, codigo).catch(e => logger.error(`Reset email error (${email})`, e));
      logger.info(`Reset password solicitado: ${email}`);
      auditLog(email, 'PASSWORD_RESET_SOLICITADO', null, req.ip);
    }
  } catch(e) { logger.error('forgot-password error', e); }
  res.json({ ok: true }); // Siempre responde igual — no revelar si el email existe
});

// ─── RECUPERACIÓN DE CONTRASEÑA — Paso 2: validar y cambiar ─────────────────
router.post('/reset-password', forgotLimiter, (req, res) => {
  const { email, codigo, nueva_password, confirmar_password } = req.body;
  if (!email || !codigo || !nueva_password || !confirmar_password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (nueva_password !== confirmar_password)
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  const pwError = validatePassword(nueva_password);
  if (pwError) return res.status(400).json({ error: pwError });

  const user = db.get('SELECT * FROM usuarios WHERE email=? AND activo=1', [email.toLowerCase().trim()]);
  if (!user) return res.status(400).json({ error: 'Código incorrecto o expirado' });

  const now   = new Date().toISOString().replace('T',' ').split('.')[0];
  const reset = db.get(
    'SELECT * FROM password_reset_codes WHERE user_id=? AND codigo=? AND usado=0 AND expira_en>? ORDER BY id DESC LIMIT 1',
    [user.id, codigo, now]
  );
  if (!reset) {
    auditLog(email, 'PASSWORD_RESET_FALLIDO', { razon: 'codigo_invalido' }, req.ip);
    return res.status(400).json({ error: 'Código incorrecto o expirado' });
  }
  db.run('UPDATE usuarios SET password_hash=? WHERE id=?', [bcrypt.hashSync(nueva_password, 10), user.id]);
  db.run('UPDATE password_reset_codes SET usado=1 WHERE id=?', [reset.id]);
  logger.info(`Contraseña reseteada: ${email}`);
  auditLog(email, 'PASSWORD_RESET_OK', null, req.ip);
  res.json({ ok: true });
});

// ─── INVITACIÓN — Verificar token ────────────────────────────────────────────
router.get('/invitacion/:token', (req, res) => {
  const { token } = req.params;
  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const inv = db.get('SELECT * FROM invitaciones WHERE token=? AND usado=0 AND expira_en>?', [token, now]);
  if (!inv) return res.status(400).json({ error: 'El enlace de invitación es inválido o ya expiró.' });
  const user = db.get('SELECT id,nombre,email,perfil FROM usuarios WHERE id=?', [inv.user_id]);
  if (!user) return res.status(400).json({ error: 'Usuario no encontrado.' });
  res.json({ ok: true, nombre: user.nombre, email: user.email, perfil: user.perfil });
});

// ─── INVITACIÓN — Activar cuenta ─────────────────────────────────────────────
router.post('/invitacion/activar', authLimiter, (req, res) => {
  const { token, password, confirmar_password } = req.body;
  if (!token || !password || !confirmar_password)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password !== confirmar_password)
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const now = new Date().toISOString().replace('T',' ').split('.')[0];
  const inv = db.get('SELECT * FROM invitaciones WHERE token=? AND usado=0 AND expira_en>?', [token, now]);
  if (!inv) return res.status(400).json({ error: 'El enlace de invitación es inválido o ya expiró.' });

  const ahora = new Date().toISOString().replace('T',' ').split('.')[0];
  db.run('UPDATE usuarios SET password_hash=?, activo=1, ultimo_acceso=? WHERE id=?',
    [bcrypt.hashSync(password, 10), ahora, inv.user_id]);
  db.run('UPDATE invitaciones SET usado=1 WHERE id=?', [inv.id]);

  const user = db.get('SELECT id,nombre,email,perfil FROM usuarios WHERE id=?', [inv.user_id]);
  db.run('INSERT INTO sesiones_log (user_id,email,evento,ip) VALUES (?,?,?,?)',
    [user.id, user.email, 'CUENTA_ACTIVADA', req.ip]);
  logger.info(`Cuenta activada: ${user.email} (${user.perfil})`);
  auditLog(user.email, 'CUENTA_ACTIVADA', null, req.ip);

  const jti      = crypto.randomBytes(16).toString('hex');
  const jwtToken = jwt.sign({ id:user.id, email:user.email, nombre:user.nombre, perfil:user.perfil, jti }, JWT_SECRET, { expiresIn:'8h' });
  res.json({ ok: true, token: jwtToken, user: { nombre:user.nombre, email:user.email, perfil:user.perfil } });
});

module.exports = router;
