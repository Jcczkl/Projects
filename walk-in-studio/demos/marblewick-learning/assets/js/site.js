/* site.js — small enhancements. The site works fully with JS off.
   Everything motion-related is skipped under prefers-reduced-motion. */
(function () {
  'use strict';
  var doc = document.documentElement;
  // Motion tiers: only <html data-motion="smooth"> animates (Standard is the default).
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || doc.getAttribute('data-motion') !== 'smooth';
  var hasSDA = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  /* ---- Mobile nav ---- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  }

  /* ---- Current year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---- Highlight today in opening hours (rows carry data-days="1,2,3" with 0 = Sunday) ---- */
  var today = String(new Date().getDay());
  document.querySelectorAll('.hours tr[data-days]').forEach(function (tr) {
    if (tr.getAttribute('data-days').split(',').indexOf(today) !== -1) tr.classList.add('is-today');
  });

  /* ---- Demo forms never send: belt and braces on top of the disabled fieldset ---- */
  document.querySelectorAll('form[data-demo]').forEach(function (f) {
    f.addEventListener('submit', function (e) { e.preventDefault(); });
  });

  /* ---- Sticky header shrink ---- */
  var header = document.querySelector('.site-header');
  var fab = document.querySelector('.wa-fab');
  var firstRow = fab && document.querySelector('main .btn-row');
  var lastY = -1;

  /* ---- Scroll-linked effects: progress bar, kinetic lines, chapters (fallback when no CSS scroll timelines) ---- */
  var scrubbers = [];
  if (!reduce && !hasSDA) {
    var bar = document.querySelector('.scroll-progress');
    if (bar) scrubbers.push({ el: bar, page: true });
    document.querySelectorAll('.kinetic__line').forEach(function (el) { scrubbers.push({ el: el, mode: 'cover' }); });
    document.querySelectorAll('.chapter').forEach(function (el) { scrubbers.push({ el: el, mode: 'contain' }); });
  }
  document.querySelectorAll('.chapter').forEach(function (ch) {
    var lines = ch.querySelectorAll('.chapter__line');
    ch.style.setProperty('--n', lines.length);
    lines.forEach(function (l, i) { l.style.setProperty('--i', i); });
  });

  var ticking = false;
  function onFrame() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    if (header && y !== lastY) header.classList.toggle('is-scrolled', y > 40);
    if (fab && y !== lastY) {
      /* never sit on top of the first buttons on the page (2026-10-07 review: phone hero buttons hidden) */
      var r = firstRow ? firstRow.getBoundingClientRect() : null;
      var clash = r && r.bottom > vh - 64 && r.top < vh;
      fab.classList.toggle('is-shown', y >= Math.min(240, (doc.scrollHeight - vh) / 2) && !clash);
    }
    lastY = y;
    for (var i = 0; i < scrubbers.length; i++) {
      var s = scrubbers[i], p;
      if (s.page) {
        var max = doc.scrollHeight - vh;
        p = max > 0 ? y / max : 0;
      } else {
        var r = s.el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue; // off-screen: skip work
        p = s.mode === 'cover' ? (vh - r.top) / (vh + r.height) : -r.top / Math.max(1, r.height - vh);
      }
      p = Math.min(1, Math.max(0, p));
      s.el.style.setProperty('--p', p.toFixed(4));
    }
  }
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } }
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  onFrame();

  /* ---- Scroll reveals (classes added by JS only; content visible without JS) ---- */
  document.querySelectorAll('[data-reveal-group]').forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (c, i) {
      if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', g.getAttribute('data-reveal-group') || '');
      c.style.setProperty('--i', i % 8);
    });
  });
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });   // starts once it is on screen, so the rise is seen
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---- Demo banner: Motion Standard / Smooth (remembered for this visitor) ---- */
  document.querySelectorAll('.motion-switch button').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-motion-set') === (doc.getAttribute('data-motion') || 'standard')));
    b.addEventListener('click', function () {
      try { localStorage.setItem('ws-motion', b.getAttribute('data-motion-set')); } catch (e) { /* private mode: this page only */ }
      doc.setAttribute('data-motion', b.getAttribute('data-motion-set'));
      location.reload();
    });
  });

  /* ---- Demo choices bar: one soft pulse on the other styles, on a visitor's first demo page only (never with reduced
     motion, never again once seen or used) - four-kinds brief part 3, 2026-10-13 ---- */
  var choices = document.querySelector('[data-choices]');
  if (choices) {
    var seen = false;
    try { seen = localStorage.getItem('ws-choices-seen') === '1'; localStorage.setItem('ws-choices-seen', '1'); } catch (e) { seen = true; }
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!seen && !calm) {
      choices.classList.add('is-hint');
      setTimeout(function () { choices.classList.remove('is-hint'); }, 2600);
    }
  }

  /* ---- Demo banner + choices bar stay on screen (sticky_demo_bar brief, Joseph 2026-10-13): fixed, the page keeps the
     full height as padding, slim one-line bar once scrolled, "see the styles" opens the thumbnails, one Motion toggle ---- */
  var dtop = document.querySelector('[data-demo-top]');
  if (dtop) {
    doc.classList.add('has-demo-top');
    var compact = false, fullH = 0;
    var setH = function () { doc.style.setProperty('--demo-top-h', dtop.offsetHeight + 'px'); };
    var measure = function () {
      var was = dtop.classList.contains('is-compact');
      var slim = window.matchMedia && matchMedia('(max-width: 760px)').matches;   // phones: the slim bar is the full height
      var wasTop = dtop.classList.contains('is-top');
      dtop.classList.toggle('is-compact', slim);
      dtop.classList.add('is-top');
      fullH = dtop.offsetHeight;
      dtop.classList.toggle('is-top', wasTop || window.pageYOffset <= 8);
      doc.style.setProperty('--demo-top-full', fullH + 'px');
      dtop.classList.toggle('is-compact', was);
      setH();
    };
    var peek = dtop.querySelector('.demo-choices__peek');
    var close = function () { dtop.classList.remove('is-peek'); if (peek) peek.setAttribute('aria-expanded', 'false'); };
    var phone = window.matchMedia ? matchMedia('(max-width: 760px)') : { matches: false };
    var onScroll = function () {
      var y = window.pageYOffset;
      // phones start slim too (blind review 2026-10-13: the full bar pushed the price and buttons off the first screen);
      // the thumbnails are one tap away ("see the styles"); desktop shows the full bar at the top
      var want = phone.matches || (compact ? y > 8 : y > 40);   // a little hysteresis: no flicker at the threshold
      if (dtop.classList.contains('is-top') !== (y <= 8)) { dtop.classList.toggle('is-top', y <= 8); setH(); }
      if (want !== compact) {
        compact = want;
        dtop.classList.toggle('is-compact', compact);
        if (!compact) close();
        setH();
      }
    };
    if (peek) peek.addEventListener('click', function () {
      var open = !dtop.classList.contains('is-peek');
      dtop.classList.toggle('is-peek', open);
      peek.setAttribute('aria-expanded', String(open));
      setH();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); setH(); } });
    var tog = dtop.querySelector('[data-motion-toggle]');
    if (tog) {
      var mode = doc.getAttribute('data-motion') || 'standard';
      tog.querySelector('[data-motion-now]').textContent = mode === 'smooth' ? 'Smooth' : 'Standard';
      tog.setAttribute('aria-label', 'Motion: ' + mode + '. Switch to ' + (mode === 'smooth' ? 'Standard' : 'Smooth'));
      tog.addEventListener('click', function () {
        var next = (doc.getAttribute('data-motion') || 'standard') === 'smooth' ? 'standard' : 'smooth';
        try { localStorage.setItem('ws-motion', next); } catch (e) { /* private mode: this page only */ }
        location.reload();                                    // the browser keeps the scroll position on a reload
      });
    }
    measure();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
  }

  /* ---- Before / after slider: the range input drives --pos ---- */
  document.querySelectorAll('.ba').forEach(function (ba) {
    var r = ba.querySelector('.ba__range');
    if (!r) return;
    var set = function () { ba.style.setProperty('--pos', r.value + '%'); };
    r.addEventListener('input', function () { ba.classList.remove('is-demo'); set(); });
    set();
    // Smooth tier: the first time it comes into view, the line sweeps across once to show
    // what the slider does (before -> after -> back to the middle). Standard stays still.
    if (!reduce && 'IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (es) {
        if (!es.some(function (e) { return e.isIntersecting; })) return;
        seen.disconnect();
        ba.classList.add('is-demo');
        // 30-64 keeps the BEFORE / AFTER labels and the measurements whole (review 2026-10-07)
        [[0, 30], [800, 64], [1600, 50]].forEach(function (step) {
          setTimeout(function () { if (ba.classList.contains('is-demo')) { r.value = step[1]; set(); } }, step[0]);
        });
        setTimeout(function () { ba.classList.remove('is-demo'); }, 2500);
      }, { threshold: 0.6 });
      seen.observe(ba);
    }
  });

  /* ---- Lookbook lightbox: tap a look to see it large, with its name, price and "Book this look" ---- */
  var looks = document.querySelectorAll('.look__open');
  if (looks.length && 'HTMLDialogElement' in window) {
    var box = document.createElement('dialog');
    box.className = 'lightbox';
    box.setAttribute('aria-label', 'Enlarged photo');
    box.innerHTML = '<img alt=""><div class="lightbox__bar"><p class="lightbox__text"></p><span class="btn-row"></span>' +
      '<button type="button" class="lightbox__close">Close</button></div>';
    document.body.appendChild(box);
    var bigImg = box.querySelector('img'), text = box.querySelector('.lightbox__text'), row = box.querySelector('.btn-row');
    box.querySelector('.lightbox__close').addEventListener('click', function () { box.close(); });
    box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
    looks.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var img = btn.querySelector('img'), fig = btn.closest('.look');
        bigImg.removeAttribute('srcset');
        bigImg.src = img.currentSrc || img.src;
        if (img.srcset) { bigImg.srcset = img.srcset; bigImg.sizes = '(max-width: 1100px) 96vw, 1100px'; }
        bigImg.alt = img.alt;
        var name = fig && fig.querySelector('.look__name'), meta = fig && fig.querySelector('.look__meta');
        text.textContent = [name && name.textContent, meta && meta.textContent].filter(Boolean).join(' · ');
        row.innerHTML = '';
        var book = fig && fig.querySelector('.look__book');
        if (book) { var c = book.cloneNode(true); c.className = 'btn btn--whatsapp'; row.appendChild(c); }
        box.showModal();
      });
    });
  }

  /* ---- Page transitions: the clicked card's image morphs into the next page's
     [data-vt-target] image (which carries view-transition-name: vt-media in CSS). ---- */
  if (!reduce) {
    var vtImg = null;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      var src = a && a.closest('[data-vt-source]');
      vtImg = src ? src.querySelector('img') : null;
    });
    window.addEventListener('pageswap', function (e) {
      if (!e.viewTransition || !vtImg) return;
      var own = document.querySelector('[data-vt-target]');
      if (own && own !== vtImg) own.style.viewTransitionName = 'none'; // names must be unique
      vtImg.style.viewTransitionName = 'vt-media';
    });
    // Coming back (or arriving) from a page a card links to: name that card's image, so the
    // project's hero image morphs back into its card. Cards: [data-vt-source] wrapping a link.
    window.addEventListener('pagereveal', function (e) {
      if (!e.viewTransition || !window.navigation || !navigation.activation || !navigation.activation.from) return;
      var from = navigation.activation.from.url.split('#')[0];
      document.querySelectorAll('[data-vt-source]').forEach(function (card) {
        var a = card.matches('a[href]') ? card : card.querySelector('a[href]');
        var img = card.querySelector('img');
        if (!a || !img || a.href.split('#')[0] !== from) return;
        var own = document.querySelector('[data-vt-target]');
        if (own && own !== img) own.style.viewTransitionName = 'none';
        img.style.viewTransitionName = 'vt-media';
      });
    });
    window.addEventListener('pageshow', function () { // back/forward cache: undo the swap
      document.querySelectorAll('[style*="view-transition-name"]').forEach(function (el) { el.style.viewTransitionName = ''; });
    });
  }
})();
