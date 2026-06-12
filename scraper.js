import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const BASELINES_DIR = 'public/baselines';
const DIFFS_DIR = 'public/diffs';
const DATA_FILE = 'public/data.json';
const DIFF_THRESHOLD = 1; // percent

fs.mkdirSync(BASELINES_DIR, { recursive: true });
fs.mkdirSync(DIFFS_DIR, { recursive: true });

const competitors = JSON.parse(fs.readFileSync('competitors.json', 'utf-8'));

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function sendEmailAlert(siteName, siteUrl, diffPercent, diffImagePath) {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
    console.log('  Skipping email: SMTP_EMAIL or SMTP_PASSWORD not set.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"Visual Monitor" <${process.env.SMTP_EMAIL}>`,
    to: process.env.SMTP_EMAIL,
    subject: `[Visual Monitor] Change detected on ${siteName} (${diffPercent}%)`,
    html: `
      <h2 style="font-family:sans-serif">Visual change detected</h2>
      <p style="font-family:sans-serif">
        <strong>${siteName}</strong> changed by <strong>${diffPercent}%</strong>.
      </p>
      <p style="font-family:sans-serif">URL: <a href="${siteUrl}">${siteUrl}</a></p>
      <p style="font-family:sans-serif">The pixel diff image is attached.</p>
    `,
    attachments: [
      { filename: `${slugify(siteName)}-diff.png`, path: diffImagePath },
    ],
  });

  console.log(`  Email alert sent to ${process.env.SMTP_EMAIL}`);
}

async function processSite(browser, site) {
  const slug = slugify(site.name);
  const baselinePath = path.join(BASELINES_DIR, `${slug}.png`);
  const tmpPath = path.join(BASELINES_DIR, `${slug}-tmp.png`);
  const diffPath = path.join(DIFFS_DIR, `${slug}-diff.png`);

  const entry = {
    name: site.name,
    url: site.url,
    timestamp: new Date().toISOString(),
    baselineImage: `baselines/${slug}.png`,
    diffImage: null,
    changed: false,
    isNew: false,
    diffPercent: 0,
    error: null,
  };

  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: tmpPath, fullPage: false });
  } catch (err) {
    console.error(`  Capture failed: ${err.message}`);
    entry.error = err.message;
    await page.close();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    return entry;
  }

  await page.close();

  // First run — save screenshot as the baseline and return.
  if (!fs.existsSync(baselinePath)) {
    fs.renameSync(tmpPath, baselinePath);
    entry.isNew = true;
    console.log('  New baseline saved.');
    return entry;
  }

  // Read both PNGs and compare.
  let baseline, current;
  try {
    baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    current = PNG.sync.read(fs.readFileSync(tmpPath));
  } catch (err) {
    console.error(`  PNG read error: ${err.message}`);
    entry.error = `PNG read error: ${err.message}`;
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    return entry;
  }

  // If dimensions changed (e.g. responsive layout shift) treat as changed.
  if (baseline.width !== current.width || baseline.height !== current.height) {
    fs.renameSync(tmpPath, baselinePath);
    entry.changed = true;
    entry.diffPercent = 100;
    console.log('  Dimensions changed — baseline updated, marked as changed.');
    return entry;
  }

  const { width, height } = baseline;
  const diff = new PNG({ width, height });

  const numDiff = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );

  const diffPercent = parseFloat(((numDiff / (width * height)) * 100).toFixed(2));
  entry.diffPercent = diffPercent;

  if (diffPercent > DIFF_THRESHOLD) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    fs.renameSync(tmpPath, baselinePath);
    entry.changed = true;
    entry.diffImage = `diffs/${slug}-diff.png`;
    console.log(`  Change detected: ${diffPercent}% — diff saved, baseline updated.`);

    try {
      await sendEmailAlert(site.name, site.url, diffPercent, diffPath);
    } catch (err) {
      console.error(`  Email failed: ${err.message}`);
    }
  } else {
    fs.unlinkSync(tmpPath);
    console.log(`  No significant change: ${diffPercent}%.`);
  }

  return entry;
}

async function run() {
  const browser = await chromium.launch();
  const results = [];

  for (const site of competitors) {
    console.log(`\nProcessing: ${site.name} (${site.url})`);
    const entry = await processSite(browser, site);
    results.push(entry);
  }

  await browser.close();

  fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2));
  console.log(`\nDone. Results written to ${DATA_FILE}`);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
