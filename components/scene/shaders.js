const noise = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = m * p; a *= 0.5; }
    return v;
  }
`;

/* ---------- Full-screen smoke background ---------- */
export const bgVert = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

export const bgFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uWarp;
  uniform float uHero;   // 1 in the hero, fades to 0 as the story starts
  uniform vec2 uCenter;  // where the logo stage sits on screen
  uniform vec2 uMouse;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHot;
  ${noise}
  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  void main(){
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float t = uTime * 0.06;
    float r = length(p);

    // domain-warped smoke
    vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, -t * 1.3)));
    vec2 w = vec2(fbm(p * 1.8 + 3.5 * q + vec2(1.7, 9.2) + t * 0.6),
                  fbm(p * 1.8 + 3.5 * q + vec2(8.3, 2.8) - t * 0.5));
    float f = fbm(p * 1.3 + (2.6 + uWarp * 2.0) * w + uMouse * 0.25);

    vec3 col = mix(uDeep, uMid, smoothstep(0.15, 0.85, f));
    col = mix(col, uHot, smoothstep(0.62, 1.05, f + length(q) * 0.28) * 0.75);

    // hero: a slow vortex of smoke wrapping round a soft glow behind the logo stage
    vec2 hp = p - uCenter;
    float hr = length(hp);
    vec2 sp = rot(1.1 / (hr + 0.35) + uTime * 0.09) * hp;
    float arms = fbm(sp * 2.6 + q * 1.5);
    float vortex = smoothstep(0.42, 0.9, arms) * smoothstep(1.0, 0.08, hr);
    col += mix(uMid * 1.3, uHot, arms * 0.5) * vortex * 0.16 * uHero;

    float ang = atan(hp.y, hp.x);
    float rays = fbm(vec2(cos(ang), sin(ang)) * 2.4 + vec2(uTime * 0.05, hr * 0.6));
    rays = pow(rays, 3.0) * smoothstep(1.0, 0.12, hr);
    col += vec3(0.75, 0.62, 1.0) * rays * 0.2 * uHero;

    float core = exp(-hr * hr * 4.2) * (0.85 + 0.15 * sin(uTime * 0.8));
    col += (vec3(0.42, 0.3, 0.95) * 0.5 + vec3(1.0, 0.8, 0.3) * 0.08) * core * uHero;

    // ember glow following the pointer
    float glow = smoothstep(0.75, 0.0, length(p - uMouse * vec2(uAspect, 1.0) * 0.5));
    col += uHot * glow * 0.10;

    // poster-style halftone dots
    vec2 g = vUv * vec2(uAspect, 1.0) * 90.0;
    float dots = smoothstep(0.32, 0.28, length(fract(g) - 0.5));
    col += dots * 0.035 * smoothstep(0.3, 0.9, f);

    // vignette + grain
    col *= 1.0 - 0.55 * smoothstep(0.35, 1.05, r);
    col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.035;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ---------- Rolling paper: a flat leaf that rolls itself, then twists into a cone ---------- */
export const paperVert = /* glsl */ `
  uniform float uRoll;   // 0..1: the roll front travels up the leaf, like a carpet
  uniform float uTight;  // 0..1: the finished roll twists into a cone
  uniform float uWave;   // 0..1: how much the loose part of the leaf flutters
  uniform float uFold;   // 0..1: the lengthwise crease every leaf has from being interleaved in the pack
  uniform float uTime;
  uniform float uH;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWound;
  void main(){
    vUv = uv;
    float y = position.y + uH * 0.5;
    float r = 0.115;
    float front = uRoll * uH;
    float cone = mix(1.0, mix(0.62, 1.3, uv.x), uTight);

    vec3 p = position;
    vec3 n = vec3(0.0, 0.0, 1.0);
    float yy = y;
    float zz = 0.0;
    vWound = 0.0;
    if (y < front) {
      float a = (front - y) / r;          // how far this strip has wound round
      float rr = r * (1.0 - 0.012 * a);   // inner layers sit a little tighter
      yy = front - sin(a) * rr * cone;
      zz = (r - cos(a) * rr) * cone;
      n = vec3(0.0, sin(a), cos(a));
      vWound = a;
    } else {
      // the loose part of the leaf is never perfectly flat
      float lift = (y - front) / uH;
      float wx = position.x * 2.1 + uTime * 0.9;
      float wy = y * 4.6 - uTime * 1.2;
      zz = (sin(wx) * 0.075 + sin(wy) * 0.045 + sin(wx * 2.3 + wy) * 0.024) * uWave * lift;
      zz += abs(position.y) * 0.42 * uFold;
      n = normalize(vec3(-cos(wx) * 0.16 * uWave * lift, -cos(wy) * 0.2 * uWave * lift - sign(position.y) * 0.42 * uFold, 1.0));
    }
    p.y = yy - mix(uH * 0.5, front, uRoll);
    p.z = zz - r * cone * uRoll;

    vNormal = normalize(normalMatrix * n);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

export const paperFrag = /* glsl */ `
  precision highp float;
  uniform float uRoll;
  uniform float uTight;
  uniform float uEmber;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFade;      // 0..1: atmospheric fade for leaves deep in the background
  uniform vec3 uFogCol;
  uniform sampler2D uMark;  // the brand watermark pressed into the sheet
  uniform vec3 uL1;         // key light direction, in view space
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWound;
  ${noise}
  void main(){
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vView);

    /* --- the sheet itself --- */
    // long fibres running both ways, plus slow mottling, like real pulp
    float fibA = fbm(vUv * vec2(260.0, 36.0));
    float fibB = fbm(vUv * vec2(34.0, 240.0) + 7.0);
    float fibre = mix(fibA, fibB, 0.5);
    float mottle = fbm(vUv * vec2(9.0, 5.0) + 3.0);
    n = normalize(n + vec3(fibA - 0.5, fibB - 0.5, 0.0) * 0.24);

    // watermark: laid lines, chain lines and a diagonal pattern pressed into the paper.
    // Pressed = thinner, so it barely changes the colour but lets more light through.
    float laid = smoothstep(0.34, 0.5, abs(fract(vUv.y * 46.0) - 0.5));
    float chain = smoothstep(0.46, 0.5, abs(fract(vUv.x * 9.0) - 0.5));
    float diag = smoothstep(0.44, 0.5, abs(fract((vUv.x * 3.2 + vUv.y) * 11.0) - 0.5));
    float mark = texture2D(uMark, vUv * vec2(2.0, 1.0)).r;
    float thin = clamp(laid * 0.3 + chain * 0.4 + diag * 0.35 + mark * 0.9, 0.0, 1.0);
    // the fold line down the middle of every interleaved leaf
    float crease = smoothstep(0.01, 0.0, abs(vUv.y - 0.5));

    vec3 albedo = vec3(0.955, 0.93, 0.865);
    albedo *= 0.93 + 0.1 * fibre;
    albedo -= mottle * 0.035 + thin * 0.05 + crease * 0.07;

    // glossy gum strip along the top edge
    float gum = smoothstep(0.925, 0.94, vUv.y);
    albedo = mix(albedo, vec3(0.9, 0.83, 0.68), gum * 0.55);

    // rolled cardboard filter tip
    float tip = smoothstep(0.2, 0.19, vUv.x) * uTight;
    vec3 card = vec3(0.86, 0.72, 0.52) * (0.88 + 0.22 * fbm(vUv * vec2(420.0, 8.0)));
    albedo = mix(albedo, card, tip);

    /* --- light --- */
    vec3 L1 = normalize(uL1);                     // key
    vec3 L2 = normalize(vec3(-0.8, -0.2, 0.35));  // coral fill
    float d1 = max(dot(n, L1), 0.0);
    float d2 = max(dot(n, L2), 0.0);
    float wrap = dot(n, L1) * 0.5 + 0.5;
    vec3 col = albedo * (0.46 + 0.5 * d1 + 0.14 * wrap);
    col += albedo * vec3(1.0, 0.36, 0.36) * d2 * 0.34;

    // thin paper glows when the light is behind it; the watermark shows up brightest
    float through = max(dot(-n, L1), 0.0) * exp(-max(vWound - 3.0, 0.0) * 0.4) * (1.0 - tip);
    col += albedo * vec3(1.0, 0.88, 0.66) * through * (0.3 + 0.95 * thin);

    // layers inside the roll shade each other
    col *= 1.0 - 0.5 * (1.0 - exp(-max(vWound - 5.6, 0.0) * 0.5));

    vec3 h = normalize(L1 + v);
    col += pow(max(dot(n, h), 0.0), 48.0) * (0.05 + 0.55 * gum);
    col += pow(1.0 - max(dot(n, v), 0.0), 3.0) * vec3(1.0, 0.4, 0.4) * 0.2;

    /* --- the lit end: scorched paper, char line, glowing ring, ash --- */
    if (uEmber > 0.001) {
      float line = 1.0 - 0.13 * uEmber;                         // where the burn has reached
      float jag = (fbm(vec2(vUv.y * 46.0, uTime * 0.35)) - 0.5) * 0.035;
      float x = vUv.x + jag;
      float scorch = smoothstep(line - 0.07, line, x);
      float charred = smoothstep(line - 0.012, line + 0.008, x);
      float ring = exp(-pow((x - (line + 0.022)) / 0.016, 2.0));
      float ash = smoothstep(line + 0.035, line + 0.07, x);
      float flick = 0.7 + 0.3 * sin(uTime * 7.0 + vUv.y * 40.0) * fbm(vUv * 70.0 + uTime * 0.8);
      float cracks = smoothstep(0.52, 0.7, fbm(vUv * vec2(120.0, 46.0) + uTime * 0.15));

      col = mix(col, col * vec3(0.62, 0.42, 0.22), scorch * 0.85);
      col = mix(col, vec3(0.05, 0.035, 0.03), charred);
      vec3 ashCol = vec3(0.62, 0.6, 0.58) * (0.6 + 0.6 * fbm(vUv * vec2(160.0, 60.0)));
      col = mix(col, ashCol, ash * 0.9);
      col += vec3(1.0, 0.34, 0.05) * ring * 2.4 * flick * uEmber;
      col += vec3(1.0, 0.8, 0.35) * pow(ring, 3.0) * flick * uEmber;
      col += vec3(1.0, 0.3, 0.04) * ash * cracks * 1.3 * flick * uEmber;
    }

    col = mix(col, uFogCol, uFade);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/* ---------- 3D logo: lit face with a sheen that sweeps across ---------- */
export const logoVert = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const logoFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uTime;
  varying vec2 vUv;
  void main(){
    float a = texture2D(uMap, vUv).a;
    if (a < 0.5) discard;
    // soft top-light across the face
    vec3 col = vec3(0.965, 0.94, 0.86) * (0.9 + 0.13 * vUv.y);
    // the edge of each letter sits a touch darker, like a pressed bevel
    col *= 0.9 + 0.1 * smoothstep(0.5, 0.95, a);
    // sheen
    float sweep = fract(uTime * 0.16) * 2.4 - 0.7;
    float band = smoothstep(0.09, 0.0, abs(vUv.x + vUv.y * 0.35 - sweep));
    col += band * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ---------- Smoke particles ---------- */
export const smokeVert = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vLife;
  void main(){
    float life = fract(uTime * (0.07 + aSeed.x * 0.06) + aSeed.y);
    vLife = life;
    vec3 p = position;
    float sway = sin(life * 5.0 + aSeed.z * 6.283 + uTime * 0.4);
    p.x += sway * (0.12 + life * 0.7) + (aSeed.x - 0.5) * life * 1.2;
    p.y += life * (2.6 + aSeed.z * 1.6);
    p.z += cos(life * 4.0 + aSeed.y * 6.283) * life * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (140.0 + life * 1000.0) * uPixelRatio / -mv.z;
  }
`;

export const smokeFrag = /* glsl */ `
  precision highp float;
  uniform float uAlpha;
  varying float vLife;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a * sin(vLife * 3.14159) * 0.16 * uAlpha;
    gl_FragColor = vec4(vec3(0.96, 0.93, 0.88), a);
  }
`;

/* ---------- Product photo planes inside the tunnel ---------- */
export const photoVert = /* glsl */ `
  uniform float uTime;
  uniform float uVel;
  varying vec2 vUv;
  varying float vDepth;
  void main(){
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 1.6 + uTime * 1.2) * 0.07 + sin(p.y * 2.0 + uTime) * 0.05;
    p.z -= uVel * 1.6 * (p.x * p.x + p.y * p.y) * 0.18;   // bends back with speed
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const photoFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uVel;
  uniform vec3 uFog;
  uniform vec3 uFrame;
  varying vec2 vUv;
  varying float vDepth;
  float box(vec2 p, vec2 b, float r){
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
  }
  void main(){
    vec2 c = vUv - 0.5;
    float outer = box(c, vec2(0.5), 0.04);
    if (outer > 0.0) discard;
    float inner = box(c, vec2(0.47), 0.03);

    vec2 uv = (vUv - 0.5) / 0.94 + 0.5;
    float s = uVel * 0.035;
    vec3 col;
    col.r = texture2D(uMap, uv + vec2(s, 0.0)).r;
    col.g = texture2D(uMap, uv).g;
    col.b = texture2D(uMap, uv - vec2(s, 0.0)).b;
    col = mix(col, uFrame, smoothstep(-0.004, 0.004, inner));

    col = mix(col, uFog, smoothstep(14.0, 48.0, vDepth));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ---------- Smoke veil: fills the screen as the camera dives into the smoke ---------- */
export const veilVert = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const veilFrag = /* glsl */ `
  precision highp float;
  uniform float uAmount;  // 0 clear .. 1 solid smoke
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;
  ${noise}
  void main(){
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float t = uTime * 0.12;
    vec2 q = vec2(fbm(p * 2.2 + vec2(0.0, -t)), fbm(p * 2.2 + vec2(4.1, -t * 1.3)));
    float n = fbm(p * 1.8 + q * 1.6 + vec2(0.0, -t * 0.7));
    // smoke rolls in from the edges first, then closes over the middle
    float edge = smoothstep(0.15, 0.95, length(p));
    float a = clamp((uAmount * 1.7 - (1.0 - n) + edge * 0.35 * (1.0 - uAmount)) * 2.2, 0.0, 1.0);
    vec3 col = mix(vec3(0.74, 0.70, 0.74), vec3(0.97, 0.94, 0.90), n);
    col = mix(col, vec3(1.0, 0.86, 0.80), q.x * 0.25);
    gl_FragColor = vec4(col, a);
  }
`;

/* ---------- Steam off the chai ---------- */
export const steamVert = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const steamFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;
  ${noise}
  void main(){
    vec2 uv = vUv;
    float sway = sin(uv.y * 5.0 - uTime * 1.3) * 0.09 * uv.y;
    float x = uv.x - 0.5 + sway;
    float n = fbm(vec2(x * 4.0, uv.y * 2.4 - uTime * 0.55));
    float wisp = smoothstep(0.42, 0.78, n);
    float mask = smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.35, uv.y) * smoothstep(0.42, 0.06, abs(x));
    gl_FragColor = vec4(vec3(0.97, 0.95, 0.92), wisp * mask * 0.55);
  }
`;
