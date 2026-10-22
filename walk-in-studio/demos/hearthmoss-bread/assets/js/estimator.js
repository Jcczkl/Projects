/* estimator.js — price estimator / request builder (opt-in: <script src="assets/js/estimator.js" defer>).
   Markup: <form class="est" data-estimator> with radio inputs name="svc" (data-label, optional data-price,
   optional data-from), .est__step buttons (data-step="1" / "-1"), .est__n, .est__sum and an .est__book link.
   - With prices: shows the estimate (count-up in the Smooth tier) and writes it into a WhatsApp link.
   - Without prices (the client hasn't given price rules yet): shows the request, e.g. "Chemical wash, 3 units".
   - A tel: book link is left alone (landlines can't take WhatsApp). Without JS the links still work.
   Request builder (new request 2026-10-09, nails rehearsal "design your set"): any other radio groups with a
   data-label on each option are added to the request in page order ("Almond · Short · Mauve · Fine lines");
   the svc group and the units stepper are optional. Nothing is stored or sent anywhere but the WhatsApp link. */
(function () {
  'use strict';
  document.querySelectorAll('[data-estimator]').forEach(function (f) {
  var n = 2, out = f.querySelector('.est__n'), sum = f.querySelector('.est__sum'), book = f.querySelector('.est__book');
  var isWa = book && /wa\.me\//.test(book.href);
  var base = isWa ? book.href.split('?')[0] : '';
  var greet = (f.getAttribute('data-greeting') || 'Hi, I\'d like');
  var shown = null, raf = 0;
  function smooth() {
    return document.documentElement.getAttribute('data-motion') === 'smooth' &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function show(text, price) {
    if (price === null || shown === null || !smooth() || !window.requestAnimationFrame) {
      shown = price; sum.textContent = text(price); return;
    }
    var start = shown, t0 = 0; cancelAnimationFrame(raf);
    sum.classList.add('is-changing');
    (function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 480), e = 1 - Math.pow(1 - k, 3);
      shown = Math.round(start + (price - start) * e);
      sum.textContent = text(shown);
      if (k < 1) raf = requestAnimationFrame(step); else { shown = price; sum.classList.remove('is-changing'); }
    })(performance.now());
  }
  function extras() {
    var picked = [];
    f.querySelectorAll('input[type=radio]:checked').forEach(function (r) {
      if (r.name !== 'svc' && r.getAttribute('data-label')) picked.push(r.getAttribute('data-label'));
    });
    return picked;
  }
  function update() {
    var r = f.querySelector('input[name=svc]:checked');
    var more = extras();
    if (out) out.textContent = n;
    if (!r) {                                   // request builder only: the picks are the request
      sum.textContent = more.join(' · ');
      if (isWa) book.href = base + '?text=' + encodeURIComponent(greet + ': ' + more.join(', ') + '.');
      return;
    }
    var label = r.getAttribute('data-label'), units = out ? n + (n === 1 ? ' unit' : ' units') : '';
    var priced = r.hasAttribute('data-price');
    var from = r.hasAttribute('data-from') ? 'from ' : '';
    // Client price rules (aircon rehearsal 2026-10-09): a chosen option may add a per-unit amount (data-add="30"),
    // and the form may give a bulk discount (data-bulk-min="3" data-bulk-off="10" = 10% off from 3 units).
    var addPer = 0;
    f.querySelectorAll('input[type=radio]:checked').forEach(function (x) {
      if (x.name !== 'svc' && x.hasAttribute('data-add')) addPer += parseInt(x.getAttribute('data-add'), 10) || 0;
    });
    var units_n = out ? n : 1;
    var bulkMin = parseInt(f.getAttribute('data-bulk-min') || '0', 10), bulkOff = parseInt(f.getAttribute('data-bulk-off') || '0', 10);
    var bulk = priced && bulkMin && bulkOff && units_n >= bulkMin;
    var price = priced ? (parseInt(r.getAttribute('data-price'), 10) + addPer) * units_n : null;
    if (bulk) price = Math.round(price * (100 - bulkOff) / 100);
    var request = label + (units ? ', ' + units : '') + (more.length ? ' · ' + more.join(' · ') : '');
    if (priced) show(function (p) { return from + '$' + p; }, price);
    else { shown = null; sum.textContent = request; }
    if (isWa) {
      book.href = base + '?text=' + encodeURIComponent(greet + ' ' + label + (units ? ' for ' + units : '') +
        (more.length ? ' (' + more.join(', ') + ')' : '') +
        (priced ? ' (estimate ' + from + '$' + price + (bulk ? ', ' + bulkOff + '% off for ' + bulkMin + '+ units' : '') + ').' : '.'));
    }
  }
  f.addEventListener('change', update);
  f.querySelectorAll('.est__step').forEach(function (b) {
    b.addEventListener('click', function () { n = Math.min(12, Math.max(1, n + parseInt(b.getAttribute('data-step'), 10))); update(); });
  });
  update();
  });
})();
