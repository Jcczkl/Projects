/* pop: stickers land with a tilt and a bounce when they come into view */
(function (S) {
  'use strict';
  if (!S || S.calm) return;
  document.querySelectorAll('.sig-sticker').forEach(S.live);
})(window.WSig);
