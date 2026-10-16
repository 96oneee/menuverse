import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here=path.dirname(new URL(import.meta.url).pathname); const [out,name,img,w]=process.argv.slice(2);
const server=http.createServer((q,s)=>{const p=path.join(here,q.url.split('?')[0]);fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end();return;}s.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'text/html'});s.end(d);});}).listen(0);
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}); const p=await b.newPage();
p.on('pageerror',e=>console.log('ERR',e.message)); p.on('console',m=>console.log('[c]',m.text()));
await p.goto(`http://localhost:${server.address().port}/photo.html`); await p.waitForFunction(()=>window.ready,null,{timeout:30000});
const r=await p.evaluate(([i,w])=>window.exportPhoto(i,w),[img,+w]);
fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(`${out}/${name}.glb`,Buffer.from(r.glb,'base64')); fs.writeFileSync(`${out}/${name}.usdz`,Buffer.from(r.usdz,'base64'));
console.log('ok depth', r.h); await b.close(); server.close();
