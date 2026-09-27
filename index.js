/**
 * Capture real-browser client-side performance metrics for a page
 * (default: amazon.com) using Puppeteer + Chromium.
 *
 * Usage:
 *   node index.js
 *   node index.js https://www.amazon.com
 *   node index.js https://www.amazon.com --headful
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const TARGET_URL = args.find((a) => a.startsWith('http')) || 'https://www.amazon.com';
const HEADFUL = args.includes('--headful');
const WAIT_AFTER_LOAD_MS = 9000; // let LCP finalize + speed-index sampling finish

async function run() {
  console.log(`Launching Chromium (${HEADFUL ? 'headful' : 'headless'})...`);
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // reduce basic bot-detection flags
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  // Inject the metrics scripts before ANY page script executes.
  const collectorScript = fs.readFileSync(
    path.join(__dirname, 'browser/metrics-collector.js'),
    'utf8'
  );
  const speedIndexScript = fs.readFileSync(
    path.join(__dirname, 'browser/speed-index.js'),
    'utf8'
  );
  await page.evaluateOnNewDocument(collectorScript);
  await page.evaluateOnNewDocument(speedIndexScript);

  // Wire everything up inside the page context.
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('load', () => {
      window.__collector = new window.MetricsCollector((m) => {
        window.__latestMetrics = m;
      });
      new window.SpeedIndexApproximator({
        onComplete: (perceivedSpeedIndex) => {
          window.__latestMetrics = {
            ...window.__latestMetrics,
            perceivedSpeedIndex,
          };
        },
      });
    });
  });

  console.log(`Navigating to ${TARGET_URL} ...`);
  const start = Date.now();
  try {
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 60000 });
  } catch (err) {
    console.error('Navigation failed or timed out:', err.message);
    await browser.close();
    process.exit(1);
  }
  console.log(`Navigation "load" event fired after ${Date.now() - start}ms.`);
  console.log(`Waiting ${WAIT_AFTER_LOAD_MS}ms for LCP/Speed Index to settle...`);

  await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));

  const metrics = await page.evaluate(() => window.__latestMetrics || null);

  console.log('\n=== Client-Side Performance Metrics ===');
  console.log(`URL: ${TARGET_URL}`);
  console.table(metrics);

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `metrics-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ url: TARGET_URL, capturedAt: new Date().toISOString(), metrics }, null, 2));
  console.log(`\nSaved to ${outPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
