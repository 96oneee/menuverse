// MENUVERSE customer app.
// Loads one restaurant's menu document and renders two views:
//   menu  (#)           -> categories and dish list
//   dish  (#dish-<id>)  -> 360° viewer (or photo) and dish details
// Hash tokens are used so the menu works on any static host.
// Each restaurant brings its own theme (colours, fonts) in its menu document.
import { SpinViewer } from './viewer.js';

const params = new URLSearchParams(location.search);
const RESTAURANT = params.get('r') || document.querySelector('meta[name="menuverse:restaurant"]')?.content || 'sample-table';
const TABLE = params.get('table');

const ALLERGENS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish', peanuts: 'Peanuts',
  soy: 'Soy', milk: 'Milk', nuts: 'Tree nuts', celery: 'Celery', mustard: 'Mustard',
  sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin', molluscs: 'Molluscs',
};
const DIETARY = { vegetarian: 'Vegetarian', vegan: 'Vegan', 'gluten-free': 'Gluten-free', halal: 'Halal' };

const app = document.getElementById('app');
let menu, viewer, menuScroll = 0, currentKey = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let fmt;
const money = (amount) => fmt.format(amount / (menu.restaurant.money?.minorUnit ?? 100));
const framesOf = (d) => {
  const s = d.media?.spin; if (!s) return null;
  return Array.from({ length: s.frames }, (_, i) => `${s.path}/${String(i).padStart(2, '0')}.webp`);
};
const thumbOf = (d) => (d.media?.spin ? `${d.media.spin.path}/thumb.webp` : d.media?.photo?.thumb || null);
const status = () => menu.restaurant.contentStatus || (menu.restaurant.isSample ? 'sample' : 'live');
const STATUS_LABEL = { sample: 'Sample menu', 'pilot-draft': 'Pilot preview' };

const icons = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  drag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  spin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="13" rx="9" ry="4"/><path d="M16 6.5A9 4 0 0 1 21 9"/><path d="M19.5 4.8l1.6 4.1-4.2.6"/></svg>',
};

