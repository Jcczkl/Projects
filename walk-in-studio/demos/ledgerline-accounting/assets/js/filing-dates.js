/* filing-dates.js — "Key filing dates" helper (static, runs in the browser only).
   A GENERAL GUIDE. Joseph reviews these rules before the demo is shown to anyone.

   Rules implemented (checked against IRAS on 6 Oct 2026):
   1. ECI (Estimated Chargeable Income): file within 3 months from the end of the
      financial year. Example on the IRAS page: FY ending 31 Dec 2024 -> 31 Mar 2025;
      FY ending 31 Mar 2025 -> 30 Jun 2025.
      Waiver: not needed if annual revenue is $5 million or below AND ECI is nil.
      https://www.iras.gov.sg/taxes/corporate-income-tax/estimated-chargeable-income-(eci)-filing
   2. Form C-S / C-S (Lite) / C: filed by 30 Nov of the Year of Assessment (YA).
      The YA is the calendar year after the year the financial year ends
      (FY ending 31 Dec 2024 -> YA 2025; FY ending 31 Mar 2025 -> YA 2026; same IRAS ECI page).
      https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/guidance-on-filing-form-c-s-form-c-s-(lite)-form-c
      Note shown on the page: for YA 2023-2027, Form C-S filed through accounting software
      gets an automatic extension to 15 Dec.
      https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/using-accounting-software-to-prepare-file-form-c-s-seamlessly
   3. GST returns (quarterly): filing and payment due one month after the end of each
      accounting period (Jan-Mar -> 30 Apr, Apr-Jun -> 31 Jul, Jul-Sep -> 31 Oct, Oct-Dec -> 31 Jan).
      GST periods are assigned by IRAS, so the visitor picks their quarter pattern.
      Shown: returns due in the past 6 months (greyed) and the next 4 to come.
      https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/due-dates-and-requests-for-extension
   Deliberately NOT included: ACRA annual return / AGM / any company-secretarial dates
   (GROUND_RULES Rule 3), monthly GST periods, special accounting periods, new-company first-year rules. */
(function () {
  'use strict';
  var root = document.querySelector('[data-filing-dates]');
  if (!root) return;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var fyeSel = root.querySelector('[name="fye"]');
  var gstSel = root.querySelector('[name="gst"]');
  var list = root.querySelector('.fd__list');
  var today = new Date(); today.setHours(0, 0, 0, 0);

  function lastDay(year, month0) { return new Date(year, month0 + 1, 0); } // month0 may overflow; Date handles it
  function fmt(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  function compute(fyeMonth0, gstPattern) {
    var items = [];
    // The year before last, the year that ended most recently, and the one in progress:
    // a return for the year before last can still be due (e.g. FYE 30 Jun 2025 -> Form C-S by 30 Nov 2026).
    var lastFye = lastDay(today.getFullYear(), fyeMonth0);
    if (lastFye > today) lastFye = lastDay(today.getFullYear() - 1, fyeMonth0);
    var fyes = [-1, 0, 1].map(function (k) { return lastDay(lastFye.getFullYear() + k, fyeMonth0); });
    fyes.forEach(function (fye) {
      var ya = fye.getFullYear() + 1;
      var label = 'FY ending ' + fmt(fye);
      items.push({ date: lastDay(fye.getFullYear(), fye.getMonth() + 3), what: 'ECI', detail: label + ' (3 months after year end, unless waived)' });
      items.push({ date: new Date(ya, 10, 30), what: 'Form C-S / C', detail: label + ' (YA ' + ya + ')' });
    });
    var cutoff = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
    if (gstPattern !== 'none') {
      var first = parseInt(gstPattern, 10); // quarter-end months: first, first+3, first+6, first+9 (0-based)
      var found = 0;
      // From 8 months back, so returns due in the past 6 months are listed (greyed) as well,
      // then the next 4 still to come.
      for (var k = -8; found < 4 && k < 24; k++) {
        var qEndMonth = today.getMonth() + k;
        if (((qEndMonth - first) % 3 + 3) % 3 !== 0) continue;
        var qEnd = lastDay(today.getFullYear(), qEndMonth);
        var due = lastDay(qEnd.getFullYear(), qEnd.getMonth() + 1);
        if (due < cutoff) continue;
        if (due >= today) found++;
        var qStart = new Date(qEnd.getFullYear(), qEnd.getMonth() - 2, 1);
        items.push({ date: due, what: 'GST return', detail: MONTHS[qStart.getMonth()] + '–' + MONTHS[qEnd.getMonth()] + ' ' + qEnd.getFullYear() + ' quarter' });
      }
    }
    // Show everything still to come, plus anything due in the last 6 months (greyed as passed).
    items = items.filter(function (it) { return it.date >= cutoff; });
    items.sort(function (a, b) { return a.date - b.date; });
    return items;
  }

  function render() {
    var items = compute(parseInt(fyeSel.value, 10), gstSel.value);
    var nextMarked = false;
    list.innerHTML = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var past = it.date < today;
      li.className = 'fd__item' + (past ? ' is-past' : '');
      if (!past && !nextMarked) { li.className += ' is-next'; nextMarked = true; }
      li.innerHTML = '<time datetime="' + it.date.toISOString().slice(0, 10) + '">' + fmt(it.date) + '</time>' +
        '<span class="fd__what">' + it.what + (past ? ' <small>(passed)</small>' : '') + '</span>' +
        '<span class="fd__detail">' + it.detail + '</span>';
      list.appendChild(li);
    });
  }

  root.addEventListener('change', render);
  root.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  root.classList.add('is-ready');
  render();
})();
