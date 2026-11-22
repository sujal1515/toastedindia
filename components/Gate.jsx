"use client";

// The age gate, which is also the loader.
//   - Left: TOASTED, split letter by letter across a loose grid.
//   - Right: the question on a photo card, the buttons and a loading line.
//   - Behind: one strip of rolling paper floating in the dark, slowly twisting
//     (cream face, violet back), burning at one end with a single thread of smoke.
// The site only opens once the visitor has said yes AND the 3D scene has finished loading.
// It always asks: the site only opens when the visitor clicks "Yes".
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

// [letter, column, row] — reads T-O-A-S-T-E-D left to right, top to bottom
const LETTERS = [
  ["T", 0, 0],
  ["O", 1, 0],
  ["A", 1, 1],
  ["S", 2, 1],
  ["T", 0, 2],
  ["E", 1, 2],
  ["D", 2, 3],
];

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uZoom;

const vec3 INK = vec3(0.043, 0.032, 0.072);
const vec3 CREAM = vec3(0.93, 0.89, 0.81);
const vec3 CORAL = vec3(1.0, 0.43, 0.34);
const vec3 VIOLET = vec3(0.42, 0.31, 0.84);

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// the centre line of a strip, at distance x along it; the pointer pulls it gently
float centre(float x, float t, float seed, vec2 bend){
  return 0.085 * sin(x * 1.6 + t * 0.21 + seed)
       + 0.032 * sin(x * 3.4 - t * 0.17 + seed * 2.0)
       + bend.y * exp(-(x - bend.x) * (x - bend.x) * 3.0);
}

// One strip of rolling paper floating in the dark, slowly twisting as it drifts.
// Where it faces you you see the cream paper (warming to coral along its length),
// where it has turned over you see the violet back. A satin sheen runs over each
// twist, laid lines and fibres sit in the paper, and if burnAt is set the strip
// ends in a charred edge with a live ember.
vec4 strip(vec2 p, float t, float seed, float w0, float blur, float burnAt, vec2 bend, float px){
  float x = p.x;
  float c = centre(x, t, seed, bend);
  float slope = (centre(x + 0.01, t, seed, bend) - c) / 0.01;
  float d = (p.y - c) / sqrt(1.0 + slope * slope);
  float th = x * 2.1 + t * 0.32 + seed;
  float ct = cos(th);
  float facing = abs(ct);
  float hw = w0 * max(facing, 0.03);
  float aa = blur + px;
  float cover = smoothstep(hw + aa, hw - aa, abs(d));
  if (cover <= 0.0) return vec4(0.0);
  float v = clamp(d / hw, -1.0, 1.0);
  float front = step(0.0, ct);

  vec3 face = mix(VIOLET * 0.62, mix(CREAM, mix(CREAM, CORAL, 0.6), smoothstep(-1.0, 1.4, x)), front);
  float paper = 1.0
    - 0.045 * smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(v * 46.0))
    - 0.06 * noise(vec2(x * 90.0, v * 5.0 + seed));
  float cup = 1.0 - 0.2 * v * v;
  vec3 col = face * (0.28 + 0.72 * facing) * cup * paper;
  float sheen = exp(-pow((sin(th) - 0.45) * 4.0 + v * 0.8, 2.0)) * facing;
  col += sheen * mix(vec3(0.62, 0.55, 1.0) * 0.28, vec3(1.0, 0.94, 0.86) * 0.42, front);
  // the paper edge catches light when the strip turns edge-on
  col += vec3(0.9, 0.86, 0.82) * 0.22 * (1.0 - smoothstep(0.03, 0.16, facing));

  if (burnAt > -9.0) {
    float edge = burnAt + (fbm(vec2(v * 2.2 + seed, t * 0.12)) - 0.5) * 0.1;
    float k = x - edge;
    cover *= smoothstep(-0.003, 0.003, k);
    col = mix(col, vec3(0.07, 0.045, 0.045), (1.0 - smoothstep(0.0, 0.08, k)) * 0.9);
    float flick = 0.78 + 0.22 * sin(t * 7.0 + v * 5.0) * sin(t * 3.1 + 1.0);
    col += vec3(1.0, 0.42, 0.12) * exp(-max(k, 0.0) * 140.0) * 1.7 * flick;
  }
  return vec4(col * cover, cover);
}

