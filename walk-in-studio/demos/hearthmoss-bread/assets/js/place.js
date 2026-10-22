/* Signature · Place - scroll walks you into the place, pausing at a few stops (template/COMPONENTS.md "Signature ·
   Place"; claude_code_walk_in_site.md). Plain JS, no libraries. The page's own markup carries everything:
     data-frames  frames per set        data-sets  "m:720x1280,d:1600x900" (phone, desktop; a portrait clip has only m)
     data-stops   frame index of each stop (in order)      data-walk / data-hold / data-hero  scroll lengths in screens/100
   Scroll down = forward, up = back. Between two sampled frames the next one fades in (no steps); the position follows
   the scroll smoothly (a fast flick doesn't jump). At a stop the picture holds and zooms in slowly while its card fades
   in. Reduced motion or no JS: nothing here runs and the stops stay a list of stills with their cards.
   The opening (claude_code_signature_overhaul.md Part 2): a designed door (.place__door, page elements only) swings
   open by itself as you scroll, light spills out, then the page zooms through the doorway into the first walk frame
   (--door-open / --door-zoom, 0..1, on the section; the CSS default is the door standing open, for no-JS and reduced
   motion). data-holds = each stop's pause (a product longest), data-push = 1 on a thin stop (a deeper, slower push-in). */
