# Visual Monitor

Automated visual regression monitoring for competitor websites. Every 12 hours, GitHub Actions visits every URL in `competitors.json`, screenshots it at 1280 × 800 px, and compares it pixel-by-pixel to the stored baseline. If the difference exceeds 1 % you get an email alert with the diff image attached. The results are published as a React dashboard on GitHub Pages.

---

## How It Works

```
GitHub Actions (cron)
  ↓
node scraper.js
  ↓ playwright screenshots each URL
  ↓ pixelmatch compares vs. public/baselines/<slug>.png
  ↓ if Δ > 1 %: saves diff to public/diffs/, sends email via nodemailer/Gmail
  ↓ writes public/data.json
  ↓ commits baselines + diffs + data.json back to main [skip ci]
  ↓
npm run build  →  dist/  →  GitHub Pages
```

---

## Quick Start

### 1. Fork & clone

```bash
git clone https://github.com/YOUR_USERNAME/visual-monitor.git
cd visual-monitor
npm install
npx playwright install chromium   # one-time browser download
```

### 2. Configure competitors

Edit `competitors.json` — add as many sites as you like:

```json
[
  { "name": "Competitor A", "url": "https://competitora.com" },
  { "name": "Competitor B", "url": "https://competitorb.com" }
]
```

### 3. Create a Gmail App Password

Email alerts use a Gmail **App Password** (not your regular account password).

1. Sign in to your Google Account and go to **Security**.
2. Enable **2-Step Verification** if it is not already active.
3. In the search bar type **App Passwords** (or visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Click **Create**, choose **Other (custom name)**, type `visual-monitor`, and click **Create**.
5. Copy the **16-character password** that appears — you will not see it again.

> **Tip:** If you do not want email alerts, you can skip this step entirely. The scraper works without `SMTP_EMAIL`/`SMTP_PASSWORD` — it just prints a notice and continues.

### 4. Add GitHub repository secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name     | Value                                         |
| --------------- | --------------------------------------------- |
| `SMTP_EMAIL`    | Your full Gmail address, e.g. `you@gmail.com` |
| `SMTP_PASSWORD` | The 16-character App Password from step 3     |

### 5. Enable GitHub Pages

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Click **Save**.

### 6. Grant the workflow write permissions

Go to **Settings → Actions → General → Workflow permissions** and select:

> **Read and write permissions** ✓

This allows the workflow to push the updated baselines, diffs, and `data.json` back to `main` after each run.

### 7. Trigger the first run

Go to **Actions → Monitor & Deploy → Run workflow → Run workflow**.

- The first run saves a fresh baseline for every site (no diffs yet).
- Subsequent runs compare against those baselines and alert you when something changes.

---

## Running Locally

```bash
# Optional — needed only for email alerts
$env:SMTP_EMAIL    = "you@gmail.com"
$env:SMTP_PASSWORD = "your-app-password"

# Run the scraper
node scraper.js

# Start the dashboard in dev mode
npm run dev
```

Open `http://localhost:5173` to see the dashboard.

---

## Project Structure

```
visual-monitor/
├── competitors.json            ← sites to monitor (edit this)
├── scraper.js                  ← screenshot + diff + email script
├── src/
│   ├── App.jsx                 ← React dashboard
│   └── App.css                 ← dashboard styles
├── public/
│   ├── baselines/              ← stored baseline PNGs (committed to git)
│   ├── diffs/                  ← diff PNGs when a change is detected
│   └── data.json               ← generated metadata read by the dashboard
├── vite.config.js              ← base: './' set for GitHub Pages
└── .github/
    └── workflows/
        └── deploy.yml          ← CI/CD pipeline
```

---

## Configuration

### Adjust the diff sensitivity

In `scraper.js`, near the top:

```js
const DIFF_THRESHOLD = 1; // percent — raise to e.g. 5 to reduce noise
```

The `threshold` option passed to `pixelmatch` (default `0.1`) controls per-pixel colour tolerance; `DIFF_THRESHOLD` controls how many pixels must differ before an alert fires.

### Change the schedule

In `.github/workflows/deploy.yml`:

```yaml
schedule:
  - cron: '0 */12 * * *'   # every 12 hours (default)
  # - cron: '0 8 * * *'    # daily at 08:00 UTC
  # - cron: '0 8 * * 1'    # every Monday at 08:00 UTC
```

### Change the viewport

In `scraper.js` inside `processSite()`:

```js
await page.setViewportSize({ width: 1280, height: 800 });
```

Both dimensions must stay consistent between runs for the pixel comparison to be valid.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Workflow fails: `Permission denied` on `git push` | **Settings → Actions → General → Workflow permissions → Read and write** |
| Email not arriving | Verify the App Password is correct and 2-Step Verification is enabled |
| Screenshot times out for a specific site | Some sites block headless browsers. Remove the site or increase the `timeout` value in `scraper.js` |
| Images missing on the GitHub Pages dashboard | Ensure `base: './'` is present in `vite.config.js` (already set) |
| First deploy shows empty dashboard | Normal — the dashboard shows `data.json`; trigger the workflow to populate it |
