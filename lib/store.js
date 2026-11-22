// Mutable scroll state shared between the DOM (GSAP ScrollTrigger writes)
// and the WebGL scene (useFrame reads). Kept outside React on purpose.
export const scroll = {
  story: 0, // 0..1 across the roll story
  dive: 0, // 0..1 across the tunnel dive
  mouse: { x: 0, y: 0 }, // -1..1
  intro: 0, // 0..1: the hero logo's entrance once the age gate has gone
  // where the hero logo stage sits, in background-shader units (written by the scene)
  stage: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } },
  // screen position (0..1) and opacity of each feature callout (written by the scene)
  callouts: Array.from({ length: 8 }, () => ({ x: 0, y: 0, o: 0 })),
};

// Tunnel layout, shared so the DOM label and the camera agree.
export const TUNNEL = {
  camStart: 7,
  firstZ: -34,
  gap: 22,
  count: 5,
};
TUNNEL.portalZ = TUNNEL.firstZ - (TUNNEL.count - 1) * TUNNEL.gap - 16;
TUNNEL.travel = TUNNEL.camStart - TUNNEL.portalZ - 1.2;

export const camZ = (dive) => TUNNEL.camStart - dive * TUNNEL.travel;
export const productZ = (i) => TUNNEL.firstZ - i * TUNNEL.gap;

// Which product the camera is currently flying past (-1 for none).
export function activeProduct(dive) {
  const z = camZ(dive);
  for (let i = 0; i < TUNNEL.count; i++) {
    const dist = z - productZ(i);
    if (dist > 1.5 && dist < 17) return i;
  }
  return -1;
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const seg = (x, a, b) => clamp01((x - a) / (b - a));
export const ease = (t) => t * t * (3 - 2 * t);
export const lerp = (a, b, t) => a + (b - a) * t;