(function () {
  var root = document.querySelector('[data-place]');
  if (!root || !document.createElement('canvas').getContext) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce && reduce.matches) return;

  var N = +root.dataset.frames, path = root.dataset.path;
  var stopsAt = root.dataset.stops.split(',').filter(Boolean).map(Number);
  var WALK = +root.dataset.walk || 400, HOLD = +root.dataset.hold || 70, HERO = +root.dataset.hero || 45;
  var DOOR = root.querySelector('.place__door') ? (+root.dataset.door || 40) : 0;
  var holds = (root.dataset.holds || '').split(',').filter(Boolean).map(Number);
  var push = (root.dataset.push || '').split(',').map(function (x) { return x === '1'; });
  var sets = {};
  root.dataset.sets.split(',').forEach(function (s) { var p = s.split(':'), wh = p[1].split('x'); sets[p[0]] = { w: +wh[0], h: +wh[1], imgs: [] }; });
  var stage = root.querySelector('.place__stage'), view = root.querySelector('.place__view');
  var canvas = root.querySelector('.place__canvas'), ctx = canvas.getContext('2d');
  var back = root.querySelector('.place__backdrop'), bctx = back.getContext('2d');
  var hero = root.querySelector('.place__hero');
  var stops = [].slice.call(root.querySelectorAll('.place__stop'));
  root.classList.add('place--live');
  if (root.querySelector('.place__door')) { root.style.setProperty('--door-open', '0'); root.style.setProperty('--door-zoom', '0'); }

  // ---- the timeline, in units of 1/100 of the stage height ----
  var segs = [], T = 0;
  function add(seg) { seg.a = T; T += seg.len; seg.b = T; segs.push(seg); }
  if (DOOR) add({ hold: true, door: true, f: 0, stop: -1, len: DOOR });
  add({ hold: true, f: 0, stop: -1, len: HERO });
  var prev = 0;
  stopsAt.forEach(function (f, i) {
    if (f > prev) add({ f0: prev, f1: f, len: WALK * (f - prev) / Math.max(1, N - 1) });
    var h = holds[i] || HOLD;
    add({ hold: true, f: f, stop: i, push: !!push[i], len: i === stopsAt.length - 1 ? h + 25 : h });
    prev = f;
  });
  segs.forEach(function (s) { if (s.hold && s.stop >= 0) stops[s.stop] && (stops[s.stop].seg = s); });

  var unit = 1, top = 0;
  function layout() {
    unit = stage.clientHeight / 100;
    root.style.height = (T * unit + stage.clientHeight) + 'px';
    top = root.getBoundingClientRect().top + window.pageYOffset - (parseFloat(getComputedStyle(stage).top) || 0);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.clientWidth * dpr); canvas.height = Math.round(view.clientHeight * dpr);
    back.width = 40; back.height = Math.max(1, Math.round(40 * view.clientHeight / Math.max(1, view.clientWidth)));
    pick();
    dirty = true;
  }

  // ---- which frames: phone set on a narrow or upright screen, desktop otherwise ----
  var set;
  function pick() {
    var upright = view.clientWidth < 768 || view.clientWidth / view.clientHeight < 0.8;
    var next = upright || !sets.d ? sets.m : sets.d;
    if (next !== set) { set = next; load(); }
    var frameRatio = set.w / set.h, viewRatio = view.clientWidth / view.clientHeight;
    contain = frameRatio < 0.8 && viewRatio > 1.05;          // an upright clip on a wide screen: centred, over a blurred copy
    root.classList.toggle('is-contain', contain);
  }
  var contain = false;

  // ---- loading: the first frame, then the stops, then the rest in order, 4 at a time ----
  function load() {
    var key = set === sets.d ? 'd' : 'm', order = [0].concat(stopsAt), seen = {};
    for (var i = 0; i < N; i++) order.push(i);
    order = order.filter(function (i) { if (seen[i]) return false; seen[i] = 1; return true; });
    var queue = order.slice(), active = 0, mine = set;
    function next() {
      while (active < 4 && queue.length) {
        var i = queue.shift();
        if (mine.imgs[i]) continue;
        active++;
        (function (i) {
          var im = new Image();
          im.decoding = 'async';
          im.onload = function () { mine.imgs[i] = im; active--; dirty = true; next(); };
          im.onerror = function () { active--; next(); };
          im.src = path + '/' + key + '/frame_' + ('00' + (i + 1)).slice(-3) + '.webp';
        })(i);
      }
    }
    next();
  }
  function near(i) {
    if (set.imgs[i]) return set.imgs[i];
    for (var d = 1; d < N; d++) { if (set.imgs[i - d]) return set.imgs[i - d]; if (set.imgs[i + d]) return set.imgs[i + d]; }
    return null;
  }

  // ---- where the scroll says we are ----
  function at(u) {
    u = Math.max(0, Math.min(T - 0.001, u));
    for (var k = 0; k < segs.length; k++) {
      var s = segs[k];
      if (u < s.b) {
        var p = (u - s.a) / s.len;
        return s.hold ? { f: s.f, stop: s.stop, p: p, door: !!s.door, push: !!s.push } : { f: s.f0 + (s.f1 - s.f0) * p, stop: -2, p: p };
      }
    }
    var last = segs[segs.length - 1];
    return { f: last.f, stop: last.stop, p: 1 };
  }

  var cur = { f: 0, z: 1, d: 0 }, want = { f: 0, z: 1, stop: -1, p: 0, u: 0, d: 0 }, dirty = true, last = 0, raf = 0;
  function onScroll() {
    var u = (window.pageYOffset - top) / unit;
    var a = at(u);
    want.f = a.f; want.stop = a.stop; want.p = a.p; want.u = u;
    want.z = a.stop >= 0 ? 1 + (a.push ? 0.09 : 0.045) * ease(a.p) : 1;
    want.d = !DOOR ? 1 : a.door ? a.p : u < DOOR ? 0 : 1;          // the door: 0 = shut, 1 = gone through
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function tick(now) {
    raf = 0;
    var dt = last ? Math.min(64, now - last) : 16.7; last = now;
    var k = 1 - Math.pow(0.82, dt / 16.7), kz = 1 - Math.pow(0.94, dt / 16.7);
    cur.f += (want.f - cur.f) * k; cur.z += (want.z - cur.z) * kz; cur.d += (want.d - cur.d) * k;
    if (Math.abs(want.f - cur.f) < 0.002) cur.f = want.f;
    if (Math.abs(want.z - cur.z) < 0.0005) cur.z = want.z;
    if (Math.abs(want.d - cur.d) < 0.002) cur.d = want.d;
    draw();
    cards();
    doorway();
    if (cur.f !== want.f || cur.z !== want.z || cur.d !== want.d || dirty) raf = requestAnimationFrame(tick);
    else last = 0;
  }

  function place(im, c, w, h, z, fit) {
    var r = fit === 'contain' ? Math.min(w / im.naturalWidth, h / im.naturalHeight) : Math.max(w / im.naturalWidth, h / im.naturalHeight);
    r *= z;
    var dw = im.naturalWidth * r, dh = im.naturalHeight * r;
    c.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function draw() {
    dirty = false;
    var i = Math.floor(cur.f), a = cur.f - i, A = near(i), B = a > 0.01 ? near(i + 1) : null;
    if (!A) { dirty = true; return; }
    var w = canvas.width, h = canvas.height, fit = contain ? 'contain' : 'cover';
    ctx.globalAlpha = 1;
    if (contain) ctx.clearRect(0, 0, w, h);
    place(A, ctx, w, h, cur.z, fit);
    if (B && B !== A) { ctx.globalAlpha = a; place(B, ctx, w, h, cur.z, fit); ctx.globalAlpha = 1; }
    if (contain) { place(A, bctx, back.width, back.height, 1, 'cover'); bctx.fillStyle = 'rgba(0,0,0,.45)'; bctx.fillRect(0, 0, back.width, back.height); }
    if (!root.classList.contains('is-drawn')) root.classList.add('is-drawn');
  }

  // ---- the door: swings open over the first 60% of its pause, then the page zooms through it ----
  var doorEl = root.querySelector('.place__door'), lastD = -1;
  function doorway() {
    if (!doorEl || cur.d === lastD) return;
    lastD = cur.d;
    var open = ease(Math.min(1, cur.d / 0.6)), zoom = ease(Math.max(0, (cur.d - 0.45) / 0.55));
    root.style.setProperty('--door-open', open.toFixed(4));
    root.style.setProperty('--door-zoom', zoom.toFixed(4));
    root.classList.toggle('is-through', cur.d >= 0.999);
  }

  var shown = -3;
  function cards() {
    var on = -1;
    if (want.stop >= 0) {
      var lastStop = want.stop === stops.length - 1;
      if (want.p > 0.1 && (want.p < 0.9 || lastStop)) on = want.stop;
    }
    if (on !== shown) {
      stops.forEach(function (s, n) { s.classList.toggle('is-on', n === on); });
      dots.forEach(function (d, n) { d[n === on ? 'setAttribute' : 'removeAttribute']('aria-current', 'step'); });
      shown = on;
    }
    var h = Math.max(0, Math.min(1, want.u / ((DOOR ? DOOR * 0.5 : HERO * 0.7))));
    hero.style.opacity = String(1 - h);
    hero.style.transform = 'translateY(' + (-30 * h).toFixed(1) + 'px)';
  }

  // ---- jumping to a stop: the nav, the dots, and a #hash in the address ----
  function scrollToStop(n, smooth) {
    var s = stops[n] && stops[n].seg;
    if (!s) return;
    var y = top + (s.a + s.len * 0.4) * unit;
    window.scrollTo({ top: Math.round(y), behavior: smooth ? 'smooth' : 'auto' });
    stops[n].focus({ preventScroll: true });
  }
  var dots = [];
  var nav = document.createElement('nav');
  nav.className = 'place__dots'; nav.setAttribute('aria-label', 'Stops on the way in');
  stops.forEach(function (s, n) {
    var b = document.createElement('button'), h2 = s.querySelector('h2');
    b.type = 'button'; b.setAttribute('aria-label', (h2 ? h2.textContent : 'Stop ' + (n + 1)));
    b.addEventListener('click', function () { scrollToStop(n, true); });
    nav.appendChild(b); dots.push(b);
  });
  view.appendChild(nav);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    for (var n = 0; n < stops.length; n++) {
      if (stops[n].id === id) { e.preventDefault(); history.replaceState(null, '', '#' + id); scrollToStop(n, true); return; }
    }
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { layout(); onScroll(); });
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', function () { location.reload(); });
  layout();
  if (location.hash) {
    for (var n = 0; n < stops.length; n++) if ('#' + stops[n].id === location.hash) { scrollToStop(n, false); break; }
  }
  onScroll();
  window.__place = { segs: segs, T: T, door: DOOR, unit: function () { return unit; }, top: function () { return top; }, cur: cur, want: want };
})();
