/**
 * Lead activity log — appended as CSV to data/leads.csv.
 *
 * Columns: timestamp_iso, type, email, category, file, ip, user_agent
 *
 *   - type:     "signin"  | "download"
 *   - category: only set for downloads (e.g. "led-modules")
 *   - file:     only set for downloads (PDF filename)
 *
 * Open the file in Excel / Numbers / Google Sheets to view leads at any time.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.csv');
const HEADER = 'timestamp,type,email,category,file,ip,user_agent\n';

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, HEADER);
}

// RFC 4180-ish CSV field escaping
function csv(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function logEvent({ type, email = '', category = '', file = '', req }) {
  try {
    ensureFile();
    const ip = (req && (req.ip || req.headers['x-forwarded-for'] || '')) || '';
    const ua = (req && req.headers && req.headers['user-agent']) || '';
    const row = [
      new Date().toISOString(),
      type,
      email,
      category,
      file,
      ip,
      ua,
    ].map(csv).join(',') + '\n';
    fs.appendFileSync(LEADS_FILE, row);
  } catch (err) {
    console.warn('[leads] log error:', err.message);
  }
}

// Naive but adequate CSV parser for our own well-formed lines.
function parseLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') { inQuotes = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

function readEvents() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  const text = fs.readFileSync(LEADS_FILE, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const [headerLine, ...rest] = lines;
  const headers = headerLine.split(',');
  return rest.map(line => {
    const fields = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fields[i] || ''; });
    return obj;
  });
}

module.exports = { logEvent, readEvents, LEADS_FILE };
