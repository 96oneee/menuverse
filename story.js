// MENUVERSE cinematic layout: every dish is a full-screen slide; swipe up for the next.
// Uses the same restaurant menu document as the classic layout (app.js).
import { SpinViewer } from './viewer.js';

const params = new URLSearchParams(location.search);
const RESTAURANT = params.get('r') || document.querySelector('meta[name="menuverse:restaurant"]')?.content || 'swiss-butter';
const TABLE = params.get('table');
const ALLERGENS = { gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish', peanuts: 'Peanuts', soy: 'Soy', milk: 'Milk', nuts: 'Tree nuts', celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin', molluscs: 'Molluscs' };

const root = document.getElementById('story');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 11v6M12 7.5v.01"/><circle cx="12" cy="12" r="9.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2z"/><path d="M4 7.2l8 4.4 8-4.4M12 11.6v9.6"/></svg>',
  spin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="13" rx="9" ry="4"/><path d="M16 6.5A9 4 0 0 1 21 9"/><path d="M19.5 4.8l1.6 4.1-4.2.6"/></svg>',
};

let menu, money, slides = [], viewers = new Map();

async function boot() {
  try {
    const res = await fetch(`data/restaurants/${encodeURIComponent(RESTAURANT)}.json`);
    if (!res.ok) throw new Error(res.status);
    menu = await res.json();
  } catch {
    root.innerHTML = '<p style="padding:40vh 20px 0;text-align:center;color:var(--muted)">This menu could not be loaded. Ask a member of staff for help.</p>';
    return;
  }
  const r = menu.restaurant;
  const f = new Intl.NumberFormat(r.locale || 'en-US', { maximumFractionDigits: r.money?.fractionDigits ?? 2, minimumFractionDigits: r.money?.fractionDigits ?? 2 });
  money = (a) => `<small>${esc(r.currency)}</small>${f.format(a / (r.money?.minorUnit ?? 100))}`;
  for (const [k, v] of Object.entries(r.theme?.colors || {})) document.documentElement.style.setProperty(`--${k}`, v);
  document.title = `${r.name} · Menu`;
  menu.categories.sort((a, b) => a.sortOrder - b.sortOrder);
  render();
}

const catOf = (d) => menu.categories.find((c) => c.id === d.categoryId);
const featured = () => menu.categories.filter((c) => c.layout !== 'compact').flatMap((c) => menu.dishes.filter((d) => d.categoryId === c.id));
const compactCats = () => menu.categories.filter((c) => c.layout === 'compact');
const preview = () => menu.restaurant.contentStatus === 'pilot-draft';

