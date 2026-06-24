# Luminaton — Landing Page & Customer Cabinet

Single-page landing site for **Luminaton.com**, a distributor of customized LED modules and LED strip lights, plus a customer cabinet behind magic-link email auth where verified business customers can download product datasheets.

## What's in this folder

```
luminaton/
├── index.html              Landing page (hero, products, about, contact)
├── styles.css              Clean white theme with soft LED accents
├── script.js               Mobile nav, scroll reveal, AJAX form submission
├── server.js               Express server: contact API, cabinet mount, static
├── lib/
│   ├── auth.js             Magic-link tokens, sessions, company-domain check
│   ├── mailer.js           Shared SMTP transport (Nodemailer)
│   └── store.js            JSON-backed token & session store (data/*.json)
├── routes/
│   └── cabinet.js          Cabinet pages + API (request-link, verify, datasheets)
├── public/cabinet/
│   ├── login.html          Email entry page
│   ├── check-email.html    "We sent you a link" confirmation
│   ├── dashboard.html      Datasheet library (auth required)
│   ├── cabinet.css         Cabinet-specific styles
│   └── cabinet.js          Dashboard logic (list, search, sign out)
├── datasheets/             Drop PDFs here, organized by category subfolder
│   ├── README.md           How to add datasheets
│   ├── led-modules/        (with meta.json + PDFs)
│   ├── led-strips/
│   └── accessories/
├── data/                   Created at runtime; holds tokens.json + sessions.json
│                           (gitignored — never commit)
├── package.json
├── .env.example            Copy to .env and fill in real values
├── .gitignore
└── README.md               This file
```

## Customer cabinet — how it works

1. Visitor opens `/cabinet/` and enters their **company email**.
2. Server rejects free / personal mail providers (Gmail, Yahoo, Outlook, iCloud, Proton, Mail.ru, QQ, etc. — full list in `lib/auth.js`).
3. A one-time sign-in URL is generated (cryptographically random, 15-minute expiry, single-use) and emailed via SMTP.
4. Customer clicks the link → server validates the token → sets a 30-day HTTP-only session cookie → redirects to `/cabinet/dashboard`.
5. Dashboard reads the `/datasheets/` folder, displays PDFs by category, supports search and direct download.
6. PDFs are served through an authenticated route (`/cabinet/files/:category/:file`) — no direct hot-linking.

No password is ever stored. No customer signup form. Adding new datasheets is just "drop a PDF in the right subfolder".

## Local development

```bash
cd luminaton
cp .env.example .env       # fill in SMTP credentials (optional in dev)
npm install
npm start
```

Open <http://localhost:3000>.

If SMTP variables are not configured, submissions are logged to the console instead of mailed — handy for local testing.

## Deploying to Hostinger

Hostinger supports Node.js on Business, Cloud Startup, and higher plans, plus all VPS plans. Two deployment paths:

### Option A — Shared / Cloud hosting with Node.js (hPanel)

1. **Create the domain / point DNS.**
   In hPanel → Domains, attach `luminaton.com` and let it resolve.

2. **Open the Node.js setup tool.**
   hPanel → Advanced → **Node.js**.

3. **Create a new application:**
   - Node version: **18 LTS or higher**
   - Application mode: **Production**
   - Application root: e.g. `/home/USER/luminaton`
   - Application URL: your domain (`luminaton.com`)
   - Application startup file: `server.js`

4. **Upload the project files** into the application root (File Manager, or SFTP, or `git clone`).

5. **Set environment variables** (in the Node.js panel → "Environment variables"):
   ```
   SMTP_HOST=smtp.hostinger.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=sales@luminaton.com
   SMTP_PASS=<your mailbox password>
   MAIL_TO=sales@luminaton.com
   MAIL_FROM=Luminaton Website <sales@luminaton.com>
   ```

6. **Install dependencies.**
   In the Node.js panel, click **Run NPM Install**, or in SSH:
   ```bash
   cd ~/luminaton
   npm install --omit=dev
   ```

7. **Start the app.**
   Click **Restart** in the Node.js panel. Visit `https://luminaton.com`.

### Option B — VPS (full control)

1. SSH into the VPS, install Node 18+ and PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   ```
2. Upload the project, then:
   ```bash
   cd luminaton
   cp .env.example .env   # edit with real values
   npm install --omit=dev
   pm2 start server.js --name luminaton
   pm2 save
   pm2 startup
   ```
3. Put **Nginx** or Hostinger's built-in reverse proxy in front of port 3000, terminate TLS with Let's Encrypt (hPanel does this automatically on shared/cloud).

## Setting up the email mailbox

In hPanel → Emails → Email Accounts, create `sales@luminaton.com`. Use that mailbox's SMTP credentials in the env vars above. Hostinger's defaults:

- SMTP host: `smtp.hostinger.com`
- Port: `465` (TLS) or `587` (STARTTLS)
- Auth: full email + mailbox password

## How the contact form works

1. The visitor submits the form on `#contact`.
2. `script.js` POSTs JSON to `/api/contact`.
3. `server.js` validates fields, blocks honeypot bots, rate-limits (8/15min/IP), and emails the message via Nodemailer to `MAIL_TO`.
4. The reply-to header is set to the visitor's email so you can hit "Reply" directly.

