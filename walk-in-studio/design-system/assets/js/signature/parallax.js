/* parallax: things float at different depths as you scroll (CSS reads --sig-p) */
(function (S) {
  'use strict';
  if (!S) return;
  S.scene('data-sig-parallax', { progress: function (r) { return S.clamp(-r.top / Math.max(1, r.height)); } });
})(window.WSig);
