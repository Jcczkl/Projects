/* notice.js — dated content: hide it (or swap in a fallback line) from its end date (opt-in: <script src="assets/js/notice.js" defer>).
   <p class="notice" data-notice-until="2027-02-12">Closed for Chinese New Year, 9-11 Feb.</p>
   <div class="cert" data-notice-until="2027-01-01" data-notice-expired="Our halal certificate is being renewed. Ask us for the latest.">…</div>
   The date is the first day the content should be gone (compared at local midnight).
   With data-notice-expired the element stays and shows that line instead (certificate card, 2026-10-09 new request).
   Without JS the content simply stays, so keep the wording true after the date ("9-11 Feb", "valid until 31 Dec 2026");
   check_site.py warns before a certificate's date and fails after it. */
(function () {
  'use strict';
  var today = new Date(); today.setHours(0, 0, 0, 0);
  document.querySelectorAll('[data-notice-until]').forEach(function (el) {
    var p = (el.getAttribute('data-notice-until') || '').split('-');
    if (p.length !== 3) return;
    var until = new Date(+p[0], +p[1] - 1, +p[2]);
    if (today < until) return;
    var fallback = el.getAttribute('data-notice-expired');
    if (!fallback) { el.hidden = true; return; }
    while (el.firstChild) el.removeChild(el.firstChild);
    var line = document.createElement('p');
    line.textContent = fallback;
    el.appendChild(line);
    el.classList.add('is-expired');
  });
})();
