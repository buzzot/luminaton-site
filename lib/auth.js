/**
 * Auth helpers: company-email check, token generation, session middleware.
 */

const crypto = require('crypto');
const store = require('./store');

const SESSION_COOKIE = 'lumi_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min

// Common personal / free-mail providers. Reject these — we want company emails only.
// Not exhaustive; covers ~99% of consumer mailboxes worldwide.
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
  'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'live.com', 'live.co.uk', 'live.fr', 'live.de',
  'msn.com', 'passport.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at',
  'mail.com', 'email.com',
  'mail.ru', 'list.ru', 'bk.ru', 'inbox.ru', 'internet.ru',
  'yandex.com', 'yandex.ru', 'ya.ru',
  'qq.com', '163.com', '126.com', 'sina.com', 'sina.cn', 'sohu.com', 'foxmail.com', 'aliyun.com',
  'tutanota.com', 'tutanota.de', 'tuta.io',
  'fastmail.com', 'fastmail.fm',
  'hushmail.com',
  'rediffmail.com', 'rocketmail.com',
  'web.de', 't-online.de', 'freenet.de', 'arcor.de',
  'free.fr', 'orange.fr', 'wanadoo.fr', 'laposte.net', 'sfr.fr',
  'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it',
  'wp.pl', 'onet.pl', 'interia.pl', 'o2.pl', 'gazeta.pl',
  'seznam.cz', 'centrum.cz', 'volny.cz',
  'abv.bg', 'mail.bg',
  'naver.com', 'daum.net', 'hanmail.net',
  'bigpond.com', 'optusnet.com.au',
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isCompanyEmail(email) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const domain = e.split('@')[1];
  if (!domain) return false;
  return !PERSONAL_DOMAINS.has(domain);
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex'); // 48 chars
}

function generateSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function createMagicToken(email) {
  const token = generateToken();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  store.saveToken({ token, email: normalizeEmail(email), expiresAt });
  return { token, expiresAt };
}

function redeemMagicToken(token) {
  return store.consumeToken(token);
}

function createSession(res, email) {
  const id = generateSessionId();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  store.saveSession({ id, email: normalizeEmail(email), expiresAt });
  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return id;
}

function endSession(req, res) {
  const id = req.cookies && req.cookies[SESSION_COOKIE];
  if (id) store.deleteSession(id);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function getSessionFromReq(req) {
  const id = req.cookies && req.cookies[SESSION_COOKIE];
  if (!id) return null;
  return store.getSession(id);
}

// Express middleware — require a valid session for HTML page access
function requireAuthPage(redirectTo = '/cabinet/') {
  return (req, res, next) => {
    const session = getSessionFromReq(req);
    if (!session) return res.redirect(redirectTo);
    req.session = session;
    next();
  };
}

// Express middleware — require a valid session for API/JSON access
function requireAuthApi() {
  return (req, res, next) => {
    const session = getSessionFromReq(req);
    if (!session) return res.status(401).json({ ok: false, error: 'Not signed in' });
    req.session = session;
    next();
  };
}

module.exports = {
  SESSION_COOKIE,
  isCompanyEmail,
  normalizeEmail,
  createMagicToken,
  redeemMagicToken,
  createSession,
  endSession,
  getSessionFromReq,
  requireAuthPage,
  requireAuthApi,
  TOKEN_TTL_MS,
  SESSION_TTL_MS,
};
