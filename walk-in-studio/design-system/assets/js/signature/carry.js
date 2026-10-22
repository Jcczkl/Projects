/* carry: the product walks from one section into the next (--sig-path), changes flavour scene by scene, and a
   statement's words part around it ([data-sig-part]) */
(function (S) {
  'use strict';
  if (!S) return;
  /* part: wrap words so they can move aside */
  function splitWords(el) {
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            var s = document.createElement('span'); s.className = 'sig-word'; s.textContent = w;
            frag.appendChild(s); words.push({ el: s });
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) { walk(c); }
      });
    })(el);
    return words;
  }

  S.scene('data-sig-carry', {
    setup: function (s) {
      var el = s.el;
      s.product = el.querySelector('.sig-carry__product');
      s.cups = (el.getAttribute('data-sig-cups') || '').split(',').filter(Boolean);
      s.shots = s.product ? Array.prototype.slice.call(s.product.querySelectorAll('[data-sig-shot]')) : [];
      // photo scenes (framed photos, not cut-outs) never roll or travel: a slow push-in only (Joseph 2026-10-13)
      // or the card chose a gentle push-in: data-sig-carry=push (signature_motion.py)
      s.photo = el.getAttribute('data-sig-carry') === 'push' || !!(s.product && s.product.querySelector('.sig-photo') && !s.product.querySelector('svg, img:not(.sig-photo)'));
      s.part = el.querySelector('[data-sig-part]');
      if (s.part) s.words = splitWords(s.part);
      s.measure = true;
    },
    resize: function (s) { s.measure = true; },
    progress: function (r, vh) { return S.clamp(-r.top / Math.max(1, r.height - vh)); },
    update: carry
  });

  function carry(s, p) {
    var smooth = S.smooth;
    if (s.cups.length) { // the cup changes flavour scene by scene
      var i = Math.min(s.cups.length - 1, Math.floor(p * s.cups.length));
      if (s.cupIndex !== i) { s.cupIndex = i; s.el.style.setProperty('--sig-cup', s.cups[i]); }
    }
    if (s.shots.length > 1) { // real cut-outs (signature_capture.py): one photo per scene, the rest hidden
      var k = Math.min(s.shots.length - 1, Math.floor(p * s.shots.length));
      if (s.shotIndex !== k) {
        s.shotIndex = k; s.product.classList.add('is-picking');
        s.shots.forEach(function (im, j) { im.classList.toggle('is-shown', j === k); });
      }
    }
    if (!s.product) return;
    if (s.measure) { // --sig-path: where the product stands in each scene (0 left .. 1 right)
      var cs = getComputedStyle(s.el);
      s.path = cs.getPropertyValue('--sig-path').split(',').map(parseFloat).filter(isFinite);
      s.gap = parseFloat(getComputedStyle(s.product).marginRight) || 0;
      s.parts = s.words && cs.getPropertyValue('--sig-part').trim() !== '0';
    }
    if (s.photo) {
      s.product.style.transform = 'scale(' + (1 + 0.06 * smooth(p)).toFixed(4) + ')';
    } else if (s.path.length > 1) { // travel between scenes, dwelling at each one
      var n = s.path.length - 1, t = p * n, j = Math.min(n - 1, Math.floor(t));
      var pos = s.path[j] + (s.path[j + 1] - s.path[j]) * smooth(t - j);
      var range = s.el.clientWidth - s.product.offsetWidth - 2 * s.gap;
      s.product.style.transform = 'translateX(' + ((pos - 1) * range).toFixed(1) + 'px)';
    }
    if (!s.words) { s.measure = false; return; }
    var box = s.part.getBoundingClientRect();
    if (s.measure) { // word boxes relative to the statement, untransformed, grouped in lines
      s.words.forEach(function (w) { w.el.style.transform = ''; w.t = ''; });
      s.lines = []; var line = null;
      s.words.forEach(function (w) {
        var r = w.el.getBoundingClientRect();
        w.l = r.left - box.left; w.r = r.right - box.left; w.y0 = r.top - box.top; w.y1 = r.bottom - box.top;
        if (!line || w.y0 > (line.y0 + line.y1) / 2) { line = { y0: w.y0, y1: w.y1, words: [] }; s.lines.push(line); }
        line.words.push(w); line.y1 = Math.max(line.y1, w.y1);
      });
    }
    s.measure = false;
    if (!s.parts) return;
    // the line opens a gap where the product is: words left of it slide left, words right of it slide right, as blocks
    var P = s.product.getBoundingClientRect(), m = 18, soft = 90;
    s.lines.forEach(function (ln) {
      var top = box.top + ln.y0, bot = box.top + ln.y1;
      var dist = Math.max(0, P.top - m - bot, top - (P.bottom + m));
      var f = dist >= soft ? 0 : smooth(1 - dist / soft), maxL = -1e9, minR = 1e9, left = true;
      // the left part may slide at most to the page edge; words that would not clear the product go right instead
      var room = Math.max(0, box.left + ln.words[0].l - 16);
      ln.words.forEach(function (w) {
        w.left = left = left && box.left + w.r - room <= P.left - m;
        if (w.left) maxL = Math.max(maxL, box.left + w.r); else minR = Math.min(minR, box.left + w.l);
      });
      var dl = -Math.max(0, maxL - (P.left - m)) * f, dr = Math.max(0, P.right + m - minR) * f;
      ln.words.forEach(function (w) {
        var d = w.left ? dl : dr, t = Math.abs(d) > .5 ? 'translateX(' + d.toFixed(1) + 'px)' : '';
        if (w.t !== t) { w.t = t; w.el.style.transform = t; }
      });
    });
  }
})(window.WSig);
