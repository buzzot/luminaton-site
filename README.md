# Luminaton — Landing Page

Single-page landing site for **Luminaton.com**, a distributor of customized LED modules and LED strip lights. Static front end + small Node.js / Express backend that delivers contact-form submissions to your mailbox by SMTP.

## What's in this folder

```
luminaton/
├── index.html        Landing page (hero, products, about, contact)
├── styles.css        Clean white theme with soft LED accents
├── script.js         Mobile nav, scroll reveal, AJAX form submission
├── server.js         Express server + /api/contact endpoint
├── package.json      Node dependencies
├── .env.example      Copy to .env and fill in SMTP credentials
└── README.md         This file
```

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
