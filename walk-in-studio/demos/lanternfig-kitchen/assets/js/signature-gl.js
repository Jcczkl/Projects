/* signature-gl.js - the WebGL variant of the Signature ink dissolve (COMPONENTS.md "Signature motion").
   Optional: signature.js fetches it only for data-sig-ink="gl". The mask variant is the default (measured 2026-10-11:
   same smoothness at 4x throttle, no GPU dependency, no extra file). A noise-threshold flood in the next scene's colour. */
window.sigInkGL = function (el) {
  var canvas = document.createElement('canvas'); canvas.className = 'sig-ink__gl'; canvas.setAttribute('aria-hidden', 'true');
  el.querySelector('.sig-ink__stage').appendChild(canvas);
  var gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  if (!gl) { canvas.remove(); return null; }
  var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var fs = 'precision mediump float;uniform vec2 r;uniform float k;uniform vec3 c;' +
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}' +
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}' +
    'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/max(r.x,r.y);float d=length(uv)*1.6+fbm(uv*4.+3.7)*.75;' +
    'float e=k*2.1;float a=smoothstep(e,e-.12,d);gl_FragColor=vec4(c,a);}';
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var pg = gl.createProgram();
  gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) { canvas.remove(); return null; }
  gl.useProgram(pg);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uR = gl.getUniformLocation(pg, 'r'), uK = gl.getUniformLocation(pg, 'k'), uC = gl.getUniformLocation(pg, 'c');
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  function rgb(css) {
    css = css.trim();
    var hx = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
    if (hx) {
      var v = hx[1].length === 3 ? hx[1].replace(/./g, '$&$&') : hx[1];
      return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
    }
    var m = css.match(/\d+(\.\d+)?/g) || [0, 0, 0];
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }
  return function (k, next) {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.round(canvas.clientWidth * dpr * 0.5), h = Math.round(canvas.clientHeight * dpr * 0.5); // half resolution: soft ink anyway
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!next || k <= 0) return;
    var c = rgb(getComputedStyle(next).getPropertyValue('--scene-bg') || 'rgb(0,0,0)');
    gl.uniform2f(uR, w, h); gl.uniform1f(uK, k); gl.uniform3f(uC, c[0], c[1], c[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
};
