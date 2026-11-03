const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const base = process.env.AUTH_TEST_URL || 'http://127.0.0.1:5176';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('heading', { name: 'Welcome to Ledgerly' }).waitFor();
    await page.locator('.auth-tour > summary').click();
    const video = page.locator('video');
    assert.equal(await video.getAttribute('preload'), 'none');
    assert.equal(await video.getAttribute('autoplay'), null);
    const metadata = await video.evaluate(async v => {
      v.load();
      await new Promise((resolve, reject) => { v.onloadedmetadata = resolve; v.onerror = () => reject(new Error('Video metadata failed')); });
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
    });
    console.log(JSON.stringify(metadata));
    assert(metadata.duration > 60 && metadata.duration < 100);
    assert.equal(metadata.width, 1280); assert.equal(metadata.height, 960);
    await video.evaluate(v => v.play());
    await page.waitForTimeout(700);
    assert(await video.evaluate(v => v.currentTime > 0 && !v.paused));
    await video.evaluate(v => v.pause());
    fs.mkdirSync(path.join(root, 'tmp/tutorial/frames'), { recursive: true });
    // Export frames from the encoded video, not the original source UI.
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.evaluate(() => {
      const v = document.querySelector('video'); document.body.replaceChildren(v);
      document.documentElement.style.cssText = 'margin:0;padding:0;background:#11171f';
      document.body.style.cssText = 'margin:0;padding:0';
      v.style.cssText = 'display:block;width:1280px;height:960px;max-width:none;border:0;border-radius:0'; v.controls = false;
    });
    for (const second of [5, 12, 18, 25, 31, 37, 43, 53, 58, 64, 71]) {
      await video.evaluate(async (v, t) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { v.removeEventListener('seeked', done); reject(new Error(`Seeking to ${t}s timed out (readyState ${v.readyState}, networkState ${v.networkState})`)); }, 20000);
          function done() { clearTimeout(timeout); resolve(); }
          v.addEventListener('seeked', done, { once: true });
          v.currentTime = t;
        });
      }, second);
      await page.screenshot({ path: path.join(root, `tmp/tutorial/frames/${second}.jpg`) });
    }
    await page.goto(base); await page.locator('.auth-tour > summary').click();
    await page.getByText('Read the walkthrough steps', { exact: true }).click();
    assert.equal(await page.locator('.walkthrough-transcript li').count(), 7);
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('button', { name: `${theme} theme`, exact: true }).click();
      await page.locator('.walkthrough-video').screenshot({ path: path.join(root, `tmp/tutorial/player-${theme.toLowerCase()}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.walkthrough-video').screenshot({ path: path.join(root, 'tmp/tutorial/player-mobile.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: anonymous access, no autoplay, video metadata, playback, seeking, transcript, themes and mobile overflow.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
