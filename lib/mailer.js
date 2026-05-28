/**
 * Shared SMTP mailer. Used by both the contact form and the magic-link sender.
 */

const nodemailer = require('nodemailer');

let cachedTransport = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

async function sendMail(opts) {
  const transport = getTransport();
  const from = opts.from || process.env.MAIL_FROM || `Luminaton <no-reply@luminaton.com>`;
  if (!transport) {
    // Dev fallback — log instead of crashing
    console.warn('[mailer] SMTP not configured. Would have sent:');
    console.warn(JSON.stringify({ ...opts, from }, null, 2));
    return { dev: true };
  }
  return transport.sendMail({ from, ...opts });
}

module.exports = { sendMail };