function render() {
  const r = menu.restaurant;
  const dishes = featured();
  const [first, ...rest] = r.name.split(' ');
  const tabs = [...new Set(dishes.map((d) => d.categoryId))].map((id) => menu.categories.find((c) => c.id === id));
  const drinksCat = compactCats().find((c) => /drink|wine|bever/i.test(c.name)) ? 'Drinks' : 'More';

  root.innerHTML = `
    <div class="topbar">
      <div class="bars" aria-hidden="true">${dishes.map(() => '<i></i>').join('')}<i></i></div>
      <div class="nav-row">
        <span class="mini-brand">${esc(first)} <em>${esc(rest.join(' '))}</em></span>
        <nav class="tabs" aria-label="Menu sections">
          ${tabs.map((c) => `<button data-go="cat-${c.id}">${esc(c.name)}</button>`).join('')}
          <button data-go="list">${drinksCat}</button>
        </nav>
      </div>
    </div>
    <main class="reel" id="reel" tabindex="-1">
      <section class="slide intro" data-key="intro" aria-label="${esc(r.name)}">
        <div class="media">${r.cover ? `<img src="${esc(dishes.find((d) => d.media?.photo?.tall)?.media.photo.tall || r.cover.src)}" alt="${esc(r.cover.alt)}">` : ''}</div>
        <div class="shade"></div>
        <div class="caption">
          <div class="where"><span class="pill">${esc(r.location || '')}</span>${preview() ? '<span class="pill preview">Pilot preview</span>' : ''}${TABLE ? `<span class="pill">Table ${esc(TABLE)}</span>` : ''}</div>
          <h1>${esc(first)}<em>${esc(rest.join(' '))}</em></h1>
          <p>${esc(r.tagline)}.</p>
          <div class="cue">${icon.up}Swipe up for the menu</div>
        </div>
      </section>
      ${dishes.map((d, i) => slide(d, i, dishes)).join('')}
      ${listSlide()}
    </main>
    <div class="scrim" id="scrim"></div>
    <section class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden></section>`;

  const reel = root.querySelector('#reel');
  slides = [...reel.querySelectorAll('.slide')];
  const bars = [...root.querySelectorAll('.bars i')];
  const tabBtns = [...root.querySelectorAll('.tabs button')];
  const bg = document.querySelector('.backdrop-blur');

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.intersectionRatio < 0.6) return;
      const s = en.target;
      slides.forEach((x) => x.classList.toggle('is-active', x === s));
      const idx = slides.indexOf(s) - 1; // intro has no bar
      bars.forEach((b, i) => { b.classList.toggle('seen', i < idx); b.classList.toggle('now', i === idx); });
      const cat = s.dataset.cat;
      tabBtns.forEach((t) => t.setAttribute('aria-current', String(t.dataset.go === (s.dataset.key === 'list' ? 'list' : `cat-${cat}`))));
      const img = s.querySelector('.media img');
      if (bg && img) bg.style.backgroundImage = `url("${img.getAttribute('src')}")`;
      if (s.dataset.spin && !viewers.has(s.dataset.key)) mountSpin(s);
      if (s.dataset.key && s.dataset.key !== 'intro' && s.dataset.key !== 'list') history.replaceState(null, '', `#dish-${s.dataset.key}`);
      else history.replaceState(null, '', location.pathname + location.search);
    });
  }, { root: reel, threshold: [0.6] });
  slides.forEach((s) => io.observe(s));

  tabBtns.forEach((b) => b.addEventListener('click', () => {
    const target = b.dataset.go === 'list' ? reel.querySelector('[data-key="list"]') : reel.querySelector(`[data-cat="${b.dataset.go.slice(4)}"]`);
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  reel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-details]'); if (b) openSheet(b.dataset.details);
    const a = e.target.closest('[data-ar]'); if (a) openAR(a.dataset.ar);
  });
  root.querySelector('#scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') && !root.querySelector('.sheet.open')) {
      const cur = slides.findIndex((s) => s.classList.contains('is-active'));
      const next = slides[Math.max(0, Math.min(slides.length - 1, cur + (/Down/.test(e.key) ? 1 : -1)))];
      next?.scrollIntoView({ behavior: 'smooth' }); e.preventDefault();
    }
  });

  const m = location.hash.match(/^#dish-([a-z0-9-]+)$/);
  if (m) reel.querySelector(`[data-key="${m[1]}"]`)?.scrollIntoView();
}