async function boot() {
  try {
    const res = await fetch(`data/restaurants/${encodeURIComponent(RESTAURANT)}.json`);
    if (!res.ok) throw new Error(res.status);
    menu = await res.json();
    menu.categories.sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (e) {
    app.innerHTML = `<div class="page"><div class="boot">This menu could not be loaded. Check the link on your table, or ask a member of staff.</div></div>`;
    return;
  }
  const r = menu.restaurant;
  fmt = new Intl.NumberFormat(r.locale || 'en-US', {
    style: 'currency', currency: r.currency || 'USD', currencyDisplay: r.money?.currencyDisplay || 'symbol',
    minimumFractionDigits: r.money?.fractionDigits ?? 2, maximumFractionDigits: r.money?.fractionDigits ?? 2,
  });
  applyTheme(r.theme);
  document.title = `${r.name} · Menu`;
  window.addEventListener('hashchange', () => route(true));
  route(false);
}

// A restaurant theme overrides the colour and font tokens from styles.css.
function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(theme.colors || {})) root.setProperty(`--${k}`, v);
  for (const [k, v] of Object.entries(theme.fonts || {})) root.setProperty(`--font-${k}`, v);
  for (const [k, v] of Object.entries(theme.vars || {})) root.setProperty(`--${k}`, v);
  if (theme.colorScheme) root.setProperty('color-scheme', theme.colorScheme);
  if (theme.googleFonts) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${theme.googleFonts}&display=swap`;
    document.head.appendChild(l);
  }
  if (theme.colors?.bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.bg);
  document.documentElement.dataset.restaurant = menu.restaurant.slug;
}

function route(animate) {
  const m = location.hash.match(/^#dish-([a-z0-9-]+)$/);
  const dish = m && menu.dishes.find((d) => d.id === m[1] && !isCompact(d));
  const key = dish ? dish.id : 'menu';
  if (key === currentKey) return;
  currentKey = key;
  const render = () => (dish ? renderDish(dish) : renderMenu());
  if (animate && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(render);
  else render();
}

const catOf = (d) => menu.categories.find((c) => c.id === d.categoryId);
const isCompact = (d) => catOf(d)?.layout === 'compact';

function cleanup() { viewer?.destroy(); viewer = null; }

function statusPill(short) {
  const s = status();
  if (!STATUS_LABEL[s]) return '';
  return `<span class="sample-pill">${short ? (s === 'sample' ? 'Sample' : 'Preview') : STATUS_LABEL[s]}</span>`;
}

// ---------------------------------------------------------------- menu
function renderMenu() {
  cleanup();
  const r = menu.restaurant;
  const cats = menu.categories.filter((c) => menu.dishes.some((d) => d.categoryId === c.id));
  const [first, ...rest] = r.name.split(' ');
  app.innerHTML = `
  <div class="page view-enter">
    ${r.cover ? `<figure class="cover"><img src="${r.cover.src}" alt="${esc(r.cover.alt)}" width="1400" height="1112"></figure>` : ''}
    <header class="masthead">
      <div class="brand-row">
        <span class="wordmark">${esc(r.location || 'MENUVERSE')}</span>
        ${statusPill(false)}
      </div>
      <h1>${esc(first)} <em>${esc(rest.join(' '))}</em></h1>
      <p>${esc(r.tagline)}. ${status() === 'sample' ? 'Tap a dish, then drag the plate to see it from every side.' : 'Tap a dish to see it up close.'}</p>
      ${TABLE ? `<span class="table-chip">Table ${esc(TABLE)}</span>` : ''}
    </header>
    <nav class="catnav" aria-label="Menu sections"><ul>
      ${cats.map((c, i) => `<li><a href="#cat-${c.id}" data-cat="${c.id}" aria-current="${i === 0}">${esc(c.name)}</a></li>`).join('')}
    </ul></nav>
    ${cats.map((c) => {
      const items = menu.dishes.filter((d) => d.categoryId === c.id);
      const compact = c.layout === 'compact';
      return `<section class="cat ${compact ? 'is-compact' : ''}" id="cat-${c.id}" aria-labelledby="h-${c.id}">
        <h2 id="h-${c.id}"><span>${esc(c.name)}</span><span>${items.length}</span></h2>
        ${c.note ? `<p class="cat-note">${esc(c.note)}</p>` : ''}
        <ul class="${compact ? 'rows' : 'dishes'}">${items.map(compact ? row : card).join('')}</ul>
      </section>`;
    }).join('')}
    <footer class="footnote">
      ${r.notice ? `<p><b>${status() === 'sample' ? 'About this demo.' : 'About this preview.'}</b> ${esc(r.notice)}</p>` : ''}
      ${r.priceNote ? `<p>${esc(r.priceNote)}</p>` : ''}
      <p>Ask your server about allergens before ordering.</p>
      <p class="powered">Menu by MENUVERSE</p>
    </footer>
  </div>`;

  app.querySelectorAll('.catnav a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(`cat-${a.dataset.cat}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  scrollSpy();
  requestAnimationFrame(() => window.scrollTo(0, menuScroll));
}

function card(d) {
  const t = thumbOf(d);
  const tags = [
    ...(d.badges || []).map((b) => `<span class="tag badge">${esc(b)}</span>`),
    ...(d.dietary || []).map((x) => `<span class="tag">${esc(DIETARY[x] || x)}</span>`),
    d.available ? '' : `<span class="tag off">${esc(d.unavailableNote || 'Unavailable')}</span>`,
  ].join('');
  const photoClass = d.media?.photo && !d.media?.spin ? 'is-photo' : '';
  return `<li><a class="dish-card ${d.available ? '' : 'is-off'}" href="#dish-${d.id}" data-dish="${d.id}">
    <div class="txt">
      <h3>${esc(d.name)}</h3>
      ${d.summary ? `<span class="sum">${esc(d.summary)}</span>` : ''}
      <div class="meta"><span class="price">${money(d.price.amount)}</span>${tags}</div>
    </div>
    ${t ? `<div class="thumb ${photoClass}"><img src="${t}" alt="" loading="lazy" width="420" height="420" style="view-transition-name: dish-${d.id}">${d.media?.spin ? '<span class="spin-badge">360°</span>' : ''}</div>`
        : '<div class="thumb empty"><span>Photo coming soon</span></div>'}
  </a></li>`;
}

