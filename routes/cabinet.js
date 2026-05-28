/**
 * Customer Cabinet routes.
 *
 * Flow:
 *   1. Customer enters company email on /cabinet/                       (login.html)
 *   2. POST /api/cabinet/request-link  → validates domain + emails link
 *   3. Customer clicks link            → GET /cabinet/verify?token=...
 *   4. Server consumes token, sets session cookie, redirects to /cabinet/dashboard
 *   5. Dashboard reads /datasheets/ folder and lists PDFs (protected)
 *   6. PDFs served via /cabinet/files/:category/:file (protected)
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');

const auth = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { logEvent } = require('../lib/leads');

const router = express.Router();

const DATASHEETS_DIR = path.join(__dirname, '..', 'datasheets');
const PAGES_DIR = path.join(__dirname, '..', 'public', 'cabinet');

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

// ---------- Pages ----------

router.get('/', (req, res) => {
  // If already signed in, jump straight to the dashboard
  const session = auth.getSessionFromReq(req);
  if (session) return res.redirect('/cabinet/dashboard');
  res.sendFile(path.join(PAGES_DIR, 'login.html'));
});

router.get('/check-email', (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'check-email.html'));
});

router.get('/verify', (req, res) => {
  const token = String(req.query.token || '');
  const record = auth.redeemMagicToken(token);
  if (!record) {
    return res.redirect('/cabinet/?error=invalid_or_expired');
  }
  auth.createSession(res, record.email);
  logEvent({ type: 'signin', email: record.email, req });
  res.redirect('/cabinet/dashboard');
});

router.get('/dashboard', auth.requireAuthPage('/cabinet/'), (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'dashboard.html'));
});

// ---------- API ----------

router.post('/api/request-link', requestLimiter, async (req, res) => {
  try {
    const email = auth.normalizeEmail(req.body && req.body.email);

    if (!email) {
      return res.status(400).json({ ok: false, error: 'Please enter your email address.' });
    }
    if (!auth.isCompanyEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Access is limited to company email addresses. Personal email providers (Gmail, Yahoo, Outlook, etc.) are not allowed — please use your work email.',
      });
    }

    const { token, expiresAt } = auth.createMagicToken(email);

    const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const link = `${baseUrl}/cabinet/verify?token=${token}`;
    const minutes = Math.round((expiresAt - Date.now()) / 60000);

    const subject = 'Your Luminaton sign-in link';
    const text =
`Hello,

Click the link below to sign in to the Luminaton customer cabinet and access product datasheets:

${link}

This link is valid for ${minutes} minutes and can only be used once.
If you didn't request this, you can safely ignore this email.

— Luminaton`;

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#1a2233;line-height:1.6;padding:20px;">
        <h2 style="margin:0 0 12px;">Sign in to Luminaton</h2>
        <p>Click the button below to access the customer cabinet and download datasheets:</p>
        <p style="margin:28px 0;">
          <a href="${link}" style="display:inline-block;padding:14px 26px;border-radius:999px;background:linear-gradient(135deg,#FFB400,#ffa726);color:#1a2233;font-weight:600;text-decoration:none;">Open the customer cabinet</a>
        </p>
        <p style="font-size:13px;color:#5a6478;">Or paste this URL into your browser:<br/>
          <span style="word-break:break-all;">${link}</span>
        </p>
        <p style="font-size:13px;color:#5a6478;">This link is valid for ${minutes} minutes and can only be used once. If you didn't request it, you can safely ignore this email.</p>
      </div>
    `;

    await sendMail({ to: email, subject, text, html });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[cabinet] request-link error:', err);
    return res.status(500).json({ ok: false, error: 'Could not send sign-in email. Please try again later.' });
  }
});

router.post('/api/logout', (req, res) => {
  auth.endSession(req, res);
  res.json({ ok: true });
});

router.get('/api/session', (req, res) => {
  const session = auth.getSessionFromReq(req);
  if (!session) return res.status(401).json({ ok: false });
  res.json({ ok: true, email: session.email });
});

// ---------- Datasheets discovery ----------

function readDirSafe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
}

function loadCategoryMeta(dir) {
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) return {};
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
  catch { return {}; }
}

function titleize(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

router.get('/api/datasheets', auth.requireAuthApi(), (_req, res) => {
  if (!fs.existsSync(DATASHEETS_DIR)) {
    return res.json({ ok: true, categories: [] });
  }
  const categories = [];
  for (const entry of readDirSafe(DATASHEETS_DIR)) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    if (slug.startsWith('.') || slug === 'node_modules') continue;

    const catDir = path.join(DATASHEETS_DIR, slug);
    const meta = loadCategoryMeta(catDir);
    const files = readDirSafe(catDir)
      .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.pdf'))
      .map(f => ({
        file: f.name,
        title: (meta.files && meta.files[f.name] && meta.files[f.name].title) || f.name.replace(/\.pdf$/i, ''),
        description: (meta.files && meta.files[f.name] && meta.files[f.name].description) || '',
        url: `/cabinet/files/${encodeURIComponent(slug)}/${encodeURIComponent(f.name)}`,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    if (files.length === 0) continue;

    categories.push({
      slug,
      title: meta.title || titleize(slug),
      description: meta.description || '',
      order: typeof meta.order === 'number' ? meta.order : 999,
      files,
    });
  }
  categories.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  res.json({ ok: true, categories });
});

// Protected PDF delivery
router.get('/files/:category/:file', auth.requireAuthPage('/cabinet/'), (req, res) => {
  const { category, file } = req.params;
  // Guard against path traversal — only allow simple slugs/filenames
  if (!/^[a-zA-Z0-9._-]+$/.test(category) || !/^[a-zA-Z0-9 ._()+-]+\.pdf$/i.test(file)) {
    return res.status(400).send('Bad request');
  }
  const fullPath = path.join(DATASHEETS_DIR, category, file);
  if (!fullPath.startsWith(DATASHEETS_DIR + path.sep)) {
    return res.status(400).send('Bad request');
  }
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('File not found');
  }
  logEvent({
    type: 'download',
    email: req.session && req.session.email,
    category,
    file,
    req,
  });
  res.sendFile(fullPath);
});

module.exports = router;
