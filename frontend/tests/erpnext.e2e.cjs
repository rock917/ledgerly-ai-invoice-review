const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.ERP_TEST_URL || 'http://127.0.0.1:5177';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const user = { id: '10000000-0000-4000-8000-000000000001', email: 'erp@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), user_metadata: { full_name: 'ERP tester' }, app_metadata: { provider: 'email' } };
    const jwt = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.mock';
    const session = { access_token: jwt, refresh_token: 'fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
    await page.addInitScript(session => localStorage.setItem('sb-auth-auth-token', JSON.stringify(session)), session);
    let imported = false, approved = false, exported = false, writes = 0;
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname === '/health') return route.fulfill({ json: { configured: true, status: 'ok' } });
      if (url.pathname.startsWith('/auth/v1')) return route.fulfill({ json: user });
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === base) return route.continue();
        return route.abort();
      }
      assert.equal(req.headers().authorization, 'Bearer '+jwt);
      let data = [];
      if (url.pathname === '/api/me') data = { id: user.id, display_name: 'ERP tester' };
      else if (url.pathname === '/api/erpnext') data = { enabled: true };
      else if (url.pathname === '/api/erpnext/purchase-orders') { assert.equal(req.postDataJSON().reference, 'PO-ERP-1'); imported = true; data = { reference: 'PO-ERP-1' }; }
      else if (url.pathname === '/api/purchase-orders') data = imported ? [{ id:'po', reference:'PO-ERP-1', vendor:{name:'ERP supplier'}, currency:'INR', amount:100000, accepted_amount:0, status:'open', erp_snapshot:{} }] : [];
      else if (url.pathname.endsWith('/erpnext')) {
        if (req.method() === 'POST') { assert(approved); writes++; if (writes === 1) return route.fulfill({status:502,json:{error:{message:'ERP unavailable; retry reconciles existing draft.'}}}); exported = true; }
        data = { enabled:true, export: exported ? {status:'synced',erp_document_id:'PINV-TEST-1'} : null };
      } else if (url.pathname === '/api/executions/test') data = { id:'test',filename:'test.pdf',invoice_number:'ERP-INV-1',vendor_name:'ERP supplier',total:10000,currency:'INR',status:'completed',outcome:'ready',review_status:approved?'approved':'pending',created_at:'2026-11-03T00:00:00Z',duration_ms:1000,stages:[],reviews:[],decision:{summary:'Checks passed',rules:[]},policy_version:'1.0' };
      await route.fulfill({json:data});
    });
    await page.goto(base+'/purchase-orders');
    await page.getByRole('heading',{name:'Import from ERPNext'}).waitFor();
    await page.getByLabel('ERPNext purchase order reference').fill('PO-ERP-1');
    await page.getByRole('button',{name:'Import purchase order',exact:true}).click();
    await page.getByText('PO-ERP-1',{exact:true}).waitFor(); assert(imported);
    await page.goto(base+'/runs/test');
    await page.getByRole('heading',{name:'ERPNext draft export'}).waitFor();
    assert(await page.getByRole('button',{name:'Export draft to ERPNext'}).isDisabled());
    approved = true; await page.reload();
    await page.getByRole('button',{name:'Export draft to ERPNext'}).click();
    await page.getByText('ERP unavailable; retry reconciles existing draft.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Export draft to ERPNext'}).click();
    await page.getByText('PINV-TEST-1',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Export draft to ERPNext'}).count(),0);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('heading',{name:'ERPNext draft export'}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    fs.mkdirSync('../tmp/browser',{recursive:true});
    await page.screenshot({path:'../tmp/browser/erp-export-mobile.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS: mocked ERP import, approval gate, failed export, explicit retry, confirmed document ID and mobile layout. No live writes.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
