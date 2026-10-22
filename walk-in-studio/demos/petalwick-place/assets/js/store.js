/* Signature · Place, illustrated - a drawn shop you walk into (claude_code_signature_matrix_tuition_smooth.md Stage 2,
   Joseph 2026-10-14: "make cartoon versions of them and make the animations work"). Plain JS + CSS 3D, no libraries.

   The visitor is the camera. It starts on the street facing the shopfront; the first step is the visitor's own hand
   pushing the door, then the camera walks in through the doorway (a slight walking bob, the door frame sliding past, the
   light changing from street to inside) and moves left to right through the room, holding at each stop with its card.
   The room is real 3D: floor, walls and ceiling planes, flat illustrated props standing at their depths, a perspective
   camera that really moves, so near things slide past faster than far ones. The scene is data (a JSON block made by
   tools/store_build.py from template/store/scenes.json); this file knows no trade.

   Same rules as place.js (triggered, not scrubbed): a scroll, swipe, key, Next/Back or a dot TRIGGERS one step that
   plays at a fixed duration; one step per gesture, one queued at most; no trap before the first step or after the last.
   Same page contract as place.js (.place__hero / .place__stop / .place__card / dots / Next and window.__place), so the
   Place checks and the walkthrough recorder drive it unchanged. Reduced motion, a low-power device or ?place=calm: the
   stops cross-fade, no hand, no walk. No CSS 3D or no JS: the stops as stills with their cards. */
