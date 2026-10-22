/* band: outline words slide sideways; the loop runs only while on screen */
(function (S) {
  'use strict';
  if (!S || S.calm) return;
  document.querySelectorAll('.sig-band').forEach(S.live);
})(window.WSig);
