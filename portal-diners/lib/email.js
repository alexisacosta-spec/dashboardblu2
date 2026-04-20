'use strict';
const nodemailer = require('nodemailer');
const logger     = require('./logger');

const DEV_MODE = process.env.DEV_MODE === 'true';

const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST || 'smtp.office365.com',
  port:   parseInt(process.env.MAIL_PORT || '587'),
  secure: false,
  auth:   { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});

async function enviarOTP(email, nombre, codigo) {
  if (DEV_MODE) { logger.debug(`[DEV] OTP para ${email}: ${codigo}`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Código de verificación — Portal Canales',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Tu código de verificación es:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#2B5FE8;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#fff">⏱ Expira en 5 minutos</span></div></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

async function enviarResetPassword(email, nombre, codigo) {
  if (DEV_MODE) { logger.debug(`[DEV] Reset password para ${email}: ${codigo}`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Restablecimiento de contraseña — Portal Canales',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales · Recuperación de contraseña</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 8px;font-size:14px;color:#5A6E8A">Recibimos una solicitud para restablecer tu contraseña.</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Usa este código para continuar:</p><div style="text-align:center;margin:0 0 28px"><div style="display:inline-block;background:#F2F5FA;border:2px solid #D0DCF0;border-radius:12px;padding:24px 32px;font-size:48px;font-weight:800;letter-spacing:14px;color:#0D1B2E">${codigo}</div></div><div style="background:#C9A84C;border-radius:8px;padding:12px 20px;text-align:center"><span style="font-size:13px;font-weight:700;color:#0D1B2E">⏱ Expira en 5 minutos</span></div><p style="margin:24px 0 0;font-size:12px;color:#8A9BB0">Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no será modificada.</p></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

async function enviarInvitacion(email, nombre, token, portalUrl) {
  const link = `${portalUrl}?invite=${token}`;
  if (DEV_MODE) { logger.debug(`[DEV] Invitación para ${email}: ${link}`); return; }
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to: email,
    subject: 'Bienvenido al Portal Canales — Activa tu cuenta',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center"><table width="520" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:28px 32px"><div style="font-size:20px;font-weight:800;color:#fff">Diners Club del Ecuador</div><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Portal Canales · Invitación de acceso</div></td></tr><tr><td style="background:#fff;padding:36px 32px"><p style="margin:0 0 8px;font-size:16px;color:#0D1B2E">Hola <strong>${nombre}</strong>,</p><p style="margin:0 0 8px;font-size:14px;color:#5A6E8A">Has sido invitado a acceder al <strong>Portal Canales</strong> de Diners Club del Ecuador.</p><p style="margin:0 0 28px;font-size:14px;color:#5A6E8A">Haz clic en el botón para crear tu contraseña y activar tu cuenta:</p><div style="text-align:center;margin:0 0 28px"><a href="${link}" style="display:inline-block;background:#2B5FE8;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:8px">Activar mi cuenta →</a></div><div style="background:#F2F5FA;border:1px solid #D0DCF0;border-radius:8px;padding:12px 16px;font-size:11px;color:#8A9BB0;word-break:break-all"><strong>O copia este enlace en tu navegador:</strong><br>${link}</div><div style="background:#C9A84C;border-radius:8px;padding:10px 16px;text-align:center;margin-top:20px"><span style="font-size:12px;font-weight:700;color:#0D1B2E">⏱ Este enlace expira en 48 horas</span></div><p style="margin:20px 0 0;font-size:12px;color:#8A9BB0">Si no esperabas esta invitación, puedes ignorar este mensaje.</p></td></tr><tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center"><p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático</p></td></tr></table></td></tr></table></body></html>`
  });
}

// ─── ALERTAS IAE ──────────────────────────────────────────────────────────────
function _tagTask(id) {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin:2px 2px 2px 0;background:#F1F5F9;color:#334155;border:1px solid #CBD5E1">#${id}</span>`;
}

function _seccionAlertas(alertas, tipo) {
  if (!alertas.length) return '';
  const CFG = {
    TASKS_ABIERTAS_CRITICO: { icon: '🔴', titulo: 'Tasks abiertas en iniciativas críticas (IAE &lt; 70%)', bg: '#FFF5F5', border: '#FECACA', borderLeft: '#DC2626', badgeBg: '#FEE2E2', badgeColor: '#991B1B' },
    HORAS_PLACEHOLDER:      { icon: '🟠', titulo: 'Horas con estimación placeholder (&ge; 100h por task)',  bg: '#FFFBEB', border: '#FDE68A', borderLeft: '#D97706', badgeBg: '#FEF3C7', badgeColor: '#92400E' },
    ZERO_ESTIMATE:          { icon: 'ℹ️', titulo: 'Tasks sin estimación con horas ejecutadas',              bg: '#F0F9FF', border: '#BAE6FD', borderLeft: '#0284C7', badgeBg: '#DBEAFE', badgeColor: '#1E40AF' },
  };
  const c = CFG[tipo];
  if (!c) return '';

  let rows = '';
  for (const a of alertas) {
    const iaeStr = a.iae != null ? `IAE ${a.iae.toFixed(1)}%` : '';
    const taskIds = (a.tasks || []).map(t => _tagTask(t.id_task)).join('');
    let extra = '';
    if (tipo === 'HORAS_PLACEHOLDER') {
      extra = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:11px;color:#6B7280">
        <tr style="background:#F8FAFC"><th align="left" style="padding:4px 8px;font-weight:600;border-bottom:1px solid #E2E8F0">#ID</th><th align="left" style="padding:4px 8px;font-weight:600;border-bottom:1px solid #E2E8F0">Task</th><th align="right" style="padding:4px 8px;font-weight:600;border-bottom:1px solid #E2E8F0">H.Est.</th></tr>
        ${(a.tasks || []).slice(0, 10).map(t =>
          `<tr><td style="padding:3px 8px">#${t.id_task}</td><td style="padding:3px 8px;color:#374151">${(t.nombre_task || '—').slice(0,50)}</td><td align="right" style="padding:3px 8px;color:#B45309;font-weight:600">${(+t.horas_estimadas || 0).toFixed(0)}h</td></tr>`
        ).join('')}
        ${(a.tasks || []).length > 10 ? `<tr><td colspan="3" style="padding:4px 8px;color:#94A3B8">… y ${a.tasks.length - 10} más</td></tr>` : ''}
      </table>`;
    } else if (tipo === 'ZERO_ESTIMATE') {
      extra = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:11px;color:#6B7280">
        <tr style="background:#F8FAFC"><th align="left" style="padding:4px 8px;font-weight:600;border-bottom:1px solid #E2E8F0">#ID</th><th align="left" style="padding:4px 8px;font-weight:600;border-bottom:1px solid #E2E8F0">Task</th><th align="right" style="padding:4px 8px;font-weight:600;border-bottom:1px solid #E2E8F0">H.Ejec.</th></tr>
        ${(a.tasks || []).slice(0, 10).map(t =>
          `<tr><td style="padding:3px 8px">#${t.id_task}</td><td style="padding:3px 8px;color:#374151">${(t.nombre_task || '—').slice(0,50)}</td><td align="right" style="padding:3px 8px;font-weight:600">${(+t.horas_completadas || 0).toFixed(1)}h</td></tr>`
        ).join('')}
        ${(a.tasks || []).length > 10 ? `<tr><td colspan="3" style="padding:4px 8px;color:#94A3B8">… y ${a.tasks.length - 10} más</td></tr>` : ''}
      </table>`;
    } else {
      extra = `<div style="margin-top:6px;font-size:11px;color:#6B7280">${(a.tasks || []).length} task${(a.tasks||[]).length!==1?'s':''} sin cerrar en ADO:</div>
               <div style="margin-top:4px">${taskIds}</div>`;
    }

    rows += `<div style="border:1px solid ${c.border};border-left:3px solid ${c.borderLeft};border-radius:0 6px 6px 0;background:${c.bg};padding:12px 14px;margin-bottom:8px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:13px;font-weight:700;color:#1E293B">${a.nombre_ini}</td>
        ${iaeStr ? `<td align="right" style="white-space:nowrap"><span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:${c.badgeBg};color:${c.badgeColor}">${iaeStr}</span></td>` : ''}
      </tr></table>
      ${extra}
    </div>`;
  }

  return `<div style="margin-bottom:22px">
    <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E2E8F0">${c.icon} ${c.titulo}</div>
    ${rows}
  </div>`;
}

async function enviarAlertasIAE(destinatarios, todasDetalle, archivo, nuevas = 0) {
  const total = todasDetalle.length;
  const fecha = new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });

  const criticas     = todasDetalle.filter(a => a.tipo === 'TASKS_ABIERTAS_CRITICO');
  const advertencias = todasDetalle.filter(a => a.tipo === 'HORAS_PLACEHOLDER');
  const info         = todasDetalle.filter(a => a.tipo === 'ZERO_ESTIMATE');

  const cuerpo = _seccionAlertas(criticas, 'TASKS_ABIERTAS_CRITICO')
               + _seccionAlertas(advertencias, 'HORAS_PLACEHOLDER')
               + _seccionAlertas(info, 'ZERO_ESTIMATE');

  // Badge secundario: cuántas son realmente nuevas
  const badgeNuevas = nuevas > 0
    ? `<span style="display:inline-block;margin-left:10px;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;background:#DC2626;color:#fff">${nuevas} nueva${nuevas!==1?'s':''}</span>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F5FA;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:32px 0"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="background:#0D1B2E;border-radius:12px 12px 0 0;padding:26px 32px">
  <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.3px">Diners Club del Ecuador</div>
  <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:3px;letter-spacing:0.08em;text-transform:uppercase">Portal IAE · Informe de alertas</div>
</td></tr>
<tr><td style="background:#fff;padding:30px 32px 24px">

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px">
  <tr><td style="background:#FEF9EC;border:1px solid #FDE68A;border-left:4px solid #D97706;border-radius:0 8px 8px 0;padding:14px 18px">
    <div style="font-size:17px;font-weight:800;color:#92400E">⚠ ${total} alerta${total!==1?'s':''} IAE activa${total!==1?'s':''}${badgeNuevas}</div>
    <div style="font-size:12px;color:#78350F;margin-top:6px">Detectada${total!==1?'s':''} tras la carga de <strong>${archivo}</strong> &nbsp;·&nbsp; ${fecha}</div>
  </td></tr></table>

  ${cuerpo}

  <table width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="background:#EFF6FF;border-radius:8px;padding:14px 18px;font-size:12px;color:#1E40AF">
    Revisa el detalle completo en el <strong>Portal IAE</strong>. Las alertas se resolverán automáticamente cuando se cargue un CSV con los datos corregidos.
  </td></tr></table>

</td></tr>
<tr><td style="background:#0D1B2E;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center">
  <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">Diners Club del Ecuador · Mensaje automático · Portal IAE</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const toList = destinatarios.map(d => d.email).join(', ');
  const cc     = process.env.MAIL_ALERTAS_CC || undefined;
  const subject = `⚠ ${total} alerta${total!==1?'s':''} IAE — ${archivo} (${fecha})`;

  if (DEV_MODE) {
    logger.debug(`[DEV] Email alertas IAE → ${toList}${cc ? ' CC: ' + cc : ''} — ${total} activas (${nuevas} nuevas): ${todasDetalle.map(a=>a.nombre_ini).join(', ')}`);
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to: toList, cc, subject, html });
}

module.exports = { enviarOTP, enviarResetPassword, enviarInvitacion, enviarAlertasIAE };