(function () {
  var root = document.querySelector('[data-store]');
  var sceneEl = root && root.querySelector('script.store__scene');
  if (!root || !sceneEl || !(window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d'))) return;
  var SC = JSON.parse(sceneEl.textContent);
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var lowPower = (navigator.deviceMemory && navigator.deviceMemory < 4) ||
    (window.matchMedia && matchMedia('(pointer: coarse)').matches && (navigator.hardwareConcurrency || 8) <= 4);
  var calm = !!(reduce && reduce.matches) || !!lowPower || /[?&](place|store)=calm\b/.test(location.search);
  var still = /[?&]store=still\b/.test(location.search);        // tools/store_build.py renders the no-JS stills this way

  var stage = root.querySelector('.place__stage'), view = root.querySelector('.place__view');
  var view3 = root.querySelector('.store__view'), world = root.querySelector('.store__world'), worlds = [world];
  // The room is one 3D layer (its props really sorted by depth). The outside things (tools/store_build.py marks them
  // "front": the street across, the pavement, the inside of the front wall, the shopfront, the sign, the door) are painted
  // over it in that fixed order, each its own layer with the same camera: Chrome's depth sorting is not reliable with
  // planes this big, and this order is right from the street (the front is nearer than the room) and from inside (the
  // front wall is the nearest thing in its direction; the street side faces away and is not drawn).
  var hero = root.querySelector('.place__hero');
  var stops = [].slice.call(root.querySelectorAll('.place__stop'));
  var push = root.querySelector('.place__door'), armEl = root.querySelector('.store__arm');
  var S = stops.length;
  root.classList.add('place--live');
  if (calm) root.classList.add('place--calm');

  // ---- the world: every plane from the scene data ----
  var loading = 0, doorEl = null;
  function plane(p) {
    var el;
    if (p.src) {
      el = document.createElement('img');
      el.src = p.src; el.alt = ''; el.decoding = 'async'; el.draggable = false;
      loading++;
      var done = function () { loading--; if (!loading) ready(); };
      el.onload = function () { if (el.decode) el.decode().then(done, done); else done(); };
      el.onerror = done;
    } else {
      el = document.createElement('div');
      if (p.html) el.innerHTML = p.html;
      if (p.bg) el.style.background = p.bg;
    }
    el.className = 'store__p' + (p.cls ? ' ' + p.cls : '');
    el.style.width = p.w + 'px'; el.style.height = p.h + 'px';
    el.style.transform = p.t;
    if (p.front) {
      var layer = document.createElement('div');
      layer.className = 'store__world';
      view3.appendChild(layer); worlds.push(layer); layer.appendChild(el);
    } else world.appendChild(el);
    return el;
  }
  SC.planes.forEach(plane);
  doorEl = plane(SC.door);
  doorEl.classList.add('place__leaf');                       // the Place checks read the door's angle from it
  var doorBase = SC.door.t;
  function setDoor(a) { doorEl.style.transform = doorBase + ' rotateY(' + a.toFixed(2) + 'deg)'; }
  setDoor(0);

  // ---- timings (ms): fixed, whatever the scroll speed ----
  var T_DOOR = 1100, T_WALK_MIN = 900, T_WALK_MAX = 1900, T_FADE = 450, T_HOLD = 3200;
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---- the camera ----
  var P = 900, W = SC.room.w, D = SC.room.d, EYE = SC.eye;
  function persp() {                                          // a wider lens on a phone held upright
    var w = view3.clientWidth, h = view3.clientHeight, fov = (w < 768 ? 70 : 72) * Math.PI / 180;
    P = Math.max(220, (w / 2) / Math.tan(fov / 2));
    if (h / w > 1.25) P = Math.max(220, (w / 2) / Math.tan(74 * Math.PI / 360));
    view3.style.perspective = P.toFixed(1) + 'px';
  }
  function street() {                                         // a step back and up: the sign in view (closer on a phone)
    var tall = view3.clientHeight > view3.clientWidth * 1.2;
    return { x: 0, y: -EYE - (tall ? 240 : 140), z: SC.street * (tall ? .7 : 1), yaw: 0, d: 0 };
  }
  function entry() { return { x: 0, y: -EYE, z: -260, yaw: 0, d: 0 }; }
  function stopPose(n) {                                      // n: 0-based stop; framed for this screen, card included
    var s = SC.stops[n], w = view3.clientWidth, h = view3.clientHeight, phone = w < 768;
    var rad = s.yaw * Math.PI / 180, fx = Math.sin(rad), fz = -Math.cos(rad), rx = Math.cos(rad), rz = Math.sin(rad);
    var visW = w / P, visH = h / P;                           // world units seen per unit of depth
    var d = Math.max(s.fw / ((phone ? .9 : .62) * visW), s.fh / ((phone ? .52 : .74) * visH));
    var side = phone ? 0 : .13 * visW * d, down = (phone ? .17 : .05) * visH * d;
    var x = s.x - fx * d - rx * side, z = s.z - fz * d - rz * side;
    x = clamp(x, -W / 2 + 130, W / 2 - 130); z = clamp(z, -D + 130, -130);
    var dd = Math.sqrt((s.x - x) * (s.x - x) + (s.z - z) * (s.z - z));
    return { x: x, y: clamp(s.y + down, -EYE - 200, -260), z: z, yaw: s.yaw, d: dd };
  }
  function poseOf(k) { return k === 0 ? street() : stopPose(k - 1); }
  var cam = street();
  function apply(c, hold) {
    var x = c.x, z = c.z;
    if (hold) { var r = c.yaw * Math.PI / 180; x += Math.sin(r) * c.d * .06 * hold; z -= Math.cos(r) * c.d * .06 * hold; }
    var tf = 'translateZ(' + P.toFixed(1) + 'px) rotateY(' + c.yaw.toFixed(3) + 'deg) translate3d(' +
      (-x).toFixed(1) + 'px,' + (-c.y).toFixed(1) + 'px,' + (-z).toFixed(1) + 'px)';
    for (var i = 0; i < worlds.length; i++) worlds[i].style.transform = tf;
    var inside = clamp((150 - z) / 420, 0, 1);              // the light changes from the street to inside
    root.style.setProperty('--inside', inside.toFixed(3));
  }

  // ---- a path: poses joined by straight lines, turned by the shortest way ----
  function path(list) {
    var pts = [list[0]], L = [0];
    for (var i = 1; i < list.length; i++) {
      var a = pts[i - 1], b = list[i], dy = ((b.yaw - a.yaw) % 360 + 540) % 360 - 180;
      var q = { x: b.x, y: b.y, z: b.z, yaw: a.yaw + dy, d: b.d };
      pts.push(q);
      L.push(L[i - 1] + Math.sqrt((q.x - a.x) * (q.x - a.x) + (q.z - a.z) * (q.z - a.z)) + Math.abs(dy) * 4);
    }
    return { pts: pts, L: L, len: L[L.length - 1] };
  }
  function along(pa, t) {
    var s = t * pa.len, i = 1;
    while (i < pa.pts.length - 1 && pa.L[i] < s) i++;
    var a = pa.pts[i - 1], b = pa.pts[i], u = pa.L[i] > pa.L[i - 1] ? (s - pa.L[i - 1]) / (pa.L[i] - pa.L[i - 1]) : 1;
    u = clamp(u, 0, 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, yaw: a.yaw + (b.yaw - a.yaw) * u, d: b.d, s: s };
  }
  function walkTime(pa) { return clamp(700 + pa.len * .45, T_WALK_MIN, T_WALK_MAX); }

  // ---- the state ----
  var step = 0, anim = null, queued = 0, arrivedAt = performance.now(), raf = 0, drawn = 0;
  var vis = { f: 0, d: 0 };                                   // f = where we are (0..S, a stop is a whole number); d = door 0..1

  function go(k, how) {
    k = Math.max(0, Math.min(S, k));
    if (k === step && !anim) return false;
    var from = cam, to = poseOf(k), parts = [], f0 = vis.f;
    if (calm) parts.push({ dur: T_FADE, fade: true, to: to });
    else {
      if (step === 0 && k > 0) {
        var s0 = street(), lean = { x: 0, y: -EYE - 60, z: s0.z - 260, yaw: 0, d: 0 };
        parts.push({ dur: T_DOOR, door: [vis.d, 1], arm: true, pa: path([from, lean]) });
        var pa = path([lean, entry(), to]);
        parts.push({ dur: walkTime(pa) + 300, pa: pa, walk: true, shut: true });
      } else if (k === 0) {
        var pb = path([from, entry(), street()]);
        parts.push({ dur: walkTime(pb) + 300, pa: pb, walk: true, reopen: true });
        parts.push({ dur: T_DOOR * .7, door: [vis.d, 0] });
      } else {
        var pc = path([from, to]);
        parts.push({ dur: walkTime(pc), pa: pc, walk: true });
      }
    }
    var total = 0; parts.forEach(function (p) { total += p.dur; });
    anim = { t0: performance.now(), parts: parts, to: k, from: step, f0: f0, total: total, p: 0 };
    step = k;
    if (!how || !how.noScroll) jump(stepY(k));
    showCard(-1);
    hero.style.visibility = 'visible';
    wake();
    return true;
  }
  function request(dir) {
    if (anim) { if (!queued) queued = dir; return; }
    go(step + dir);
  }

  // ---- the frame loop: only while something moves ----
  function wake() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    var moving = false, hold = 0;
    if (anim) {
      var t = now - anim.t0, k = 0;
      anim.p = Math.min(1, t / anim.total);
      while (k < anim.parts.length && t > anim.parts[k].dur) { t -= anim.parts[k].dur; part(anim.parts[k], 1); k++; }
      if (k < anim.parts.length) { part(anim.parts[k], t / anim.parts[k].dur); moving = true; }
      vis.f = anim.f0 + (anim.to - anim.f0) * ease(anim.p);
      if (!moving) {                                          // arrived
        cam = poseOf(step); anim = null; arrivedAt = now; vis.f = step; vis.d = step > 0 ? 1 : 0;
        view3.style.opacity = '1'; setDoor(0); arm(1);        // inside, the door has swung shut behind the visitor
        showCard(step - 1);
        if (queued) { var q = queued; queued = 0; go(step + q); moving = true; }
      }
    }
    if (!anim && step > 0 && !calm) {
      hold = ease(Math.min(1, (now - arrivedAt) / T_HOLD));
      if (now - arrivedAt < T_HOLD + 50) moving = true;
    }
    apply(cam, hold);
    heroFade();
    root.classList.toggle('is-through', vis.d >= .999 && step > 0 && !anim);
    if (moving) wake();
  }
  function part(p, u) {
    var e = ease(u);
    if (p.fade) {                                             // calm: fade out, jump, fade in
      view3.style.opacity = String(Math.abs(1 - 2 * u).toFixed(3));
      if (u >= .5) { cam = p.to; vis.d = step > 0 ? 1 : 0; setDoor(0); }
      return;
    }
    if (p.door) { vis.d = p.door[0] + (p.door[1] - p.door[0]) * clamp((u - (p.arm ? .3 : 0)) / (p.arm ? .7 : 1), 0, 1); setDoor(100 * ease(vis.d)); }
    if (p.arm) arm(u);
    if (p.shut) setDoor(100 * (1 - ease(clamp((u - .7) / .3, 0, 1))));   // swings shut once the visitor is past it
    if (p.reopen) setDoor(100 * ease(clamp(u * 2.5, 0, 1)));
    if (p.pa) {
      var c = along(p.pa, p.walk ? e : e);
      if (p.walk) {                                           // a walking bob, fading in and out with the move
        var bob = Math.abs(Math.sin(c.s / 270 * Math.PI)) * 7 * Math.sin(Math.PI * u);
        c.y -= bob; c.x += Math.sin(c.s / 540 * Math.PI) * 3 * Math.sin(Math.PI * u);
      }
      cam = c;
    }
  }
  function arm(u) {                                           // the hand: comes up, pushes, drops away
    if (!armEl) return;
    var up = ease(clamp(u / .3, 0, 1)), pushU = ease(clamp((u - .3) / .45, 0, 1)), away = ease(clamp((u - .78) / .22, 0, 1));
    var ty = (1 - up) * 105 + away * 110, sc = 1 - .14 * pushU, tx = -8 * pushU;
    armEl.style.transform = 'translate(' + tx.toFixed(2) + '%,' + ty.toFixed(2) + '%) scale(' + sc.toFixed(3) + ')';
    armEl.style.opacity = u >= 1 ? '0' : '1';
  }
  function heroFade() {                                       // the name shows on the street only
    var o = !anim ? (step === 0 ? 1 : 0) : (anim.from === 0 || anim.to === 0) ?
      (anim.to === 0 ? ease(anim.p) : 1 - Math.min(1, anim.p * 3)) : 0;
    hero.style.opacity = String(o);
    hero.style.transform = 'translateY(' + (-30 * (1 - o)).toFixed(1) + 'px)';
    hero.style.visibility = o < .01 ? 'hidden' : 'visible';
  }
  var warmed = false;
  function ready() {                                          // everything decoded: the drawing replaces the poster
    if (warmed) return;
    warmed = true;
    // behind the poster, the camera looks from every stop for one frame first, so the browser has drawn every prop
    // before the visitor walks (no hitch the first time a corner comes into view)
    var k = 0, keep = cam;
    (function warm() {
      if (k <= S && !anim) { apply(poseOf(k), 0); k++; requestAnimationFrame(warm); return; }
      if (!anim) { cam = keep; apply(cam, 0); }
      drawn++;
      root.classList.add('is-drawn');
    })();
  }
  setTimeout(ready, 5000);                                    // a slow picture never keeps the poster up for good

  // ---- layout: one screen of scroll per step, so the scrollbar and links still mean something ----
  var stepH = 1, top = 0;
  function layout() {
    stepH = stage.clientHeight;
    root.style.height = (S * stepH + stage.clientHeight) + 'px';
    top = root.getBoundingClientRect().top + window.pageYOffset - (parseFloat(getComputedStyle(stage).top) || 0);
    persp();
    if (!anim) { cam = poseOf(step); apply(cam, 0); }
  }
  function stepY(k) { return Math.round(top + k * stepH); }

  // ---- cards, dots, Next / Back ----
  var shown = -2;
  function showCard(n) {
    if (n !== shown) {
      shown = n;
      stops.forEach(function (s, k) { s.classList.toggle('is-on', k === n); });
      dots.forEach(function (d, k) { d[k === n ? 'setAttribute' : 'removeAttribute']('aria-current', 'step'); });
    }
    nextBtn.textContent = step >= S ? 'Continue' : step === 0 ? 'Walk in' : 'Next';
    nextBtn.setAttribute('aria-label', step >= S ? 'Continue down the page' : step === 0 ? 'Push the door and walk in' : 'Next stop');
    prevBtn.hidden = step === 0;
  }
  var dots = [];
  var nav = document.createElement('nav');
  nav.className = 'place__dots'; nav.setAttribute('aria-label', 'Stops inside');
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

  // ---- input: a gesture triggers one step; nothing is scrubbed (as place.js) ----
  var programmatic = -1;
  function jump(y) { programmatic = y; window.scrollTo(0, y); }
  function inside() { var y = window.pageYOffset; return y >= stepY(0) - 2 && y <= stepY(S) + 2; }
  function exitsHere(dir) { return !anim && ((dir > 0 && step >= S) || (dir < 0 && step <= 0)); }
  var lastWheel = 0, lastDir = 0, stepped = false;
  window.addEventListener('wheel', function (e) {
    var dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0, y = window.pageYOffset;
    if (!dir || e.ctrlKey) return;
    if (!inside()) {
      var into = (y < stepY(0) && y + e.deltaY > stepY(0)) || (y > stepY(S) && y + e.deltaY < stepY(S));
      if (into) {
        e.preventDefault();
        jump(stepY(step));
        var t0 = performance.now(), first = t0 - lastWheel > 260 || dir !== lastDir;
        lastWheel = t0; lastDir = dir;
        if (first && dir > 0 && step === 0 && y >= stepY(0) - stepH * 0.25) { stepped = true; request(1); }
      }
      return;
    }
    var now = performance.now(), fresh = now - lastWheel > 260 || dir !== lastDir;
    lastWheel = now; lastDir = dir;
    if (fresh) stepped = false;
    if (exitsHere(dir) && !stepped) return;
    e.preventDefault();
    if (!stepped) { stepped = true; request(dir); }
  }, { passive: false });
  var ty = null, tDir = 0, tUsed = false;
  window.addEventListener('touchstart', function (e) { ty = e.touches[0].clientY; tDir = 0; tUsed = false; }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (ty === null) return;
    var dy = ty - e.touches[0].clientY;
    if (!tDir && Math.abs(dy) > 6) tDir = dy > 0 ? 1 : -1;
    if (!inside()) {
      var y = window.pageYOffset;
      if (tDir > 0 && step === 0 && y < stepY(0) && y >= stepY(0) - stepH * 0.25) {
        if (e.cancelable) e.preventDefault();
        if (!tUsed && Math.abs(dy) > 40) { tUsed = true; jump(stepY(0)); request(1); }
      }
      return;
    }
    if (!tDir || (exitsHere(tDir) && !tUsed)) return;
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
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset;
    if (programmatic >= 0 && Math.abs(y - programmatic) <= 2) { programmatic = -1; return; }
    if (!inside()) return;
    var k = Math.max(0, Math.min(S, Math.round((y - top) / stepH)));
    if (k !== step && !anim) go(k, { noScroll: true });
    clearTimeout(settle);
    settle = setTimeout(function () { if (inside() && Math.abs(window.pageYOffset - stepY(step)) > 2) jump(stepY(step)); }, 180);
  }, { passive: true });

  // ---- jumping to a stop: the menu (#ids) and a #hash in the address ----
  function finish() { if (anim) { anim.t0 -= 1e6; } }
  function goStop(n, smooth) {
    if (window.pageYOffset !== stepY(n + 1)) jump(stepY(n + 1));
    go(n + 1, { noScroll: true });
    if (!smooth) finish();
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

  window.addEventListener('resize', function () { layout(); jump(stepY(step)); wake(); });
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', function () { location.reload(); });
  layout();
  showCard(-1);
  arm(1);
  if (still) root.classList.add('store--still');
  else if (location.hash) {
    for (var n = 0; n < stops.length; n++) if ('#' + stops[n].id === location.hash) { goStop(n, false); break; }
  } else if (window.pageYOffset > stepY(0) + 2) {
    var k0 = Math.max(0, Math.min(S, Math.round((window.pageYOffset - top) / stepH)));
    if (k0) { go(k0, { noScroll: true }); finish(); }
  }
  wake();
  window.__place = {
    step: function () { return step; }, busy: function () { return !!anim; }, S: S, calm: calm, store: true,
    stepY: stepY, top: function () { return top; }, vis: vis, stopsAt: stops.map(function (_, i) { return i + 1; }),
    drawn: function () { return drawn; }, cam: function () { return cam; },
    rests: function () {
      var r = []; for (var k = 0; k <= S; k++) r.push([stepY(k) - 1, stepY(k) + 1, k === 0 ? 1.6 : k === S ? 3.6 : 3.0]); return r;
    },
    jumpTo: function (k) {                                    // for the stills: straight onto step k, no move
      persp(); step = clamp(k, 0, S); anim = null; cam = poseOf(step); vis.f = step; vis.d = step > 0 ? 1 : 0;
      setDoor(0); apply(cam, 0); heroFade();
    },
    depth: function () { return { on: false, ids: 0, drawn: 0, lowPower: !!lowPower }; }
  };
})();
