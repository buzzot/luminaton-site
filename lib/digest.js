/**
 * Daily lead-activity digest email.
 *
 * Reads data/leads.csv, picks events from the last 24 hours (or yesterday by date,
 * depending on schedule), and mails a summary to MAIL_TO.
 *
 * Skips sending entirely if there were zero events — no "nothing happened" spam.
 */

const { readEvents } = require('./leads');
const { sendMail } = require('./mailer');

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleString('en-GB', { hour12: false }); }
  catch { return iso; }
}

/**
 * Build the digest for events in the given window.
 * @param {Date} start  inclusive
 * @param {Date} end    exclusive
 */
function buildDigest(start, end) {
  const all = readEvents();
  const events = all.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= start.getTime() && t < end.getTime();
  });

  if (events.length === 0) return null;

  const signins = events.filter(e => e.type === 'signin');
  const downloads = events.filter(e => e.type === 'download');

  // Unique emails active in window
  const uniqueEmails = Array.from(new Set(events.map(e => e.email).filter(Boolean))).sort();

  // Per-email download summary
  const byEmail = new Map();
  for (const e of downloads) {
    if (!e.email) continue;
    if (!byEmail.has(e.email)) byEmail.set(e.email, []);
    byEmail.get(e.email).push(e);
  }

  // Top files
  const fileCounts = new Map();
  for (const e of downloads) {
    const key = `${e.category}/${e.file}`;
    fileCounts.set(key, (fileCounts.get(key) || 0) + 1);
  }
  const topFiles = Array.from(fileCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const dateLabel = start.toISOString().slice(0, 10);

  // ---- Plain-text body ----
  const lines = [];
  lines.push(`Luminaton — daily lead digest for ${dateLabel}`);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Total events:    ${events.length}`);
  lines.push(`Sign-ins:        ${signins.length}`);
  lines.push(`Downloads:       ${downloads.length}`);
  lines.push(`Unique visitors: ${uniqueEmails.length}`);
  lines.push('');

  if (uniqueEmails.length) {
    lines.push('Active customers:');
    for (const email of uniqueEmails) {
      const dl = byEmail.get(email) || [];
      const last = dl.length ? `  (${dl.length} download${dl.length === 1 ? '' : 's'})` : '';
      lines.push(`  • ${email}${last}`);
    }
    lines.push('');
  }

  if (downloads.length) {
    lines.push('Top files:');
    for (const [key, n] of topFiles) {
      lines.push(`  ${n.toString().padStart(3, ' ')}×  ${key}`);
    }
    lines.push('');

    lines.push('Detailed downloads:');
    for (const e of downloads) {
      lines.push(`  ${fmtTime(e.timestamp)}  ${e.email}  →  ${e.category}/${e.file}`);
    }
  }

  const text = lines.join('\n');

  // ---- HTML body ----
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#1a2233;line-height:1.55;max-width:640px;">
      <h2 style="margin:0 0 8px;">Luminaton lead digest</h2>
      <p style="color:#5a6478;margin:0 0 20px;">Activity for <strong>${escapeHtml(dateLabel)}</strong></p>

      <table cellpadding="8" style="border-collapse:collapse;background:#f6f8fb;border-radius:10px;width:100%;margin-bottom:20px;">
        <tr>
          <td style="font-size:13px;color:#5a6478;">Sign-ins</td>
          <td style="font-size:13px;color:#5a6478;">Downloads</td>
          <td style="font-size:13px;color:#5a6478;">Unique customers</td>
        </tr>
        <tr>
          <td style="font-size:22px;font-weight:700;">${signins.length}</td>
          <td style="font-size:22px;font-weight:700;">${downloads.length}</td>
          <td style="font-size:22px;font-weight:700;">${uniqueEmails.length}</td>
        </tr>
      </table>

      ${uniqueEmails.length ? `
        <h3 style="margin:24px 0 8px;">Active customers</h3>
        <ul style="padding-left:18px;margin:0 0 16px;">
          ${uniqueEmails.map(email => {
            const dl = byEmail.get(email) || [];
            const note = dl.length ? ` <span style="color:#5a6478;font-size:13px;">— ${dl.length} download${dl.length === 1 ? '' : 's'}</span>` : '';
            return `<li>${escapeHtml(email)}${note}</li>`;
          }).join('')}
        </ul>
      ` : ''}

      ${topFiles.length ? `
        <h3 style="margin:24px 0 8px;">Top files</h3>
        <table cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px;">
          ${topFiles.map(([key, n]) => `
            <tr style="border-bottom:1px solid #e6ebf2;">
              <td style="width:50px;font-weight:700;color:#FFB400;">${n}×</td>
              <td>${escapeHtml(key)}</td>
            </tr>
          `).join('')}
        </table>
      ` : ''}

      ${downloads.length ? `
        <h3 style="margin:24px 0 8px;">All downloads</h3>
        <table cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f6f8fb;text-align:left;">
              <th>Time</th><th>Customer</th><th>File</th>
            </tr>
          </thead>
          <tbody>
            ${downloads.map(e => `
              <tr style="border-bottom:1px solid #e6ebf2;">
                <td style="color:#5a6478;white-space:nowrap;">${escapeHtml(fmtTime(e.timestamp))}</td>
                <td>${escapeHtml(e.email)}</td>
                <td>${escapeHtml(e.category)}/${escapeHtml(e.file)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      <p style="font-size:12px;color:#8993a6;margin-top:24px;">
        The complete log lives at <code>data/leads.csv</code> on the server.
        Open it in Excel or import into your CRM at any time.
      </p>
    </div>
  `;

  return {
    subject: `Luminaton leads — ${signins.length} sign-in${signins.length === 1 ? '' : 's'}, ${downloads.length} download${downloads.length === 1 ? '' : 's'} (${dateLabel})`,
    text,
    html,
  };
}

async function sendDailyDigest({ now = new Date() } = {}) {
  // Cover the previous calendar day in the configured timezone (server TZ)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 1);

  const digest = buildDigest(start, end);
  if (!digest) {
    console.log('[digest] no events to report — skipping email');
    return { sent: false, reason: 'no_events' };
  }

  const to = process.env.MAIL_TO || 'sales@luminaton.com';
  await sendMail({ to, ...digest });
  console.log('[digest] sent', digest.subject);
  return { sent: true };
}

module.exports = { sendDailyDigest, buildDigest };
