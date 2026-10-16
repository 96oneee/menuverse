// SpinViewer: photo-based 360° viewer.
// Takes an ordered list of frame URLs (photos of a dish shot around a
// turntable) and lets the customer "turn the plate" by dragging.
// - frames load coarse-to-fine, so rotation works before every photo arrives
// - drag with finger or mouse, with inertia; vertical swipes still scroll the page
// - keyboard: arrow keys turn, Home resets; exposed to assistive tech as a slider

export class SpinViewer {
  constructor(container, { frames, poster, label = 'Dish', onProgress, onFrame } = {}) {
    this.frames = frames;
    this.n = frames.length;
    this.onProgress = onProgress || (() => {});
    this.onFrame = onFrame || (() => {});
    this.images = new Array(this.n);
    this.loaded = new Array(this.n).fill(false);
    this.loadedCount = 0;
    this.pos = 0;           // fractional frame index
    this.vel = 0;           // frames per ms (inertia)
    this.raf = 0;
    this.dragging = false;
    this.interacted = false;
    this.autoplay = false;

    const c = (this.canvas = document.createElement('canvas'));
    c.className = 'spin-canvas';
    c.tabIndex = 0;
    c.setAttribute('role', 'slider');
    c.setAttribute('aria-label', `${label}, 360 degree view. Drag or use arrow keys to rotate.`);
    c.setAttribute('aria-valuemin', '0');
    c.setAttribute('aria-valuemax', '359');
    container.appendChild(c);
    this.ctx = c.getContext('2d');

    if (poster) {
      this.poster = new Image();
      this.poster.onload = () => this.draw();
      this.poster.src = poster;
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.container = container;

    this.bind();
    this.load();
  }

  // Bit-reversal style order: 0, n/2, n/4, 3n/4 ... gives an even spread early.
  loadOrder() {
    const order = [], seen = new Set();
    for (let step = this.n; step >= 1; step = Math.floor(step / 2)) {
      for (let i = 0; i < this.n; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
      if (step === 1) break;
    }
    for (let i = 0; i < this.n; i++) if (!seen.has(i)) order.push(i);
    return order;
  }

  load() {
    const order = this.loadOrder();
    let next = 0;
    const PARALLEL = 6;
    const pump = () => {
      if (this.destroyed || next >= order.length) return;
      const i = order[next++];
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = () => {
        if (this.destroyed) return;
        if (img.naturalWidth) { this.images[i] = img; this.loaded[i] = true; }
        this.loadedCount++;
        this.onProgress(this.loadedCount / this.n);
        if (i === this.frameIndex() || this.loadedCount === 1) this.draw();
        if (this.loadedCount === Math.ceil(this.n / 4)) this.maybeIntro();
        pump();
      };
      img.src = this.frames[i];
    };
    for (let k = 0; k < PARALLEL; k++) pump();
  }

  frameIndex() { return ((Math.round(this.pos) % this.n) + this.n) % this.n; }

  nearestLoaded(i) {
    if (this.loaded[i]) return this.images[i];
    for (let d = 1; d < this.n; d++) {
      const a = (i + d) % this.n, b = (i - d + this.n) % this.n;
      if (this.loaded[a]) return this.images[a];
      if (this.loaded[b]) return this.images[b];
    }
    return null;
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    const i = this.frameIndex();
    const img = this.nearestLoaded(i) || (this.poster?.complete && this.poster.naturalWidth ? this.poster : null);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img) {
      const s = Math.min(canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (canvas.width - s) / 2, (canvas.height - s) / 2, s, s);
    }
    const deg = Math.round((i / this.n) * 360);
    this.canvas.setAttribute('aria-valuenow', String(deg));
    this.canvas.setAttribute('aria-valuetext', `Turned ${deg} degrees`);
    this.onFrame(i, deg);
  }

  setPos(p) {
    const before = this.frameIndex();
    this.pos = p;
    if (this.frameIndex() !== before) this.draw();
  }

  pxPerFrame() { return Math.max(6, this.container.clientWidth / (this.n * 0.8)); }

  bind() {
    const c = this.canvas;
    let startX = 0, startPos = 0, lastX = 0, lastT = 0, axis = null, startY = 0;
    this.onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.stopMotion();
      this.interacted = true;
      this.dragging = true; axis = e.pointerType === 'mouse' ? 'x' : null;
      startX = lastX = e.clientX; startY = e.clientY; startPos = this.pos; lastT = e.timeStamp; this.vel = 0;
      c.setPointerCapture?.(e.pointerId);
      c.classList.add('is-dragging');
      this.container.dispatchEvent(new CustomEvent('spin:interact', { bubbles: true }));
    };
    this.onMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!axis) { if (Math.abs(dx) + Math.abs(dy) < 6) return; axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
      if (axis !== 'x') return;
      const dt = Math.max(1, e.timeStamp - lastT);
      const v = -(e.clientX - lastX) / this.pxPerFrame() / dt;
      this.vel = this.vel * 0.6 + v * 0.4;
      lastX = e.clientX; lastT = e.timeStamp;
      this.setPos(startPos - dx / this.pxPerFrame());
    };
    this.onUp = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      c.classList.remove('is-dragging');
      if (e.timeStamp - lastT > 80) this.vel = 0;
      if (axis === 'x' && Math.abs(this.vel) > 0.004 && !reducedMotion()) this.coast();
    };
    this.onKey = (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { this.stopMotion(); this.interacted = true; this.setPos(this.pos + (k === 'ArrowRight' ? 1 : -1)); e.preventDefault(); }
      else if (k === 'Home') { this.stopMotion(); this.setPos(0); e.preventDefault(); }
    };
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('keydown', this.onKey);
    c.addEventListener('dragstart', (e) => e.preventDefault());
  }

  coast() {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(48, now - last); last = now;
      this.setPos(this.pos + this.vel * dt);
      this.vel *= Math.pow(0.993, dt);
      if (Math.abs(this.vel) > 0.0015) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // One gentle half turn and back on arrival, so people see that the plate moves.
  maybeIntro() {
    if (this.interacted || reducedMotion()) return;
    const from = this.pos, span = this.n * 0.5, dur = 2600, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const tick = (now) => {
      if (this.interacted) return;
      const t = Math.min(1, (now - t0) / dur);
      this.setPos(from + span * Math.sin(ease(t) * Math.PI));
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  setAutoplay(on) {
    this.stopMotion();
    this.autoplay = on;
    if (!on) return;
    this.interacted = true;
    let last = performance.now();
    const tick = (now) => {
      if (!this.autoplay) return;
      const dt = Math.min(48, now - last); last = now;
      this.setPos(this.pos + dt / 70);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopMotion() {
    cancelAnimationFrame(this.raf);
    if (this.autoplay) { this.autoplay = false; this.container.dispatchEvent(new CustomEvent('spin:autoplay-off', { bubbles: true })); }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.remove();
  }
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
