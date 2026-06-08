/**
 * Luminaton — Node.js / Express backend
 *
 * Serves:
 *   - The static landing page (index.html, styles.css, script.js at project root)
 *   - The /cabinet customer area (magic-link auth, datasheets library)
 *   - POST /api/contact (quote requests from the main site)
 *
 * Runs on Hostinger Business/Cloud/VPS with Node.js enabled. See README.md.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const cron = require('node-cron');

const { sendMail } = require('./lib/mailer');
const { sendDailyDigest, sendWeeklyCsv } = require('./lib/digest');
const cabinetRouter = require('./routes/cabinet');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Core middleware ----
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(cookieParser());

// ---- Security: block direct fetches of source / config files ----
const BLOCKED_EXACT = new Set([
  '/server.js', '/package.json', '/package-lock.json',
  '/.env', '/.env.example', '/.gitignore', '/README.md',
]);
const BLOCKED_PREFIXES = ['/lib/', '/routes/', '/data/', '/node_modules/', '/.git/'];

app.use((req, res, next) => {
  if (BLOCKED_EXACT.has(req.path)) return res.status(404).send('Not found');
  if (BLOCKED_PREFIXES.some(p => req.path.startsWith(p))) return res.status(404).send('Not found');
  next();
});

// ---- Cabinet static assets (CSS, JS) — explicit, no .html exposed ----
app.get('/cabinet/cabinet.css', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'cabinet', 'cabinet.css')));
app.get('/cabinet/cabinet.js', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'cabinet', 'cabinet.js')));

// ---- Cabinet router (login / verify / dashboard / API / PDF download) ----
app.use('/cabinet', cabinetRouter);

// ---- Contact form (main site) ----
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name = '', email = '', company = '', product = '', message = '', website = '' } = req.body || {};
    if (website && website.trim() !== '') return res.json({ ok: true }); // honeypot

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
    const subject = `New quote request — ${cleanName}${cleanCompany ? ' (' + cleanCompany + ')' : ''}`;
    const text = [
      `New website inquiry`, `------------------------------`,
      `Name:     ${cleanName}`, `Email:    ${cleanEmail}`,
      `Company:  ${cleanCompany || '-'}`, `Interest: ${cleanProduct || '-'}`,
      ``, `Message:`, cleanMessage, ``,
      `Submitted: ${new Date().toISOString()}`, `IP:        ${req.ip}`,
    ].join('\n');
    const html = `
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
      </div>`;

    await sendMail({ to, subject, text, html, replyTo: cleanEmail });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[contact] error:', err);
    return res.status(500).json({ ok: false, error: 'Could not send your message. Please try again later.' });
  }
});

// ---- Health check ----
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ---- Main site static files (root level: index.html, styles.css, script.js) ----
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  maxAge: '1h',
  dotfiles: 'deny',
}));

// ---- Fallback: serve homepage for unknown GETs ----
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---- Daily lead digest ----
// Default: 08:00 every day in the configured timezone.
const digestTz = process.env.DIGEST_TIMEZONE || 'UTC';
const digestCron = process.env.DIGEST_CRON || '0 8 * * *';
if (cron.validate(digestCron)) {
  cron.schedule(digestCron, () => {
    sendDailyDigest().catch(err => console.error('[digest] error:', err));
  }, { timezone: digestTz });
  console.log(`Daily digest scheduled: "${digestCron}" (${digestTz})`);
} else {
  console.warn(`[digest] invalid cron expression: "${digestCron}" — digest disabled`);
}

// ---- Weekly leads.csv export ----
// Default: Monday 08:00 in the configured timezone.
const weeklyCron = process.env.WEEKLY_CSV_CRON || '0 8 * * 1';
if (cron.validate(weeklyCron)) {
  cron.schedule(weeklyCron, () => {
    sendWeeklyCsv().catch(err => console.error('[weekly-csv] error:', err));
  }, { timezone: digestTz });
  console.log(`Weekly leads.csv export scheduled: "${weeklyCron}" (${digestTz})`);
} else {
  console.warn(`[weekly-csv] invalid cron expression: "${weeklyCron}" — weekly export disabled`);
}

app.listen(PORT, () => {
  console.log(`Luminaton server running on port ${PORT}`);
});
