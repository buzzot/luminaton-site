/**
 * Luminaton — Node.js / Express backend
 *
 * Serves the static landing page and exposes POST /api/contact,
 * which validates the submission and emails it via SMTP (Nodemailer).
 *
 * Designed to run on Hostinger Business / Cloud hosting with Node.js enabled,
 * or any Node host (Render, Railway, VPS). See README.md for deployment notes.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy when running behind Hostinger's reverse proxy / any PaaS
app.set('trust proxy', 1);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// Serve static files (index.html, styles.css, script.js)
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  maxAge: '1h',
}));

// Rate-limit the contact endpoint to deter abuse
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

// Build SMTP transporter (verified lazily)
function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const {
      name = '',
      email = '',
      company = '',
      product = '',
      message = '',
      website = '', // honeypot
    } = req.body || {};

    // Honeypot: if filled, silently accept and discard
    if (website && website.trim() !== '') {
      return res.json({ ok: true });
    }

    const cleanName = String(name).trim().slice(0, 120);
    const cleanEmail = String(email).trim().slice(0, 200);
    const cleanCompany = String(company).trim().slice(0, 160);
    const cleanProduct = String(product).trim().slice(0, 80);
    const cleanMessage = String(message).trim().slice(0, 4000);

    if (!cleanName || !cleanEmail || !cleanMessage) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    }

    const to = process.env.MAIL_TO || 'sales@luminaton.com';
    const from = process.env.MAIL_FROM || `Luminaton Website <no-reply@luminaton.com>`;

    const subject = `New quote request — ${cleanName}${cleanCompany ? ' (' + cleanCompany + ')' : ''}`;
    const textBody = [
      `New website inquiry`,
      `------------------------------`,
      `Name:     ${cleanName}`,
      `Email:    ${cleanEmail}`,
      `Company:  ${cleanCompany || '-'}`,
      `Interest: ${cleanProduct || '-'}`,
      ``,
      `Message:`,
      cleanMessage,
      ``,
      `------------------------------`,
      `Submitted: ${new Date().toISOString()}`,
      `IP:        ${req.ip}`,
    ].join('\n');

    const htmlBody = `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1a2233;">
        <h2 style="margin:0 0 12px;">New quote request</h2>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td><strong>Name</strong></td><td>${escapeHtml(cleanName)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escapeHtml(cleanEmail)}</td></tr>
          <tr><td><strong>Company</strong></td><td>${escapeHtml(cleanCompany) || '-'}</td></tr>
          <tr><td><strong>Interest</strong></td><td>${escapeHtml(cleanProduct) || '-'}</td></tr>
        </table>
        <h3 style="margin-top:18px;">Message</h3>
        <p style="white-space:pre-wrap;">${escapeHtml(cleanMessage)}</p>
        <hr/>
        <p style="font-size:12px;color:#888;">Submitted ${new Date().toUTCString()} · IP ${escapeHtml(req.ip)}</p>
      </div>
    `;

    // If SMTP isn't configured, fall back to console logging so the site doesn't crash in dev
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.warn('[contact] SMTP not configured — logging submission instead:');
      console.warn(textBody);
      return res.json({ ok: true, dev: true });
    }

    const transporter = buildTransport();
    await transporter.sendMail({
      from,
      to,
      replyTo: cleanEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[contact] error:', err);
    return res.status(500).json({ ok: false, error: 'Could not send your message. Please try again later.' });
  }
});

// Health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// SPA-ish fallback: always serve index.html for unknown GETs
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Luminaton server running on port ${PORT}`);
});