void main(){
  float m = min(uRes.x, uRes.y);
  vec2 half_ = 0.5 * uRes / m;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / m;
  float t = uTime;
  float px = 1.5 / m;

  // wide screens: the ember sits in the gap between the word and the card, the strip
  // rising to the top right. Tall phones: the ember sits right of the letters, the
  // strip rising up behind them.
  float tall = smoothstep(1.05, 0.6, uRes.x / uRes.y);
  float ang = mix(0.36, 1.9, tall);
  float burnAt = mix(-0.02, 0.174, tall);
  vec2 drift = vec2(0.0, sin(t * 0.3) * 0.012 + 0.419 * tall);
  vec2 mouse = uMouse * 2.0 * half_;
  vec2 bend = vec2((rot(ang) * mouse).x, 0.035 * clamp(uMouse.y * 2.0, -1.0, 1.0));

  // where the ember sits on screen: the glow, the smoke and the exit all start there
  vec2 tipP = vec2(burnAt, centre(burnAt, t, 0.0, bend)) - drift;
  vec2 ember = rot(-ang) * tipP;

  // the way in: dive toward the ember
  float zoom = uZoom * uZoom;
  uv = mix(uv, ember + (uv - ember) * 0.12, zoom);

  // the room: deep ink, a soft violet haze, the warm breath of the ember
  vec3 col = mix(INK, vec3(0.085, 0.06, 0.14), smoothstep(-0.8, 0.9, uv.y + uv.x * 0.3));
  col += VIOLET * 0.05 * fbm(uv * 1.5 + vec2(t * 0.02, -t * 0.01));
  col += vec3(1.0, 0.38, 0.18) * 0.1 * exp(-length(uv - ember) * 3.0);

  // a second strip, further back and out of focus
  vec2 pg = rot(ang) * (uv - uMouse * 0.02) + vec2(0.0, -0.3) + drift * 0.6;
  vec4 back = strip(pg, t * 0.8, 2.4, 0.05, 0.014, -99.0, bend * 0.4, px);
  col = mix(col, back.rgb / max(back.a, 0.001) * 0.42, back.a * 0.55);

  // the main strip
  vec2 p = rot(ang) * (uv - uMouse * 0.035) + drift;
  vec4 front = strip(p, t, 0.0, 0.082, 0.0, burnAt, bend, px);
  col = mix(col, front.rgb / max(front.a, 0.001), front.a);

  // a single thread of smoke from the ember, curling as it rises
  vec2 q = uv - ember;
  if (q.y > 0.0) {
    float up = q.y;
    float sway = sin(up * 6.0 - t * 0.8) * 0.035 * up + sin(t * 0.2) * up * up * 0.18;
    float wisp = fbm(vec2((q.x - sway) * 9.0, up * 3.0 - t * 0.35));
    float body = exp(-pow((q.x - sway) / (0.012 + up * 0.16), 2.0));
    float smoke = body * smoothstep(0.4, 0.75, wisp) * exp(-up * 1.5) * smoothstep(0.0, 0.04, up);
    col = mix(col, vec3(0.74, 0.7, 0.84), smoke * 0.4);
  }

  // a few motes of ash drifting up
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    float rate = 0.01 + 0.018 * hash(vec2(fi, 3.3));
    vec2 a = vec2((hash(vec2(fi, 1.3)) * 2.0 - 1.0) * half_.x, (fract(hash(vec2(fi, 7.1)) + t * rate) * 2.0 - 1.0) * half_.y);
    a.x += sin(t * 0.3 + fi) * 0.03;
    float tw = 0.5 + 0.5 * sin(t * (0.8 + hash(vec2(fi, 9.0))) + fi * 2.0);
    col += mix(CREAM, CORAL, hash(vec2(fi, 4.0))) * exp(-length(uv - a) * 420.0) * 0.5 * tw;
  }

  // film grain and a soft vignette, then the warm glow of the way in
  col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.022;
  col *= 1.0 - 0.5 * smoothstep(0.35, 1.25, length(uv * vec2(0.75, 1.0)));
  col = mix(col, vec3(1.0, 0.86, 0.7), zoom * 0.85);
  gl_FragColor = vec4(col, 1.0);
}
`;

function startShader(canvas, uniforms) {
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) return () => {};
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
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {};
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    mouse: gl.getUniformLocation(prog, "uMouse"),
    zoom: gl.getUniformLocation(prog, "uZoom"),
  };
  // the background is soft, so it renders at reduced resolution and the browser scales it up
  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * (window.innerWidth < 820 ? 0.85 : 0.75);
    canvas.width = Math.round(canvas.clientWidth * scale);
    canvas.height = Math.round(canvas.clientHeight * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);
  let raf;
  const t0 = performance.now();
  const frame = (now) => {
    uniforms.mx += (uniforms.tx - uniforms.mx) * 0.05;
    uniforms.my += (uniforms.ty - uniforms.my) * 0.05;
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, (now - t0) / 1000);
    gl.uniform2f(u.mouse, uniforms.mx, uniforms.my);
    gl.uniform1f(u.zoom, uniforms.zoom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

export default function Gate({ onDone }) {
  const root = useRef(null);
  const canvas = useRef(null);
  const yesBtn = useRef(null);
  const shader = useRef({ mx: 0, my: 0, tx: 0, ty: 0, zoom: 0 });
  const flow = useRef({ ready: false, want: false, leaving: false });
  const [mode, setMode] = useState("ask"); // ask | denied | waiting (said yes, still loading)
  const [pct, setPct] = useState(0);

  const leave = () => {
    const f = flow.current;
    if (f.leaving || !f.ready || !f.want) return;
    f.leaving = true;
    const q = gsap.utils.selector(root);
    gsap
      .timeline({ onComplete: onDone })
      .to(q(".gate-side > *"), { y: 24, opacity: 0, duration: 0.45, stagger: 0.04, ease: "power2.in" })
      .to(q(".gate-letter"), { yPercent: -120, rotate: () => gsap.utils.random(-25, 25), opacity: 0, filter: "blur(12px)", duration: 0.8, stagger: 0.05, ease: "power3.in" }, 0)
      .to(shader.current, { zoom: 1, duration: 1.3, ease: "power3.in" }, 0.15)
      .to(root.current, { opacity: 0, duration: 0.55, ease: "power1.out" }, "-=0.35");
  };

  const enter = () => {
    sessionStorage.setItem("toasted-18", "yes");
    flow.current.want = true;
    if (!flow.current.ready) setMode("waiting");
    leave();
  };

  // background + pointer
  useEffect(() => {
    const stop = startShader(canvas.current, shader.current);
    const move = (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      shader.current.tx = x;
      shader.current.ty = -y;
      root.current?.style.setProperty("--gx", x.toFixed(3));
      root.current?.style.setProperty("--gy", y.toFixed(3));
    };
    window.addEventListener("pointermove", move);
    return () => {
      stop();
      window.removeEventListener("pointermove", move);
    };
  }, []);

  // loading: creep forward on our own, jump with real progress, finish when the scene is ready
  useEffect(() => {
    const f = flow.current;
    let reported = 0;
    let shown = 0;
    const t0 = performance.now();
    const onProgress = (e) => (reported = Math.max(reported, e.detail));
    const onReady = () => (f.ready = true);
    if (window.__sceneReady) f.ready = true;
    window.addEventListener("scene:progress", onProgress);
    window.addEventListener("scene:ready", onReady);
    // never strand anyone behind the gate if something fails to report
    const fallback = setTimeout(onReady, 12000);
    const id = setInterval(() => {
      const creep = Math.min(0.86, (performance.now() - t0) / 5000);
      const target = f.ready ? 1 : Math.max(creep, reported * 0.9);
      shown += (target - shown) * 0.18;
      if (f.ready && shown > 0.995) shown = 1;
      setPct(Math.round(shown * 100));
      if (shown === 1) {
        clearInterval(id);
        leave();
      }
    }, 50);
    // letters arrive one by one
    const q = gsap.utils.selector(root);
    gsap.fromTo(q(".gate-letter"), { yPercent: 110, opacity: 0, filter: "blur(14px)" }, { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 1.1, stagger: 0.07, ease: "power4.out", delay: 0.15 });
    gsap.fromTo(q(".gate-side > *"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.07, ease: "power3.out", delay: 0.5 });
    return () => {
      clearInterval(id);
      clearTimeout(fallback);
      window.removeEventListener("scene:progress", onProgress);
      window.removeEventListener("scene:ready", onReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = pct < 100;

  return (
    <div ref={root} className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-q">
      <canvas ref={canvas} className="gate-liquid" aria-hidden="true" />
      <div className="gate-grain" aria-hidden="true" />

      <h1 className="gate-word" aria-label="Toasted">
        {LETTERS.map(([ch, col, row], i) => (
          <span key={i} className="gate-cell" style={{ gridColumn: col + 1, gridRow: row + 1, "--d": (i % 3) + 1 }} aria-hidden="true">
            <span className="gate-letter">{ch}</span>
          </span>
        ))}
        <span className="gate-mark" style={{ gridColumn: 3, gridRow: 3 }} aria-hidden="true">✦</span>
      </h1>

      <aside className="gate-side">
        <p className="gate-kicker gate-type">
          Papers with a<br />
          whole <span>personality.</span>
        </p>

        {/* the card is frosted glass over the photo: the photo shows faintly through it,
            and only the mannequin holding the packs stays sharp, standing in front of the glass */}
        <div className="gate-card">
          <div className="gate-card-glass" aria-hidden="true">
            <i className="gc-photo" />
            <i className="gc-sheen" />
            <img className="gc-figure" src="/gate/sesh-figure.webp" alt="" draggable="false" />
          </div>
          {mode === "denied" ? (
            <h2 id="gate-q" className="gate-type">Come back<br />at <span>18.</span></h2>
          ) : (
            <h2 id="gate-q" className="gate-type">Are you<br />18 or<br /><span>older?</span></h2>
          )}

          <div className="gate-card-foot">
            {mode === "denied" ? (
              <div className="gate-actions">
                <button className="gate-ghost" data-cursor onClick={() => setMode("ask")}>← I&apos;m 18 now</button>
              </div>
            ) : (
              <div className="gate-actions">
                {/* if they say yes before everything has loaded, the button shows the wait */}
                <button ref={yesBtn} className="gate-yes" data-cursor onClick={enter} disabled={mode === "waiting"} aria-busy={mode === "waiting"}>
                  <span>{mode === "waiting" ? `Rolling up… ${pct}%` : "Yes, let me in"}</span>
                  <i aria-hidden="true">→</i>
                </button>
                {mode !== "waiting" && (
                  <button className="gate-ghost" data-cursor onClick={() => setMode("denied")}>Not yet</button>
                )}
              </div>
            )}
            <div className={`gate-load ${loading ? "" : "done"}`} role="status" aria-live="polite">
              <span className="gate-load-bar"><i style={{ transform: `scaleX(${pct / 100})` }} /></span>
              <span className="gate-load-text">{loading ? `${pct}%` : "Ready"}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="gate-foot" aria-hidden="true">
        <span>Rolling papers &amp; trays — India</span>
        <span>18+ only</span>
      </div>
    </div>
  );
}
