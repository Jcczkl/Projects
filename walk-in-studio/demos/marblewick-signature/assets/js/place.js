/* Signature · Place - the homepage walks you into the place, one stop at a time (template/COMPONENTS.md "Signature ·
   Place"). Plain JS, no libraries.

   TRIGGERED, NOT SCRUBBED (claude_code_batch_gal_motion_tuition.md Part 2, Joseph 2026-10-14: "People can scroll really
   fast and it would look off"): a scroll, swipe, key, tap on Next or a dot only TRIGGERS a step; the step then plays at a
   fixed duration with easing, the same however fast the visitor scrolls. One step per gesture: input during a running
   step is queued once, never stacked; a hard flick moves exactly one stop. Steps: 0 = the door (the name, a closed door),
   then one step per stop. The door step plays as ONE timed move: the door swings open, the page goes through it and
   walks to the first stop. At a stop the picture holds (a slow push-in by time, not by scroll) and its card shows.
   No trap: before the first step and after the last one the page scrolls normally, so the visitor can always leave.
   Reduced motion or a low-power device: a simple fade between stops, no door. No JS: the stops stay a list of stills
   with their cards. The page's markup: data-frames, data-sets ("m:720x1280,d:1600x900"), data-stops (frame of each stop),
   data-push (1 = a thin stop: a deeper push-in), data-depth (optional depth maps, tools/depth.py). */
