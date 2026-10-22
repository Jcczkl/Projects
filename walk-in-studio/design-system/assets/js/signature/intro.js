/* intro: the product's story in 2.4 s, once per visit, Skip / any input ends it (also removed when calm) */
(function (S) {
  'use strict';
  var intro = document.querySelector('[data-sig-intro]');
  if (!S || !intro) return;
  var seen = false;
  try { seen = sessionStorage.getItem('sig-intro') === '1'; } catch (e) { /* private mode: play it */ }
  if (S.calm || seen) {
    intro.remove();
  } else {
    if (!/[?&]sig=preview\b/.test(location.search)) try { sessionStorage.setItem('sig-intro', '1'); } catch (e) { /* ignore */ }
    var ends = ['keydown', 'wheel', 'touchstart'];
    var finish = function () {
      clearTimeout(timer);
      ends.forEach(function (n) { removeEventListener(n, finish); });
      if (!intro.isConnected || intro.classList.contains('is-done')) return;
      intro.classList.add('is-done');
      setTimeout(function () { intro.remove(); }, 240);
    };
    var timer = setTimeout(finish, 2160); // the last shape holds, then a 240 ms fade: gone by 2.4 s
    intro.classList.add('is-playing');
    var skip = intro.querySelector('.sig-intro__skip');
    if (skip) skip.addEventListener('click', finish);
    ends.forEach(function (n) { addEventListener(n, finish, { passive: true }); });
  }
})(window.WSig);
