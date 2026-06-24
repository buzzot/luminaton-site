/**
 * Customer inquiry routes.
 *
 *  /cabinet/inquiries/                      list customer's own inquiries (HTML)
 *  /cabinet/inquiries/new                   submission form (HTML)
 *  /cabinet/inquiries/:id                   detail page (HTML, customer can only see own; admin sees any)
 *  POST /cabinet/api/inquiries              submit new inquiry (multipart/form-data, up to 10 files * 10 MB)
 *  GET  /cabinet/api/inquiries              JSON list for current customer
 *  GET  /cabinet/api/inquiries/:id          JSON detail (auth + ownership / admin)
 *  GET  /cabinet/attachments/:id/:name      download an attachment (auth + ownership / admin)
 *
 *  Admin-only:
 *  /cabinet/admin                           admin panel page
 *  GET  /cabinet/api/admin/inquiries        JSON list of ALL inquiries
 *  POST /cabinet/api/admin/inquiries/:id/status   change status
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const auth = require('../lib/auth');
const inquiries = require('../lib/inquiries');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

const PAGES_DIR = path.join(__dirname, '..', 'public', 'cabinet');

const MAX_FILE_BYTES = 10 * 1024 * 1024;   // 10 MB per file
const MAX_FILES = 10;
const MAX_INQUIRY_BYTES = MAX_FILE_BYTES * MAX_FILES;
const EMAIL_ATTACH_LIMIT_BYTES = 25 * 1024 * 1024; // attach to email only if total under 25 MB

const ALLOWED_EXTS = new Set([
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.csv',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg',
  // CAD / 3D
  '.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.stl', '.skp', '.3dm', '.obj',
  // Design
  '.ai', '.psd', '.eps', '.indd',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz',
]);

const BLOCKED_EXTS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.sh', '.bash', '.ps1',
  '.scr', '.js', '.vbs', '.jar', '.app', '.deb', '.rpm', '.dll', '.so',
  '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl',
]);

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ext;
}

// Multer storage: write directly to data/inquiry-attachments/<inquiry-id>/
// The inquiry-id is generated at request time and shared via req._inquiryId.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      if (!req._inquiryId) {
        req._inquiryId = require('crypto').randomBytes(6).toString('hex');
      }
      const dir = inquiries.ensureAttachmentDir(req._inquiryDraftDir || req._inquiryId);
      req._inquiryDraftDir = req._inquiryDraftDir || req._inquiryId;
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = safeExt(file.originalname) || '';
      const safeBase = path.basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 60);
      const rand = crypto.randomBytes(4).toString('hex');
      cb(null, `${rand}_${safeBase}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const ext = safeExt(file.originalname);
    if (BLOCKED_EXTS.has(ext)) return cb(new Error(`File type not allowed: ${ext}`));
    if (ALLOWED_EXTS.size && !ALLOWED_EXTS.has(ext)) {
      return cb(new Error(`File type not allowed: ${ext || 'unknown'}`));
    }
    cb(null, true);
  },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many submissions. Please try again later.' },
});

// ---------- Customer HTML pages ----------

router.get('/inquiries/', auth.requireAuthPage('/cabinet/'), (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'inquiries.html'));
});

router.get('/inquiries/new', auth.requireAuthPage('/cabinet/'), (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'inquiry-new.html'));
});

router.get('/inquiries/:id', auth.requireAuthPage('/cabinet/'), (req, res) => {
  const inq = inquiries.get(req.params.id);
  if (!inq) return res.status(404).send('Inquiry not found');
  const email = req.session.email;
  if (inq.email !== email && !auth.isAdmin(email)) {
    return res.status(403).send('Forbidden');
  }
  res.sendFile(path.join(PAGES_DIR, 'inquiry-detail.html'));
});

router.get('/admin', auth.requireAdminPage('/cabinet/dashboard'), (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'admin.html'));
});

// ---------- Customer API ----------

router.post('/api/inquiries', auth.requireAuthApi(), submitLimiter, (req, res) => {
  // Wrap multer in a single-call try/catch so we can return JSON on upload errors
  upload.array('attachments', MAX_FILES)(req, res, async (err) => {
    try {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? `Each file must be under ${MAX_FILE_BYTES / 1024 / 1024} MB.`
          : err.message || 'Upload failed.';
        return res.status(400).json({ ok: false, error: msg });
      }

      const email = req.session.email;
      const {
        projectName = '',
        description = '',
        contactName = '',
        contactPhone = '',
        contactEmail = '',
      } = req.body || {};

      const pn = String(projectName).trim().slice(0, 200);
      const desc = String(description).trim().slice(0, 8000);
      const cn = String(contactName).trim().slice(0, 120);
      const cp = String(contactPhone).trim().slice(0, 60);
      const ce = String(contactEmail).trim().slice(0, 200);

      if (!pn || !desc || !cn || !cp || !ce) {
        return res.status(400).json({ ok: false, error: 'All fields are required.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) {
        return res.status(400).json({ ok: false, error: 'Invalid contact email.' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ ok: false, error: 'At least one attachment is required.' });
      }

      const attachments = req.files.map(f => ({
        originalName: f.originalname,
        storedName: path.basename(f.path),
        mimetype: f.mimetype,
        size: f.size,
      }));

      // Move files from draft dir to final id dir if needed
      const draftDir = req._inquiryDraftDir
        ? path.join(inquiries.ATTACHMENTS_DIR, req._inquiryDraftDir)
        : null;

      const record = inquiries.create({
        email,
        projectName: pn,
        description: desc,
        contactName: cn,
        contactPhone: cp,
        contactEmail: ce,
        attachments,
      });

      // Rename draft attachment dir to use the inquiry id, so paths line up
      if (draftDir && fs.existsSync(draftDir)) {
        const finalDir = inquiries.attachmentDir(record.id);
        if (draftDir !== finalDir) {
          if (fs.existsSync(finalDir)) {
            // Move files into existing dir (safer than overwriting)
            for (const fn of fs.readdirSync(draftDir)) {
              fs.renameSync(path.join(draftDir, fn), path.join(finalDir, fn));
            }
            fs.rmdirSync(draftDir);
          } else {
            fs.renameSync(draftDir, finalDir);
          }
        }
      }

      // Fire-and-forget email notification to admins
      sendNewInquiryEmail(record, req)
        .catch(e => console.warn('[inquiry] email failed:', e.message));

      return res.json({ ok: true, id: record.id });
    } catch (e) {
      console.error('[inquiry] submit error:', e);
      return res.status(500).json({ ok: false, error: 'Could not submit your inquiry. Please try again.' });
    }
  });
});

router.get('/api/inquiries', auth.requireAuthApi(), (req, res) => {
  const list = inquiries.listForEmail(req.session.email)
    .map(({ description, ...rest }) => rest); // strip long fields from list
  res.json({ ok: true, items: list, statusLabels: inquiries.STATUS_LABELS });
});

router.get('/api/inquiries/:id', auth.requireAuthApi(), (req, res) => {
  const inq = inquiries.get(req.params.id);
  if (!inq) return res.status(404).json({ ok: false, error: 'Not found' });
  if (inq.email !== req.session.email && !auth.isAdmin(req.session.email)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  res.json({ ok: true, inquiry: inq, statusLabels: inquiries.STATUS_LABELS });
});

// Attachment download — customer can fetch own, admin can fetch any
router.get('/attachments/:id/:name', auth.requireAuthPage('/cabinet/'), (req, res) => {
  const { id, name } = req.params;
  if (!/^inq_[0-9]+_[a-f0-9]+$/.test(id)) return res.status(400).send('Bad request');
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return res.status(400).send('Bad request');

  const inq = inquiries.get(id);
  if (!inq) return res.status(404).send('Not found');
  if (inq.email !== req.session.email && !auth.isAdmin(req.session.email)) {
    return res.status(403).send('Forbidden');
  }

  const file = inq.attachments.find(a => a.storedName === name);
  if (!file) return res.status(404).send('Attachment not found');

  const full = path.join(inquiries.attachmentDir(id), name);
  if (!fs.existsSync(full)) return res.status(404).send('File missing on disk');
  res.download(full, file.originalName);
});

// ---------- Admin API ----------

router.get('/api/admin/inquiries', auth.requireAdminApi(), (_req, res) => {
  res.json({
    ok: true,
    items: inquiries.listAll(),
    statusLabels: inquiries.STATUS_LABELS,
    statuses: inquiries.STATUSES,
  });
});

router.post('/api/admin/inquiries/:id/status', auth.requireAdminApi(), (req, res) => {
  const { status } = req.body || {};
  const updated = inquiries.updateStatus(req.params.id, String(status || ''));
  if (!updated) return res.status(400).json({ ok: false, error: 'Invalid id or status' });
  res.json({ ok: true, inquiry: updated });
});

// ---------- Email notification helper ----------

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendNewInquiryEmail(inq, req) {
  const to = process.env.MAIL_TO || 'sales@luminaton.com';
  const adminList = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  const recipients = Array.from(new Set([to, ...adminList])).filter(Boolean);

  const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const adminLink = `${baseUrl}/cabinet/admin`;

  const totalBytes = inq.attachments.reduce((sum, a) => sum + (a.size || 0), 0);
  const includeFiles = totalBytes <= EMAIL_ATTACH_LIMIT_BYTES;

  const attachments = includeFiles
    ? inq.attachments.map(a => ({
        filename: a.originalName,
        path: path.join(inquiries.attachmentDir(inq.id), a.storedName),
      }))
    : [];

  const fileListHtml = inq.attachments.map(a =>
    `<li>${escapeHtml(a.originalName)} <span style="color:#5a6478;">(${(a.size / 1024 / 1024).toFixed(2)} MB)</span></li>`
  ).join('');

  const fileListText = inq.attachments
    .map(a => `  • ${a.originalName} (${(a.size / 1024 / 1024).toFixed(2)} MB)`)
    .join('\n');

  const subject = `New inquiry: ${inq.projectName} — ${inq.email}`;

  const text = [
    `New customer inquiry`,
    `=========================`,
    ``,
    `Project:        ${inq.projectName}`,
    `Customer:       ${inq.email}`,
    `Contact name:   ${inq.contactName}`,
    `Contact phone:  ${inq.contactPhone}`,
    `Contact email:  ${inq.contactEmail}`,
    ``,
    `Description:`,
    inq.description,
    ``,
    `Attachments (${inq.attachments.length}):`,
    fileListText,
    ``,
    includeFiles
      ? `All files are attached to this email.`
      : `Files exceed the 25 MB email limit — download them from the admin panel:`,
    adminLink,
    ``,
    `— Luminaton automated notification`,
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#1a2233;line-height:1.55;max-width:640px;">
      <h2 style="margin:0 0 8px;">New customer inquiry</h2>
      <p style="color:#5a6478;margin:0 0 18px;">From <strong>${escapeHtml(inq.email)}</strong></p>

      <h3 style="margin:18px 0 6px;">${escapeHtml(inq.projectName)}</h3>
      <p style="white-space:pre-wrap;">${escapeHtml(inq.description)}</p>

      <table cellpadding="8" style="border-collapse:collapse;background:#f6f8fb;border-radius:10px;width:100%;font-size:14px;margin-top:18px;">
        <tr><td style="color:#5a6478;width:140px;"><strong>Contact name</strong></td><td>${escapeHtml(inq.contactName)}</td></tr>
        <tr><td style="color:#5a6478;"><strong>Contact phone</strong></td><td>${escapeHtml(inq.contactPhone)}</td></tr>
        <tr><td style="color:#5a6478;"><strong>Contact email</strong></td><td>${escapeHtml(inq.contactEmail)}</td></tr>
        <tr><td style="color:#5a6478;"><strong>Account email</strong></td><td>${escapeHtml(inq.email)}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px;">Attachments (${inq.attachments.length})</h3>
      <ul style="padding-left:18px;margin:0;">${fileListHtml}</ul>

      <p style="margin-top:22px;">
        ${includeFiles
          ? `All files are attached to this email.`
          : `Files exceed the 25 MB email cap — download them from the admin panel.`}
      </p>

      <p style="margin-top:18px;">
        <a href="${adminLink}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:linear-gradient(135deg,#FFB400,#ffa726);color:#1a2233;font-weight:600;text-decoration:none;">Open in admin panel</a>
      </p>
    </div>
  `;

  await sendMail({
    to: recipients.join(','),
    replyTo: inq.contactEmail || inq.email,
    subject,
    text,
    html,
    attachments,
  });
}

module.exports = router;
