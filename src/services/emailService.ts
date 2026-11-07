import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

// Local development usually has no mail server (SMTP_USER is required only in production): the
// message is logged instead, so reset and invitation links can still be followed.
async function send(message: { to: string; subject: string; html: string; link: string }) {
  const { link, ...mail } = message;
  if (env.NODE_ENV !== 'production' && !env.SMTP_USER) {
    logger.info({ to: mail.to, link }, `Email not sent (no SMTP configured): ${mail.subject}`);
    return;
  }
  await transporter.sendMail({ from: env.SMTP_USER, ...mail });
}

export async function sendPasswordResetEmail(to: string, resetToken: string) {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  await send({
    to,
    link: resetUrl,
    subject: 'Password reset - Veltris',
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a></p>
      <p>The link expires in 1 hour. If you did not request this, you can ignore this email.</p>
    `,
  });
}

export async function sendInvitationEmail(
  to: string,
  invitation: { workspaceName: string; inviterName: string; token: string }
) {
  const url = `${env.FRONTEND_URL}/invite?token=${invitation.token}`;

  await send({
    to,
    link: url,
    subject: `${invitation.inviterName} invited you to ${invitation.workspaceName} - Veltris`,
    html: `
      <p>${escapeHtml(invitation.inviterName)} invited you to the workspace
      <strong>${escapeHtml(invitation.workspaceName)}</strong> on Veltris.</p>
      <p><a href="${url}">Accept the invitation</a></p>
      <p>The link expires in 7 days.</p>
    `,
  });
}

// Workspace and person names are user input and end up in HTML.
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
