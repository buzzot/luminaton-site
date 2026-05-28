/**
 * Tiny JSON-backed store for magic-link tokens and active sessions.
 * Zero native dependencies — perfect for low-volume B2B traffic on shared hosting.
 *
 * Files written under ./data/ (gitignored):
 *   data/tokens.json    — pending one-time login tokens
 *   data/sessions.json  — active customer sessions
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('[store] read error', file, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic on POSIX
}

// ---------- Tokens ----------
function saveToken({ token, email, expiresAt }) {
  const tokens = readJson(TOKENS_FILE, {});
  tokens[token] = { email, expiresAt, usedAt: null };
  writeJson(TOKENS_FILE, tokens);
}

function consumeToken(token) {
  const tokens = readJson(TOKENS_FILE, {});
  const record = tokens[token];
  if (!record) return null;
  if (record.usedAt) return null;
  if (Date.now() > record.expiresAt) return null;

  record.usedAt = Date.now();
  tokens[token] = record;
  writeJson(TOKENS_FILE, tokens);
  pruneTokens();
  return record;
}

function pruneTokens() {
  const tokens = readJson(TOKENS_FILE, {});
  const now = Date.now();
  let dirty = false;
  for (const [k, v] of Object.entries(tokens)) {
    if (v.expiresAt < now || (v.usedAt && v.usedAt < now - 24 * 60 * 60 * 1000)) {
      delete tokens[k];
      dirty = true;
    }
  }
  if (dirty) writeJson(TOKENS_FILE, tokens);
}

// ---------- Sessions ----------
function saveSession({ id, email, expiresAt }) {
  const sessions = readJson(SESSIONS_FILE, {});
  sessions[id] = { email, expiresAt };
  writeJson(SESSIONS_FILE, sessions);
}

function getSession(id) {
  if (!id) return null;
  const sessions = readJson(SESSIONS_FILE, {});
  const record = sessions[id];
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    delete sessions[id];
    writeJson(SESSIONS_FILE, sessions);
    return null;
  }
  return record;
}

function deleteSession(id) {
  if (!id) return;
  const sessions = readJson(SESSIONS_FILE, {});
  if (sessions[id]) {
    delete sessions[id];
    writeJson(SESSIONS_FILE, sessions);
  }
}

module.exports = {
  saveToken,
  consumeToken,
  saveSession,
  getSession,
  deleteSession,
};
