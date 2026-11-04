// Local-only, staged tutorial. Never connects to real Auth, APIs, or accounts.
// Start Vite with the fake environment described in docs/DEMO_WALKTHROUGH.md.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const base = process.env.TOUR_URL || 'http://127.0.0.1:5180';
const output = path.join(root, 'frontend/public/assets/tutorial');
const scratch = path.join(root, 'tmp/tutorial');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(scratch, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, recordVideo: { dir: scratch, size: { width: 1280, height: 960 } }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const user = { id: '10000000-0000-4000-8000-000000000001', email: 'reviewer@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), user_metadata: { full_name: 'Demo Reviewer' }, app_metadata: { provider: 'email' }, created_at: new Date().toISOString() };
  const jwt = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url') + '.mock';
  const session = { access_token: jwt, refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  let approved = false, submitted = false, active = 'valid', informationRequested = false;
  const ruleNames = ['Required information', 'Invoice date', 'Source evidence', 'Approved vendor', 'Vendor identifier', 'Purchase order match', 'Duplicate invoice', 'Invoice arithmetic', 'Line item reconciliation', 'Currency agreement', 'Remaining PO balance'];
  const now = '2026-11-03T09:00:00Z';
  function validRun() {
    return { id: 'tutorial-sample', filename: '01-valid-partial-invoice.pdf', invoice_number: 'NS-2026-001', vendor_name: 'Northstar Office Supplies', total: 60000, currency: 'INR', status: 'completed', outcome: 'ready', review_status: approved ? 'approved' : 'pending', created_at: now, duration_ms: 6000, policy_version: '1.0', ai_model: 'illustrative tutorial result',
      stages: ['PDF received and stored privately.', 'Fields extracted with source excerpts.', 'Required fields and amounts checked.', 'Matched PO-2026-1001.', '11 checks passed in this sample.', 'Decision saved for human review.'].map((detail, position) => ({ id: String(position), position, status: 'completed', detail, started_at: now, finished_at: now })),
      decision: { summary: 'All configured checks passed. Ready for human approval; no payment initiated.', rules: ruleNames.map((title, i) => ({ code: String(i), title, status: 'pass', detected: title === 'Remaining PO balance' ? 'Invoice INR 60,000; remaining PO balance INR 100,000.' : 'Sample information matches the configured rule.', rule: title === 'Remaining PO balance' ? 'The invoice must fit within the remaining PO balance.' : 'Check the extracted information against the source and workspace records.', next_action: 'Review the evidence before approving.' })) },
      extraction: { vendor_name: 'Northstar Office Supplies', invoice_number: 'NS-2026-001', total: '60000.00', po_reference: 'PO-2026-1001', currency: 'INR', evidence: [{ field: 'vendor_name', quote: 'Northstar Office Supplies', page: 1 }, { field: 'invoice_number', quote: 'NS-2026-001', page: 1 }, { field: 'po_reference', quote: 'PO-2026-1001', page: 1 }, { field: 'total', quote: 'INR 60000.00', page: 1 }], uncertainties: [], line_items: [{ description: 'Office workstation supplies - first delivery', quantity: '1', unit_price: '60000.00', amount: '60000.00' }] },
      reviews: approved ? [{ id: 'demo-review', action: 'approve', reviewer: 'Demo Reviewer', comment: 'Checked the source invoice, vendor and available PO balance.', created_at: now }] : [] };
  }
  function run() {
    const result = validRun();
    if (active === 'valid') return result;
    const cases = {
      duplicate: { file: '03-duplicate-renamed.pdf', number: 'NS-2026-001', total: 60000, title: 'Duplicate invoice', status: 'block', detected: 'Previously processed as tutorial-sample. Same vendor and invoice number, despite a different filename.', summary: 'Duplicate invoice detected. Acceptance is blocked; inspect the original execution.' },
      overage: { file: '04-partial-invoice-overage.pdf', number: 'NS-2026-002', total: 45000, title: 'Remaining PO balance', status: 'review', detected: 'Invoice 45000.00; remaining 40000.00; overage 5000.00', summary: 'Review required. This invoice exceeds the remaining PO balance by INR 5,000.' },
      missing: { file: '02-missing-invoice-number.pdf', number: null, total: 10000, title: 'Required information', status: 'review', detected: 'invoice_number', summary: 'Review required. Request a corrected invoice with an invoice number.' },
    };
    const sample = cases[active];
    Object.assign(result, { id: `tutorial-${active}`, filename: sample.file, invoice_number: sample.number, total: sample.total, outcome: active === 'duplicate' ? 'blocked' : 'needs_review', review_status: informationRequested && active === 'missing' ? 'info_requested' : 'pending', reviews: [] });
    result.decision.summary = sample.summary;
    result.decision.rules = result.decision.rules.map(r => r.title === sample.title ? { ...r, status: sample.status, detected: sample.detected, next_action: active === 'duplicate' ? 'Inspect the original execution; do not approve this duplicate.' : 'Request a corrected invoice before approval.' } : r);
    if (active === 'duplicate') Object.assign(result.decision.rules.find(r => r.title === 'Remaining PO balance'), { status: 'review', detected: 'Invoice 60000.00; remaining 40000.00; overage 20000.00' });
    result.extraction = { ...result.extraction, invoice_number: sample.number, total: String(sample.total), evidence: result.extraction.evidence.filter(e => !(active === 'missing' && e.field === 'invoice_number')).map(e => ({ ...e, quote: e.field === 'total' ? `INR ${sample.total}.00` : e.field === 'invoice_number' ? sample.number : e.quote })), line_items: [{ description: 'Synthetic sample delivery', quantity: '1', unit_price: String(sample.total), amount: String(sample.total) }] };
    if (informationRequested && active === 'missing') result.reviews = [{ id: 'info-review', action: 'request_info', reviewer: 'Demo Reviewer', comment: 'Please provide a corrected invoice with its invoice number.', created_at: now }];
    result.stages[4].detail = `11 checks evaluated; outcome: ${result.outcome}.`;
    return result;
  }
  // A catch-all prevents accidental live requests if configuration changes.
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    if (url.origin === 'https://auth.example.test') return route.fulfill({ json: p.endsWith('/token') ? session : p.endsWith('/user') ? user : {} });
    if (url.origin === 'http://127.0.0.1:8001') {
      let data;
      if (p === '/health') data = { configured: true, status: 'ok' };
      else if (p === '/api/me') data = { id: user.id, display_name: 'Demo Reviewer', email: user.email, daily_upload_limit: 10 };
      else if (p === '/api/dashboard') data = { metrics: { total: submitted ? 1 : 0, approved: approved ? 1 : 0, pending_reviews: submitted && !approved ? 1 : 0, failed: 0 }, recent: submitted ? [run()] : [] };
      else if (p === '/api/executions' && req.method() === 'POST') {
        const body = req.postDataBuffer().toString();
        active = body.includes('03-duplicate-renamed.pdf') ? 'duplicate' : body.includes('04-partial-invoice-overage.pdf') ? 'overage' : body.includes('02-missing-invoice-number.pdf') ? 'missing' : 'valid';
        submitted = true; data = { id: active === 'valid' ? 'tutorial-sample' : `tutorial-${active}` };
      }
      else if (p.endsWith('/reviews')) {
        if (active === 'valid') { assert.equal(req.postDataJSON().action, 'approve'); approved = true; data = { review_status: 'approved' }; }
        else { assert.equal(req.postDataJSON().action, 'request_info'); informationRequested = true; data = { review_status: 'info_requested' }; }
      }
      else if (p.startsWith('/api/executions/tutorial-')) data = p.endsWith('/erpnext') ? { enabled: false } : run();
      else if (p === '/api/erpnext') data = { enabled: false };
      else if (p === '/api/purchase-orders') data = [{ id: 'sample-po', reference: 'PO-2026-1001', currency: 'INR', amount: 100000, accepted_amount: approved ? 60000 : 0, status: 'open', vendor: { name: 'Northstar Office Supplies' } }, { id: 'sample-po-2', reference: 'PO-2026-1002', currency: 'INR', amount: 50000, accepted_amount: 0, status: 'open', vendor: { name: 'Harbor Technology Services' } }];
      else data = [];
      return route.fulfill({ json: data });
    }
    if (url.origin === base) return route.continue();
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('ledgerly_theme', 'dark'));
  const chapters = [];
  const start = Date.now();
  async function caption(step, text, target) {
    await page.evaluate(({ step, text }) => {
      document.body.style.paddingBottom = '180px';
      document.querySelectorAll('[data-tutorial-focus]').forEach(el => { el.style.outline = ''; el.removeAttribute('data-tutorial-focus'); });
      let overlay = document.getElementById('tutorial-caption');
      if (!overlay) { overlay = document.createElement('div'); overlay.id = 'tutorial-caption'; document.body.append(overlay); }
      overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:22px 36px 26px;background:#062c32;color:white;border-top:3px solid #36d6ca;font:23px/1.5 Arial,sans-serif;pointer-events:none;box-shadow:0 -12px 40px #0004';
      overlay.replaceChildren();
      const label = document.createElement('div'); label.textContent = step; label.style.cssText = 'font:700 13px Arial;letter-spacing:2px;color:#64e5da;margin-bottom:8px';
      const copy = document.createElement('div'); copy.textContent = text; overlay.append(label, copy);
      let tag = document.getElementById('tutorial-tag');
      if (!tag) { tag = document.createElement('div'); tag.id = 'tutorial-tag'; document.body.append(tag); }
      tag.textContent = 'GUIDED DEMO · STAGED SAMPLE RESULTS';
      tag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;padding:8px 14px;background:#062c32;color:#8cf4e9;border:1px solid #36d6ca;border-radius:20px;font:700 11px Arial;letter-spacing:1px;pointer-events:none';
    }, { step, text });
    if (target) await target.evaluate(el => { el.style.outline = '3px solid #36d6ca'; el.style.outlineOffset = '5px'; el.setAttribute('data-tutorial-focus', ''); });
    chapters.push({ at: (Date.now() - start) / 1000, step, text });
  }
  async function hold(seconds) {
    const frame = `scene-${String(chapters.length).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(scratch, frame), animations: 'disabled' });
    chapters[chapters.length - 1].frame = frame;
    await page.waitForTimeout(seconds * 1000);
  }
  async function top(locator) { await locator.evaluate(el => { el.style.scrollMarginTop = '80px'; el.scrollIntoView({ block: 'start', behavior: 'instant' }); }); }
  try {
    await page.goto(base);
    await page.getByRole('heading', { name: 'Welcome to Ledgerly' }).waitFor();
    await caption('01 / SIGN IN', 'Use Google or create an email account. Each account gets a private demo workspace.');
    await hold(7);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('synthetic-demo-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Your invoice workspace.' }).waitFor();
    await caption('02 / YOUR WORKSPACE', 'Start with sample invoices and purchase orders. Use synthetic documents only.', page.getByRole('link', { name: 'Open sample walkthrough' }));
    await hold(6);
    await page.getByRole('link', { name: 'Open sample walkthrough' }).click();
    const guide = page.getByRole('region', { name: 'Try the sample walkthrough' });
    await top(guide);
    await caption('03 / PICK A SAMPLE', 'Choose “Approve a valid invoice” first. “Use sample” selects the PDF; it does not submit it.', page.getByRole('button', { name: 'Use sample: Approve a valid invoice' }));
    await hold(7);
    await page.getByRole('button', { name: 'Use sample: Approve a valid invoice' }).click();
    await page.locator('.selected-file').waitFor();
    await top(page.locator('#invoice-upload'));
    await caption('04 / START THE WORKFLOW', 'Check the selected file, then click “Start workflow”. Scanned PDFs take longer.', page.getByRole('button', { name: 'Start workflow' }));
    await hold(6);
    await page.getByRole('button', { name: 'Start workflow' }).click();
    await page.getByRole('heading', { name: 'NS-2026-001', exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await caption('05 / READ THE RESULT', '“Ready for approval” means validation passed. A person must still review the invoice.');
    await hold(6);
    await top(page.getByRole('heading', { name: 'Validation & business rules' }));
    await caption('06 / INSPECT THE CHECKS', 'Check the vendor, duplicate history and PO balance. Expand a rule to read its reasoning.');
    await hold(5);
    await page.getByText('Remaining PO balance', { exact: true }).click();
    await top(page.locator('.rule').last());
    await caption('07 / COMPARE THE EVIDENCE', 'Review the extracted values and source excerpts. Use “Original PDF” to check the document.');
    await hold(7);
    await top(page.locator('#human-review'));
    await caption('08 / RECORD YOUR DECISION', 'Add a meaningful note (at least 5 characters). Approve only after checking the evidence.');
    await page.getByLabel('Decision notes').fill('Checked the source invoice, vendor and available PO balance.');
    await page.getByText('Notes complete. Choose a decision below.').waitFor();
    await hold(5);
    await caption('08 / RECORD YOUR DECISION', 'Your signed-in identity and review note are saved in the audit trail. Choose Approve invoice to accept this sample.');
    await hold(5);
    await page.getByRole('button', { name: 'Approve invoice', exact: true }).click();
    await page.getByText(/Approved by a reviewer/).waitFor();
    await page.getByRole('link', { name: 'Purchase orders', exact: true }).click();
    await page.getByRole('cell', { name: '₹40,000.00', exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await caption('09 / VERIFY THE BALANCE', 'This sample uses ₹60,000 of a ₹1,00,000 PO, leaving ₹40,000. Approval does not send payment.');
    await hold(7);
    await page.getByRole('link', { name: 'New invoice', exact: true }).click();
    await top(page.getByRole('region', { name: 'Try the sample walkthrough' }));
    await caption('10 / DOWNLOAD THE TEST PACK', 'Download all five PDFs and test instructions, or choose Use sample. Approve the valid invoice first.');
    await hold(5);
    async function showEdge(title, heading, label, text, rule) {
      await page.getByRole('button', { name: `Use sample: ${title}`, exact: true }).click();
      await page.getByRole('button', { name: 'Start workflow', exact: true }).click();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await top(page.locator('.rule').filter({ hasText: rule }));
      await caption(label, text);
      await hold(7);
      await top(page.locator('#human-review'));
      await page.getByLabel('Decision notes').fill('Please inspect this exception before accepting the invoice.');
      assert(await page.getByRole('button', { name: 'Approve invoice', exact: true }).isDisabled());
    }
    await showEdge('Edge case 1: Duplicate invoice', 'NS-2026-001', '11 / DUPLICATE INVOICE', 'A renamed PDF still has the same vendor and invoice number. The duplicate is blocked and cannot be approved.', 'Duplicate invoice');
    await page.getByRole('link', { name: 'New invoice', exact: true }).click();
    await showEdge('Edge case 2: PO balance exceeded', 'NS-2026-002', '12 / PO BALANCE EXCEEDED', 'Only 40,000 rupees remains after the first approval. This 45,000 rupee invoice exceeds it by 5,000.', 'Remaining PO balance');
    await caption('13 / APPROVAL STAYS UNAVAILABLE', 'Even with a review note, unresolved checks prevent approval. Request a correction or reject the invoice.');
    await hold(6);
    await page.getByRole('link', { name: 'New invoice', exact: true }).click();
    await showEdge('Edge case 3: Missing invoice number', '02-missing-invoice-number.pdf', '14 / MISSING INVOICE NUMBER', 'The required-information check flags the missing invoice number. The system asks for correction instead of guessing.', 'Required information');
    await page.getByLabel('Decision notes').fill('Please provide a corrected invoice with its invoice number.');
    await caption('15 / REQUEST INFORMATION', 'Add a clear note and choose Request information. The decision is recorded without accepting the invoice.');
    await hold(6);
    await page.getByRole('button', { name: 'Request information', exact: true }).click();
    await page.getByText(/Information request saved/).waitFor();
    await top(page.locator('.success-banner'));
    await caption('16 / REVIEW SAVED', 'The information request is saved. The invoice stays pending, and the accepted PO balance does not increase.');
    await hold(5);
    await page.getByRole('link', { name: 'New invoice', exact: true }).click();
    await top(page.locator('.demo-sample').last());
    await caption('YOUR TURN / OCR AND REPEAT TESTS', 'Try the printed scan to explore OCR. Reusing invoice numbers affects results. All samples work without ERPNext.');
    await hold(6);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(scratch, 'chapters.json'), JSON.stringify(chapters, null, 2));
    console.log('Recorded staged tutorial. No live accounts or database writes.');
  } finally {
    await context.close();
    await page.video().saveAs(path.join(output, 'ledgerly-walkthrough.webm'));
    await browser.close();
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