function row(d) {
  return `<li class="row ${d.available === false ? 'is-off' : ''}">
    <span class="row-name">${esc(d.name)}${d.summary ? `<small>${esc(d.summary)}</small>` : ''}</span>
    <span class="row-lead" aria-hidden="true"></span>
    <span class="price">${money(d.price.amount)}</span>
  </li>`;
}

function scrollSpy() {
  const links = [...app.querySelectorAll('.catnav a')];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.id.replace('cat-', '');
      links.forEach((l) => l.setAttribute('aria-current', String(l.dataset.cat === id)));
      const active = links.find((l) => l.dataset.cat === id);
      const nav = active?.closest('ul');
      if (nav) nav.scrollTo({ left: active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  app.querySelectorAll('.cat').forEach((s) => io.observe(s));
}

// ---------------------------------------------------------------- dish
function renderDish(d) {
  if (!app.querySelector('.dish-top')) menuScroll = window.scrollY;
  cleanup();
  const cat = catOf(d);
  const frames = framesOf(d);
  const photo = d.media?.photo;
  const thumb = thumbOf(d);
  const list = menu.dishes.filter((x) => !isCompact(x) && (x.media?.spin || x.media?.photo));
  const next = list[(list.indexOf(d) + 1) % list.length];
  const unknownAllergens = d.allergens == null;

  app.innerHTML = `
  <div class="page view-enter">
    <div class="dish-top">
      <button class="icon-btn" id="back" aria-label="Back to menu">${icons.back}</button>
      <span class="crumb">${esc(cat?.name || '')}</span>
      ${statusPill(true) || '<span></span>'}
    </div>

    <div class="stage">
      ${frames ? `
      <div class="spin-wrap" id="spin" style="view-transition-name: dish-${d.id}">
        <div class="hint" id="hint">${icons.drag}Drag to turn the plate</div>
      </div>
      <div class="loadbar" id="loadbar" aria-hidden="true"><i></i></div>
      <div class="dial">
        <button class="pill-btn" id="auto" aria-pressed="false">${icons.play}<span>Auto-rotate</span></button>
        <div class="dial-track" aria-hidden="true"><div class="dial-ticks" id="ticks"></div><div class="dial-needle"></div></div>
        <span class="deg" id="deg">0°</span>
      </div>`
      : photo ? `
      <figure class="photo-stage" style="view-transition-name: dish-${d.id}">
        <img src="${photo.hero}" alt="${esc(photo.alt || d.name)}">
        ${photo.spinPlanned ? `<figcaption class="spin-soon">${icons.spin}360° view coming soon</figcaption>` : ''}
      </figure>`
      : `<div class="photo-stage empty"><span>Photo coming soon</span></div>`}
    </div>

    <article class="info">
      <div class="title-row">
        <h1>${esc(d.name)}</h1>
        <div class="price-row">
          <span class="price">${money(d.price.amount)}</span>
          <span class="avail ${d.available ? '' : 'off'}">${d.available ? 'Available now' : esc(d.unavailableNote || 'Unavailable')}</span>
        </div>
      </div>
      ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ''}

      ${(d.options || []).map((o, oi) => `<section class="block" aria-labelledby="opt-${oi}">
        <h2 id="opt-${oi}">${esc(o.label)}</h2>
        <ul class="chips choices">${o.choices.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </section>`).join('')}

      ${d.servedWith?.length ? `<section class="block" aria-labelledby="sw">
        <h2 id="sw">Served with</h2>
        <ul class="chips">${d.servedWith.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </section>` : ''}

      ${d.ingredients?.length ? `<section class="block" aria-labelledby="ing">
        <h2 id="ing">Ingredients</h2>
        <ul class="chips">${d.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </section>` : ''}

      ${(d.addOns || []).length ? `<section class="block" aria-labelledby="add">
        <h2 id="add">Add on</h2>
        <ul class="addons">${d.addOns.map((id) => menu.dishes.find((x) => x.id === id)).filter(Boolean).map((x) => `<li><span>${esc(x.name)}</span><span class="price">+ ${money(x.price.amount)}</span></li>`).join('')}</ul>
      </section>` : ''}

      <section class="block" aria-labelledby="alg">
        <h2 id="alg">Allergens</h2>
        ${unknownAllergens
          ? '<p class="none tbc">Not listed yet. Please ask your server.</p>'
          : d.allergens.length
            ? `<ul class="chips allergens">${d.allergens.map((a) => `<li><b aria-hidden="true">${esc((ALLERGENS[a] || a)[0])}</b>${esc(ALLERGENS[a] || a)}</li>`).join('')}</ul>`
            : '<p class="none">None of the 14 major allergens.</p>'}
      </section>

      ${d.dietary?.length ? `<section class="block" aria-labelledby="diet"><h2 id="diet">Dietary</h2>
        <ul class="chips">${d.dietary.map((x) => `<li>${esc(DIETARY[x] || x)}</li>`).join('')}</ul></section>` : ''}

      <p class="legal">${legalNote(d)}</p>

      ${next && next !== d ? `<a class="next" href="#dish-${next.id}"><div><small>Next dish</small><span>${esc(next.name)}</span></div>${thumbOf(next) ? `<img src="${thumbOf(next)}" alt="">` : ''}</a>` : ''}
    </article>
  </div>`;

  window.scrollTo(0, 0);
  app.querySelector('#back').addEventListener('click', () => {
    if (history.state?.fromMenu) history.back();
    else location.hash = '';
  });

  if (!frames) return;
  const wrap = app.querySelector('#spin');
  const hint = app.querySelector('#hint');
  const bar = app.querySelector('#loadbar');
  const deg = app.querySelector('#deg');
  const ticks = app.querySelector('#ticks');
  const auto = app.querySelector('#auto');
  viewer = new SpinViewer(wrap, {
    frames, poster: thumb, label: d.name,
    onProgress: (p) => { bar.firstElementChild.style.width = `${p * 100}%`; if (p >= 1) bar.classList.add('done'); },
    onFrame: (i, dg) => { deg.textContent = `${dg}°`; ticks.style.backgroundPosition = `${-dg * 2}px 0`; },
  });
  wrap.addEventListener('spin:interact', () => hint.classList.add('gone'), { once: true });
  const setAuto = (on) => { auto.setAttribute('aria-pressed', String(on)); auto.innerHTML = `${on ? icons.pause : icons.play}<span>${on ? 'Pause' : 'Auto-rotate'}</span>`; };
  auto.addEventListener('click', () => { const on = auto.getAttribute('aria-pressed') !== 'true'; hint.classList.add('gone'); viewer.setAutoplay(on); setAuto(on); });
  wrap.addEventListener('spin:autoplay-off', () => setAuto(false));
}

function legalNote(d) {
  const s = status();
  if (s === 'sample') return '<b>Sample dish.</b> Invented for the MENUVERSE demo; the 360° images are computer-generated. Please tell your server about any allergy.';
  if (s === 'pilot-draft') return `<b>Pilot preview.</b> ${d.descriptionStatus === 'draft' ? 'Description written from the restaurant photo and still to be confirmed. ' : ''}Name and price are taken from the menu board. Please tell your server about any allergy.`;
  return 'Allergen information is provided by the restaurant. Please tell your server about any allergy.';
}

// remember that a dish was opened from the menu, so Back returns to the same scroll spot
document.addEventListener('click', (e) => {
  const a = e.target.closest('a.dish-card, a.next');
  if (!a) return;
  e.preventDefault();
  const fromMenu = a.classList.contains('dish-card');
  if (fromMenu) menuScroll = window.scrollY;
  try {
    history.pushState({ fromMenu: fromMenu || history.state?.fromMenu }, '', a.getAttribute('href'));
    route(true);
  } catch {
    location.hash = a.getAttribute('href'); // some embedded viewers block pushState
  }
});
window.addEventListener('popstate', () => route(true));

boot();
