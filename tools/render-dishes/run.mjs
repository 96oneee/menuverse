// Usage: node run.mjs <outDir> [frames] [dish,dish...] [--preview]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir = './out', framesArg = '36', dishArg = 'burger,spaghetti,salmon,chocolateDome,burrata'] = process.argv.slice(2);
const preview = process.argv.includes('--preview');
const N = +framesArg;
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(here, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[err]', e.message));
await page.goto(`http://localhost:${port}/render.html`);
await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
const slug = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
for (const dish of dishArg.split(',')) {
  await page.evaluate(d => window.loadDish(d), dish);
  const dir = path.join(outDir, slug(dish));
  fs.mkdirSync(dir, { recursive: true });
  const frames = preview ? [0, Math.round(N / 4)] : [...Array(N).keys()];
  for (const i of frames) {
    const url = await page.evaluate(([i, n]) => window.renderFrame(i, n), [i, N]);
    fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.webp`), Buffer.from(url.split(',')[1], 'base64'));
  }
  const thumb = await page.evaluate(([n]) => window.renderFrame(0, n, 0.82, 420), [N]);
  fs.writeFileSync(path.join(dir, 'thumb.webp'), Buffer.from(thumb.split(',')[1], 'base64'));
  console.log('rendered', dish, frames.length);
}
await browser.close(); server.close();
