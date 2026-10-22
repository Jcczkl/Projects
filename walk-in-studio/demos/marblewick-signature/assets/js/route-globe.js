/* route-globe.js — a live, spinnable globe linking places around the world to one hub.

   Ported from the globe Joseph built for the GAL Global Advisory website
   (gal-global.com, with GAL's OK, 2026-10-06) and made reusable: everything
   that was GAL's - colours, the 21 markets, the wording - is now config.
   Self-contained in WebStudio: needs only this file, route-globe-land.js and
   route-globe.css. Read "Route globe" in template/COMPONENTS.md before changing
   the geometry: rimArc / horizonCross / landPath are correct as they are.

   Markup (see COMPONENTS.md):
     <figure class="rg" data-route-globe="gal-style" data-places='[...]'>
       <img class="rg-poster" src="..." alt="...">          (JS off / reduced motion)
       <p class="rg-hint">Drag the globe to turn it</p>
     </figure>
   Or from script: RouteGlobe.mount(element, {preset: "flat-teal", places: [...]}).

   A live orthographic globe. Nothing is pre-baked: coastlines, graticule,
   routes, dots and labels are projected from lat/lon on every frame, so a
   label and its route stay pinned to the right place however it is turned.
   It tours the places by itself (easing to the midpoint between each place
   and the hub so both ends face the viewer), lights a route only once its
   place is round and named, and after a number of legs plays a two-view
   finale with every route at once. Drag with mouse, finger or arrow keys.
   Paused off-screen and in background tabs. Under prefers-reduced-motion the
   poster image stays and nothing animates. No library. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var R = 250, DEG = Math.PI / 180;
  var VX = -340, VY = -292, VW = 680, VH = 584, PAD = 4, PH = 25;
  var uid = 0;

  /* ---------------- presets ---------------- */
  var GAL_MARKETS = [
    ["United States", 38.90, -77.04], ["Canada", 43.65, -79.38], ["Brazil", -23.55, -46.63],
    ["United Kingdom", 51.51, -0.13], ["France", 48.86, 2.35], ["Netherlands", 52.37, 4.90],
    ["Germany", 52.52, 13.41], ["Switzerland", 47.38, 8.54], ["Italy", 41.90, 12.50],
    ["Russia", 55.76, 37.62], ["Turkey", 41.01, 28.98], ["United Arab Emirates", 25.20, 55.27],
    ["Saudi Arabia", 24.71, 46.68], ["South Africa", -26.20, 28.04], ["India", 19.08, 72.88],
    ["China", 31.23, 121.47], ["Hong Kong", 22.32, 114.17], ["South Korea", 37.57, 126.98],
    ["Japan", 35.68, 139.65], ["Indonesia", -6.21, 106.85], ["Australia", -33.87, 151.21]
  ];
  var BASE = {
    hub: ["Singapore", 1.3521, 103.8198],
    places: GAL_MARKETS,
    view: [13, -87],                 // [rotLat, rotLon] to start from
    land: "metallic",                // "metallic" (gradient ramp) or "flat"
    bezel: true, gloss: true,
    tour: true, finale: true, drag: true, labels: true,
    solidDim: false,                 // dim names: see-through pill (GAL) or solid pill + muted text
    hideRimNames: false,             // true: dim names near the rim are hidden, not drawn faint (data-rim-names="hide")
    timing: { leg: 1500, gap: 300, turnMax: 1800, legsPerFinale: 8, sweep: 1750, repeats: 2 },
    font: 'Poppins, "Segoe UI", Arial, sans-serif',
    label: "Globe showing places connected to the hub. Drag or use the arrow keys to turn it.",
    paint: {
      ocean: ["#5563BD", "#3A4698", "#242E6C"],
      rim: "#FBF187", shine: "#FFF6DE",
      gold: ["#FFF6CB", "#F2D882", "#D9AC3C", "#A97D22", "#E3BD5E", "#F7E7A4", "#9A7324"],
      bezel: ["#FFF7D0", "#D7A93A", "#8C6A1E", "#E7C465", "#FFF2B8"],
      landFlat: "#C9A23C", terminator: "#0B1233"
    },
    css: {   // become --rg-* custom properties (see route-globe.css)
      grat: "#FBF187", "grat-opacity": ".13", "land-stroke": "#6B4F16",
      casing: "#F3E2AE", trail: "#4A3A12", light: "#FFF6D6", glow: "rgba(255,236,160,.9)",
      origin: "#4A3A12", hub: "#E8C86A", "hub-stroke": "#fff",
      pill: "#141A45", "pill-stroke": "#E8C86A", "pill-text": "#E8C86A",
      "live-stroke": "#FFDF8F", "live-text": "#FFE9A8",
      "hub-pill": "#E8C86A", "hub-pill-stroke": "#141A45", "hub-pill-text": "#141A45",
      leader: "#FFDF8F", focus: "#FBF187", "inner-ring": "#3A2C0C", "outer-ring": "#FFF6CB"
    }
  };
  var PRESETS = {
    "gal-style": {},
    "flat-teal": {
      places: [["London", 51.51, -0.13], ["Dubai", 25.20, 55.27], ["Mumbai", 19.08, 72.88],
               ["Hong Kong", 22.32, 114.17], ["Tokyo", 35.68, 139.65], ["Sydney", -33.87, 151.21]],
      view: [10, -100], land: "flat", bezel: false, gloss: false, finale: false, solidDim: true,
      font: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
      paint: { ocean: ["#F4F8F7", "#E3EFEC", "#CFE2DD"], rim: "#0E5A52", shine: "#FFFFFF",
               landFlat: "#0E5A52", terminator: "#0F1A19" },
      css: { grat: "#0E5A52", "grat-opacity": ".10", "land-stroke": "#0B4A43", casing: "#FFFFFF",
             trail: "#0E5A52", light: "#E8A33D", glow: "rgba(232,163,61,.75)", origin: "#0E5A52",
             hub: "#E8A33D", "hub-stroke": "#fff", pill: "#FFFFFF", "pill-stroke": "#0E5A52",
             "pill-text": "#0E5A52", "live-stroke": "#E8A33D", "live-text": "#0F1A19",
             "hub-pill": "#0E5A52", "hub-pill-stroke": "#0E5A52", "hub-pill-text": "#FFFFFF",
             leader: "#E8A33D", focus: "#0E5A52", "inner-ring": "#0E5A52", "outer-ring": "#0E5A52" }
    }
  };

  function merge(a, b) {
    var out = {}, k;
    for (k in a) out[k] = a[k];
    for (k in b) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) out[k] = merge(a[k], b[k]);
      else out[k] = b[k];
    }
    return out;
  }

  /* ---------------- land (shared, decoded once) ---------------- */
  var LAND = null;
  function land() {
    if (LAND) return LAND;
    var str = window.ROUTE_GLOBE_LAND || "";
    var CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var IDX = {}; for (var c = 0; c < CH.length; c++) IDX[CH[c]] = c;
    var rings = [], parts = str ? str.split("|") : [];
    for (var p = 0; p < parts.length; p++) {
      var s = parts[p], i = 0, x = 0, y = 0, ring = [];
      while (i < s.length) {
        var vals = [];
        for (var k = 0; k < 2; k++) {
          var z = 0, sh = 0, cont = true;
          while (cont) { var v = IDX[s[i++]]; cont = v >= 32; z |= (v & 31) << sh; sh += 5; }
          vals.push((z & 1) ? -((z + 1) >> 1) : (z >> 1));
        }
        x += vals[0]; y += vals[1];
        ring.push([x / 4, y / 4]);
      }
      if (ring.length > 2) rings.push(ring);
    }
    LAND = rings;
    return LAND;
  }

  function mount(host, options) {
    if (!host || host.__routeGlobe) return host && host.__routeGlobe;
    var preset = (options && options.preset) || host.getAttribute("data-route-globe") || "gal-style";
    var cfg = merge(BASE, PRESETS[preset] || {});
    if (options) cfg = merge(cfg, options);
    var attrPlaces = host.getAttribute("data-places");
    if (attrPlaces) { try { cfg.places = JSON.parse(attrPlaces); } catch (e) { /* keep preset */ } }
    var attrHub = host.getAttribute("data-hub");
    if (attrHub) { try { cfg.hub = JSON.parse(attrHub); } catch (e) { /* keep preset */ } }
    if (host.getAttribute("data-rim-names") === "hide") cfg.hideRimNames = true;

    var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reduce && !(options && options.forceLive)) return null;   // the poster stays

    var id = "rg" + (++uid);
    var P = cfg.paint;
    for (var ck in cfg.css) host.style.setProperty("--rg-" + ck, cfg.css[ck]);
    host.style.setProperty("--rg-font", cfg.font);

    /* ---- the drawing ---- */
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "rg-svg");
    svg.setAttribute("viewBox", VX + " " + VY + " " + VW + " " + VH);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", cfg.label);
    if (cfg.drag) svg.setAttribute("tabindex", "0");
    function stops(list) {
      var s = "";
      for (var i = 0; i < list.length; i++) s += '<stop offset="' + (list[i][0]) + '" stop-color="' + list[i][1] + '"' + (list[i][2] != null ? ' stop-opacity="' + list[i][2] + '"' : "") + "/>";
      return s;
    }
    var g = P.gold || BASE.paint.gold, bz = P.bezel || BASE.paint.bezel;
    /* The paint servers are created here, by the same script that uses them.
       GAL lesson: an SVG fill:url(#x) that does not resolve paints NOTHING - the
       continents vanished and left bare ocean - so never rely on gradients that
       live somewhere else. Every fill also carries a flat fallback colour. */
    svg.innerHTML =
      "<defs>" +
      '<radialGradient id="' + id + '-body" cx="38%" cy="32%" r="75%">' + stops([[0, P.ocean[0]], [.55, P.ocean[1]], [1, P.ocean[2]]]) + "</radialGradient>" +
      '<radialGradient id="' + id + '-rim" cx="50%" cy="50%" r="50%">' + stops([[.72, P.rim, 0], [.94, P.rim, .18], [1, P.rim, 0]]) + "</radialGradient>" +
      '<radialGradient id="' + id + '-shine" cx="50%" cy="50%" r="50%">' + stops([[0, P.shine, .20], [1, P.shine, 0]]) + "</radialGradient>" +
      '<linearGradient id="' + id + '-gold" gradientUnits="userSpaceOnUse" x1="-215" y1="-235" x2="185" y2="245">' +
        stops([[0, g[0]], [.14, g[1]], [.33, g[2]], [.50, g[3]], [.66, g[4]], [.84, g[5]], [1, g[6]]]) + "</linearGradient>" +
      '<linearGradient id="' + id + '-bezel" gradientUnits="userSpaceOnUse" x1="-250" y1="-250" x2="250" y2="250">' +
        stops([[0, bz[0]], [.28, bz[1]], [.52, bz[2]], [.74, bz[3]], [1, bz[4]]]) + "</linearGradient>" +
      '<radialGradient id="' + id + '-gloss" cx="32%" cy="26%" r="62%">' + stops([[0, "#FFFFFF", .34], [.55, "#FFF4D0", .08], [1, "#FFF4D0", 0]]) + "</radialGradient>" +
      '<radialGradient id="' + id + '-term" cx="50%" cy="50%" r="50%">' + stops([[.62, P.terminator, 0], [1, P.terminator, .45]]) + "</radialGradient>" +
      '<clipPath id="' + id + '-clip"><circle r="250"/></clipPath>' +
      "</defs>" +
      '<circle class="rg-glow" r="276" fill="url(#' + id + '-rim) transparent"/>' +
      '<circle class="rg-ocean" r="250" fill="url(#' + id + '-body) ' + P.ocean[1] + '"/>' +
      '<g clip-path="url(#' + id + '-clip)">' +
        '<path class="rg-grat" d=""/>' +
        '<path class="rg-land" d="" fill="' + (cfg.land === "flat" ? P.landFlat : "url(#" + id + "-gold) " + P.landFlat) + '"/>' +
        (cfg.gloss ? '<ellipse class="rg-shine" cx="-70" cy="-90" rx="210" ry="170" fill="url(#' + id + '-shine) transparent"/>' +
                     '<circle class="rg-gloss" r="250" fill="url(#' + id + '-gloss) transparent"/>' : "") +
        '<circle class="rg-terminator" r="250" fill="url(#' + id + '-term) transparent"/>' +
      "</g>" +
      (cfg.bezel ? '<circle class="rg-bezel" r="253" fill="none" stroke="url(#' + id + '-bezel) ' + bz[1] + '" stroke-width="7"/>' +
                   '<circle class="rg-inner-ring" r="249" fill="none" stroke-opacity=".5" stroke-width="1.4"/>' +
                   '<circle class="rg-outer-ring" r="257.5" fill="none" stroke-opacity=".28" stroke-width="1"/>'
                 : '<circle class="rg-inner-ring" r="250" fill="none" stroke-opacity=".35" stroke-width="1.2"/>') +
      '<circle class="rg-focus" r="262"/>' +
      '<g class="rg-arcs"></g><g class="rg-dots"></g>' +
      '<circle class="rg-hub-halo" r="7"/><circle class="rg-hub" r="5.5"/>' +
      '<g class="rg-hub-label"><rect height="25" rx="12.5"/><text text-anchor="middle"></text></g>' +
      '<g class="rg-leads"></g><g class="rg-labels"></g>';
    var poster = host.querySelector(".rg-poster");
    host.insertBefore(svg, poster ? poster.nextSibling : host.firstChild);
    host.classList.add("rg--live");

    var LANDR = land();
    var HUB = { name: cfg.hub[0], lat: cfg.hub[1], lon: cfg.hub[2] };
    var ORIGINS = cfg.places.map(function (p) { return { name: p[0], lat: p[1], lon: p[2] }; });
    var T = cfg.timing;

    /* ---- projection ---- */
    var rotLat = cfg.view[0], rotLon = cfg.view[1];
    var sinL, cosL;
    function setRot() { sinL = Math.sin(rotLat * DEG); cosL = Math.cos(rotLat * DEG); }
    setRot();
    var px = 0, py = 0;
    function project(lat, lon) {
      var la = lat * DEG, lo = (lon + rotLon) * DEG;
      var cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
      var pz = sinL * sla + cosL * cla * clo;               // >0 is the near side
      px = R * cla * slo;
      py = -R * (cosL * sla - sinL * cla * clo);
      return pz;
    }
    function toLimb(x, y) { var m = Math.sqrt(x * x + y * y) || 1; return [x / m * R, y / m * R]; }

    /* ---- paths (GAL geometry, unchanged - see COMPONENTS.md before touching) ---- */
    /* Bisect an edge to where it crosses the horizon, walking from the VISIBLE end;
       the other way round converges on the far vertex (the "Atlantic flood"). */
    function horizonCross(a, b) {
      var aVis = project(a[1], a[0]) > 0;
      var p0 = aVis ? a : b, p1 = aVis ? b : a;
      var lo = 0, hi = 1;
      for (var k = 0; k < 16; k++) {
        var m = (lo + hi) / 2;
        if (project(p0[1] + (p1[1] - p0[1]) * m, p0[0] + (p1[0] - p0[0]) * m) > 0) lo = m; else hi = m;
      }
      project(p0[1] + (p1[1] - p0[1]) * lo, p0[0] + (p1[0] - p0[0]) * lo);
      return toLimb(px, py);
    }
    /* Always the short way round the rim: the long way is only right for a ring
       that encircles the view centre, and such a ring never crosses the horizon. */
    function rimArc(from, to) {
      var a0 = Math.atan2(from[1], from[0]), a1 = Math.atan2(to[1], to[0]);
      var d = a1 - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      var steps = Math.max(2, Math.ceil(Math.abs(d) / 0.08)), pts = [];
      for (var i = 1; i <= steps; i++) { var a = a0 + d * (i / steps); pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
      return pts;
    }
    function signedArea(pts) {
      var a = 0;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
      return a / 2;
    }
    function toPath(pts) {
      if (signedArea(pts) < 0) pts = pts.slice().reverse();
      var s = "";
      for (var i = 0; i < pts.length; i++) s += (i ? "L" : "M") + pts[i][0].toFixed(1) + " " + pts[i][1].toFixed(1);
      return s + "Z";
    }
    /* Each ring is cut at the horizon and every visible run is closed along the rim
       against its OWN entry (closing against the next run's entry drew a chord). */
    function landPath() {
      var d = "";
      for (var r = 0; r < LANDR.length; r++) {
        var ring = LANDR[r], n = ring.length;
        var vis = new Array(n), xs = new Array(n), ys = new Array(n), anyVis = false, allVis = true, i;
        for (i = 0; i < n; i++) {
          vis[i] = project(ring[i][1], ring[i][0]) > 0;
          xs[i] = px; ys[i] = py;
          if (vis[i]) anyVis = true; else allVis = false;
        }
        if (!anyVis) continue;
        if (allVis) { var whole = []; for (i = 0; i < n; i++) whole.push([xs[i], ys[i]]); d += toPath(whole); continue; }
        var start = -1;
        for (i = 0; i < n; i++) if (vis[i] && !vis[(i - 1 + n) % n]) { start = i; break; }
        if (start < 0) continue;
        var at = start, guard = 0;
        while (guard++ < n + 4) {
          var entry = horizonCross(ring[(at - 1 + n) % n], ring[at]);
          var run = [entry], j = at, last = at;
          while (vis[j]) { run.push([xs[j], ys[j]]); last = j; j = (j + 1) % n; if (j === at) break; }
          var exit = horizonCross(ring[last], ring[j]);
          run.push(exit);
          d += toPath(run.concat(rimArc(exit, entry)));
          var k = j, hops = 0;
          while (!vis[k] && hops++ < n) k = (k + 1) % n;
          if (hops >= n || k === start) break;
          at = k;
        }
      }
      return d;
    }
    function gratPath() {
      var d = "", lat, lon, on;
      for (lon = -180; lon < 180; lon += 20) {
        on = false;
        for (lat = -90; lat <= 90; lat += 4) {
          if (project(lat, lon) > 0) { d += (on ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1); on = true; } else on = false;
        }
      }
      for (lat = -60; lat <= 60; lat += 30) {
        on = false;
        for (lon = -180; lon <= 180; lon += 4) {
          if (project(lat, lon) > 0) { d += (on ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1); on = true; } else on = false;
        }
      }
      return d;
    }
    function xyz(lat, lon) { var la = lat * DEG, lo = lon * DEG; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
    function toLatLon(v) { return [Math.asin(v[2]) / DEG, Math.atan2(v[1], v[0]) / DEG]; }
    var HUBV = xyz(HUB.lat, HUB.lon);
    /* Great circle to the hub, lifted off the surface so it reads as a route,
       cut where it goes behind. */
    function arcPoints(o, steps) {
      var a = o.v, b = HUBV;
      var dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      var om = Math.acos(dot);
      if (om < 1e-6) return [];
      var s = Math.sin(om), pts = [];
      for (var i = 0; i <= steps; i++) {
        var t = i / steps, w1 = Math.sin((1 - t) * om) / s, w2 = Math.sin(t * om) / s;
        var ll = toLatLon([w1 * a[0] + w2 * b[0], w1 * a[1] + w2 * b[1], w1 * a[2] + w2 * b[2]]);
        if (project(ll[0], ll[1]) > 0.015) { var k = 1 + 0.085 * Math.sin(Math.PI * t); pts.push([px * k, py * k]); }
        else if (pts.length) break;
      }
      return pts;
    }
    function lineOf(pts) { var d = ""; for (var i = 0; i < pts.length; i++) d += (i ? "L" : "M") + pts[i][0].toFixed(1) + " " + pts[i][1].toFixed(1); return d; }

    /* ---- nodes ---- */
    function q(sel) { return svg.querySelector(sel); }
    var gLand = q(".rg-land"), gGrat = q(".rg-grat"), gArcs = q(".rg-arcs"), gDots = q(".rg-dots");
    var gLabels = q(".rg-labels"), gLeads = q(".rg-leads"), hubDot = q(".rg-hub"), hubHalo = q(".rg-hub-halo");
    var hubLabel = q(".rg-hub-label"), hubRect = hubLabel.querySelector("rect"), hubText = hubLabel.querySelector("text");
    hubText.textContent = HUB.name;
    function el(tag, cls) { var n = document.createElementNS(NS, tag); if (cls) n.setAttribute("class", cls); return n; }

    var items = ORIGINS.map(function (o, i) {
      o.v = xyz(o.lat, o.lon);
      var casing = el("path", "rg-casing"); gArcs.appendChild(casing);
      var arc = el("path", "rg-trail"); gArcs.appendChild(arc);
      var light = el("path", "rg-light"); light.setAttribute("data-i", i); gArcs.appendChild(light);
      var dot = el("circle", "rg-origin"); dot.setAttribute("r", 3.4); gDots.appendChild(dot);
      var gl = el("g", "rg-label"); gl.setAttribute("data-i", i);
      var rect = el("rect"); rect.setAttribute("height", PH); rect.setAttribute("rx", 12.5);
      var text = el("text"); text.setAttribute("text-anchor", "middle");
      text.appendChild(document.createTextNode(o.name));
      gl.appendChild(rect); gl.appendChild(text); gLabels.appendChild(gl);
      var lead = el("line", "rg-leader"); lead.style.display = "none"; gLeads.appendChild(lead);
      return { o: o, arc: arc, casing: casing, light: light, dot: dot, g: gl, rect: rect, text: text, lead: lead, w: 0, i: i, pick: -1 };
    });

    /* The tour: the whole list in order, easing round to the great-circle midpoint
       of each place and the hub, so both ends of the route face the viewer. */
    var DIM = 0.26;
    var legStart = 0, legIdx = -1, order = [], orderAt = 0, legPhase = "turn", turnStart = 0;
    var tgtLon = rotLon, tgtLat = rotLat;
    for (var vi = 0; vi < items.length; vi++) {
      var ov = items[vi].o.v, mx = ov[0] + HUBV[0], my = ov[1] + HUBV[1], mz = ov[2] + HUBV[2];
      var ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      items[vi].view = toLatLon([mx / ml, my / ml, mz / ml]);
    }
    /* Finale viewpoints are chosen as a PAIR covering every place, with the hub in
       sight in both (best-view-then-patch put the second finale over Antarctica). */
    var BURST_VIEW = null, BURST_VIEW_B = null;
    function popcount(x) { var n = 0; while (x) { x &= x - 1; n++; } return n; }
    if (cfg.finale && items.length) (function () {
      var cand = [], lat, lon, i, c, m, w, d;
      for (lon = -180; lon < 180; lon += 6) {
        for (lat = -60; lat <= 60; lat += 6) {
          c = xyz(lat, lon);
          if (c[0] * HUBV[0] + c[1] * HUBV[1] + c[2] * HUBV[2] < 0.15) continue;
          m = 0;
          for (i = 0; i < items.length; i++) { w = items[i].o.v; d = c[0] * w[0] + c[1] * w[1] + c[2] * w[2]; if (d > 0.12) m |= (1 << i); }
          cand.push({ v: [lat, lon], m: m, n: popcount(m) });
        }
      }
      var ALL = items.length >= 31 ? -1 : (1 << items.length) - 1, bestA = null, bestB = null, bestScore = -1, j;
      for (i = 0; i < cand.length; i++) for (j = i + 1; j < cand.length; j++) {
        if (((cand[i].m | cand[j].m) & ALL) !== ALL) continue;
        var sc = cand[i].n + cand[j].n;
        if (sc > bestScore) { bestScore = sc; bestA = cand[i]; bestB = cand[j]; }
      }
      if (!bestA) { for (i = 0; i < cand.length; i++) if (!bestA || cand[i].n > bestA.n) bestA = cand[i]; bestB = bestA; }
      if (bestB.n > bestA.n) { var t = bestA; bestA = bestB; bestB = t; }
      BURST_VIEW = bestA.v; BURST_VIEW_B = bestB.v;
    })();
    var bursting = false, burstStart = 0, legsRun = 0, burstStage = 0, burstTurning = false, burstTurnAt = 0;

    function clampLat(v) { return Math.max(-72, Math.min(72, v)); }
    function aimAt(view) { tgtLat = clampLat(view[0]); tgtLon = -view[1]; }
    function pickNext(now) {
      if (!items.length || !cfg.tour) { legIdx = -1; return; }
      if (!order.length) { for (var i = 0; i < items.length; i++) order.push(i); orderAt = 0; }
      legIdx = order[orderAt]; orderAt = (orderAt + 1) % order.length;
      legsRun += 1; legStart = now;
      aimAt(items[legIdx].view); legPhase = "turn"; turnStart = now;
    }

    function measure() {
      var fs = parseFloat(getComputedStyle(svg.querySelector(".rg-label text") || hubText).fontSize) || 13;
      items.forEach(function (it) {
        var w; try { w = it.text.getComputedTextLength(); } catch (e) { w = 0; }
        if (!w) w = it.o.name.length * fs * 0.58;
        it.w = Math.round(w + 22); it.rect.setAttribute("width", it.w);
      });
      var hw; try { hw = hubText.getComputedTextLength(); } catch (e) { hw = 0; }
      hubRect.setAttribute("width", Math.round((hw || HUB.name.length * fs * 0.6) + 24));
    }
    function hits(a, b) { return !(a[0] + a[2] + 6 < b[0] || b[0] + b[2] + 6 < a[0] || a[1] + a[3] + 5 < b[1] || b[1] + b[3] + 5 < a[1]); }

    var RINGS = [20, 36, 54, 74, 96, 122, 150, 182], NCAND = 4 + RINGS.length * 16;
    function draw(now) {
      gLand.setAttribute("d", landPath());
      gGrat.setAttribute("d", gratPath());
      var hz = project(HUB.lat, HUB.lon), hx = px, hy = py, hubOn = hz > 0;
      [hubDot, hubHalo].forEach(function (n) {
        n.setAttribute("cx", hx.toFixed(1)); n.setAttribute("cy", hy.toFixed(1)); n.style.display = hubOn ? "" : "none";
      });
      var taken = [];
      if (hubOn && cfg.labels) {
        var sw = +hubRect.getAttribute("width") || 98;
        var bx = Math.min(hx + 12, VX + VW - PAD - sw), by = hy - PH / 2;
        hubRect.setAttribute("x", bx.toFixed(1)); hubRect.setAttribute("y", by.toFixed(1));
        hubText.setAttribute("x", (bx + sw / 2).toFixed(1)); hubText.setAttribute("y", (by + 17.1).toFixed(1));
        hubLabel.style.display = ""; taken.push([bx, by, sw, PH]);
        taken.push([hx - 8, hy - 8, 16, 16]);   // keep every name off the hub dot (found on the showroom GAL page, 2026-10-07)
      } else hubLabel.style.display = "none";

      var n, it;
      for (n = 0; n < items.length; n++) {
        it = items[n];
        var z = project(it.o.lat, it.o.lon);
        it.ox = px; it.oy = py; it.z = z;
        var pts = arcPoints(it.o, 72); it.pts = pts;
        var d = pts.length > 1 ? lineOf(pts) : "";
        it.arc.setAttribute("d", d); it.casing.setAttribute("d", d);
        var vis = z > 0.06;
        it.visible = vis && pts.length > 1;
        it.dot.style.display = vis ? "" : "none";
        if (vis) { it.dot.setAttribute("cx", it.ox.toFixed(1)); it.dot.setAttribute("cy", it.oy.toFixed(1)); }
        it.light.setAttribute("d", ""); it.g.classList.remove("is-live"); it.g.style.display = "none";
      }

      /* which route is lit */
      if (bursting) {
        if (burstTurning) { if (now - burstTurnAt > T.turnMax) { burstTurning = false; burstStart = now; } }
        else if (now - burstStart >= T.sweep * T.repeats) {
          if (burstStage === 0) { burstStage = 1; burstTurning = true; burstTurnAt = now; aimAt(BURST_VIEW_B); }
          else { bursting = false; legsRun = 0; pickNext(now); }
        }
      } else if (legIdx < 0) {
        pickNext(now);
      } else if (legPhase === "turn") {
        /* light it once it is properly round, or give up waiting (someone may be holding it) */
        if (items[legIdx].z > 0.25 || now - turnStart > T.turnMax) { legPhase = "run"; legStart = now; }
      } else if (now - legStart > T.leg + T.gap) {
        if (cfg.finale && BURST_VIEW && legsRun >= T.legsPerFinale) {
          bursting = true; burstStart = now; legIdx = -1; burstStage = 0; burstTurning = true; burstTurnAt = now; aimAt(BURST_VIEW);
        } else pickNext(now);
      }

      /* Labels. The lit name is placed first; the rest follow, dimmed. A dim name
         only gets the four snug spots and may be dropped; a bright name is never
         dropped and never overlaps - it searches rings further out (16 directions,
         outward first) and gets a leader line back to its dot. */
      var brightAll = bursting && !burstTurning;
      if (cfg.labels) {
        var candidate = function (it, k) {
          var w = it.w, ox = it.ox, oy = it.oy;
          if (k < 4) return [[ox + 12, oy - PH / 2], [ox - 12 - w, oy - PH / 2], [ox - w / 2, oy + 13], [ox - w / 2, oy - 13 - PH]][k];
          k -= 4;
          var ring = RINGS[Math.floor(k / 16)], step = k % 16;
          var off = (step % 2 ? 1 : -1) * Math.ceil(step / 2);
          var ang = (Math.atan2(oy, ox) || 0) + off * Math.PI / 8, dx = Math.cos(ang), dy = Math.sin(ang);
          var cx = ox + dx * (ring + Math.abs(dx) * w / 2), cy = oy + dy * (ring + Math.abs(dy) * PH / 2);
          return [cx - w / 2, cy - PH / 2];
        };
        var dotBoxes = [];
        for (n = 0; n < items.length; n++) if (items[n].visible) dotBoxes.push([items[n].ox - 3, items[n].oy - 3, 6, 6, n]);
        var free = function (cand, self) {
          for (var a = 0; a < taken.length; a++) if (hits(cand, taken[a])) return false;
          for (a = 0; a < dotBoxes.length; a++) {
            var db = dotBoxes[a];
            if (db[4] !== self && !(cand[0] + cand[2] < db[0] || db[0] + db[2] < cand[0] || cand[1] + cand[3] < db[1] || db[1] + db[3] < cand[1])) return false;
          }
          return true;
        };
        var boxAt = function (it, k) {
          var c = candidate(it, k);
          return [Math.max(VX + PAD, Math.min(c[0], VX + VW - PAD - it.w)), Math.max(VY + PAD, Math.min(c[1], VY + VH - PAD - PH)), it.w, PH];
        };
        var placeLabel = function (it, bright) {
          if (!bright && cfg.hideRimNames && it.z < 0.28) { it.pick = -1; it.g.style.display = "none"; it.lead.style.display = "none"; return; }
          var limit = bright ? NCAND : 4, box = null, pick = -1, k;
          if (it.pick >= 0 && it.pick < limit) { var keep = boxAt(it, it.pick); if (free(keep, it.i)) { box = keep; pick = it.pick; } }
          for (k = 0; k < limit && !box; k++) { var cand = boxAt(it, k); if (free(cand, it.i)) { box = cand; pick = k; } }
          if (!box) { it.pick = -1; it.lead.style.display = "none"; if (!bright) return; box = boxAt(it, 0); }
          it.pick = pick; taken.push(box);
          it.rect.setAttribute("x", box[0].toFixed(1)); it.rect.setAttribute("y", box[1].toFixed(1));
          it.text.setAttribute("x", (box[0] + it.w / 2).toFixed(1)); it.text.setAttribute("y", (box[1] + 17.1).toFixed(1));
          it.g.style.display = "";
          var fade = brightAll && bright ? 1 : Math.min(1, (it.z - 0.06) / 0.22);
          var op = (bright || cfg.solidDim ? fade : fade * DIM).toFixed(2);   // solidDim: the pill stays solid, the text is muted (CSS)
          it.g.style.opacity = op;
          it.g.classList.toggle("is-dim", !!cfg.solidDim && !bright);
          if (bright) it.g.classList.add("is-live");
          if (pick >= 4) {
            var nx = Math.max(box[0], Math.min(it.ox, box[0] + box[2])), ny = Math.max(box[1], Math.min(it.oy, box[1] + box[3]));
            it.lead.setAttribute("x1", it.ox.toFixed(1)); it.lead.setAttribute("y1", it.oy.toFixed(1));
            it.lead.setAttribute("x2", nx.toFixed(1)); it.lead.setAttribute("y2", ny.toFixed(1));
            it.lead.style.opacity = op; it.lead.style.display = "";
          } else it.lead.style.display = "none";
        };
        var order2 = [];
        for (n = 0; n < items.length; n++) items[n].lead.style.display = "none";
        if (legIdx >= 0 && items[legIdx].visible) placeLabel(items[legIdx], true);
        for (n = 0; n < items.length; n++) if (n !== legIdx && items[n].visible) order2.push(n);
        if (brightAll) {
          var crowd = function (i) {
            var c = 0;
            for (var j = 0; j < items.length; j++) {
              if (j === i || !items[j].visible) continue;
              var dx = items[j].ox - items[i].ox, dy = items[j].oy - items[i].oy;
              if (dx * dx + dy * dy < 70 * 70) c++;
            }
            return c;
          };
          order2.sort(function (x, y) { return crowd(y) - crowd(x) || x - y; });
        }
        for (var oi = 0; oi < order2.length; oi++) placeLabel(items[order2[oi]], brightAll);
      }

      /* the travelling light: a segment running the route, its tail falling away */
      var TAIL = 16;
      var lit = function (it, u) {
        var ap = it.pts || [];
        if (ap.length < 2 || u >= 1) { it.light.setAttribute("d", ""); return; }
        var head = Math.max(1, Math.round(u * (ap.length - 1))), tail = Math.max(0, head - TAIL);
        it.light.setAttribute("d", lineOf(ap.slice(tail, head + 1)));
      };
      for (n = 0; n < items.length; n++) {
        it = items[n];
        if (bursting && !burstTurning && it.visible) lit(it, ((now - burstStart) % T.sweep) / T.sweep);
        /* a route lights only once its place has come round and is named */
        /* ...and only while its name is clearly showing (z 0.2 = label at least ~60% opaque).
           Found by the per-frame check: on the very first leg the turn gives up waiting
           (turnMax) before the place is round, and GAL's original lit the route for ~0.2 s
           with its name still fading in from nothing. */
        else if (!bursting && n === legIdx && legPhase === "run" && it.visible && it.z > 0.2) lit(it, Math.min(1, (now - legStart) / T.leg));
        else it.light.setAttribute("d", "");
      }
    }

    /* ---- motion and interaction ---- */
    var vel = 0, velLat = 0, dragging = false, lastX = 0, lastY = 0, idle = 0, pid = null;
    var raf = 0, prev = 0, running = false, onScreen = false;
    function frame(ts) {
      var dt = prev ? Math.min(64, ts - prev) : 16;
      prev = ts;
      if (!dragging) {
        if (Math.abs(vel) > 0.02 || Math.abs(velLat) > 0.02) {
          rotLon += vel * dt / 16; rotLat = clampLat(rotLat + velLat * dt / 16);
          vel *= 0.94; velLat *= 0.94; idle = 0;
        } else {
          vel = velLat = 0; idle += dt;
          if (idle > 900) {           // ease round to whatever the tour wants next, the short way
            var dLon = (tgtLon - rotLon) % 360;
            if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;
            var k = 1 - Math.pow(0.12, dt / 1000);
            rotLon += dLon * k; rotLat = clampLat(rotLat + (tgtLat - rotLat) * k);
          }
        }
      }
      setRot();
      draw(ts);
      if (host.__rgOnFrame) host.__rgOnFrame(ts);      // test hook (tests/globe_check.py)
      raf = running ? window.requestAnimationFrame(frame) : 0;
    }
    function start() { if (!raf) { prev = 0; running = true; raf = window.requestAnimationFrame(frame); } }
    function stop() { running = false; if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }
    function update() { (onScreen && !document.hidden) ? start() : stop(); }

    if (cfg.drag && window.PointerEvent) {
      svg.addEventListener("pointerdown", function (e) {
        if (e.button != null && e.button !== 0) return;
        if (e.pointerType !== "keyboard") e.preventDefault();
        dragging = true; idle = 0; vel = velLat = 0; lastX = e.clientX; lastY = e.clientY; pid = e.pointerId;
        if (svg.setPointerCapture && pid != null) { try { svg.setPointerCapture(pid); } catch (err) { /* ignore */ } }
        host.classList.add("is-dragging"); start();
      });
      svg.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var rect = svg.getBoundingClientRect(), k = 360 / Math.max(rect.width, 1) * 0.85;
        var dx = (e.clientX - lastX) * k, dy = (e.clientY - lastY) * k;
        lastX = e.clientX; lastY = e.clientY;
        rotLon += dx; rotLat = clampLat(rotLat + dy); vel = dx * 0.55; velLat = dy * 0.45;
        e.preventDefault();
      });
      var up = function () {
        if (!dragging) return;
        dragging = false; idle = 0;
        if (pid != null && svg.releasePointerCapture) { try { svg.releasePointerCapture(pid); } catch (err) { /* ignore */ } }
        pid = null; host.classList.remove("is-dragging");
      };
      svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up); svg.addEventListener("pointerleave", up);
      svg.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 20 : 8, used = true;
        if (e.key === "ArrowLeft") rotLon += step;
        else if (e.key === "ArrowRight") rotLon -= step;
        else if (e.key === "ArrowUp") rotLat = clampLat(rotLat + step / 2);
        else if (e.key === "ArrowDown") rotLat = clampLat(rotLat - step / 2);
        else used = false;
        if (used) { idle = 0; vel = velLat = 0; start(); e.preventDefault(); }
      });
    } else host.classList.add("rg--no-drag");

    measure(); setRot(); draw((window.performance && performance.now) ? performance.now() : 0);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; update(); }, { threshold: 0.08 }).observe(host);
    } else { onScreen = true; update(); }
    document.addEventListener("visibilitychange", update);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); });

    var api = { host: host, svg: svg, config: cfg, items: items, start: start, stop: stop,
                state: function () { return { legIdx: legIdx, legPhase: legPhase, bursting: bursting, burstTurning: burstTurning, rotLat: rotLat, rotLon: rotLon }; } };
    host.__routeGlobe = api;
    return api;
  }

  window.RouteGlobe = { mount: mount, presets: PRESETS, defaults: BASE };
  function auto() { Array.prototype.forEach.call(document.querySelectorAll("[data-route-globe]"), function (h) { mount(h); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
})();
