/* timetable.js - the tuition kit's signature: this term's classes, filtered by level (Primary / Secondary / JC).
   Without JavaScript every class shows. A level's "timetable" link (data-level-link) opens the table already filtered. */
(function () {
  var filters = [].slice.call(document.querySelectorAll('[data-level-filter]'));
  if (!filters.length) return;
  var rows = [].slice.call(document.querySelectorAll('tr[data-level]'));
  var count = document.querySelector('[data-tt-count]');
  var table = document.querySelector('.mw-table');
  /* Smooth: each table writes itself in row by row (site.css); the cells need their place in the row */
  [].slice.call(document.querySelectorAll('[data-reveal="fill"] tbody tr')).forEach(function (r, i) {
    r.style.setProperty('--r', i % 12);
    [].slice.call(r.children).forEach(function (c, j) { c.style.setProperty('--c', j); });
  });
  var names = { all: 'all levels', primary: 'Primary', secondary: 'Secondary', jc: 'JC' };
  function show(level) {
    var n = 0;
    rows.forEach(function (r) { var on = level === 'all' || r.getAttribute('data-level') === level; r.hidden = !on; if (on) n++; });
    filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-level-filter') === level)); });
    if (table && document.documentElement.getAttribute('data-motion') === 'smooth') {   // a tapped level is marked as it appears
      var v = 0;
      rows.forEach(function (r) { if (!r.hidden) r.style.setProperty('--v', v++); });
      table.classList.remove('is-rewrite'); void table.offsetWidth; table.classList.add('is-rewrite');
    }
    if (count) count.textContent = level === 'all' ? 'Showing all ' + n + ' classes' : 'Showing ' + n + ' ' + names[level] + ' classes';
  }
  filters.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-level-filter')); }); });
  [].slice.call(document.querySelectorAll('[data-level-link]')).forEach(function (a) {
    a.addEventListener('click', function () { show(a.getAttribute('data-level-link')); });
  });
})();
