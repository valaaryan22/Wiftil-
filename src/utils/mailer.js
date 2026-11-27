'use strict';

const nodemailer = require('nodemailer');
const logger = require('./logger');

let cachedTransporter = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    require('dotenv').config();
  }

  const user = process.env.GMAIL_USER;
  const rawPass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !rawPass) {
    throw new Error('Gmail credentials (GMAIL_USER and GMAIL_APP_PASSWORD) are not configured');
  }

  // Gmail app passwords are 16 chars and may include spaces for readability
  const pass = rawPass.replace(/\s+/g, '');

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return cachedTransporter;
}

/**
 * Send an email via configured Gmail transporter
 */
async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || `Wiftil <${process.env.GMAIL_USER}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  logger.info('Email sent successfully', { to, subject, messageId: info.messageId });
  return info;
}

/**
 * Send password reset email with secure one-time link
 */
async function sendPasswordResetEmail({ to, firstName, resetUrl, expiresMinutes = 15 }) {
  const safeName = escapeHtml(firstName || 'there');
  const safeUrl = escapeHtml(resetUrl);

  const subject = 'Reset Your Wiftil Password';
  const text = [
    `Hi ${firstName || 'there'},`,
    '',
    'We received a request to reset your Wiftil account password.',
    `Use the link below to set a new password (valid for ${expiresMinutes} minutes):`,
    resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb; padding: 32px 16px; color: #1f2937;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; padding: 32px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px;">Reset Your Password</h2>
        <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.6;">Hi ${safeName},</p>
        <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
          We received a request to reset your Wiftil account password. Click the button below to choose a new password.
          This link will expire in <strong>${expiresMinutes} minutes</strong>.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${safeUrl}"
             style="display: inline-block; background-color: #f26522; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 6px;">
            Reset Password
          </a>
        </div>
        <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; line-height: 1.5;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; word-break: break-all;">
          <a href="${safeUrl}" style="color: #f26522;">${safeUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
          If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}

module.exports = { sendEmail, sendPasswordResetEmail };
