/* ink: each flavour scene blooms in through an ink blot as soon as it comes into view.
   Triggered, not scrubbed (claude_code_batch_gal_motion_tuition.md Part 2, Joseph 2026-10-14: "People can scroll really
   fast and it would look off"): the bloom plays by the clock (1.1 s), the same at any scroll speed, and never stops half
   way; the page scrolls normally between scenes. Calm / reduced motion: no mask, the scenes as they are. */
(function (S) {
  'use strict';
  if (!S || S.calm) return;
  var BLOOM = 1100;
  function bloom(sc) {
    sc.classList.add('is-playing');
    var t0 = performance.now(), K0 = 0.22;                   // starts part-way: its first frame already shows the content
    (function frame(now) {
      var t = Math.min(1, (now - t0) / BLOOM);
      sc.style.setProperty('--sig-k', (K0 + (1 - K0) * S.smooth(t)).toFixed(4));
      if (t < 1) requestAnimationFrame(frame);
      else { sc.classList.remove('is-playing'); sc.classList.add('is-done'); }
    })(t0);
  }
  S.scene('data-sig-ink', {
    setup: function (s) {
      s.el.setAttribute('data-sig-ink', 'mask');
      s.list = Array.prototype.slice.call(s.el.querySelectorAll('.sig-ink__scene'));
      s.list.forEach(function (sc) { sc.style.setProperty('--sig-k', '0.22'); });
    },
    progress: function (r, vh) { return S.clamp(-r.top / Math.max(1, r.height)); },
    update: function (s) {
      var vh = S.vh;
      s.list.forEach(function (sc) {
        if (sc.classList.contains('is-playing') || sc.classList.contains('is-done')) return;
        var r = sc.getBoundingClientRect(), seen = (Math.min(vh, r.bottom) - Math.max(0, r.top)) / Math.max(1, Math.min(vh, r.height));
        if (seen >= 0.15) bloom(sc);                          // as soon as it shows, not once it fills the screen
      });
    }
  });
})(window.WSig);
