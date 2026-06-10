// Smoke test + screenshot: loads the app in headless Chromium, loads the
// sample data set, waits for the charts to render, and saves a screenshot.
// Usage: npm run build && npm run preview (in another shell) && node scripts/screenshot.mjs
import { chromium } from 'playwright';

const url = process.env.APP_URL ?? 'http://localhost:4173';
const out = process.env.OUT ?? 'screenshot.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle' });

const sampleButton = page.getByRole('button', { name: 'Load sample data' });
if (await sampleButton.isVisible().catch(() => false)) {
  await sampleButton.click();
}

await page.waitForSelector('.recharts-surface', { timeout: 10_000 });
await page.waitForTimeout(800); // let chart animations settle

await page.screenshot({ path: out, fullPage: true });
console.log(`saved ${out}`);
console.log('page errors:', errors.length ? errors.join('\n') : 'none');

await browser.close();
process.exit(errors.length ? 2 : 0);
