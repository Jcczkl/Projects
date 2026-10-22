/* ring: letters on a cylinder (or one flat line when calm); spins only while on screen */
(function (S) {
  'use strict';
  if (!S) return;
  document.querySelectorAll('.sig-ring[data-sig-ring]').forEach(function (ring) {
    var text = ring.getAttribute('data-sig-ring');
    if (S.calm) {
      ring.classList.add('sig-ring--flat');
      ring.innerHTML = '<p class="sig-ring__flat"></p>';
      ring.firstChild.textContent = text;
      return;
    }
    var chars = (text + ' • ').split('');
    var n = chars.length;
    var tilt = document.createElement('div'); tilt.className = 'sig-ring__tilt';
    var spin = document.createElement('div'); spin.className = 'sig-ring__spin';
    spin.style.setProperty('--step', (360 / n) + 'deg');
    spin.style.setProperty('--r', (n * 0.62 / (2 * Math.PI)).toFixed(2) + 'em');
    chars.forEach(function (c, i) {
      ['', ' sig-ring__ch--back'].forEach(function (k) { // the back copy shows the far side of the ring, faint
        var s = document.createElement('span'); s.className = 'sig-ring__ch' + k; s.style.setProperty('--i', i);
        s.textContent = c; spin.appendChild(s);
      });
    });
    tilt.appendChild(spin); ring.appendChild(tilt);
    S.live(ring);
  });
})(window.WSig);
