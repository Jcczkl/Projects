/* showroom.js — phone / desktop preview of a demo in a dialog (screens 768 px and wider).
   Without JS the "Phone view" / "Desktop view" buttons are hidden and the cards just link to the demos. */
(function () {
  'use strict';
  var dlg = document.getElementById('viewer');
  if (!dlg || !dlg.showModal) return;
  var frame = document.getElementById('viewer-frame');
  var width = 390;

  function fit() {
    var stage = dlg.querySelector('.viewer__stage');
    var h = stage.clientHeight - 8, w = stage.clientWidth - 16;
    var tall = width < 600 ? 844 : 800;
    var s = Math.min(1, w / width, h / tall);
    frame.style.width = width + 'px';
    frame.style.height = (h / s) + 'px';
    frame.style.transform = 'scale(' + s + ')';
    dlg.querySelectorAll('.viewer__bar [data-w]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.getAttribute('data-w') === width));
    });
  }

  document.querySelectorAll('[data-view]').forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      width = +btn.getAttribute('data-w');
      document.getElementById('viewer-title').textContent = btn.getAttribute('data-title');
      document.getElementById('viewer-open').href = btn.getAttribute('data-view');
      frame.src = btn.getAttribute('data-view');
      dlg.showModal();
      fit();
    });
  });
  dlg.querySelectorAll('.viewer__bar [data-w]').forEach(function (b) {
    b.addEventListener('click', function () { width = +b.getAttribute('data-w'); fit(); });
  });
  document.getElementById('viewer-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { frame.src = 'about:blank'; });
  window.addEventListener('resize', function () { if (dlg.open) fit(); });
})();

/* Templates page: "Open (Standard)" / "Open with Smooth motion" set the demo's motion switch
   first (same site, same localStorage key as the demo banner switch). */
document.querySelectorAll('[data-motion-open]').forEach(function (a) {
  a.addEventListener('click', function () {
    try { localStorage.setItem('ws-motion', a.getAttribute('data-motion-open')); } catch (e) { /* private mode: demo opens in Standard */ }
  });
});

/* Templates page, Signature band: the phone preview scrolls through the demo by itself while it is on screen
   (same site, so the frame's page can be scrolled from here). Off for reduced motion; the frame stays still. */
(function () {
  var f = document.querySelector('[data-sig-tour]');
  if (!f || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  var on = false, y = 0, last = 0, hold = 0;
  function step(t) {
    if (!on) { last = 0; return; }
    var w = f.contentWindow, max;
    try { max = w.document.documentElement.scrollHeight - w.innerHeight; } catch (e) { return; }
    var dt = last ? Math.min(64, t - last) : 0; last = t;
    if (!hold) hold = t + 3000; // let the intro play first
    if (t > hold) {
      y += dt * 0.2; // px per ms
      if (y >= max) { y = 0; hold = t + 2500; }
      w.scrollTo(0, y);
    }
    requestAnimationFrame(step);
  }
  new IntersectionObserver(function (e) {
    var was = on; on = e[0].isIntersecting;
    if (on && !was) requestAnimationFrame(step);
  }, { threshold: 0.3 }).observe(f);
  f.addEventListener('load', function () { y = 0; hold = 0; });
})();

/* Signature preview loop (homepage, draft while the Signature demos are held): plays only while on screen; with reduced
   motion it stays still, with controls, so nothing moves unless the visitor asks. */
(function () {
  var v = document.querySelector('[data-sig-loop]');
  if (!v) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.controls = true; return; }
  if (!('IntersectionObserver' in window)) { v.preload = 'auto'; v.play().catch(function () {}); return; }
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(function () {}); } else v.pause(); });
  }, { threshold: 0.4 }).observe(v);
})();
