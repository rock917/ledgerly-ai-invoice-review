// Local QA only. Uses the already bundled Playwright runtime, not a new app dependency.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const out = path.resolve(__dirname, '../../tmp/browser');
  mkdirSync(out, { recursive: true });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'A clearer view of every invoice.' }).waitFor();
  await page.screenshot({ path: path.join(out, 'overview-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'New invoice', exact: true }).click();
  await page.getByRole('heading', { name: 'One invoice. A complete picture.' }).waitFor();
  await page.getByLabel('Choose invoice PDF').setInputFiles(path.resolve(__dirname, '../../sample_data/01-valid-partial-invoice.pdf'));
  if (!(await page.getByRole('button', { name: 'Start workflow' }).isDisabled())) throw new Error('Unauthenticated workflow must be disabled');
  await page.screenshot({ path: path.join(out, 'upload-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Run history', exact: true }).click();
  await page.getByRole('heading', { name: 'Every invoice has a history.' }).waitFor();
  await page.getByRole('link', { name: 'Review queue', exact: true }).click();
  await page.getByRole('heading', { name: 'A decision needs your attention.' }).waitFor();
  await page.getByRole('link', { name: 'Purchase orders', exact: true }).click();
  await page.getByRole('heading', { name: 'Know what’s left on every PO.' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: path.join(out, 'overview-mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Mobile page has horizontal overflow');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Browser QA passed: five routes, real local empty states, file selection, auth gating, mobile width, no uncaught JS errors. No live workflow claimed.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
