/* fx.js — optional starfield background for [data-fx="stars"] sections.
   Canvas, paused when off-screen, capped at 60 fps. Off under
   prefers-reduced-motion, Save-Data, and on low-power devices
   (≤ 4 CPU cores or ≤ 4 GB memory, where the browser reports them). */
(function () {
  'use strict';
  var hosts = document.querySelectorAll('[data-fx="stars"]');
  if (!hosts.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var conn = navigator.connection || {};
  if (conn.saveData) return;
  if ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) return;

  hosts.forEach(function (host) {
    var canvas = document.createElement('canvas');
    canvas.className = 'fx-stars';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    var ctx = canvas.getContext('2d');
    var stars = [], running = false, last = 0, raf = 0;
    var colour = getComputedStyle(host).getPropertyValue('--fx-colour').trim() || '255,255,255';

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(host.clientWidth * dpr);
      canvas.height = Math.round(host.clientHeight * dpr);
      var n = Math.min(160, Math.round(host.clientWidth * host.clientHeight / 9000));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          r: (Math.random() * 1.3 + .3) * dpr, v: (Math.random() * .25 + .05) * dpr, t: Math.random() * 6.28 });
      }
    }
    function frame(now) {
      raf = running ? requestAnimationFrame(frame) : 0;
      if (now - last < 16) return; // ~60 fps cap (also on 120 Hz screens)
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.y -= s.v; s.t += .02;
        if (s.y < -2) { s.y = canvas.height + 2; s.x = Math.random() * canvas.width; }
        ctx.globalAlpha = .35 + Math.sin(s.t) * .3;
        ctx.fillStyle = 'rgb(' + colour + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
    }
    var onScreen = false;
    function update() {
      running = onScreen && !document.hidden;
      if (running && !raf) raf = requestAnimationFrame(frame);
    }
    new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; update(); }).observe(host);
    document.addEventListener('visibilitychange', update);
    resize();
    window.addEventListener('resize', resize);
  });
})();
