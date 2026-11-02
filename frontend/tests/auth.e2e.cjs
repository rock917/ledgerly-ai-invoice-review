const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.chdir(path.resolve(__dirname,'../..'));
const base=process.env.AUTH_TEST_URL || 'http://127.0.0.1:5176';
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const user={id:'10000000-0000-4000-8000-000000000001',email:'alice@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),user_metadata:{full_name:'Alice Tester'},app_metadata:{provider:'email'},created_at:new Date().toISOString()};
const jwt='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.mock';
const session={access_token:jwt,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
let loginFail=true,signup=false,recovery=false,passwordUpdated=false,reviewBody,approved=false,apiCalls=0,uploads=0,uploadBody;
await page.route('https://auth.example.test/**',async r=>{
 const u=new URL(r.request().url());const body=r.request().postDataJSON();
 if(u.pathname.endsWith('/signup')){signup=true;assert.equal(body.data.full_name,'Alice Tester');assert(u.searchParams.get('redirect_to').endsWith('/auth/callback'));return r.fulfill({json:{user,session:null}})}
 if(u.pathname.endsWith('/recover')){recovery=true;assert(u.searchParams.get('redirect_to').endsWith('/auth/reset'));return r.fulfill({json:{}})}
 if(u.pathname.endsWith('/token')){if(loginFail)return r.fulfill({status:400,json:{error_code:'invalid_credentials',msg:'Invalid login credentials'}});return r.fulfill({json:session})}
 if(u.pathname.endsWith('/user')){if(r.request().method()==='PUT'){passwordUpdated=true;assert(body.password.length>=12)}return r.fulfill({json:user})}
 if(u.pathname.endsWith('/logout'))return r.fulfill({status:204});
 return r.fulfill({json:{}});
});
await page.route('**/health',r=>r.fulfill({json:{configured:true,status:'ok'}}));
await page.route('**/api/**',async r=>{
 apiCalls++;assert.equal(r.request().headers().authorization,'Bearer '+jwt);
 const path=new URL(r.request().url()).pathname;let data;
 if(path==='/api/me')data={id:user.id,display_name:'Alice Tester',email:user.email,daily_upload_limit:10};
 else if(path==='/api/dashboard')data={metrics:{total:0,approved:0,pending_reviews:0,failed:0},recent:[]};
 else if(path==='/api/executions' && r.request().method()==='POST'){uploads++;uploadBody=r.request().postDataBuffer();data={id:'ready'}}
 else if(path.endsWith('/reviews')){reviewBody=r.request().postDataJSON();approved=true;data={review_status:'approved'}}
 else if(path==='/api/executions/ready')data={id:'ready',filename:'test.pdf',invoice_number:'TEST-1',vendor_name:'Northstar Office Supplies',total:10000,currency:'INR',status:'completed',outcome:'ready',review_status:approved?'approved':'pending',created_at:'2026-11-01T00:00:00Z',duration_ms:1000,stages:[],reviews:[],decision:{summary:'All checks passed.',rules:[]},policy_version:'1.0'};
 else data=[];
 await r.fulfill({json:data});
});
await page.goto(base);await page.getByRole('heading',{name:'Welcome to Ledgerly'}).waitFor();assert.equal(apiCalls,0);
fs.mkdirSync('tmp/browser',{recursive:true});await page.screenshot({path:'tmp/browser/auth-light.png',fullPage:true,animations:'disabled'});
await page.getByRole('button',{name:'Dark theme',exact:true}).click();await page.screenshot({path:'tmp/browser/auth-dark.png',fullPage:true,animations:'disabled'});await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
await page.getByRole('button',{name:'New here? Create an account'}).click();await page.getByLabel('Full name').fill('Alice Tester');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-only');await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByText(/Check your inbox/).waitFor();assert(signup);assert.equal(apiCalls,0);
await page.getByRole('button',{name:'Back to sign in'}).click();await page.getByLabel('Password',{exact:true}).fill('test-password-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('alert').waitFor();
await page.getByRole('button',{name:'Forgot password?'}).click();await page.getByRole('button',{name:'Send reset link'}).click();await page.getByText(/If an account exists/).waitFor();assert(recovery);
await page.getByRole('button',{name:'Back to sign in'}).click();loginFail=false;await page.getByLabel('Password',{exact:true}).fill('test-password-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Your invoice workspace.'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Your invoice workspace.'}).waitFor();
await page.getByRole('link',{name:'Open sample walkthrough'}).click();
const guide=page.getByRole('region',{name:'Try the sample walkthrough'});
await guide.waitFor();
const downloads=guide.getByRole('link',{name:/Download PDF:/});assert.equal(await downloads.count(),5);
for(const link of await downloads.all()){
 const href=await link.getAttribute('href');const filename=await link.getAttribute('download');
 const response=await page.request.get(base+href);assert.equal(response.status(),200);
 assert.deepEqual(await response.body(),fs.readFileSync(path.join('sample_data',filename)));
}
await guide.screenshot({path:'tmp/browser/sample-guide-dark.png'});
await page.getByRole('button',{name:'Light theme',exact:true}).click();
await guide.screenshot({path:'tmp/browser/sample-guide-light.png'});
await page.setViewportSize({width:390,height:844});await guide.scrollIntoViewIfNeeded();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await guide.screenshot({path:'tmp/browser/sample-guide-mobile.png'});
const sampleButtons=guide.getByRole('button',{name:/Use sample:/});
for(let i=0;i<await sampleButtons.count();i++){
 await sampleButtons.nth(i).click();
 const filename=await downloads.nth(i).getAttribute('download');
 await page.locator('.selected-file').getByText(filename,{exact:true}).waitFor();
 assert.equal(uploads,0,'Selecting a sample must never submit it');
}
await page.getByRole('button',{name:'Remove selected file'}).click();
const badSample='**/assets/samples/01-valid-partial-invoice.pdf';
await page.route(badSample,r=>r.fulfill({status:200,contentType:'text/html',body:'<html>Missing sample</html>'}));
await sampleButtons.first().click();await page.getByText(/did not return a PDF/).waitFor();
assert(await page.getByRole('button',{name:'Start workflow'}).isDisabled());assert.equal(uploads,0);
await page.unroute(badSample);
await sampleButtons.first().click();await page.locator('.selected-file').getByText('01-valid-partial-invoice.pdf',{exact:true}).waitFor();
await page.getByRole('button',{name:'Start workflow'}).click();await page.waitForURL('**/runs/ready');
assert.equal(uploads,1);assert(uploadBody.includes(fs.readFileSync('sample_data/01-valid-partial-invoice.pdf')));
await page.setViewportSize({width:1440,height:1000});
await page.getByLabel('Decision notes').fill('Good');assert(await page.getByRole('button',{name:'Approve invoice'}).isDisabled());await page.getByLabel('Decision notes').fill('Checked sample invoice and PO.');await page.getByRole('button',{name:'Approve invoice'}).click();await page.getByText(/Approved by a reviewer/).waitFor();assert.deepEqual(Object.keys(reviewBody).sort(),['action','comment']);assert.equal(await page.getByLabel('Reviewer access code').count(),0);
await page.goto(base+'/auth/reset');await page.getByRole('heading',{name:'Choose a new password'}).waitFor();await page.getByLabel('New password',{exact:true}).fill('new-test-password-only');await page.getByRole('button',{name:'Update password'}).click();await page.getByRole('heading',{name:'Your invoice workspace.'}).waitFor();assert(passwordUpdated);
await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Welcome to Ledgerly'}).waitFor();assert.equal(await page.getByText('Alice Tester',{exact:true}).count(),0);await page.reload();await page.getByRole('heading',{name:'Welcome to Ledgerly'}).waitFor();
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Light theme',exact:true}).click();await page.screenshot({path:'tmp/browser/auth-mobile.png',fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.getByRole('button',{name:'Continue with Google'}).click();
await page.waitForURL('https://auth.example.test/auth/v1/authorize**');
const oauth=new URL(page.url());assert.equal(oauth.searchParams.get('provider'),'google');assert.equal(oauth.searchParams.get('code_challenge_method'),'s256');assert.equal(oauth.searchParams.get('redirect_to'),base+'/auth/callback');
assert.deepEqual(errors,[]);
const result={status:'passed',mode:'mock Auth/API; real local sample assets; no live accounts, emails, or database writes',checks:['unauthenticated access gate','email signup confirmation','invalid credentials','password recovery request and update','email login and session persistence','session-authenticated review without access codes','logout removes workspace and persists','light/dark themes','mobile overflow','Google OAuth redirect and PKCE parameters','empty workspace sample walkthrough link','five sample downloads match original PDFs','sample selection makes no upload requests','invalid PDF response handled without submission','explicit workflow submission includes selected PDF bytes','sample guide desktop/mobile and both themes'],limitations:['Google OAuth consent and external email delivery require provider setup and live verification','sample upload request intercepted; no new live workflow executed by this check']};
fs.writeFileSync('docs/auth-ui-check-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
