// Smoke test for the MENUVERSE demo: phone + desktop screenshots and a drag test.
// Usage: node tools/test-demo.mjs <appDir> <outDir>
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [appDir = 'app', outDir = 'screens'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = path.join(appDir, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const errors = [];
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

// ---- phone
const phone = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
const page = await phone.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base + '?table=12');
await page.waitForSelector('.dish-card');
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/1-menu.png` });
check('menu lists dishes', (await page.locator('.dish-card').count()) === 8);
check('sample label shown', await page.locator('.sample-pill').first().isVisible());
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('no horizontal scroll (menu)', !overflow);
await page.locator('.catnav a', { hasText: 'Desserts' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/2-menu-desserts.png` });

await page.goto(base + '?table=12');
await page.waitForSelector('.dish-card');
await page.locator('.dish-card[data-dish="steak-frites"]').click();
await page.waitForSelector('.spin-canvas');
await page.waitForFunction(() => document.querySelector('.loadbar')?.classList.contains('done'), null, { timeout: 20000 });
await page.waitForTimeout(3000); // let the intro half-turn finish
await page.screenshot({ path: `${outDir}/3-dish.png` });
const deg0 = await page.textContent('#deg');
const before = await page.locator('.spin-canvas').screenshot();
// touch-like drag across the plate
const box = await page.locator('.spin-canvas').boundingBox();
const y = box.y + box.height / 2;
await page.mouse.move(box.x + box.width * 0.8, y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + box.width * (0.8 - 0.05 * i), y + i * 0.5); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForTimeout(1200);
const deg1 = await page.textContent('#deg');
const after = await page.locator('.spin-canvas').screenshot();
check('drag rotates the dish', deg0 !== deg1 && !before.equals(after), `(${deg0} -> ${deg1})`);
check('hint hides after drag', await page.locator('#hint.gone').count() === 1);
await page.screenshot({ path: `${outDir}/4-dish-rotated.png` });
await page.keyboard.press('ArrowRight');
await page.mouse.wheel(0, 700);
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/5-dish-details.png` });
check('no horizontal scroll (dish)', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
await page.click('#back');
await page.waitForSelector('.dish-card');
check('back returns to menu', true);
await page.locator('.dish-card[data-dish="lemonade"]').click();
await page.waitForSelector('.info h1'); await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/6-drink-no-photo.png` });

// ---- light theme phone
const light = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'light' });
const lp = await light.newPage();
await lp.goto(base + '#dish-chocolate-dome');
await lp.waitForFunction(() => document.querySelector('.loadbar')?.classList.contains('done'), null, { timeout: 20000 });
await lp.waitForTimeout(3000);
await lp.screenshot({ path: `${outDir}/7-dish-light.png` });

// ---- desktop
const desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const dp = await desk.newPage();
dp.on('pageerror', (e) => errors.push(e.message));
await dp.goto(base);
await dp.waitForSelector('.dish-card');
await dp.waitForTimeout(600);
await dp.screenshot({ path: `${outDir}/8-desktop-menu.png` });

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.close();
