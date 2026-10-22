/* walkin.js — the "walk-in" hero: scrolling plays the shop video forward/back.
   Frames come from tools/video_to_walk.py:
     assets/walk/d/frame_001.webp …  (desktop set, ~1280 px wide)
     assets/walk/m/frame_001.webp …  (mobile set, portrait crop)
     assets/walk/poster.webp / poster-m.webp (= first frame)
   Markup + tuning knobs: template/COMPONENTS.md → "Walk-in hero".
   Falls back to the static poster for: JS off, prefers-reduced-motion,
   Save-Data / 2G connections. No library. */
(function () {
  'use strict';
  var root = document.querySelector('[data-walkin]');
  if (!root) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var slow = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  var still = document.documentElement.getAttribute('data-motion') !== 'smooth'; // Standard tier: the poster is the scene
  if (reduce || slow || still) return; // poster stays — nothing else downloads

  var canvas = root.querySelector('.walkin__canvas');
  var ctx = canvas && canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var count = parseInt(root.getAttribute('data-frames'), 10) || 0;
  if (count < 2) return;
  var base = (root.getAttribute('data-path') || 'assets/walk').replace(/\/$/, '');
  var mobileQuery = window.matchMedia('(max-width: 767px), (orientation: portrait) and (max-width: 1024px)');
  var set = mobileQuery.matches ? 'm' : 'd';
  var frames = new Array(count);   // decoded Image objects (or undefined while loading)
  var current = -1, wanted = 0, ticking = false;

  root.style.setProperty('--walk-height', root.getAttribute('data-height') || 350);
  root.classList.add('is-active');

  function src(i) { return base + '/' + set + '/frame_' + String(i + 1).padStart(3, '0') + '.webp'; }

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; current = -1; }
  }

  // Nearest frame that has loaded, so it never shows blank.
  function nearestLoaded(i) {
    for (var d = 0; d < count; d++) {
      if (i - d >= 0 && frames[i - d]) return i - d;
      if (i + d < count && frames[i + d]) return i + d;
    }
    return -1;
  }

  function draw() {
    ticking = false;
    var i = nearestLoaded(wanted);
    if (i < 0 || i === current) return;
    var img = frames[i], cw = canvas.width, ch = canvas.height;
    var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight); // object-fit: cover
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    current = i;
    if (!root.classList.contains('is-ready')) root.classList.add('is-ready');
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(draw); } }

  function onScroll() {
    var r = root.getBoundingClientRect();
    var travel = Math.max(1, r.height - window.innerHeight);
    var p = Math.min(1, Math.max(0, -r.top / travel));
    wanted = Math.round(p * (count - 1));
    root.classList.toggle('is-scrolling', p > 0.02);
    request();
  }

  // Load order: first frame, then coarse-to-fine passes (every 16th, 8th, 4th, 2nd, all)
  // so scrubbing works early and sharpens as the rest arrive.
  var order = [0], seen = { 0: true };
  [16, 8, 4, 2, 1].forEach(function (step) {
    for (var k = 0; k < count; k += step) if (!seen[k]) { seen[k] = true; order.push(k); }
  });
  if (!seen[count - 1]) order.push(count - 1);

  var inFlight = 0, next = 0, MAX = 6;
  function pump() {
    while (inFlight < MAX && next < order.length) load(order[next++]);
  }
  function load(i) {
    inFlight++;
    var img = new Image();
    img.decoding = 'async';
    img.src = src(i);
    var done = function () { inFlight--; pump(); };
    (img.decode ? img.decode() : Promise.reject()).then(function () {
      frames[i] = img; done();
      if (Math.abs(i - wanted) < Math.abs(current - wanted) || current < 0) request();
    }, function () {
      if (img.complete) { if (img.naturalWidth) { frames[i] = img; request(); } done(); return; }
      img.onload = function () { frames[i] = img; done(); request(); };
      img.onerror = done;
    });
  }

  sizeCanvas();
  // Start fetching frames only after the page itself has loaded, so they never
  // compete with the page's own images (the poster covers the wait).
  // A walk-in lower down the page ("Step inside") waits until the visitor is about a screen away.
  function startWhenNear() {
    if (!('IntersectionObserver' in window) || root.getBoundingClientRect().top < window.innerHeight * 2) { pump(); return; }
    var near = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { near.disconnect(); pump(); }
    }, { rootMargin: '100% 0px 100% 0px' });
    near.observe(root);
  }
  if (document.readyState === 'complete') startWhenNear();
  else window.addEventListener('load', startWhenNear, { once: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { sizeCanvas(); onScroll(); });
  onScroll();
})();
