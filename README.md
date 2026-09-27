# amazon-perf-node

Captures real-browser client-side performance metrics for any URL
(defaults to `https://www.amazon.com`) using **Puppeteer** (controls a
real Chromium instance) and **Node.js**.

## Folder structure

```
amazon-perf-node/
├── index.js                    Main script: launch browser, inject metrics, capture, save
├── package.json
├── browser/
│   ├── metrics-collector.js    FCP, LCP, TTFB, CLS, FID, Rendering/Load Time
│   └── speed-index.js          Perceived Speed Index approximation
└── results/                    JSON output written here (created on first run)
```

## Setup

```bash
cd amazon-perf-node
npm install
```

This installs Puppeteer, which downloads a bundled Chromium binary
(~200MB) the first time.

## Run

```bash
# Default target: https://www.amazon.com
npm start

# Or explicitly:
node index.js https://www.amazon.com

# Watch it happen in a visible browser window instead of headless:
node index.js https://www.amazon.com --headful
```

## What it does

1. Launches Chromium via Puppeteer.
2. Uses `page.evaluateOnNewDocument()` to inject the metrics-collection
   code **before Amazon's own scripts run**, so `PerformanceObserver`
   entries for paint/LCP are captured from time zero (this is
   important — injecting after navigation would miss early paints).
3. Navigates to the target URL and waits for the `load` event.
4. Waits an additional ~9 seconds so the browser can finalize LCP
   (which updates until user input/tab-hide) and finish Speed Index
   sampling.
5. Pulls `window.__latestMetrics` back into Node via `page.evaluate()`.
6. Prints a table to the console and writes a timestamped JSON file to
   `results/`.

## Example output

```
=== Client-Side Performance Metrics ===
URL: https://www.amazon.com
┌────────────────────┬─────────┐
│       (index)       │ Values  │
├────────────────────┼─────────┤
│        ttfb         │  312.4  │
│         fcp          │  890.1  │
│         lcp          │ 1523.6  │
│         cls          │  0.012  │
│         fid          │  null   │
│  domContentLoaded    │ 1180.2  │
│   renderingTime      │ 3021.7  │
│      loadTime        │ 3021.7  │
│ perceivedSpeedIndex  │  1780   │
└────────────────────┴─────────┘
```

`fid` stays `null` in an automated run because it only fires on a real
user input event — there's nothing to click.

## Important notes on testing amazon.com specifically

- **Bot detection**: Amazon (like most large sites) can serve CAPTCHA
  or a "dog" error page to traffic it flags as automated, especially
  from data-center IPs or repeated rapid requests. This script sets a
  realistic user agent and disables the obvious `navigator.webdriver`
  automation flag, but there's no guarantee Amazon won't still
  challenge the request. If you see a challenge page in the JSON
  output/screenshot instead of the real homepage, that's why — not a
  bug in the metrics code.
- **Network variability**: run it a few times; single-run numbers for
  a page as heavy as Amazon's homepage can vary run-to-run.
- **Legal/ethical use**: this only measures page-load performance the
  same way a browser normally would (like Lighthouse or WebPageTest
  do) — it does not scrape account data, bypass paywalls, or automate
  purchases. Keep request volume reasonable and respect Amazon's
  Terms of Service / robots.txt if you adapt this for repeated or
  bulk monitoring.

## Adapting to another page

Just pass a different URL:

```bash
node index.js https://example.com
```

Or import `browser/metrics-collector.js` and `browser/speed-index.js`
into any other Puppeteer/Playwright script the same way — via
`evaluateOnNewDocument`.
