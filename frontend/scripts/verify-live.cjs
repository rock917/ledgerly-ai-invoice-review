// Real browser -> FastAPI -> Groq -> Supabase verification. Uses synthetic inputs.
// Requires an empty seeded demo workspace. Does not reset or delete records.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const envText = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8');
const setting = name => {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return (match?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
};
const demoCode = setting('DEMO_ACCESS_TOKEN');
const reviewCode = setting('REVIEW_ACCESS_TOKEN');
const apiBase = 'http://127.0.0.1:8001';
const output = path.join(root, 'tmp/browser');
fs.mkdirSync(output, { recursive: true });
const reportPath = path.join(root, 'docs/live-test-results.json');
const previous = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
const report = previous?.scenarios?.length ? previous : { environment: 'localhost with real Groq and Supabase', started_at: new Date().toISOString(), checks: [], scenarios: [] };
delete report.result;
delete report.error;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  let page;
  const errors = [];
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', error => errors.push(error.message));
    async function api(endpoint) {
      const response = await page.request.get(apiBase + endpoint, { headers: { Authorization: `Bearer ${demoCode}` } });
      const body = await response.json();
      assert.equal(response.status(), 200, body.error?.message || 'API request failed');
      return body;
    }
    const health = await api('/health');
    assert.equal(health.configured, true);
    assert.equal((await api('/api/readiness')).database, 'connected');
    report.checks.push('Backend health and live database readiness passed');
    const before = await api('/api/dashboard');
    assert.equal(before.metrics.total, report.scenarios.length, 'Workspace has records outside this test report; existing records will not be deleted.');
    const pos = await api('/api/purchase-orders');
    assert.equal(pos.length, 2);
    assert(pos.every(po => Number(po.accepted_amount) === 0 || (report.scenarios.length && po.reference === 'PO-2026-1001' && Number(po.accepted_amount) === 60000)));
    assert(pos.some(po => po.vendor.name === 'Northstar Office Supplies'));
    assert(pos.some(po => po.vendor.name === 'Harbor Technology Services'));
    report.checks.push('Both vendor records and seeded purchase orders verified');
    console.log('PASS: health, live database, vendor records, and expected PO balances.');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.getByLabel('Demo access code').fill(demoCode);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.locator('.access-panel').waitFor({ state: 'hidden', timeout: 30000 });
    async function submit(filename, expected) {
      const saved = report.scenarios.find(s => s.input === filename && s.actual === expected && s.status === 'completed');
      if (saved) {
        const existing = await api(`/api/executions/${saved.execution_id}`);
        assert.equal(existing.outcome, expected);
        await page.goto(`http://127.0.0.1:5173/runs/${existing.id}`, { waitUntil: 'networkidle' });
        await page.getByText(existing.decision.summary, { exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, filename.replace('.pdf', '.png')), fullPage: true });
        console.log(`RESUMED: verified persisted ${filename}; no duplicate submission.`);
        return existing;
      }
      await page.getByRole('link', { name: 'New invoice', exact: true }).click();
      await page.getByLabel('Choose invoice PDF').setInputFiles(path.join(root, 'sample_data', filename));
      await page.getByRole('button', { name: 'Start workflow', exact: true }).click();
      await page.waitForURL(/\/runs\/[a-f0-9-]+$/, { timeout: 60000 });
      const id = page.url().split('/').pop();
      let run;
      for (let attempt = 0; attempt < 60; attempt++) {
        run = await api(`/api/executions/${id}`);
        if (run.status !== 'running') break;
        await sleep(3000);
      }
      report.scenarios.push({ input: filename, execution_id: id, expected, actual: run.outcome, status: run.status, duration_ms: run.duration_ms, error_code: run.error_code, error_message: run.error_message, rules: run.decision?.rules });
      fs.writeFileSync(path.join(root, 'docs/live-test-results.json'), JSON.stringify(report, null, 2));
      assert.equal(run.status, 'completed', `Workflow failed: ${run.error_code}: ${run.error_message}`);
      assert.equal(run.outcome, expected, `Unexpected decision: ${JSON.stringify(run.decision?.rules.filter(r => r.status !== 'pass'))}`);
      await page.getByText(run.decision.summary, { exact: true }).waitFor({ timeout: 15000 });
      assert(run.stages.some(s => s.name === 'Extract invoice' && s.status === 'completed'));
      await page.screenshot({ path: path.join(output, filename.replace('.pdf', '.png')), fullPage: true });
      console.log(`PASS: ${filename} -> ${run.outcome} (${(run.duration_ms / 1000).toFixed(1)}s), persisted stages and browser decision verified.`);
      return run;
    }
    async function review(action, comment) {
      await page.getByLabel('Reviewer name', { exact: true }).fill('Demo QA reviewer');
      await page.getByLabel('Reviewer access code', { exact: true }).fill(reviewCode);
      await page.getByLabel('Decision notes', { exact: true }).fill(comment);
      await page.getByRole('button', { name: action, exact: true }).click();
      await page.getByText('Your review was saved to Supabase.', { exact: true }).waitFor({ timeout: 30000 });
    }
    const first = await submit('01-valid-partial-invoice.pdf', 'ready');
    assert.equal(Number(first.total), 60000);
    if (first.review_status !== 'approved') await review('Approve invoice', 'Synthetic QA: checked source evidence and PO. Accept the first partial invoice.');
    const approved = await api(`/api/executions/${first.id}`);
    assert.equal(approved.review_status, 'approved');
    assert.equal(approved.reviews.length, 1);
    const updatedPO = (await api('/api/purchase-orders')).find(po => po.reference === 'PO-2026-1001');
    assert.equal(Number(updatedPO.accepted_amount), 60000);
    report.checks.push('Human approval persisted with review history and PO accepted balance 60000');
    const doc = await api(`/api/executions/${first.id}/document`);
    const downloaded = await page.request.get(doc.url);
    assert.equal(downloaded.status(), 200);
    assert((await downloaded.body()).subarray(0, 5).equals(Buffer.from('%PDF-')));
    report.checks.push('Original PDF downloaded through short-lived private Storage link');
    console.log('PASS: human approval and original PDF; PO remaining balance is INR 40,000.');
    if (!report.scenarios.some(s => s.input === '02-missing-invoice-number.pdf')) { console.log('Waiting 35s to respect shared Groq free quota.'); await sleep(35000); }
    const incomplete = await submit('02-missing-invoice-number.pdf', 'needs_review');
    assert.equal(incomplete.extraction.invoice_number, null);
    if (incomplete.review_status !== 'information_requested') await review('Request information', 'Synthetic QA: request a corrected invoice containing its invoice number.');
    report.checks.push('Request-information review persisted for incomplete invoice');
    if (!report.scenarios.some(s => s.input === '03-duplicate-renamed.pdf')) { console.log('Waiting 35s between real Groq calls.'); await sleep(35000); }
    const duplicate = await submit('03-duplicate-renamed.pdf', 'blocked');
    assert(duplicate.decision.rules.find(r => r.code === 'duplicate_invoice').detected.includes(first.id));
    if (!report.scenarios.some(s => s.input === '04-partial-invoice-overage.pdf')) { console.log('Waiting 35s between real Groq calls.'); await sleep(35000); }
    const overage = await submit('04-partial-invoice-overage.pdf', 'needs_review');
    assert(overage.decision.rules.find(r => r.code === 'po_remaining_balance').detected.includes('overage 5000'));
    assert(await page.getByRole('button', { name: 'Approve invoice', exact: true }).isDisabled());
    report.checks.push('Overbilling review cannot be approved through the UI');
    const unauthorized = await page.request.get(apiBase + '/api/dashboard');
    assert.equal(unauthorized.status(), 401);
    const badReview = await page.request.post(apiBase + `/api/executions/${overage.id}/reviews`, { headers: { Authorization: `Bearer ${demoCode}` }, data: { action: 'approve', comment: 'Unauthorized attempt must fail', reviewer: 'QA' } });
    assert.equal(badReview.status(), 403);
    report.checks.push('Unauthorized API reads and reviews rejected');
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await page.getByRole('heading', { name: 'Recent activity' }).waitFor();
    await page.locator('tbody tr').first().waitFor();
    const after = await api('/api/dashboard');
    assert.equal(after.metrics.total, 4);
    assert.equal(after.metrics.completed, 4);
    assert.equal(after.metrics.failed, 0);
    report.metrics = after.metrics;
    await page.screenshot({ path: path.join(output, 'live-overview-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'live-overview-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile overflow');
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    report.checks.push('Dashboard matches persisted records; mobile width and browser runtime checks passed');
    report.finished_at = new Date().toISOString();
    report.checks = [...new Set(report.checks)];
    report.result = 'PASSED';
    fs.writeFileSync(path.join(root, 'docs/live-test-results.json'), JSON.stringify(report, null, 2));
    console.log('LIVE BROWSER SUITE PASSED. Four real Groq workflows, Supabase persistence, human review, document storage, and dashboard verified.');
  } finally {
    if (report.result !== 'PASSED' && page) {
      await page.screenshot({ path: path.join(output, 'live-failure.png'), fullPage: true });
      console.log('Browser runtime errors: ' + JSON.stringify(errors));
      console.log('Visible page: ' + (await page.locator('body').innerText()).slice(0, 1500));
    }
    await browser.close();
  }
})().catch(error => {
  report.result = 'FAILED';
  report.error = String(error.message).replaceAll(demoCode, '[REDACTED]').replaceAll(reviewCode, '[REDACTED]');
  fs.writeFileSync(path.join(root, 'docs/live-test-results.json'), JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exit(1);
});
