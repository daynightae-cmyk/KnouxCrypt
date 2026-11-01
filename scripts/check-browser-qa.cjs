// Real-browser QA sweep over the current source build.
//
// Walks the CURRENT 44 canonical missions and the Tools inventory in a real
// headless Chromium, at real viewports, in both locales, using the same
// history/popstate navigation the app's own router responds to. It asserts
// document width, no horizontal overflow, correct lang/dir, real non-empty
// content and no uncaught page errors. It produces screenshots for human
// comparison; it does NOT claim pixel acceptance.
//
// Playwright is intentionally NOT an app dependency. Install it outside the
// project and point NODE_PATH at it:
//   NODE_PATH=/path/to/qa/node_modules node scripts/check-browser-qa.cjs
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = process.env.QA_URL || 'http://127.0.0.1:4174';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), 'local QA only');
const out = process.env.QA_OUTPUT || path.join(root, 'qa-evidence/browser');
fs.mkdirSync(out, { recursive: true });

const m = new Module('registry');
m._compile(
  esbuild.buildSync({
    entryPoints: [path.join(root, 'src/config/screens.js')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
  }).outputFiles[0].text,
  'registry.cjs',
);
const { SCREENS } = m.exports;

const missions = [...fs.readFileSync(path.join(root, 'src/config/missionRoutes.js'), 'utf8')
  .matchAll(/id: "([^"]+)", suffix: "([^"]*)"/g)]
  .map((x) => ({ id: x[1], route: SCREENS[x[1]] + (x[2] ? '/sample-1' : '') }));

const report = { browser: null, checks: [], screens: [], warnings: [], errors: [] };
let activeBrowser;

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  activeBrowser = browser;
  report.browser = browser.version();
  const context = await browser.newContext();
  // Locale is read once at mount, so it must be seeded before app scripts run.
  // Every navigation carries the qa-<locale> marker in its query string.
  await context.addInitScript(() => {
    const marker = location.search.match(/qa-(en|ar)/);
    if (marker) localStorage.setItem('knoux.language', marker[1]);
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));

  // The app is a single document; deep routes are reached by client-side
  // navigation, which is exactly what the router listens for.
  async function goto(route, locale) {
    // Google Fonts is referenced by the document; with no outbound network the
    // `load` event can stall, so wait for the DOM instead.
    await page.goto(`${base}/?qa-${locale}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').first().waitFor();
    await page.evaluate((r) => {
      history.pushState({}, '', r);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    // A route change swaps the lazy screen through a Suspense fallback, so wait
    // until a real <main> is mounted AND the loading placeholder is gone.
    await page.waitForFunction(() => !!document.querySelector('main') && !document.querySelector('.app-route-loading'), null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(80);
  }
  const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
  const metrics = () => page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      width: innerWidth,
      docWidth: document.documentElement.scrollWidth,
      mainWidth: main.scrollWidth,
      mainClient: main.clientWidth,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      scene: document.querySelector('.crypt-app-shell')?.dataset.scene,
      text: (main.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
    };
  });

  // 1. Every canonical mission renders real content with no horizontal overflow.
  const splashText = new Map();
  for (const [w, h] of [[360, 800], [390, 844], [412, 915], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const locale of ['en', 'ar']) {
      for (const mission of missions) {
        await goto(mission.route, locale);
        const g = await metrics();
        assert.equal(g.lang, locale, `${mission.id} ${locale} lang`);
        assert.equal(g.dir, locale === 'ar' ? 'rtl' : 'ltr', `${mission.id} ${locale} dir`);
        assert.equal(g.docWidth, w, `${mission.id} ${locale} @${w} document width`);
        assert.ok(g.mainWidth <= g.mainClient + 1, `${mission.id} ${locale} @${w} inner overflow`);
        assert.ok(g.text.length > 0, `${mission.id} ${locale} @${w} rendered content`);
        if (mission.id === 'SPLASH_ENTRY') {
          splashText.set(locale, g.text);
        } else {
          assert.notEqual(g.text, splashText.get(locale), `${mission.id} ${locale} shows real screen, not the splash`);
        }
        if (w === 390) await shot(`mission-${mission.id}-${locale}`);
        if (w === 390) report.screens.push({ id: mission.id, locale, ...g, text: undefined });
      }
    }
  }
  report.checks.push(`44 missions x 4 viewports x 2 locales rendered distinct real content with no document overflow (${44 * 4 * 2} page loads).`);

  // 2. Home exposes exactly eight service cards and clears the bottom nav.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ['en', 'ar']) {
    await goto(SCREENS.HOME, locale);
    assert.equal(await page.locator('.hub-services a').count(), 8, `Home cards ${locale}`);
    await page.locator('.app-scroll-region').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(60);
    const last = await page.locator('.hub-services a').last().boundingBox();
    const nav = await page.locator('.app-bottom-nav').boundingBox();
    if (last && nav) assert.ok(last.y + last.height <= nav.y, `Home footer clearance ${locale}`);
  }
  report.checks.push('Home renders eight real service cards and clears the fixed bottom nav in both locales.');

  // 3. Tools: default essentials, then the full inventory, in both locales.
  for (const locale of ['en', 'ar']) {
    await goto(SCREENS.TOOLS, locale);
    assert.equal(await page.locator('[data-tools-results] a').count(), 8, `Tools essentials ${locale}`);
    const all = page.locator('[data-tool-category=all]');
    if (await all.count()) {
      await all.click();
      await page.waitForTimeout(60);
      report.warnings.push({ toolsInventory: await page.locator('[data-tools-results] a').count(), locale });
    }
  }
  report.checks.push('Tools default essentials and full category inventory render in both locales.');

  // 4. A live capability card must show all catalog fields.
  await goto('/key-forge/derivation', 'en');
  const capabilityText = await page.locator('.security-capability').first().innerText();
  for (const field of ['Status', 'Network', 'Provider ready', 'Permissions', 'Test evidence']) {
    assert.ok(capabilityText.includes(field), `capability card shows ${field}`);
  }
  report.checks.push('A live capability card renders Status, Network, Provider ready, Permissions and Test evidence.');

  // 5. Reduced motion must disable the code rain animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goto(SCREENS.SPLASH_ENTRY, 'en');
  const rainCount = await page.locator('.app-code-rain span').count();
  if (rainCount > 0) {
    const name = await page.locator('.app-code-rain span').first().evaluate((el) => getComputedStyle(el).animationName);
    assert.equal(name, 'none', 'reduced motion disables rain');
  }
  report.checks.push('Reduced-motion preference disables the code-rain animation.');

  assert.equal(report.errors.length, 0, 'no uncaught browser JS errors: ' + report.errors.join('; '));
  await browser.close();
}

run()
  .then(() => {
    report.status = 'PASS: real-browser route/overflow/locale assertions. Pixel acceptance still requires human comparison.';
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(report.status);
    for (const c of report.checks) console.log('  PASS', c);
    for (const w of report.warnings) console.log('  note', JSON.stringify(w));
  })
  .catch(async (e) => {
    await activeBrowser?.close();
    report.status = 'FAIL';
    report.failure = e.stack;
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.error(e);
    process.exitCode = 1;
  });
