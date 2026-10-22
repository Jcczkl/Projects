/* wipe: the next colour rises from below and a few dots fly - played by the clock (0.9 s) once the band is half in view,
   not scrubbed by the scroll (claude_code_batch_gal_motion_tuition.md Part 2). CSS reads --sig-t (0..1). */
(function (S) {
  'use strict';
  if (!S) return;
  S.scene('data-sig-wipe', {
    setup: function (s) { s.el.style.setProperty('--sig-t', '0'); },
    progress: function (r, vh) { return S.clamp((vh - r.top) / r.height); },
    update: function (s, p) {
      if (s.t0 || p < 0.5) return;
      s.t0 = performance.now();
      (function frame(now) {
        var t = Math.min(1, (now - s.t0) / 900);
        s.el.style.setProperty('--sig-t', S.smooth(t).toFixed(4));
        if (t < 1) requestAnimationFrame(frame);
      })(s.t0);
    }
  });
})(window.WSig);