function slide(d, i, all) {
  const cat = catOf(d);
  const inCat = all.filter((x) => x.categoryId === d.categoryId);
  const n = inCat.indexOf(d) + 1;
  const photo = d.media?.photo;
  const spin = d.media?.spin;
  const choices = d.options?.[0]?.choices || [];
  const media = spin
    ? `<div class="media" style="background:radial-gradient(70% 45% at 50% 34%, #3d3326, var(--bg) 70%)"></div><div class="spin-wrap" data-mount></div>`
    : photo
      ? photo.fit === 'card'
        ? `<div class="media blur"><img src="${esc(photo.hero)}" alt="" ${i > 1 ? 'loading="lazy"' : ''}></div><figure class="card-photo"><img src="${esc(photo.hero)}" alt="${esc(photo.alt || d.name)}" ${i > 1 ? 'loading="lazy"' : ''}></figure>`
        : `<div class="media"><img src="${esc(photo.tall || photo.hero)}" alt="${esc(photo.alt || d.name)}" ${i > 1 ? 'loading="lazy"' : ''}></div>`
      : `<div class="media"></div><div class="ghost"><div><b>${esc(d.name)}</b>Photo coming soon</div></div>`;
  return `<section class="slide ${photo || spin ? '' : 'typo'}" data-key="${d.id}" data-cat="${d.categoryId}" ${spin ? 'data-spin="1"' : ''} aria-label="${esc(d.name)}">
    ${media}
    <div class="shade"></div>
    <div class="rail">
      ${(d.badges || []).map((b) => `<span class="chip-glass sig">${esc(b)}</span>`).join('')}
      ${spin ? `<span class="chip-glass">${icon.spin}Drag to turn</span>` : photo?.spinPlanned ? `<span class="chip-glass">${icon.spin}360° soon</span>` : ''}
    </div>
    <div class="caption">
      <span class="kicker">${esc(cat?.name)} · ${String(n).padStart(2, '0')} / ${String(inCat.length).padStart(2, '0')}</span>
      <h2>${esc(d.name)}</h2>
      ${d.summary ? `<p>${esc(d.summary)}</p>` : ''}
      ${choices.length ? `<div class="choices">${choices.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="buy">
        <span class="price">${money(d.price.amount)}</span>
        <span class="btns">${d.media?.model ? `<button class="btn ghost-btn" data-ar="${d.id}">${icon.cube}See it in 3D</button>` : ''}<button class="btn" data-details="${d.id}">${icon.info}Details</button></span>
      </div>
    </div>
  </section>`;
}

function listSlide() {
  const r = menu.restaurant;
  const groups = compactCats().map((c) => {
    const items = menu.dishes.filter((d) => d.categoryId === c.id);
    return `<div class="group"><h3>${esc(c.name)}</h3><ul class="rows">${items.map((d) => `<li><span class="n">${esc(d.name)}${d.summary ? `<small>${esc(d.summary)}</small>` : ''}</span><span class="lead" aria-hidden="true"></span><span class="p">${money(d.price.amount)}</span></li>`).join('')}</ul></div>`;
  }).join('');
  return `<section class="slide list-slide" data-key="list" aria-label="Drinks and add-ons">
    <div class="inner">
      <h2>Drinks <em>&amp; more</em></h2>
      ${groups}
      <div class="fine">
        ${r.priceNote ? `<p>${esc(r.priceNote)}</p>` : ''}
        ${r.notice ? `<p><b>${preview() ? 'Pilot preview.' : ''}</b> ${esc(r.notice)}</p>` : ''}
        <p>Menu by MENUVERSE</p>
      </div>
    </div>
  </section>`;
}

function mountSpin(s) {
  const d = menu.dishes.find((x) => x.id === s.dataset.key);
  const sp = d.media.spin;
  const frames = Array.from({ length: sp.frames }, (_, i) => `${sp.path}/${String(i).padStart(2, '0')}.webp`);
  viewers.set(d.id, new SpinViewer(s.querySelector('[data-mount]'), { frames, poster: `${sp.path}/thumb.webp`, label: d.name }));
}

let lastFocus = null;
function openSheet(id) {
  const d = menu.dishes.find((x) => x.id === id);
  if (!d) return;
  const sheet = root.querySelector('#sheet');
  const addOns = (d.addOns || []).map((a) => menu.dishes.find((x) => x.id === a)).filter(Boolean);
  sheet.innerHTML = `
    <div class="grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="sheet-title">${esc(d.name)}</h2><button class="x" id="close" aria-label="Close details">${icon.x}</button></div>
    <div class="price" style="margin-top:8px">${money(d.price.amount)}</div>
    ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ''}
    ${(d.options || []).map((o) => `<div class="sec"><h3>${esc(o.label)}</h3><ul class="chips">${o.choices.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}
    ${d.servedWith?.length ? `<div class="sec"><h3>Served with</h3><ul class="chips">${d.servedWith.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
    ${addOns.length ? `<div class="sec"><h3>Add on</h3><ul class="addons">${addOns.map((x) => `<li><span>${esc(x.name)}</span><span>+ ${money(x.price.amount)}</span></li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h3>Allergens</h3>${d.allergens == null ? '<p class="tbc">Not listed yet. Please ask your server.</p>' : d.allergens.length ? `<ul class="chips">${d.allergens.map((a) => `<li>${esc(ALLERGENS[a] || a)}</li>`).join('')}</ul>` : '<p class="tbc" style="color:var(--muted)">None of the 14 major allergens.</p>'}</div>
    <p class="legal">${preview() ? `<b>Pilot preview.</b> ${d.descriptionStatus === 'draft' ? 'Description drafted from the restaurant photo, still to be confirmed. ' : ''}Name and price from the menu board. ` : ''}Please tell your server about any allergy.</p>`;
  sheet.hidden = false;
  lastFocus = document.activeElement;
  requestAnimationFrame(() => { sheet.classList.add('open'); root.querySelector('#scrim').classList.add('open'); sheet.querySelector('#close').focus(); });
  sheet.querySelector('#close').addEventListener('click', closeSheet);
}
function closeSheet() {
  const sheet = root.querySelector('#sheet');
  if (!sheet?.classList.contains('open')) return;
  sheet.classList.remove('open'); root.querySelector('#scrim').classList.remove('open');
  setTimeout(() => { sheet.hidden = true; }, 380);
  lastFocus?.focus?.();
}

// ---------- 3D / AR: place the dish on the customer's table through the camera ----------
let mvLoaded;
async function openAR(id) {
  const d = menu.dishes.find((x) => x.id === id);
  const m = d?.media?.model; if (!m) return;
  mvLoaded ||= import('./vendor-model-viewer.min.js');
  const wrap = document.createElement('div');
  wrap.className = 'ar-layer';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', `${d.name} in 3D`);
  wrap.innerHTML = `
    <model-viewer id="mv" ios-src="${esc(m.usdz)}" alt="3D model of ${esc(d.name)}"
      ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"
      camera-controls touch-action="pan-y" auto-rotate auto-rotate-delay="0" rotation-per-second="18deg"
      camera-orbit="25deg 60deg 0.6m" min-camera-orbit="auto 20deg auto" max-camera-orbit="auto 85deg auto"
      shadow-intensity="1.1" shadow-softness="0.8" exposure="0.9" environment-image="neutral" interaction-prompt="none">
      <button slot="ar-button" class="btn ar-go">${icon.cube}Place it on my table</button>
      <div class="ar-loading" slot="progress-bar"></div>
    </model-viewer>
    <div class="ar-top">
      <div><span class="kicker">In 3D</span><h2>${esc(d.name)}</h2></div>
      <button class="x" id="ar-close" aria-label="Close 3D view">${icon.x}</button>
    </div>
    <p class="ar-help" id="ar-help">Drag to turn it, pinch to zoom.</p>
    ${m.isStandIn ? `<p class="ar-note">${esc(m.note)}</p>` : ''}`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 300); };
  wrap.querySelector('#ar-close').addEventListener('click', close);
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  await mvLoaded;
  const mv = wrap.querySelector('#mv');
  mv.src = await resolveModel(m.glb);
  await customElements.whenDefined('model-viewer');
  if (!mv.canActivateAR) wrap.querySelector('#ar-help').textContent = 'Drag to turn it, pinch to zoom. Open this menu on a phone to place the dish on your table.';
}

// Hosts that cannot serve .glb files get the model as a JS module (<file>.glb.js) instead.
async function resolveModel(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return url; } catch {}
  const b64 = (await import(`./${url}.js`)).default;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bin], { type: 'model/gltf-binary' }));
}

boot();
