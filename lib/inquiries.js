/**
 * Customer inquiry store.
 * Inquiries are persisted as a single JSON file (data/inquiries.json) keyed by id.
 * Attachments live alongside, under data/inquiry-attachments/<inquiry-id>/.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'inquiry-attachments');

const STATUSES = ['new', 'in_review', 'quoted', 'closed'];
const STATUS_LABELS = {
  new: 'New',
  in_review: 'In Review',
  quoted: 'Quoted',
  closed: 'Closed',
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

function readAll() {
  ensureDirs();
  if (!fs.existsSync(INQUIRIES_FILE)) return {};
  try {
    const raw = fs.readFileSync(INQUIRIES_FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('[inquiries] read error:', err.message);
    return {};
  }
}

function writeAll(map) {
  ensureDirs();
  const tmp = INQUIRIES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2));
  fs.renameSync(tmp, INQUIRIES_FILE);
}

function newId() {
  const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  return `inq_${ts}_${rand}`;
}

function attachmentDir(id) {
  return path.join(ATTACHMENTS_DIR, id);
}

function ensureAttachmentDir(id) {
  const dir = attachmentDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function create({ email, projectName, description, contactName, contactPhone, contactEmail, attachments }) {
  const id = newId();
  const record = {
    id,
    email,
    projectName,
    description,
    contactName,
    contactPhone,
    contactEmail,
    attachments: (attachments || []).map(a => ({
      originalName: a.originalName,
      storedName: a.storedName,
      mimetype: a.mimetype,
      size: a.size,
    })),
    status: 'new',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const all = readAll();
  all[id] = record;
  writeAll(all);
  return record;
}

function get(id) {
  const all = readAll();
  return all[id] || null;
}

function listForEmail(email) {
  const all = readAll();
  return Object.values(all)
    .filter(i => i.email === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function listAll() {
  const all = readAll();
  return Object.values(all).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function updateStatus(id, status) {
  if (!STATUSES.includes(status)) return null;
  const all = readAll();
  if (!all[id]) return null;
  all[id].status = status;
  all[id].updatedAt = new Date().toISOString();
  writeAll(all);
  return all[id];
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  ATTACHMENTS_DIR,
  attachmentDir,
  ensureAttachmentDir,
  create,
  get,
  listForEmail,
  listAll,
  updateStatus,
};
