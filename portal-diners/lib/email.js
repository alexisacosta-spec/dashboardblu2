'use strict';
const nodemailer = require('nodemailer');

const DEV_MODE = process.env.DEV_MODE === 'true';

const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST || 'smtp.office365.com',
  port:   parseInt(process.env.MAIL_PORT || '587'),
  secure: false,
  auth:   { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});

async function enviarOTP(email, nombre, codigo) {
  if (DEV_MODE) { console.log(`\n📧 OTP para ${email}: ${codigo}\n`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Código de verificación — Portal Canales',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Tu código de verificación es:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#2B5FE8;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#fff">⏱ Expira en 5 minutos</span></div></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

async function enviarResetPassword(email, nombre, codigo) {
  if (DEV_MODE) { console.log(`\n🔑 RESET PASSWORD para ${email}: ${codigo}\n`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Restablecimiento de contraseña — Portal Canales',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales · Recuperación de contraseña</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 8px;font-size:14px;color:#5A6E8A">Recibimos una solicitud para restablecer tu contraseña.</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Usa este código para continuar:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#C9A84C;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#0D1B2E">⏱ Expira en 5 minutos</span></div><p style="margin:24px 0 0;font-size:12px;color:#8A9BB0">Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no será modificada.</p></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

async function enviarInvitacion(email, nombre, token, portalUrl) {
  const link = `${portalUrl}?invite=${token}`;
  if (DEV_MODE) { console.log(`\n✉️  INVITACIÓN para ${email}: ${link}\n`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Bienvenido al Portal Canales — Activa tu cuenta',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales · Invitación de acceso</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 8px;font-size:14px;color:#5A6E8A">Has sido invitado a acceder al <strong>Portal Canales</strong> de Diners Club del Ecuador.</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Haz clic en el botón para crear tu contraseña y activar tu cuenta:</p><div style="text-align:center;margin:0 0 28px"><a href="${link}" style="display:inline-block;background:#2B5FE8;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:8px">Activar mi cuenta →</a></div><div style="background:#F2F5FA;border:1px solid #D0DCF0;border-radius:8px;padding:12px 16px;font-size:11px;color:#8A9BB0;word-break:break-all"><strong>O copia este enlace en tu navegador:</strong><br>${link}</div><div style="background:#C9A84C;border-radius:8px;padding:10px 16px;text-align:center;margin-top:20px"><span style="font-size:12px;font-weight:700;color:#0D1B2E">⏱ Este enlace expira en 48 horas</span></div><p style="margin:20px 0 0;font-size:12px;color:#8A9BB0">Si no esperabas esta invitación, puedes ignorar este mensaje.</p></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

module.exports = { enviarOTP, enviarResetPassword, enviarInvitacion };
