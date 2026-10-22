/* signature.js - Signature scenes (COMPONENTS.md "Signature motion"). One rAF loop writes --sig-p on scenes in view;
   calm fallback = html.sig-calm (finished states). ?sig=full|calm|preview, ?ink=mask|gl for measuring.
   Built by tools/build_signature.py from template/assets/js/signature/ (core + one file per scene): edit those. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var force = (/[?&]sig=(calm|full)\b/.exec(location.search) || [])[1];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  var calm = force === 'calm' || (force !== 'full' && (reduce || conn.saveData || weak || doc.getAttribute('data-motion') === 'standard'));
  doc.classList.add(calm ? 'sig-calm' : 'sig-on');
  var S = window.WSig = { calm: calm, vh: window.innerHeight, here: (document.currentScript || {}).src || 'assets/js/signature.js',
    kinds: [], scenes: [] };
  S.clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  S.smooth = function (f) { return f * f * (3 - 2 * f); };

  /* live / pop: start ambient loops and stickers only when on screen */
  var liveIO;
  S.live = function (el) {
    liveIO = liveIO || new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.target.classList.contains('sig-sticker')) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); liveIO.unobserve(en.target); }
        } else {
          en.target.classList.toggle('is-live', en.isIntersecting);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    liveIO.observe(el);
  };

  /* scroll-linked scenes: a scene file registers its kind; start() finds them in the page */
  S.scene = function (attr, def) { def.attr = attr; S.kinds.push(def); };
  var visible = new Set(), queued = false;
  S.request = function () { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  function frame() {
    queued = false;
    visible.forEach(function (s) {
      var p = s.def.progress(s.el.getBoundingClientRect(), S.vh);
      if (Math.abs(p - s.p) < 0.0005 && !s.measure) return;
      s.p = p;
      s.el.style.setProperty('--sig-p', p.toFixed(4));
      if (s.def.update) s.def.update(s, p);
    });
  }
  S.start = function () {
    if (calm) return;
    var sel = S.kinds.map(function (k) { return '[' + k.attr + ']'; }).join(', ');
    if (sel) document.querySelectorAll(sel).forEach(function (el) {
      var def = S.kinds.filter(function (k) { return el.hasAttribute(k.attr); })[0];
      var s = { el: el, p: -1, def: def };
      if (def.setup) def.setup(s);
      S.scenes.push(s);
    });
    var sceneIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var s = S.scenes.filter(function (x) { return x.el === en.target; })[0];
        if (en.isIntersecting) visible.add(s); else visible.delete(s);
      });
      S.request();
    }, { rootMargin: '25% 0px' });
    S.scenes.forEach(function (s) { sceneIO.observe(s.el); });
    addEventListener('scroll', S.request, { passive: true });
    addEventListener('resize', function () {
      S.vh = window.innerHeight;
      S.scenes.forEach(function (s) { s.p = -1; if (s.def.resize) s.def.resize(s); });
      S.request();
    });
    S.request();
  };
})();
