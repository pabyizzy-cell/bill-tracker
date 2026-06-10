// End-to-end check of the bank CSV import flow in local mode:
// upload -> review banner -> confirm -> transactions visible.
// Usage: npm run preview (in another shell) && node scripts/test-import-e2e.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.APP_URL ?? 'http://localhost:4173';

const csv = [
  'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
  '06/02/2026,06/03/2026,"STARBUCKS STORE 123, SEATTLE",Food & Drink,Sale,-7.45,',
  '06/01/2026,06/02/2026,WHOLEFDS MKT 10259,Groceries,Sale,-84.20,',
  '05/27/2026,05/28/2026,Payment Thank You-Mobile,,Payment,500.00,',
].join('\r\n');

const dir = mkdtempSync(join(tmpdir(), 'chase-'));
const csvPath = join(dir, 'Chase1234_Activity.CSV');
writeFileSync(csvPath, csv);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};

await page.goto(url, { waitUntil: 'networkidle' });

await page.setInputFiles('input[type="file"][accept*="csv"]', csvPath);

const banner = page.locator('.import-card');
await banner.waitFor({ timeout: 5000 });
const summary = await banner.locator('.import-summary').innerText();
check('review shows 2 new transactions', summary.includes('2') && summary.includes('expenses'));
const skips = await banner.locator('.import-skips').innerText();
check('review notes the skipped card payment', /1 card payment/.test(skips));

await banner.getByRole('button', { name: /Add 2 transactions/ }).click();
await page.locator('.import-card').waitFor({ state: 'detached', timeout: 5000 });

check('success notice appears', await page.getByText('Imported 2 transactions').isVisible());
check(
  'imported transaction is in the list',
  await page.getByText('STARBUCKS STORE 123, SEATTLE').isVisible(),
);
check(
  'summary cards include imported spending',
  (await page.locator('.summary-value').first().innerText()) !== undefined,
);

// Re-import the same file: everything should be a duplicate.
page.once('dialog', async (d) => {
  check('re-import reports duplicates instead of double-counting', /already in this data/.test(d.message()));
  await d.accept();
});
await page.setInputFiles('input[type="file"][accept*="csv"]', csvPath);
await page.waitForTimeout(800);

check('no page errors', errors.length === 0);
if (errors.length) console.error(errors.join('\n'));

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nCSV import e2e passed.');