## Adding datasheets to the customer cabinet

1. Upload PDFs into `/datasheets/<category>/` via hPanel File Manager or SFTP.
2. (Optional) Edit the category's `meta.json` to give files nicer titles + descriptions.
3. Refresh `/cabinet/dashboard` — no server restart needed.

See `datasheets/README.md` for the full folder & metadata format.

## Lead activity log + email notifications

Every time a customer signs in to the cabinet or downloads a PDF, three things happen:

1. **An event is appended** to `data/leads.csv` with timestamp, email, file, IP, and user agent. Open the file in Excel, Numbers, or Google Sheets — or import it into your CRM.
2. **An instant email** goes to `MAIL_TO` describing the event. Set `INSTANT_NOTIFICATIONS=false` to silence individual notifications and rely on the digest emails only.
3. **Two scheduled emails** keep you informed even if you ignore the per-event ones.

Once a day (default 08:00, set with `DIGEST_CRON` + `DIGEST_TIMEZONE` env vars) the server emails a summary of yesterday's activity to `MAIL_TO`: sign-in count, download count, unique customers, top files, and a per-download table. If there was zero activity, no email is sent.

Once a week (default Monday 08:00, set with `WEEKLY_CSV_CRON`) the server emails the **entire `leads.csv` file as an attachment** to `MAIL_TO`, with a dated filename (`luminaton-leads-YYYY-MM-DD.csv`). Use this as your weekly backup or to import into a CRM.

To grab the raw log:
- **hPanel File Manager** → navigate to `data/leads.csv` → download
- **SFTP** → same path
- **SSH** → `cat ~/domains/luminaton.com/public_html/data/leads.csv`

The `data/` folder is gitignored, so the log lives only on the server and never goes to GitHub.

## Customer inquiries + admin panel

Customers in the cabinet can submit project inquiries through `/cabinet/inquiries/new`:

- **Required fields:** project name, project description, attachments (1–10 files, 10 MB each), contact name, contact phone, contact email.
- **Allowed file types:** PDF, common Office (`docx`, `xlsx`, `pptx`), images (`jpg`, `png`, `webp`, etc.), CAD (`dwg`, `dxf`, `step`, `stp`, `iges`, `stl`), design (`ai`, `psd`, `eps`), archives (`zip`, `rar`, `7z`). Executables and scripts are blocked.
- **Customer view:** under "My Inquiries" each customer sees only their own inquiries, with date, project name, attachment count, and status.
- **Email notification:** every new inquiry triggers an email to `MAIL_TO` + any extra emails in `ADMIN_EMAILS`. If total attachments are ≤ 25 MB they are included as actual email attachments; otherwise the email lists the filenames and links to the admin panel.

### Admin panel

Visit `/cabinet/admin` while signed in as an admin email. Admins are determined by:
1. The address in `MAIL_TO` (always admin)
2. Any extra addresses in the `ADMIN_EMAILS` env var (comma-separated)

The admin panel shows every inquiry with search, status filter, and inline status change (New → In Review → Quoted → Closed). Click a row to open the full detail page with all attachments.

### Where the data lives

- **Inquiry records:** `data/inquiries.json` (gitignored).
- **Attachments:** `data/inquiry-attachments/<inquiry-id>/*`.

These files persist across deploys as long as you don't wipe the `data/` folder. Back them up periodically (the weekly `leads.csv` email already gives you a partial backup of the leads log, but inquiry attachments need separate backup — easiest is to SFTP the `data/inquiry-attachments/` folder once a month).

## Customizing the company-email allowlist

Free / personal email providers are blocked from accessing the cabinet. The block list lives in `lib/auth.js` → `PERSONAL_DOMAINS`. To allow a specific domain, remove it from the set. To block additional domains, add them. After editing, restart the Node app in hPanel.

## Recommendations to take this further

A few things worth considering once the basics are live:

- **Real product photography.** Replace the animated LED card with actual product photos / a small gallery once you have them.
- **Multilingual support.** If you sell internationally, add EN/ES/PL/RU toggle — easy to bolt on since content is in plain HTML.
- **Google Tag Manager + GA4** for tracking quote-request conversions.
- **reCAPTCHA v3 or Cloudflare Turnstile** on the form once spam appears (the honeypot + rate-limit catch most automated noise but not all).
- **Sitemap.xml + robots.txt** and a quick **schema.org/Organization** JSON-LD block for SEO.
- **Live chat** (Tawk.to, Crisp) if you want faster lead capture.
- **CDN / Cloudflare** in front of Hostinger for global performance.

## Customizing

- Brand color palette lives at the top of `styles.css` under `:root` — change `--accent` and `--accent-2` to repaint the site.
- Section copy lives directly in `index.html`.
- Contact destination address is `MAIL_TO` in the environment.
