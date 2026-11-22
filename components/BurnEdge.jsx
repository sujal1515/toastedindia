"use client";

// A burning paper edge, drawn live with a small WebGL shader. It sits over the left edge of
// a paper element and paints, from left to right:
//   faint smoke and a few sparks drifting off → a hot glow → a thin, flickering ember line
//   that wanders up and down the edge → black char with embers still glowing in it →
//   brown scorch → the paper itself (laid lines and all), fading into the element's own paper.
// The front is ragged and slowly creeps and breathes, so it reads like real burning paper.
//
// Props: front (px from the canvas's left edge where the burn front sits), paperLeft (px from
// the canvas's left edge where the element's own paper begins, for lining up the laid lines),
// flare (ref whose .current 0..1 brightens the burn, e.g. while the paper is moving).
import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;      // canvas size in device px
uniform float uDpr;
uniform float uTime;
uniform float uFront;   // css px
uniform float uLines;   // css px offset of the paper's laid lines
uniform float uFlare;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; }
  return v;
}

const vec3 PAPER = vec3(0.965, 0.937, 0.867);

void main(){
  vec2 px = gl_FragCoord.xy / uDpr;           // css px, y up
  float H = uRes.y / uDpr;
  float W = uRes.x / uDpr;
  float t = uTime;
  float y = H - px.y;                          // css px, from the top

  // the ragged burn front: big slow lobes, smaller tears, a fine fibrous fringe
  float front = uFront
    + (fbm(vec2(y * 0.02, t * 0.045)) - 0.5) * 34.0
    + (noise(vec2(y * 0.1, t * 0.18)) - 0.5) * 7.0
    + (noise(vec2(y * 0.75, 3.0)) - 0.5) * 1.1;
  float d = px.x - front;                      // > 0: paper still there

  float flick = 0.75 + 0.25 * noise(vec2(y * 0.08, t * 2.6)) + 0.15 * uFlare;
  vec3 col = vec3(0.0);
  float a = 0.0;

  if (d > 0.0) {
    // paper with laid lines, scorched and charred toward the front
    float lx = px.x - uLines;
    float laid = smoothstep(0.92, 1.0, fract(lx / 14.0)) * 0.06;
    vec3 paper = PAPER * (1.0 - laid) - 0.025 * fbm(px * 0.12);
    float scorchW = 20.0 + 14.0 * fbm(vec2(y * 0.03, 7.0));
    float s = clamp(d / scorchW, 0.0, 1.0);
    vec3 charc = mix(vec3(0.05, 0.03, 0.025), vec3(0.24, 0.12, 0.05), smoothstep(0.0, 0.35, s));
    charc = mix(charc, vec3(0.62, 0.40, 0.20), smoothstep(0.3, 0.7, s));
    charc = mix(charc, vec3(0.86, 0.72, 0.52), smoothstep(0.65, 0.95, s));
    col = mix(charc, paper, smoothstep(0.85, 1.0, s));
    // embers still glowing inside the char
    float e = smoothstep(0.58, 0.85, noise(vec2(px.x * 0.35, y * 0.22 + t * 0.7))) * (1.0 - smoothstep(0.0, 8.0, d));
    col += vec3(1.0, 0.34, 0.06) * e * flick * 1.2;
    a = 1.0;
    // fade into the element's own paper on the right
    a *= 1.0 - smoothstep(W - 14.0, W - 1.0, px.x);
    col *= a;
  }

  // the ember line right at the front
  // a thin hot core inside a softer orange glow, brightest where the noise says so
  float heat = flick * (0.55 + 0.45 * noise(vec2(y * 0.05, t * 0.8)));
  float core = exp(-abs(d) * 1.6) * heat;
  float halo = exp(-abs(d) * 0.35) * heat * 0.45;
  vec3 hot = mix(vec3(0.95, 0.28, 0.04), vec3(1.0, 0.78, 0.42), smoothstep(0.5, 1.0, core));
  col += hot * core * 1.1 + vec3(1.0, 0.32, 0.06) * halo;
  a = max(a, clamp(core * 1.1 + halo, 0.0, 1.0));

  if (d < 0.0) {
    // warm glow off the edge, faint smoke, a few sparks drifting away
    // a lip of broken grey-black ash still clinging to the edge
    float ash = smoothstep(0.38, 0.62, noise(vec2(y * 0.35, px.x * 0.5))) * (1.0 - smoothstep(0.0, 4.5, -d));
    col = mix(col, vec3(0.1, 0.085, 0.08), ash * 0.9);
    a = max(a, ash * 0.9);
    float glow = exp(d / 6.0) * 0.4 * flick;
    col += vec3(1.0, 0.36, 0.08) * glow;
    a = max(a, glow);
    float sm = fbm(vec2(px.x * 0.05 + t * 0.15, y * 0.025 + t * 0.35));
    float smoke = smoothstep(0.5, 0.85, sm) * exp(d / 22.0) * 0.28;
    col += vec3(0.78, 0.75, 0.82) * smoke;
    a = max(a, smoke);
    for (int i = 0; i < 6; i++){
      float fi = float(i);
      float life = fract(t * (0.35 + 0.1 * hash(vec2(fi, 2.0))) + hash(vec2(fi, 9.0)));
      vec2 sp = vec2(uFront - 3.0 - life * (18.0 + 14.0 * hash(vec2(fi, 4.0))), H * hash(vec2(fi, 7.0)) - life * 26.0);
      float sd = length(vec2(px.x, y) - sp);
      float spark = exp(-sd * 1.3) * (1.0 - life) * 1.4;
      col += vec3(1.0, 0.62, 0.22) * spark;
      a = max(a, spark);
    }
  }

  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

export default function BurnEdge({ front = 36, paperLeft = 26, flare, className = "" }) {
  const holder = useRef(null);
  const props = useRef({ front, paperLeft });
  props.current = { front, paperLeft };

  useEffect(() => {
    // a fresh canvas per mount, so a dev-mode double mount never reuses a context we released
    const el = document.createElement("canvas");
    // size comes from the holder, never from the canvas's own pixel size (that would feed back)
    el.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%";
    holder.current.appendChild(el);
    const gl = el.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return () => el.remove();
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => el.remove();
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = Object.fromEntries(["uRes", "uDpr", "uTime", "uFront", "uLines", "uFlare"].map((n) => [n, gl.getUniformLocation(prog, n)]));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const size = () => {
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);

    let raf;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const t0 = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || !el.clientHeight) return;
      size();
      gl.uniform2f(u.uRes, el.width, el.height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uTime, (now - t0) / 1000);
      gl.uniform1f(u.uFront, props.current.front);
      gl.uniform1f(u.uLines, props.current.paperLeft);
      gl.uniform1f(u.uFlare, flare?.current ?? 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      el.remove();
    };
  }, [flare]);

  return <div ref={holder} className={`burn-edge ${className}`} aria-hidden="true" />;
}
