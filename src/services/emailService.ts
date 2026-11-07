import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(to: string, resetToken: string) {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  await transporter.sendMail({
    from: env.SMTP_USER,
    to,
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

  await transporter.sendMail({
    from: env.SMTP_USER,
    to,
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
