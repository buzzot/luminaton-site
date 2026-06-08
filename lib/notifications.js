/**
 * Instant per-event email notifications.
 *
 * Fired from /cabinet/verify and /cabinet/files/:category/:file in fire-and-forget
 * style — never await these in the request handler, the customer's response must
 * not block on SMTP.
 *
 * Gated by the INSTANT_NOTIFICATIONS env var:
 *   INSTANT_NOTIFICATIONS=true     → enabled (default)
 *   INSTANT_NOTIFICATIONS=false    → disabled
 */

const { sendMail } = require('./mailer');

function notificationsEnabled() {
  const v = String(process.env.INSTANT_NOTIFICATIONS || 'true').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function domainOf(email) {
  const at = String(email || '').indexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
}

function eventContext(req) {
  const ip = (req && (req.ip || req.headers['x-forwarded-for'])) || 'unknown';
  const ua = (req && req.headers && req.headers['user-agent']) || 'unknown';
  return { ip, ua, time: new Date().toUTCString() };
}

function shellHtml(title, rows) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#1a2233;line-height:1.55;max-width:560px;">
      <h2 style="margin:0 0 14px;">${escapeHtml(title)}</h2>
      <table cellpadding="8" style="border-collapse:collapse;background:#f6f8fb;border-radius:10px;width:100%;font-size:14px;">
        ${rows.map(([k, v]) => `
          <tr>
            <td style="color:#5a6478;width:120px;vertical-align:top;"><strong>${escapeHtml(k)}</strong></td>
            <td style="word-break:break-all;">${escapeHtml(v)}</td>
          </tr>
        `).join('')}
      </table>
      <p style="color:#8993a6;font-size:12px;margin-top:18px;">
        Luminaton customer cabinet — automated notification. To disable, set
        <code>INSTANT_NOTIFICATIONS=false</code> in your environment variables.
      </p>
    </div>
  `;
}

async function sendInstantSignIn({ email, req }) {
  if (!notificationsEnabled()) return;
  const { ip, ua, time } = eventContext(req);
  const to = process.env.MAIL_TO || 'sales@luminaton.com';
  const subject = `New cabinet sign-in: ${email}`;

  const text = [
    `A customer just signed in to the Luminaton customer cabinet.`,
    ``,
    `Email:    ${email}`,
    `Domain:   ${domainOf(email)}`,
    `Time:     ${time}`,
    `IP:       ${ip}`,
    `Browser:  ${ua}`,
    ``,
    `— Luminaton automated notification`,
  ].join('\n');

  const html = shellHtml('New cabinet sign-in', [
    ['Email', email],
    ['Domain', domainOf(email)],
    ['Time', time],
    ['IP', ip],
    ['Browser', ua],
  ]);

  await sendMail({ to, subject, text, html, replyTo: email });
}

async function sendInstantDownload({ email, category, file, req }) {
  if (!notificationsEnabled()) return;
  const { ip, ua, time } = eventContext(req);
  const to = process.env.MAIL_TO || 'sales@luminaton.com';
  const subject = `Datasheet downloaded: ${file} — by ${email}`;

  const text = [
    `A customer just downloaded a datasheet.`,
    ``,
    `Customer: ${email}`,
    `Domain:   ${domainOf(email)}`,
    `File:     ${category}/${file}`,
    `Time:     ${time}`,
    `IP:       ${ip}`,
    `Browser:  ${ua}`,
    ``,
    `— Luminaton automated notification`,
  ].join('\n');

  const html = shellHtml('Datasheet downloaded', [
    ['Customer', email],
    ['Domain', domainOf(email)],
    ['File', `${category}/${file}`],
    ['Time', time],
    ['IP', ip],
    ['Browser', ua],
  ]);

  await sendMail({ to, subject, text, html, replyTo: email });
}

module.exports = {
  sendInstantSignIn,
  sendInstantDownload,
  notificationsEnabled,
};