(function () {
  var root = document.querySelector('[data-place]');
  if (!root || !document.createElement('canvas').getContext) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var lowPower = (navigator.deviceMemory && navigator.deviceMemory < 4) ||
    (window.matchMedia && matchMedia('(pointer: coarse)').matches && (navigator.hardwareConcurrency || 8) <= 4);
  var calm = !!(reduce && reduce.matches) || !!lowPower || /[?&]place=calm\b/.test(location.search);

  var N = +root.dataset.frames, path = root.dataset.path;
  var stopsAt = root.dataset.stops.split(',').filter(Boolean).map(Number);
  var push = (root.dataset.push || '').split(',').map(function (x) { return x === '1'; });
  var sets = {};
  root.dataset.sets.split(',').forEach(function (s) { var p = s.split(':'), wh = p[1].split('x'); sets[p[0]] = { w: +wh[0], h: +wh[1], imgs: [] }; });
  var stage = root.querySelector('.place__stage'), view = root.querySelector('.place__view');
  var canvas = root.querySelector('.place__canvas'), ctx = canvas.getContext('2d');
  var back = root.querySelector('.place__backdrop'), bctx = back.getContext('2d');
  var hero = root.querySelector('.place__hero');
  var stops = [].slice.call(root.querySelectorAll('.place__stop'));
  var doorEl = calm ? null : root.querySelector('.place__door');
  var S = stops.length;                                     // steps 0..S: 0 = the door / the name, k = stop k-1
  root.classList.add('place--live');
  if (calm) root.classList.add('place--calm');
  if (doorEl) { root.style.setProperty('--door-open', '0'); root.style.setProperty('--door-zoom', '0'); }

  // ---- timings (ms): fixed, whatever the scroll speed ----
  var T_DOOR = 950, T_WALK_MIN = 800, T_WALK_MAX = 1600, T_FADE = 450, T_HOLD = 3200;
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function walkTime(df) { return Math.max(T_WALK_MIN, Math.min(T_WALK_MAX, 600 + 1400 * Math.abs(df) / Math.max(1, N - 1))); }
  function frameOf(k) { return k <= 0 ? 0 : stopsAt[k - 1]; }

  // ---- layout: one screen of scroll per step, so the scrollbar and links still mean something ----
  var stepH = 1, top = 0;
  function layout() {
    stepH = stage.clientHeight;
    root.style.height = (S * stepH + stage.clientHeight) + 'px';
    top = root.getBoundingClientRect().top + window.pageYOffset - (parseFloat(getComputedStyle(stage).top) || 0);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.clientWidth * dpr); canvas.height = Math.round(view.clientHeight * dpr);
    back.width = 40; back.height = Math.max(1, Math.round(40 * view.clientHeight / Math.max(1, view.clientWidth)));
    pick();
    dirty = true; wake();
  }
  function stepY(k) { return Math.round(top + k * stepH); }

  // ---- which frames: phone set on a narrow or upright screen, desktop otherwise ----
  var set, contain = false;
  function pick() {
    var upright = view.clientWidth < 768 || view.clientWidth / view.clientHeight < 0.8;
    var next = upright || !sets.d ? sets.m : sets.d;
    if (next !== set) { set = next; load(); }
    contain = set.w / set.h < 0.8 && view.clientWidth / view.clientHeight > 1.05;   // an upright clip on a wide screen
    root.classList.toggle('is-contain', contain);
  }

  // ---- loading: the first frame and the stops first; the walk frames only when the walk runs (not in calm mode) ----
  function load() {
    var key = set === sets.d ? 'd' : 'm', order = [0].concat(stopsAt), seen = {};
    if (!calm) for (var i = 0; i < N; i++) order.push(i);
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
          im.onload = function () {                         // decoded off the main thread before its first draw (no hitch mid-walk)
            var done = function () { mine.imgs[i] = im; active--; dirty = true; wake(); next(); };
            if (im.decode) im.decode().then(done, done); else done();
          };
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

  // ---- the state: where we are (step), what is on screen (vis), the move playing now (anim) ----
  var step = 0, anim = null, queued = 0, arrivedAt = performance.now(), dirty = true, raf = 0;
  var vis = { f: 0, d: doorEl ? 0 : 1, from: 0, fade: 1 };    // f = frame position; d = door 0..1; from/fade = calm cross-fade

  function go(k, how) {
    k = Math.max(0, Math.min(S, k));
    if (k === step && !anim) return false;
    var f0 = vis.f, f1 = frameOf(k), d0 = vis.d, d1 = doorEl ? (k === 0 ? 0 : 1) : 1, parts = [];
    if (calm) parts.push({ dur: T_FADE, fade: true });
    else {
      if (d1 > d0) parts.push({ dur: T_DOOR, d: [d0, d1] });              // through the door, then the walk: one move
      if (f1 !== f0) parts.push({ dur: walkTime(f1 - f0), f: [f0, f1] });
      if (d1 < d0) parts.push({ dur: T_DOOR * 0.8, d: [d0, d1] });        // back out through the door
      if (!parts.length) parts.push({ dur: 200 });
    }
    var total = 0; parts.forEach(function (p) { total += p.dur; });
    anim = { t0: performance.now(), parts: parts, to: k, from: step, total: total, p: 0 };
    vis.from = f0;
    step = k;
    if (!how || !how.noScroll) jump(stepY(k));
    showCard(-1);
    hero.style.visibility = 'visible';
    wake();
    return true;
  }
  function request(dir) {
    if (anim) { if (!queued) queued = dir; return; }       // one queued step at most, never stacked
    go(step + dir);
  }

  // ---- the frame loop: only while something moves ----
  function wake() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    var moving = false;
    if (anim) {
      var t = now - anim.t0, k = 0;
      anim.p = Math.min(1, t / anim.total);
      while (k < anim.parts.length && t > anim.parts[k].dur) { t -= anim.parts[k].dur; applyPart(anim.parts[k], 1); k++; }
      if (k < anim.parts.length) { applyPart(anim.parts[k], ease(t / anim.parts[k].dur)); moving = true; }
      else {                                                // arrived
        anim = null; arrivedAt = now; vis.f = frameOf(step); vis.fade = 1;
        showCard(step - 1);
        if (queued) { var q = queued; queued = 0; go(step + q); moving = true; }
      }
    }
    var holding = !anim && step > 0 && !calm && now - arrivedAt < T_HOLD + 50;
    draw(now);
    doorway();
    heroFade();
    if (moving || holding || dirty) wake();
  }
  function applyPart(p, e) {
    if (p.d) vis.d = p.d[0] + (p.d[1] - p.d[0]) * e;
    if (p.f) vis.f = p.f[0] + (p.f[1] - p.f[0]) * e;
    if (p.fade) { vis.fade = e; vis.f = frameOf(anim.to); }
  }

  // ---- drawing ----
  function place(im, c, w, h, z, fit) {
    var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;    // an image or a canvas (the depth layer)
    var r = (fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih)) * z;
    var dw = iw * r, dh = ih * r;
    c.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function holdZoom(now) {                                  // the slow push-in at a stop: by time, not by scroll
    if (calm || anim || step === 0) return 1;
    return 1 + (push[step - 1] ? 0.09 : 0.045) * ease(Math.min(1, (now - arrivedAt) / T_HOLD));
  }
  var drawn = 0;
  function draw(now) {
    dirty = false;
    var w = canvas.width, h = canvas.height, fit = contain ? 'contain' : 'cover', z = holdZoom(now);
    var i = Math.floor(vis.f), a = vis.f - i, A, B = null, alphaB = 0;
    if (calm && anim) { A = near(Math.round(vis.from)); B = near(frameOf(anim.to)); alphaB = vis.fade; }
    else { A = near(i); if (a > 0.01) { B = near(i + 1); alphaB = a; } }
    if (!A) { dirty = true; return; }
    ctx.globalAlpha = 1;
    if (contain) ctx.clearRect(0, 0, w, h);
    place(A, ctx, w, h, z, fit);
    if (B && B !== A) { ctx.globalAlpha = alphaB; place(B, ctx, w, h, z, fit); ctx.globalAlpha = 1; }
    if (useDepth && !anim && step > 0 && !B) {                 // held at a stop: the near layer comes forward (optional)
      var L = nearLayer(step - 1);
      if (L) { place(L, ctx, w, h, z * (1 + 0.035 * ease(Math.min(1, (now - arrivedAt) / T_HOLD))), fit); depthDrawn++; }
    }
    if (contain) { place(A, bctx, back.width, back.height, 1, 'cover'); bctx.fillStyle = 'rgba(0,0,0,.45)'; bctx.fillRect(0, 0, back.width, back.height); }
    drawn++;
    if (!root.classList.contains('is-drawn')) root.classList.add('is-drawn');
  }

  // ---- depth (optional; claude_code_depth_and_fixes.md): a soft near mask from a small greyscale map ----
  var depthIds = (root.dataset.depth || '').split(',').filter(function (x) { return x !== ''; });
  var useDepth = depthIds.length > 0 && !calm && !/[?&]depth=off\b/.test(location.search), layers = {}, depthDrawn = 0;
  function nearLayer(n) {
    var k = (set === sets.d ? 'd' : 'm'), key = k + n, L = layers[key];
    if (L) return L === 'loading' || L === 'none' ? null : L;
    var frame = set.imgs[stopsAt[n]];
    if (!frame || depthIds[n] === undefined) return null;
    layers[key] = 'loading';
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      var mc = document.createElement('canvas'), mw = mc.width = im.naturalWidth, mh = mc.height = im.naturalHeight, mx = mc.getContext('2d');
      mx.drawImage(im, 0, 0);
      var d = mx.getImageData(0, 0, mw, mh), a = d.data;
      for (var i = 0; i < a.length; i += 4) {
        var t = Math.min(1, Math.max(0, (a[i] / 255 - 0.55) / 0.25));
        a[i + 3] = Math.round(255 * t * t * (3 - 2 * t));
      }
      mx.putImageData(d, 0, 0);
      var c = document.createElement('canvas'), cx = c.getContext('2d');
      c.width = frame.naturalWidth; c.height = frame.naturalHeight;
      cx.drawImage(frame, 0, 0);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(mc, 0, 0, c.width, c.height);
      layers[key] = c; dirty = true; wake();
    };
    im.onerror = function () { layers[key] = 'none'; };
    im.src = path + '/depth/' + k + '/stop_' + depthIds[n] + '.webp';
    return null;
  }

  // ---- the door (--door-open, then --door-zoom through the doorway) and the name over it ----
  var lastD = -1;
  function doorway() {
    if (!doorEl || vis.d === lastD) return;
    lastD = vis.d;
    var open = ease(Math.min(1, vis.d / 0.6)), zoom = ease(Math.max(0, (vis.d - 0.45) / 0.55));
    root.style.setProperty('--door-open', open.toFixed(4));
    root.style.setProperty('--door-zoom', zoom.toFixed(4));
    root.classList.toggle('is-through', vis.d >= 0.999);
  }
  function heroFade() {                                   // the name shows on step 0 only
    var o;
    if (doorEl) o = Math.max(0, 1 - vis.d * 2);
    else if (!anim) o = step === 0 ? 1 : 0;
    else { var a0 = anim.from === 0 ? 1 : 0, a1 = anim.to === 0 ? 1 : 0; o = a0 + (a1 - a0) * ease(anim.p); }
    hero.style.opacity = String(o);
    hero.style.transform = 'translateY(' + (-30 * (1 - o)).toFixed(1) + 'px)';
    hero.style.visibility = o < 0.01 ? 'hidden' : 'visible';
  }

  // ---- cards, dots, Next / Back ----
  var shown = -2;
  function showCard(n) {
    if (n !== shown) {
      shown = n;
      stops.forEach(function (s, k) { s.classList.toggle('is-on', k === n); });
      dots.forEach(function (d, k) { d[k === n ? 'setAttribute' : 'removeAttribute']('aria-current', 'step'); });
    }
    nextBtn.textContent = step >= S ? 'Continue' : step === 0 ? 'Walk in' : 'Next';
    nextBtn.setAttribute('aria-label', step >= S ? 'Continue down the page' : step === 0 ? 'Open the door and walk in' : 'Next stop');
    prevBtn.hidden = step === 0;
  }
  var dots = [];
  var nav = document.createElement('nav');
  nav.className = 'place__dots'; nav.setAttribute('aria-label', 'Stops on the way in');
  stops.forEach(function (s, n) {
    var b = document.createElement('button'), h2 = s.querySelector('h2');
    b.type = 'button'; b.setAttribute('aria-label', (h2 ? h2.textContent : 'Stop ' + (n + 1)));
    b.addEventListener('click', function () { if (!anim) go(n + 1); });
    nav.appendChild(b); dots.push(b);
  });
  view.appendChild(nav);
  var ctrl = document.createElement('div'), prevBtn = document.createElement('button'), nextBtn = document.createElement('button');
  ctrl.className = 'place__steps';
  prevBtn.type = nextBtn.type = 'button';
  prevBtn.className = 'place__prev'; prevBtn.textContent = 'Back'; prevBtn.setAttribute('aria-label', 'Previous stop');
  nextBtn.className = 'place__next';
  prevBtn.addEventListener('click', function () { request(-1); });
  nextBtn.addEventListener('click', function () {
    if (step >= S && !anim) window.scrollTo({ top: stepY(S) + stage.clientHeight, behavior: calm ? 'auto' : 'smooth' });
    else request(1);
  });
  ctrl.appendChild(prevBtn); ctrl.appendChild(nextBtn);
  view.appendChild(ctrl);

  // ---- input: a gesture triggers one step; nothing is scrubbed ----
  var programmatic = -1;
  function jump(y) { programmatic = y; window.scrollTo(0, y); }
  function inside() { var y = window.pageYOffset; return y >= stepY(0) - 2 && y <= stepY(S) + 2; }
  function exitsHere(dir) { return !anim && ((dir > 0 && step >= S) || (dir < 0 && step <= 0)); }
  var lastWheel = 0, lastDir = 0;
  window.addEventListener('wheel', function (e) {
    var dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0, y = window.pageYOffset;
    if (!dir || e.ctrlKey) return;
    if (!inside()) {                                       // coming in from above or below: land on the step we left
      var into = (y < stepY(0) && y + e.deltaY > stepY(0)) || (y > stepY(S) && y + e.deltaY < stepY(S));
      if (into) {
        e.preventDefault();
        jump(stepY(step));
        var t0 = performance.now(), first = t0 - lastWheel > 260 || dir !== lastDir;
        lastWheel = t0; lastDir = dir;
        // the door is already on screen (the page starts just above it): this same gesture opens it
        if (first && dir > 0 && step === 0 && y >= stepY(0) - stepH * 0.25) request(1);
      }
      return;
    }
    var now = performance.now(), fresh = now - lastWheel > 260 || dir !== lastDir;   // a burst of wheel events = one gesture
    lastWheel = now; lastDir = dir;
    if (fresh) stepped = false;
    if (exitsHere(dir) && !stepped) return;                // past the first or last step: normal scrolling, no trap
    e.preventDefault();                                    // (a gesture that already moved a step is used up: leaving takes a new one)
    if (!stepped) { stepped = true; request(dir); }
  }, { passive: false });
  var stepped = false;
  var ty = null, tDir = 0, tUsed = false;
  window.addEventListener('touchstart', function (e) { ty = e.touches[0].clientY; tDir = 0; tUsed = false; }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (ty === null) return;
    var dy = ty - e.touches[0].clientY;
    if (!tDir && Math.abs(dy) > 6) tDir = dy > 0 ? 1 : -1;
    if (!inside()) {                                       // the door is on screen just below the header: this swipe opens it
      var y = window.pageYOffset;
      if (tDir > 0 && step === 0 && y < stepY(0) && y >= stepY(0) - stepH * 0.25) {
        if (e.cancelable) e.preventDefault();
        if (!tUsed && Math.abs(dy) > 40) { tUsed = true; jump(stepY(0)); request(1); }
      }
      return;
    }
    if (!tDir || (exitsHere(tDir) && !tUsed)) return;    // a swipe that already moved a step does not also scroll away
    if (e.cancelable) e.preventDefault();
    if (!tUsed && Math.abs(dy) > 40) { tUsed = true; request(tDir); }
  }, { passive: false });
  window.addEventListener('touchend', function () { ty = null; }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (!inside() || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
    var fwd = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
    var bwd = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
    if (!fwd && !bwd) return;
    var dir = fwd ? 1 : -1;
    if (exitsHere(dir)) return;
    e.preventDefault();
    request(dir);
  });
  var settle = 0;
  window.addEventListener('scroll', function () {        // the scrollbar, a link, find-in-page: go to the nearest step
    var y = window.pageYOffset;
    if (programmatic >= 0 && Math.abs(y - programmatic) <= 2) { programmatic = -1; return; }
    if (!inside()) return;
    var k = Math.max(0, Math.min(S, Math.round((y - top) / stepH)));
    if (k !== step && !anim) go(k, { noScroll: true });
    clearTimeout(settle);
    settle = setTimeout(function () { if (inside() && Math.abs(window.pageYOffset - stepY(step)) > 2) jump(stepY(step)); }, 180);
  }, { passive: true });

  // ---- jumping to a stop: the menu (#story, #menu, #visit) and a #hash in the address ----
  function goStop(n, smooth) {
    if (window.pageYOffset !== stepY(n + 1)) jump(stepY(n + 1));
    go(n + 1, { noScroll: true });
    if (!smooth) { anim && (anim.t0 -= 1e6); }             // a page opened on #menu shows the stop at once
    stops[n].focus({ preventScroll: true });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    for (var n = 0; n < stops.length; n++) {
      if (stops[n].id === id) { e.preventDefault(); history.replaceState(null, '', '#' + id); goStop(n, true); return; }
    }
  });

  window.addEventListener('resize', function () { layout(); jump(stepY(step)); });
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', function () { location.reload(); });
  layout();
  showCard(-1);
  if (location.hash) {
    for (var n = 0; n < stops.length; n++) if ('#' + stops[n].id === location.hash) { goStop(n, false); break; }
  } else if (window.pageYOffset > stepY(0) + 2) {          // reloaded part way down: start from where the page is
    var k0 = Math.max(0, Math.min(S, Math.round((window.pageYOffset - top) / stepH)));
    if (k0) { go(k0, { noScroll: true }); anim && (anim.t0 -= 1e6); }
  }
  wake();
  window.__place = {
    step: function () { return step; }, busy: function () { return !!anim; }, S: S, calm: calm,
    stepY: stepY, top: function () { return top; }, vis: vis, stopsAt: stopsAt, drawn: function () { return drawn; },
    rests: function () {                                   // for the walkthrough recorder: rest at every step
      var r = []; for (var k = 0; k <= S; k++) r.push([stepY(k) - 1, stepY(k) + 1, k === 0 ? 1.4 : k === S ? 3.6 : 3.0]); return r;
    },
    depth: function () { return { on: useDepth, ids: depthIds.length, drawn: depthDrawn, lowPower: !!lowPower }; }
  };
})();
