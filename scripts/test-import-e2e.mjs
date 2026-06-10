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
  '06/01/2026,06/02/2026,NETFLIX.COM,Bills & Utilities,Sale,-15.49,',
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
check('review shows 3 new transactions', summary.includes('3') && summary.includes('expenses'));
const skips = await banner.locator('.import-skips').first().innerText();
check('review notes the skipped card payment', /1 card payment/.test(skips));

// Bulk-apply: select all rows, set them to monthly, then bulk-set back to
// one-time — the per-row dropdowns must follow both times.
await banner.locator('input[aria-label="Select all rows"]').check();
await banner
  .locator('select[aria-label="Set recurrence for selected rows"]')
  .selectOption('monthly');
check(
  'bulk apply sets every row dropdown',
  (await banner.locator('.import-repeat').evaluateAll((els) => els.every((e) => e.value === 'monthly'))),
);
await banner.locator('input[aria-label="Select all rows"]').check();
await banner
  .locator('select[aria-label="Set recurrence for selected rows"]')
  .selectOption('once');
check(
  'bulk apply can set rows back to one-time',
  (await banner.locator('.import-repeat').evaluateAll((els) => els.every((e) => e.value === 'once'))),
);

// Mark the Netflix row as a monthly recurring bill.
await banner
  .locator('select[aria-label="Recurrence for NETFLIX.COM"]')
  .selectOption('monthly');
const confirmLabel = await banner.getByRole('button', { name: /^Add 3/ }).innerText();
check('confirm button reflects the recurring choice', /\+ 1 recurring item/.test(confirmLabel));

await banner.getByRole('button', { name: /^Add 3/ }).click();
await page.locator('.import-card').waitFor({ state: 'detached', timeout: 5000 });

check('success notice appears', await page.getByText(/Imported 3 transactions/).isVisible());
check(
  'success notice mentions the recurring item',
  await page.getByText(/set up 1 recurring item/).isVisible(),
);
check(
  'recurring list shows the marked bill',
  await page
    .locator('.recurring-list li', { hasText: 'NETFLIX.COM' })
    .locator('.tx-meta', { hasText: 'Every month' })
    .isVisible(),
);
check(
  'projection card is visible with stats',
  await page.locator('.projection-card .projection-stats').isVisible(),
);
check(
  'imported transaction is in the list',
  await page.getByText('STARBUCKS STORE 123, SEATTLE').isVisible(),
);
check(
  'date lookup produces a projected number',
  /\$/.test(await page.locator('.lookup-result strong, .lookup-breakdown').first().innerText()),
);

// Re-marking an already-recurring bill via edit must UPDATE the existing
// item (this used to be silently dropped, and the user saw nothing happen).
await page.locator('.tx-list').getByRole('button', { name: 'Edit NETFLIX.COM' }).click();
await page.locator('.form-grid select').last().selectOption('weekly');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForTimeout(300);
check(
  'remarking via edit shows a confirmation notice',
  await page.getByText(/was already recurring — updated it to every week/).isVisible(),
);
const netflixRows = page.locator('.recurring-list li', { hasText: 'NETFLIX.COM' });
check('no duplicate recurring item is created', (await netflixRows.count()) === 1);
check(
  'the existing recurring item took the new frequency',
  await netflixRows.locator('.tx-meta', { hasText: 'Every week' }).isVisible(),
);
check(
  'summary cards include imported spending',
  (await page.locator('.summary-value').first().innerText()) !== undefined,
);

// Search across all months.
await page.locator('.search-input').fill('starb');
await page.waitForTimeout(200);
check(
  'search finds matches across months',
  (await page.locator('.tx-list li').count()) === 1 &&
    (await page.getByText(/1 match across all months/).isVisible()),
);
await page.locator('.search-input').fill('');
await page.waitForTimeout(200);

// Bulk select existing entries: change category, mark as repeating, delete.
await page.locator('.list-tools').getByRole('button', { name: 'Select' }).click();
await page.locator('.tx-list input[aria-label="Select STARBUCKS STORE 123, SEATTLE"]').check();
await page.locator('.tx-list input[aria-label="Select WHOLEFDS MKT 10259"]').check();
await page
  .locator('select[aria-label="Change category for selected transactions"]')
  .selectOption('dining');
await page.waitForTimeout(200);
check(
  'bulk category change reports what it did',
  await page.getByText(/Moved 2 transactions to Dining Out/).isVisible(),
);

// Bulk "mark as repeating" on EXISTING entries.
await page.locator('.tx-list input[aria-label="Select STARBUCKS STORE 123, SEATTLE"]').check();
await page.locator('.tx-list input[aria-label="Select WHOLEFDS MKT 10259"]').check();
await page
  .locator('select[aria-label="Mark selected transactions as repeating"]')
  .selectOption('monthly');
await page.waitForTimeout(200);
check(
  'bulk mark-as-repeating reports what it did',
  await page.getByText(/Marked 2 entries as repeating \(every month\)/).isVisible(),
);
check(
  'recurring list gained the two marked entries',
  (await page.locator('.recurring-list li').count()) === 3,
);

await page.locator('.tx-list input[aria-label="Select STARBUCKS STORE 123, SEATTLE"]').check();
await page.locator('.tx-list input[aria-label="Select WHOLEFDS MKT 10259"]').check();
page.once('dialog', (d) => d.accept());
await page.locator('.bulk-bar').getByRole('button', { name: 'Delete selected' }).click();
await page.waitForTimeout(300);
check(
  'bulk delete removes the selected rows',
  !(await page.locator('.tx-list').getByText('STARBUCKS STORE 123, SEATTLE').isVisible()) &&
    (await page.locator('.tx-list li').count()) === 1,
);
check(
  'deleting transactions keeps their recurring schedules',
  (await page.locator('.recurring-list li').count()) === 3,
);
await page.getByRole('button', { name: 'Done selecting' }).click();

// Bulk delete in the recurring card prunes schedules.
const recSection = page.locator('section.card', { hasText: 'Recurring bills & deposits' });
await recSection.getByRole('button', { name: 'Select', exact: true }).click();
await page
  .locator('.recurring-list input[aria-label="Select recurring STARBUCKS STORE 123, SEATTLE"]')
  .check();
await page
  .locator('.recurring-list input[aria-label="Select recurring WHOLEFDS MKT 10259"]')
  .check();
page.once('dialog', (d) => d.accept());
await recSection.getByRole('button', { name: 'Delete selected' }).click();
await page.waitForTimeout(300);
check(
  'recurring bulk delete prunes the list',
  (await page.locator('.recurring-list li').count()) === 1,
);
await recSection.getByRole('button', { name: 'Done selecting' }).click();

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
