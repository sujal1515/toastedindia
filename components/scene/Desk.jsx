"use client";

// The room the camera lands in after diving through the smoke: a dark executive office,
// with all five Toasted products on it. Everything here is interactive:
//   - hover a product and it lifts; click it and the camera flies to it
//   - drag a focused product to spin it; click a focused pack to open or close it
//   - type on your real keyboard and the 3D keys press, and the monitor shows what you type
//   - click the lamp to switch it off and on
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshReflectorMaterial, RoundedBox } from "@react-three/drei";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as THREE from "three";
import { scroll, ease, seg, lerp } from "@/lib/store";
import { ROOM, DESK, LAYOUT, LIFT, TILT, deskState, focusAmount, activeIndex, requestFocus } from "@/lib/desk";
import { products } from "@/lib/products";
import { LOW } from "@/lib/device";
import {
  ready, madeTextures, packTopTexture, packInsideTexture, leavesTexture, trayArtTexture, TRAY_INK, woodTexture,
  concreteTexture, darkWallTexture, tileTexture, glowTexture, leafTexture, mugTexture, grinderTopTexture,
  legendTexture, paintMonitor, MONITOR, normalMapOf, leatherTexture, clothTexture, pagesTexture, boucleTexture, knitTexture,
} from "./deskTextures";
import { Logo3D } from "./Logo3D";
import { steamVert, steamFrag } from "./shaders";

const C = { indigo: "#3a2f5f", violet: "#4b3f85", coral: "#ff4d4d", cream: "#f6f0dc", sun: "#ffd23f" };

/* ------------------------------------------------------------------ */
/* Input helpers                                                        */
/* ------------------------------------------------------------------ */
// Ignore pointer events that are really meant for the page's own buttons and cards.
const usable = (e) => deskState.active && !e.nativeEvent?.target?.closest?.("a, button, .desk-card, .desk-rail");
const setCursor = (on) => document.documentElement.classList.toggle("cursor-3d", on);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
// Was this click really a drag? Measured from the last pointerdown anywhere on the page.
const pressAt = { x: 0, y: 0 };
const dragged = (e) => Math.hypot(e.nativeEvent.clientX - pressAt.x, e.nativeEvent.clientY - pressAt.y) > 6;

/* ------------------------------------------------------------------ */
/* Camera: shot list for the room                                       */
/* ------------------------------------------------------------------ */
const ENTRY = { pos: [0, 4.6, 15.5], look: [0, 1.0, -2.0], fov: 50, wide: true };
const OVERVIEW = { pos: [0, 1.15, 10.4], look: [0, 0.55, -1.6], fov: 40, wide: true };
const FINALE = { pos: [-5.4, 1.3, 7.6], look: [1.2, 0.35, -1.2], fov: 42, wide: true };
const productShot = (i) => {
  const { pos: p, type } = LAYOUT[i];
  const L = LIFT[type];
  const back = type === 'tray' ? 2.45 : 1.75;
  return { pos: [p[0] + 0.32 - p[0] * 0.08, L + back * 0.42, p[2] + back], look: [p[0] + 0.32, L + 0.05, p[2]], fov: 40, wide: false, i };
};
const KEYS = [
  { d: DESK.enter, s: ENTRY },
  { d: DESK.overview[0], s: OVERVIEW },
  { d: DESK.overview[1], s: OVERVIEW },
  ...DESK.centers.flatMap((c, i) => [
    { d: c - DESK.hold, s: productShot(i) },
    { d: c + DESK.hold, s: productShot(i) },
  ]),
  { d: DESK.finale, s: FINALE },
  { d: 1, s: FINALE },
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
// Writes the camera pose for dive progress d into out.pos / out.look (world space) and returns the fov.
export function roomCamera(d, aspect, out) {
  let i = 0;
  while (i < KEYS.length - 2 && d > KEYS[i + 1].d) i++;
  const A = KEYS[i];
  const Bk = KEYS[i + 1];
  const k = ease(seg(d, A.d, Bk.d));
  const narrow = aspect < 1;
  // on narrow screens step back so the subject still fits, and lift it clear of the card below
  const back = (s) => (s.wide ? Math.min(2.6, Math.max(1, 1.35 / aspect)) : Math.min(2.1, Math.max(1, 1.0 / aspect)));
  const shot = (s, pos, look) => {
    look.set(s.look[0] - (narrow && !s.wide ? 0.28 : 0), s.look[1], s.look[2]);
    pos.set(s.pos[0] - (narrow && !s.wide ? 0.28 : 0), s.pos[1], s.pos[2]).sub(look).multiplyScalar(back(s)).add(look);
    if (narrow && !s.wide) look.y -= 0.3;
  };
  shot(A.s, out.pos, out.look);
  shot(Bk.s, _a, _b);
  out.pos.lerp(_a, k);
  out.look.lerp(_b, k);
  // a slow arc round the product while the camera holds on it, like a turntable shot
  let arc = 0;
  DESK.centers.forEach((c, i) => {
    arc += focusAmount(i, d) * Math.max(-1, Math.min(1, (d - c) / (DESK.hold + 0.04))) * 0.26;
  });
  if (arc) out.pos.sub(out.look).applyAxisAngle(_up, arc).add(out.look);
  const close = lerp(A.s.wide ? 0 : 1, Bk.s.wide ? 0 : 1, k);
  out.pos.x += scroll.mouse.x * lerp(0.45, 0.18, close);
  out.pos.y += scroll.mouse.y * lerp(0.25, 0.1, close);
  out.pos.add(_a.set(...ROOM));
  out.look.add(_a.set(...ROOM));
  return lerp(A.s.fov, Bk.s.fov, k);
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                               */
/* ------------------------------------------------------------------ */
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// A cylinder running from one point to another (r2: radius at the "to" end, for a taper).
function Rod({ from, to, r, r2, children, ...rest }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
      len: dir.length(),
    };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat} {...rest}>
      <cylinderGeometry args={[r2 ?? r, r, len, 16]} />
      {children}
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Products                                                             */
/* ------------------------------------------------------------------ */
const PACK = { w: 0.66, d: 0.27, base: 0.046, lid: 0.012, tip: 0.006 };
const PACK_COLORS = {
  "herbal-communication": { lid: "#3d3a7c", base: "#e8443a" },
  "puff-n-tough": { lid: "#141217", base: "#e8443a" },
  "bombay-blaze": { lid: "#efe9dc", base: "#e8443a" },
};
let leavesTex;

function PackModel({ slug, lidRef }) {
  const mats = useMemo(() => {
    leavesTex = leavesTex || leavesTexture();
    const col = PACK_COLORS[slug];
    const edge = new THREE.MeshStandardMaterial({ color: col.lid, roughness: 0.55 });
    const base = new THREE.MeshStandardMaterial({ color: col.base, roughness: 0.6 });
    return {
      base: [base, base, new THREE.MeshStandardMaterial({ map: leavesTex, color: "#d6cdb8", roughness: 0.9 }), base, base, base],
      lid: [
        edge,
        edge,
        new THREE.MeshStandardMaterial({ map: packTopTexture(slug), roughness: 0.42 }),
        new THREE.MeshStandardMaterial({ map: packInsideTexture(slug), roughness: 0.8 }),
        edge,
        edge,
      ],
      tips: new THREE.MeshStandardMaterial({ color: "#d9b98a", roughness: 0.85 }),
    };
  }, [slug]);
  return (
    <group>
      <mesh position={[0, PACK.base / 2, 0]} material={mats.base} castShadow receiveShadow>
        <boxGeometry args={[PACK.w, PACK.base, PACK.d]} />
      </mesh>
      {/* a strip of filter tips sitting on the leaves */}
      <mesh position={[PACK.w / 2 - 0.075, PACK.base + PACK.tip / 2, 0]} material={mats.tips}>
        <boxGeometry args={[0.11, PACK.tip, PACK.d * 0.82]} />
      </mesh>
      {/* the lid, hinged along the back edge */}
      <group ref={lidRef} position={[0, PACK.base + PACK.tip, -PACK.d / 2]}>
        <mesh position={[0, PACK.lid / 2, PACK.d / 2]} material={mats.lid} castShadow>
          <boxGeometry args={[PACK.w, PACK.lid, PACK.d]} />
        </mesh>
      </group>
    </group>
  );
}

// Rolling trays are a single pressed sheet of tinplate (from the product video):
//   - a flat printed floor
//   - a smooth curved fillet where the floor turns up into the wall
//   - a short wall flaring outwards
//   - a flat flange that rolls over into a bead at the edge
//   - printed and lacquered on top, bare gold tinplate underneath
// The cross-section below is lofted round the rounded-rectangle outline.
const TRAY = { floorW: 0.84, floorD: 0.62, floorR: 0.07 };
// [outward offset from the floor edge, height], from the floor up over the rolled edge
const PROFILE = [
  [0, 0],
  [0.004, 0.0006],
  [0.009, 0.0026],
  [0.014, 0.006],
  [0.018, 0.011],
  [0.026, 0.022],
  [0.036, 0.036],
  [0.046, 0.051],
  [0.051, 0.0585],
  [0.057, 0.0632],
  [0.065, 0.0652],
  [0.073, 0.0652],
  [0.079, 0.0636],
  [0.0835, 0.06],
  [0.0855, 0.055],
  [0.0848, 0.0505],
];

// Points round a rounded rectangle, with the same count and order for any size,
// so successive outlines can be stitched into a surface.
function outline(w, d, r, perSide = 10, perCorner = 12) {
  const pts = [];
  const hw = w / 2 - r;
  const hd = d / 2 - r;
  const corners = [
    [hw, -hd, -Math.PI / 2],
    [hw, hd, 0],
    [-hw, hd, Math.PI / 2],
    [-hw, -hd, Math.PI],
  ];
  corners.forEach(([cx, cz, a0], k) => {
    for (let i = 0; i < perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    const [nx, nz, na] = corners[(k + 1) % 4];
    const ex = cx + Math.cos(a0 + Math.PI / 2) * r;
    const ez = cz + Math.sin(a0 + Math.PI / 2) * r;
    const sx = nx + Math.cos(na) * r;
    const sz = nz + Math.sin(na) * r;
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      pts.push([ex + (sx - ex) * t, ez + (sz - ez) * t]);
    }
  });
  return pts;
}

let trayGeoCache;
function trayGeometries() {
  if (trayGeoCache) return trayGeoCache;
  const rings = PROFILE.map(([o, y]) => outline(TRAY.floorW + 2 * o, TRAY.floorD + 2 * o, TRAY.floorR + o).map(([x, z]) => [x, y, z]));
  const n = rings[0].length;
  const pos = [];
  rings.forEach((ring) => ring.forEach((p) => pos.push(...p)));
  const idx = [];
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const c = (k + 1) * n + i;
      const dd = (k + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, dd);
    }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex(idx);
  shell.computeVertexNormals();
  // make sure the front faces look into the tray (the printed side)
  const nrm = shell.attributes.normal;
  const probe = 4 * n; // a vertex on the wall, on the +x side corner sweep
  let maxX = -Infinity;
  let at = probe;
  for (let i = 0; i < n; i++) {
    const x = pos[(4 * n + i) * 3];
    if (x > maxX) {
      maxX = x;
      at = 4 * n + i;
    }
  }
  if (nrm.getX(at) > 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    shell.setIndex(idx);
    shell.computeVertexNormals();
  }

  // the printed floor, uv-mapped edge to edge
  const shape = new THREE.Shape(rings[0].map(([x, , z]) => new THREE.Vector2(x, -z)));
  const floor = new THREE.ShapeGeometry(shape);
  const uv = floor.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) + TRAY.floorW / 2) / TRAY.floorW, (uv.getY(k) + TRAY.floorD / 2) / TRAY.floorD);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.0004, 0);
  const under = new THREE.ShapeGeometry(shape);
  under.rotateX(Math.PI / 2);
  trayGeoCache = { shell, floor, under };
  return trayGeoCache;
}

// bare tinplate on the back of every tray
let tinMat;
const tin = () =>
  (tinMat =
    tinMat ||
    new THREE.MeshPhysicalMaterial({ color: "#b8945c", metalness: 0.9, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15, side: THREE.BackSide }));

function TrayModel({ slug, children }) {
  const { geo, paint, art, back } = useMemo(() => {
    const ink = TRAY_INK[slug];
    const black = slug === "midnight-munchies";
    return {
      geo: trayGeometries(),
      // printed tin under a hard gloss lacquer
      paint: new THREE.MeshPhysicalMaterial({
        color: ink,
        metalness: black ? 0.3 : 0.2,
        roughness: black ? 0.14 : 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        side: THREE.FrontSide,
      }),
      art: new THREE.MeshPhysicalMaterial({
        map: trayArtTexture(slug),
        metalness: 0.06,
        roughness: black ? 0.18 : 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      }),
      back: new THREE.MeshPhysicalMaterial({ color: "#b8945c", metalness: 0.9, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    };
  }, [slug]);
  return (
    <group>
      <mesh geometry={geo.floor} material={art} receiveShadow />
      <mesh geometry={geo.under} material={back} />
      <mesh geometry={geo.shell} material={paint} castShadow receiveShadow />
      <mesh geometry={geo.shell} material={tin()} castShadow />
      {children}
    </group>
  );
}

// The grinder that comes with Bombay Blaze.
function Grinder(props) {
  const mats = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({ color: "#d8433c", metalness: 0.7, roughness: 0.32 });
    const top = new THREE.MeshStandardMaterial({ map: grinderTopTexture(), metalness: 0.5, roughness: 0.35 });
    return { body, top, top3: [body, top, body], groove: new THREE.MeshStandardMaterial({ color: "#3a1512", roughness: 0.6 }) };
  }, []);
  const parts = [0.05, 0.055, 0.05];
  let y = 0;
  return (
    <group {...props}>
      {parts.map((h, k) => {
        const cy = y + h / 2;
        y += h + 0.006;
        return (
          <group key={k}>
            <mesh position={[0, cy, 0]} material={k === parts.length - 1 ? mats.top3 : mats.body} castShadow receiveShadow>
              <cylinderGeometry args={[0.13, 0.13, h, 48]} />
            </mesh>
            <mesh position={[0, cy + h / 2 + 0.003, 0]} material={mats.groove}>
              <cylinderGeometry args={[0.122, 0.122, 0.006, 32]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function ProductItem({ i }) {
  const def = LAYOUT[i];
  const root = useRef();
  const tilt = useRef();
  const turn = useRef();
  const lid = useRef();
  const anim = useRef({ hover: 0, lid: 0 });

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const d = scroll.dive;
    const f = focusAmount(i, d);
    const a = anim.current;
    a.hover = damp(a.hover, deskState.hover === i && f < 0.5 ? 1 : 0, 10, dt);
    if (deskState.drag?.i !== i) deskState.spin[i] = damp(deskState.spin[i], 0, 1.4, dt);
    root.current.position.set(def.pos[0], f * LIFT[def.type] + a.hover * 0.05 + Math.sin(t * 1.3 + i) * 0.012 * f, def.pos[2]);
    root.current.scale.setScalar(1 + a.hover * 0.03);
    tilt.current.rotation.x = f * TILT[def.type];
    turn.current.rotation.y = lerp(def.yaw, 0, f) + deskState.spin[i] + Math.sin(t * 0.45 + i) * 0.16 * f;
    if (lid.current) {
      const target = f > 0.5 ? (deskState.open[i] ? 1.95 : 0) : a.hover * 0.45;
      a.lid = damp(a.lid, target, 6, dt);
      lid.current.rotation.x = -a.lid;
    }
  });

  const handlers = {
    onPointerOver: (e) => {
      if (!usable(e)) return;
      e.stopPropagation();
      deskState.hover = i;
      setCursor(true);
    },
    onPointerOut: () => {
      if (deskState.hover === i) deskState.hover = -1;
      setCursor(false);
    },
    onPointerDown: (e) => {
      if (!usable(e)) return;
      e.stopPropagation();
      if (focusAmount(i, scroll.dive) > 0.5) deskState.drag = { i, x: e.clientX };
    },
    onClick: (e) => {
      if (!usable(e) || dragged(e)) return;
      e.stopPropagation();
      if (focusAmount(i, scroll.dive) > 0.5) {
        if (def.type === "pack") deskState.open[i] = !deskState.open[i];
      } else requestFocus(i);
    },
  };

  return (
    <group ref={root} {...handlers}>
      <group ref={tilt}>
        <group ref={turn}>
          {def.type === "pack" ? (
            <>
              <PackModel slug={def.slug} lidRef={lid} />
              {def.slug === "bombay-blaze" && <Grinder position={[-0.5, 0, 0.14]} />}
            </>
          ) : (
            <TrayModel slug={def.slug} />
          )}
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Keyboard: presses when you type on your real one                     */
/* ------------------------------------------------------------------ */
const ROWS = [
  [["Backquote", 1, "esc"], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => [`Digit${n}`, 1, String(n)]), ["Minus", 1, "-"], ["Equal", 1, "="], ["Backspace", 2, "bksp"]],
  [["Tab", 1.5, "tab"], ..."QWERTYUIOP".split("").map((c) => [`Key${c}`, 1, c]), ["BracketLeft", 1, "["], ["BracketRight", 1, "]"], ["Backslash", 1.5, "\\"]],
  [["CapsLock", 1.75, "caps"], ..."ASDFGHJKL".split("").map((c) => [`Key${c}`, 1, c]), ["Semicolon", 1, ";"], ["Quote", 1, "'"], ["Enter", 2.25, "enter"]],
  [["ShiftLeft", 2.25, "shift"], ..."ZXCVBNM".split("").map((c) => [`Key${c}`, 1, c]), ["Comma", 1, ","], ["Period", 1, "."], ["Slash", 1, "/"], ["ShiftRight", 2.75, "shift"]],
  [["ControlLeft", 1.25, "ctrl"], ["MetaLeft", 1.25, "◆"], ["AltLeft", 1.25, "alt"], ["Space", 6.25, "toasted"], ["AltRight", 1.25, "alt"], ["MetaRight", 1.25, "fn"], ["ContextMenu", 1.25, "☰"], ["ControlRight", 1.25, "ctrl"]],
];
const ACCENT = new Set([]);
const ALPHA = /^(Key|Digit)|^(Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash)$/;
const CHAR_OF = { Space: " ", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/" };
const KB = { u: 0.132, keyH: 0.024, baseW: 2.06, baseD: 0.74, baseH: 0.03 };

const held = new Set();
const pulses = new Map();

function typeChar(ch) {
  if (ch === "\b") deskState.typed = deskState.typed.slice(0, -1);
  else deskState.typed = (deskState.typed + ch).slice(-240);
  deskState.dirty = true;
}

function Keyboard({ bare, ...props }) {
  const keys = useMemo(() => {
    const geos = new Map();
    const mats = {
      alpha: new THREE.MeshStandardMaterial({ color: "#26262b", roughness: 0.5 }),
      mod: new THREE.MeshStandardMaterial({ color: "#222227", roughness: 0.5 }),
      accent: new THREE.MeshStandardMaterial({ color: "#26262b", roughness: 0.5 }),
    };
    const list = [];
    ROWS.forEach((row, r) => {
      let cum = 0;
      row.forEach(([code, w, label]) => {
        if (!geos.has(w)) geos.set(w, new RoundedBoxGeometry(w * KB.u - 0.02, KB.keyH, KB.u - 0.02, 2, 0.008));
        const kind = ACCENT.has(code) ? "accent" : ALPHA.test(code) ? "alpha" : "mod";
        const ink = "#c9c9d0";
        list.push({
          code,
          label,
          x: -7.5 * KB.u + (cum + w / 2) * KB.u,
          z: -2.5 * KB.u + (r + 0.5) * KB.u,
          w,
          geo: geos.get(w),
          mat: mats[kind],
          legend: new THREE.MeshStandardMaterial({ map: legendTexture(label, w, ink), transparent: true, alphaTest: 0.25, roughness: 0.5 }),
        });
        cum += w;
      });
    });
    return list;
  }, []);
  const refs = useRef([]);
  const offsets = useRef(new Float32Array(keys.length));

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    keys.forEach((k, n) => {
      const down = held.has(k.code) || (pulses.get(k.code) || 0) > t;
      offsets.current[n] = damp(offsets.current[n], down ? -0.012 : 0, 30, dt);
      const m = refs.current[n];
      if (m) m.position.y = KB.baseH + KB.keyH / 2 + 0.004 + offsets.current[n];
    });
  });

  return (
    <group {...props}>
      {!bare && (
        <RoundedBox args={[KB.baseW, KB.baseH, KB.baseD]} radius={0.025} smoothness={4} position={[0, KB.baseH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#dcdcdf" metalness={0.75} roughness={0.3} />
        </RoundedBox>
      )}
      {keys.map((k, n) => (
        <mesh
          key={k.code}
          ref={(m) => (refs.current[n] = m)}
          geometry={k.geo}
          material={k.mat}
          position={[k.x, KB.baseH + KB.keyH / 2 + 0.004, k.z]}
          castShadow
          onPointerDown={(e) => {
            if (!usable(e)) return;
            e.stopPropagation();
            pulses.set(k.code, clockNow.t + 0.14);
            if (k.code === "Backspace") typeChar("\b");
            else if (k.code === "Enter") typeChar("\n");
            else if (CHAR_OF[k.code]) typeChar(CHAR_OF[k.code]);
            else if (/^(Key|Digit)/.test(k.code)) typeChar(k.label.toLowerCase());
          }}
          onPointerOver={(e) => usable(e) && (e.stopPropagation(), setCursor(true))}
          onPointerOut={() => setCursor(false)}
        >
          <mesh position={[0, KB.keyH / 2 + 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={k.legend}>
            <planeGeometry args={[k.w * KB.u * 0.8, KB.u * 0.8]} />
          </mesh>
        </mesh>
      ))}
    </group>
  );
}

// Pulses for mouse-clicked keys are compared against the R3F clock, which starts at page load;
// keep both on the same timeline.
const clockNow = { t: 0 };

/* ------------------------------------------------------------------ */
/* Desk accessories                                                     */
/* ------------------------------------------------------------------ */
// A laptop, open: the screen is the little desktop that shows what you type,
// and its keyboard presses when you type on yours.
function Laptop(props) {
  const { tex, canvas } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = MONITOR.w;
    canvas.height = MONITOR.h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { tex, canvas };
  }, []);
  const last = useRef({ caret: null, focus: -2, minute: "", ready: false });
  useEffect(() => {
    ready().then(() => {
      last.current.ready = true;
      deskState.dirty = true;
    });
  }, []);
  useFrame((state) => {
    const L = last.current;
    if (!L.ready || (!deskState.active && L.focus !== -2)) return;
    const caret = Math.floor(state.clock.elapsedTime / 0.53) % 2 === 0;
    const minute = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!deskState.dirty && caret === L.caret && deskState.focus === L.focus && minute === L.minute) return;
    paintMonitor(canvas.getContext("2d"), {
      typed: deskState.typed,
      caret,
      product: deskState.focus >= 0 ? products[deskState.focus] : null,
      time: minute,
    });
    tex.needsUpdate = true;
    Object.assign(L, { caret, focus: deskState.focus, minute });
    deskState.dirty = false;
  });
  const alu = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#3a3a40", metalness: 0.85, roughness: 0.32, clearcoat: 0.3 }), []);
  return (
    <group {...props}>
      <RoundedBox args={[1.32, 0.034, 0.92]} radius={0.014} smoothness={3} position={[0, 0.017, 0]} material={alu} castShadow receiveShadow />
      <Keyboard position={[0, 0.034, -0.1]} scale={0.56} bare />
      <mesh position={[0, 0.0345, 0.29]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.44, 0.26]} />
        <meshPhysicalMaterial color="#2c2c32" metalness={0.6} roughness={0.25} />
      </mesh>
      {/* lid, hinged at the back and opened a little past upright */}
      <group position={[0, 0.034, -0.46]} rotation={[-1.86, 0, 0]}>
        <RoundedBox args={[1.32, 0.02, 0.9]} radius={0.01} smoothness={3} position={[0, 0.01, 0.45]} material={alu} castShadow />
        <mesh position={[0, -0.0008, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.26, 0.84]} />
          <meshPhysicalMaterial color="#060608" roughness={0.05} clearcoat={1} />
        </mesh>
        <mesh position={[0, -0.0012, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.2, 0.72]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// A small black desk lamp with a brass collar. Click it to switch it off and on.
const LAMP_AT = [-3.45, 0, -0.78];
const LAMP_HEAD = [0.22, 1.32, 0.1];
const LAMP_AIM = [-2.5, 0, 0.1]; // where the pool of light lands on the desk (room space)

function Lamp() {
  const head = useRef();
  const bulb = useRef();
  useLayoutEffect(() => {
    head.current.parent.updateWorldMatrix(true, false);
    head.current.lookAt(ROOM[0] + LAMP_AIM[0], ROOM[1] + LAMP_AIM[1], ROOM[2] + LAMP_AIM[2]);
  }, []);
  useFrame(() => {
    bulb.current.emissiveIntensity = deskState.lampOn ? 3 : 0.02;
  });
  const black = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#141317", roughness: 0.4, metalness: 0.5, clearcoat: 0.3 }), []);
  const brass = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c49a5a", roughness: 0.25, metalness: 1 }), []);
  const toggle = (e) => {
    if (!usable(e) || dragged(e)) return;
    e.stopPropagation();
    deskState.lampOn = !deskState.lampOn;
  };
  return (
    <group
      position={LAMP_AT}
      onClick={toggle}
      onPointerOver={(e) => usable(e) && (e.stopPropagation(), setCursor(true))}
      onPointerOut={() => setCursor(false)}
    >
      <mesh position={[0, 0.02, 0]} material={black} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.26, 0.04, 48]} />
      </mesh>
      <Rod from={[0, 0.04, 0]} to={[0, 1.18, 0]} r={0.018} material={black} castShadow />
      <mesh position={[0, 1.18, 0]} material={brass}>
        <sphereGeometry args={[0.035, 16, 10]} />
      </mesh>
      <Rod from={[0, 1.18, 0]} to={LAMP_HEAD} r={0.014} material={black} castShadow />
      <group ref={head} position={LAMP_HEAD}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.08]} castShadow>
          <cylinderGeometry args={[0.2, 0.05, 0.3, 48, 1, true]} />
          <meshPhysicalMaterial color="#141317" roughness={0.35} metalness={0.5} clearcoat={0.4} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]} material={brass}>
          <cylinderGeometry args={[0.052, 0.052, 0.05, 24]} />
        </mesh>
        <mesh position={[0, 0, 0.13]}>
          <sphereGeometry args={[0.06, 20, 12]} />
          <meshStandardMaterial ref={bulb} color="#fff3dc" emissive="#ffcf8a" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Mug(props) {
  const steam = useRef();
  const mats = useMemo(
    () => ({
      outer: new THREE.MeshPhysicalMaterial({ map: mugTexture(), roughness: 0.55, clearcoat: 0.2 }),
      inner: new THREE.MeshStandardMaterial({ color: "#1e1c24", roughness: 0.4, side: THREE.BackSide }),
      steam: new THREE.ShaderMaterial({
        vertexShader: steamVert,
        fragmentShader: steamFrag,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    }),
    []
  );
  const { camera } = useThree();
  useFrame((state) => {
    mats.steam.uniforms.uTime.value = state.clock.elapsedTime;
    steam.current.quaternion.copy(camera.quaternion);
  });
  return (
    <group {...props}>
      <group rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0.15, 0]} material={mats.outer} castShadow receiveShadow>
          <cylinderGeometry args={[0.15, 0.135, 0.3, 48, 1, true]} />
        </mesh>
        <mesh position={[0, 0.15, 0]} material={mats.inner}>
          <cylinderGeometry args={[0.142, 0.128, 0.3, 48, 1, true]} />
        </mesh>
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.142, 40]} />
          <meshStandardMaterial color="#8a5a37" roughness={0.12} />
        </mesh>
        <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.146, 0.006, 10, 48]} />
          <meshStandardMaterial color={C.coral} roughness={0.35} />
        </mesh>
        <mesh position={[-0.15, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <torusGeometry args={[0.075, 0.018, 12, 24, Math.PI]} />
          <meshStandardMaterial color="#1e1c24" roughness={0.5} />
        </mesh>
      </group>
      <mesh ref={steam} position={[0, 0.66, 0]} material={mats.steam}>
        <planeGeometry args={[0.36, 0.72]} />
      </mesh>
    </group>
  );
}

// A cozy wingback desk chair: a tall back of soft vertical channels in cream bouclé that
// curves round into the arms, a plump seat cushion, a coral velvet cushion, and a
// chunky rust knit throw over the back. It swivels on a satin black five-star base
// with brass details and twin-wheel casters.
const CHAIR = { R: 0.6, seatY: 1.85, backH: 2.1, armH: 0.72, span: 1.9 };
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const channelHeight = (th) => lerp(CHAIR.backH, CHAIR.armH, sstep(0.35, CHAIR.span, Math.abs(th)));

const LEAN = 0.06; // the back leans out a little as it rises
const leanAt = (th, rise) => LEAN * rise * Math.max(0, Math.cos(th));

// The back and arms as one upholstered piece: a thick rounded wall swept around the seat,
// tallest at the back and sweeping down into the arms. The inside face puffs out into
// vertical channels with stitched seams between them, the channel tops are softly
// scalloped, and the arm ends round off.
function chairShellGeometry() {
  const { R, seatY, span } = CHAIR;
  const base = seatY - 0.3;
  const T = 0.2; // wall thickness
  const CH = 11; // channels
  const NT = 220;
  const prof = [];
  // profile around the wall: up the inside, over the top, down the outside (t in 0..1 per part)
  for (let k = 0; k <= 12; k++) prof.push(["in", k / 12]);
  for (let k = 1; k < 16; k++) prof.push(["top", k / 16]);
  for (let k = 0; k <= 8; k++) prof.push(["out", k / 8]);
  const M = prof.length;
  const pos = [];
  const uv = [];
  const index = [];
  for (let i = 0; i <= NT; i++) {
    const th = lerp(-span, span, i / NT);
    // vertical channels: 0 at a seam, 1 in the middle of a channel
    const phase = ((th + span) / (2 * span)) * CH;
    const bump = Math.pow(Math.sin(Math.PI * (phase - Math.floor(phase))), 0.55);
    const puff = 0.04 * bump;
    // round off the arm ends
    const endT = Math.max(0, (Math.abs(th) - (span - 0.14)) / 0.14);
    const f = Math.sqrt(Math.max(0, 1 - endT * endT));
    const H = channelHeight(th) + 0.025 * bump * f;
    const yTop = base + H - T / 2;
    let len = 0;
    let prev = null;
    for (let j = 0; j < M; j++) {
      const [part, t] = prof[j];
      let rho;
      let y;
      if (part === "in") {
        y = base + (yTop - base) * t;
        // the puff fades out toward the bottom, where the seat cushion presses against it
        rho = R - (T / 2 + puff * sstep(0, 0.25, t)) * f;
      } else if (part === "top") {
        const a = Math.PI * (1 - t);
        const rIn = T / 2 + puff;
        rho = R + Math.cos(a) * (Math.cos(a) < 0 ? rIn : T / 2) * f;
        y = yTop + Math.sin(a) * (T / 2) * (0.35 + 0.65 * f);
      } else {
        y = yTop + (base - yTop) * t;
        rho = R + (T / 2) * f;
      }
      rho += leanAt(th, y - base);
      const x = Math.sin(th) * rho;
      const z = -Math.cos(th) * rho;
      if (prev) len += Math.hypot(rho - prev[0], y - prev[1]);
      prev = [rho, y];
      pos.push(x, y, z);
      uv.push(th * R * 1.2, len * 1.2);
    }
  }
  for (let i = 0; i < NT; i++)
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j;
      const b = a + M;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The throw: a knitted sheet draped over the top of the back, following the curve of the
// channels, falling a little lower where the back dips toward the arms, with soft folds.
function throwGeometry() {
  const { seatY } = CHAIR;
  const base = seatY - 0.3;
  // (distance from the chair's centre, height above the seat) along the drape
  const curve = new THREE.CatmullRomCurve3(
    [
      [0.43, 0.75], [0.44, 1.2], [0.445, 1.55], [0.46, 1.74], [0.53, 1.87], [0.62, 1.92], [0.72, 1.86], [0.77, 1.65], [0.78, 1.3], [0.78, 0.95],
    ].map(([r, y]) => new THREE.Vector3(r, y, 0))
  );
  const S = 56;
  const U = 22;
  const th0 = -0.32;
  const spread = 0.46;
  const pos = [];
  const uv = [];
  const index = [];
  for (let i = 0; i <= S; i++) {
    const s = i / S;
    const p = curve.getPoint(s);
    const t = curve.getTangent(s);
    for (let j = 0; j <= U; j++) {
      const u = (j / U) * 2 - 1;
      const th = th0 + u * spread;
      const drop = (CHAIR.backH - channelHeight(th)) * sstep(0.7, 1.8, p.y);
      // soft folds, deeper toward the loose edges and the hanging ends
      const fold = 0.02 * Math.sin(u * 7 + s * 5) * (0.35 + 0.65 * Math.abs(u)) * (0.4 + 0.6 * Math.abs(s - 0.5) * 2);
      const y = base + 0.3 + p.y - drop - t.x * fold;
      const rr = p.x + t.y * fold + leanAt(th, y - base);
      pos.push(Math.sin(th) * rr, y, -Math.cos(th) * rr);
      uv.push(j / U, s * 2.2);
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < U; j++) {
      const a = i * (U + 1) + j;
      const b = a + U + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// A plump cushion: a sphere squared off at the corners, thick in the middle, pinched at the seams.
function cushionGeometry(w, h, d) {
  const g = new THREE.SphereGeometry(1, 40, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.45);
    const sy = Math.sign(y) * Math.pow(Math.abs(y), 0.45);
    const edge = Math.max(Math.abs(sx), Math.abs(sy));
    p.setXYZ(i, sx * w, sy * h, z * d * (0.35 + 0.65 * (1 - Math.pow(edge, 6))));
  }
  g.computeVertexNormals();
  return g;
}

function CozyChair(props) {
  const { seatY } = CHAIR;
  const mats = useMemo(() => {
    const boucleMap = boucleTexture();
    const knitMap = knitTexture();
    const boucle = new THREE.MeshPhysicalMaterial({
      map: boucleMap,
      normalMap: normalMapOf(boucleMap, 5),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.95,
      sheen: 1,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color("#fff1dc"),
    });
    const shell = boucle.clone();
    shell.side = THREE.DoubleSide;
    return {
      boucle,
      shell,
      knit: new THREE.MeshPhysicalMaterial({
        map: knitMap,
        normalMap: normalMapOf(knitMap, 7),
        roughness: 0.92,
        sheen: 0.8,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color("#ffb59a"),
        side: THREE.DoubleSide,
      }),
      velvet: new THREE.MeshPhysicalMaterial({ color: "#c4473a", roughness: 0.75, sheen: 1, sheenRoughness: 0.32, sheenColor: new THREE.Color("#ff9d85") }),
      walnut: new THREE.MeshPhysicalMaterial({ color: "#3a2518", roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      satin: new THREE.MeshStandardMaterial({ color: "#19181c", metalness: 0.55, roughness: 0.38 }),
      brass: new THREE.MeshStandardMaterial({ color: "#c79b5b", metalness: 1, roughness: 0.28 }),
      rubber: new THREE.MeshStandardMaterial({ color: "#0d0d0f", roughness: 0.65 }),
    };
  }, []);
  const geo = useMemo(() => {
    const seat = new THREE.ExtrudeGeometry(roundedRect(1.0, 0.95, 0.4), {
      depth: 0.16,
      bevelEnabled: true,
      bevelSize: 0.06,
      bevelThickness: 0.06,
      bevelSegments: 6,
      curveSegments: 24,
    });
    // ExtrudeGeometry UVs are in shape units; scale them so the bouclé loops stay small
    const uvs = seat.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 0.9, uvs.getY(i) * 0.9);
    return { seat, shell: chairShellGeometry(), throw: throwGeometry(), cushion: cushionGeometry(0.34, 0.24, 0.12) };
  }, []);

  return (
    <group {...props}>
      {/* five-star base: tapered satin legs, brass hub, twin-wheel casters */}
      {Array.from({ length: 5 }, (_, k) => {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        const end = [Math.cos(a) * 0.7, 0.17, Math.sin(a) * 0.7];
        return (
          <group key={k}>
            <Rod from={end} to={[0, 0.27, 0]} r={0.026} r2={0.045} material={mats.satin} castShadow />
            <group position={[end[0], 0, end[2]]} rotation={[0, -a, 0]}>
              <mesh position={[0, 0.12, 0]} material={mats.satin} castShadow>
                <boxGeometry args={[0.05, 0.07, 0.07]} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[0, 0.065, s * 0.035]} rotation={[Math.PI / 2, 0, 0]} material={mats.rubber} castShadow>
                  <cylinderGeometry args={[0.065, 0.065, 0.028, 20]} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}
      <mesh position={[0, 0.27, 0]} material={mats.brass} castShadow>
        <cylinderGeometry args={[0.085, 0.1, 0.09, 28]} />
      </mesh>
      <Rod from={[0, 0.3, 0]} to={[0, seatY - 0.62, 0]} r={0.042} material={mats.satin} castShadow />
      <Rod from={[0, seatY - 0.75, 0]} to={[0, seatY - 0.42, 0]} r={0.055} material={mats.brass} castShadow />
      <mesh position={[0, seatY - 0.42, 0]} material={mats.satin} castShadow>
        <boxGeometry args={[0.46, 0.06, 0.42]} />
      </mesh>

      {/* walnut plinth the upholstery sits on */}
      <mesh position={[0, seatY - 0.335, 0]} material={mats.walnut} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.66, 0.1, 56]} />
      </mesh>

      {/* the back and arms: one upholstered wall with vertical channels, tallest at the back */}
      <mesh geometry={geo.shell} material={mats.shell} castShadow receiveShadow />

      {/* seat cushion */}
      <mesh geometry={geo.seat} position={[0, seatY - 0.22, 0.12]} rotation={[-Math.PI / 2, 0, 0]} material={mats.boucle} castShadow receiveShadow />

      {/* coral velvet cushion leaning on the back */}
      <mesh geometry={geo.cushion} position={[0.14, seatY + 0.3, -0.37]} rotation={[-0.24, -0.12, 0.09]} material={mats.velvet} castShadow receiveShadow />

      {/* knitted throw over the back */}
      <mesh geometry={geo.throw} material={mats.knit} castShadow receiveShadow />
    </group>
  );
}

// A leafy plant in a tall concrete planter. Each leaf is a curved, lance-shaped blade
// with a midrib, arranged in clusters on a few canes, so it reads like a real dracaena.
function Plant({ seed = 1, ...props }) {
  const leaves = useRef();
  const { geo, mat, layout, canes } = useMemo(() => {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const geo = new THREE.PlaneGeometry(0.24, 1, 4, 16);
    geo.translate(0, 0.5, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      // arches outwards and down along its length, folded slightly along the midrib
      p.setZ(i, 0.42 * y * y - Math.abs(x) * 0.45);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.42, metalness: 0 });
    const canes = [
      [0.06, 0, 0.02, 2.5, 0.04],
      [-0.1, 0, -0.06, 1.85, -0.06],
      [0.12, 0, -0.1, 1.3, 0.1],
    ];
    const layout = [];
    canes.forEach(([x, , z, h, lean]) => {
      const top = [x + lean * h, 2.0 + h, z + lean * 0.5 * h];
      for (let k = 0; k < 26; k++) {
        layout.push({
          pos: top,
          yaw: k * 2.399 + rnd() * 0.5,
          pitch: 0.18 + rnd() * 1.05 + (k / 26) * 0.35,
          roll: (rnd() - 0.5) * 0.6,
          len: 1.0 + rnd() * 0.7,
          shade: 0.82 + rnd() * 0.3,
        });
      }
    });
    return { geo, mat, layout, canes };
  }, [seed]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    layout.forEach((l, i) => {
      e.set(l.pitch, l.yaw, l.roll, "YXZ");
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(...l.pos), q, new THREE.Vector3(l.len * 0.9, l.len, l.len));
      leaves.current.setMatrixAt(i, m);
      leaves.current.setColorAt(i, col.setScalar(l.shade));
    });
    leaves.current.instanceMatrix.needsUpdate = true;
    leaves.current.instanceColor.needsUpdate = true;
  }, [layout]);
  const group = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.45 + seed) * 0.006;
  });
  const pot = useMemo(() => new THREE.MeshStandardMaterial({ map: concreteTexture(), color: "#55545a", roughness: 0.85 }), []);
  return (
    <group {...props}>
      <mesh position={[0, 1.0, 0]} material={pot} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.56, 2.0, 64]} />
      </mesh>
      <mesh position={[0, 2.0, 0]} rotation={[Math.PI / 2, 0, 0]} material={pot}>
        <torusGeometry args={[0.6, 0.02, 8, 64]} />
      </mesh>
      <mesh position={[0, 1.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.59, 48]} />
        <meshStandardMaterial color="#1c1612" roughness={1} />
      </mesh>
      <group ref={group}>
        {canes.map(([x, , z, h, lean], k) => (
          <Rod key={k} from={[x, 1.95, z]} to={[x + lean * h, 2.0 + h, z + lean * 0.5 * h]} r={0.035} castShadow>
            <meshStandardMaterial color="#6b5a42" roughness={0.85} />
          </Rod>
        ))}
        <instancedMesh ref={leaves} args={[geo, mat, layout.length]} castShadow receiveShadow frustumCulled={false} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Everyday desk things, so it reads as a real, lived-in desk          */
/* ------------------------------------------------------------------ */
// A stitched leather desk pad under the middle of the desk.
function DeskPad(props) {
  const mat = useMemo(() => {
    const map = leatherTexture();
    return new THREE.MeshPhysicalMaterial({
      map,
      normalMap: normalMapOf(map, 6),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.62,
      sheen: 0.5,
      sheenColor: new THREE.Color("#4a4466"),
      clearcoat: 0.15,
      clearcoatRoughness: 0.6,
    });
  }, []);
  // RoundedBoxGeometry keeps proper box UVs on the top face (drei's RoundedBox is an extrusion,
  // which would stretch the leather into streaks)
  const geo = useMemo(() => new RoundedBoxGeometry(3.95, 0.012, 1.45, 2, 0.005), []);
  return <mesh geometry={geo} material={mat} receiveShadow castShadow {...props} />;
}

// A small stack of cloth-bound books with a little plant on top.
function Books(props) {
  const books = useMemo(() => {
    const pages = pagesTexture();
    return [
      { w: 0.92, d: 0.66, h: 0.11, color: "#2d2a44", rot: 0.05 },
      { w: 0.84, d: 0.6, h: 0.09, color: "#b9442f", rot: -0.08 },
      { w: 0.78, d: 0.56, h: 0.08, color: "#e7dfcc", rot: 0.12 },
    ].map((b) => {
      const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(b.color), roughness: 0.85 });
      const page = new THREE.MeshStandardMaterial({ map: pages, roughness: 0.9 });
      return { ...b, cloth, page };
    });
  }, []);
  let y = 0;
  return (
    <group {...props}>
      {books.map((b, k) => {
        const cy = y + b.h / 2;
        y += b.h;
        return (
          <group key={k} position={[0, cy, 0]} rotation={[0, b.rot, 0]}>
            {/* covers: a hair bigger than the pages */}
            <mesh material={b.cloth} castShadow receiveShadow>
              <boxGeometry args={[b.w, b.h, b.d]} />
            </mesh>
            <mesh position={[0.012, 0, 0]} material={b.page}>
              <boxGeometry args={[b.w - 0.02, b.h - 0.024, b.d + 0.002]} />
            </mesh>
          </group>
        );
      })}
      <SmallPlant position={[0.05, y, 0.02]} />
    </group>
  );
}

// A little succulent in a ribbed ceramic pot.
function SmallPlant(props) {
  const spikes = useMemo(
    () => Array.from({ length: 16 }, (_, k) => ({ a: k * 2.4, tilt: 0.2 + (k % 4) * 0.22, len: 0.12 + (k % 3) * 0.04 })),
    []
  );
  const pot = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#efe8da", roughness: 0.35, clearcoat: 0.6 }), []);
  const leaf = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5f8a58", roughness: 0.55 }), []);
  return (
    <group {...props}>
      <mesh position={[0, 0.09, 0]} material={pot} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.1, 0.18, 24]} />
      </mesh>
      <mesh position={[0, 0.176, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.11, 24]} />
        <meshStandardMaterial color="#2b2119" roughness={1} />
      </mesh>
      {spikes.map((s, k) => (
        <group key={k} position={[0, 0.17, 0]} rotation={new THREE.Euler(s.tilt, s.a, 0, "YXZ")}>
          <mesh position={[0, s.len / 2, 0]} material={leaf} castShadow>
            <coneGeometry args={[0.022, s.len, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// A closed notebook with an elastic band, and a pen resting across it.
function Notebook(props) {
  const mats = useMemo(
    () => ({
      cover: new THREE.MeshPhysicalMaterial({ map: clothTexture("#141218"), roughness: 0.7, sheen: 0.3 }),
      pages: new THREE.MeshStandardMaterial({ map: pagesTexture(), roughness: 0.9 }),
      band: new THREE.MeshStandardMaterial({ color: "#ff5a4f", roughness: 0.6 }),
      pen: new THREE.MeshPhysicalMaterial({ color: "#1b1a20", metalness: 0.6, roughness: 0.25, clearcoat: 0.8 }),
      brass: new THREE.MeshStandardMaterial({ color: "#c49a5a", metalness: 1, roughness: 0.25 }),
    }),
    []
  );
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]} material={mats.cover} castShadow receiveShadow>
        <boxGeometry args={[0.64, 0.06, 0.9]} />
      </mesh>
      <mesh position={[0.01, 0.03, 0]} material={mats.pages}>
        <boxGeometry args={[0.63, 0.044, 0.882]} />
      </mesh>
      <mesh position={[0.2, 0.03, 0]} material={mats.band}>
        <boxGeometry args={[0.018, 0.064, 0.904]} />
      </mesh>
      {/* the pen */}
      <group position={[-0.02, 0.075, 0.05]} rotation={[0, 0.55, Math.PI / 2]}>
        <mesh material={mats.pen} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.62, 20]} />
        </mesh>
        <mesh position={[0, 0.33, 0]} material={mats.brass}>
          <coneGeometry args={[0.016, 0.05, 20]} />
        </mesh>
        <mesh position={[0.018, -0.2, 0]} material={mats.brass}>
          <boxGeometry args={[0.008, 0.16, 0.012]} />
        </mesh>
      </group>
    </group>
  );
}

// Cables: from the lamp and the laptop, over the back edge of the desk and down.
function Cables() {
  const geos = useMemo(() => {
    const cable = (pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 64, 0.012, 8, false);
    return [
      cable([[-3.45, 0.012, -0.98], [-3.4, 0.012, -1.08], [-3.3, 0.014, -1.16], [-3.25, 0.0, -1.21], [-3.24, -0.25, -1.23], [-3.2, -1.2, -1.26], [-3.1, -2.9, -1.4]]),
      cable([[2.55, 0.012, -0.72], [2.5, 0.012, -0.95], [2.62, 0.014, -1.14], [2.68, 0.0, -1.21], [2.7, -0.3, -1.23], [2.74, -1.4, -1.27], [2.9, -2.9, -1.45]]),
    ];
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0f0e12", roughness: 0.55 }), []);
  return geos.map((g, k) => <mesh key={k} geometry={g} material={mat} castShadow />);
}

/* ------------------------------------------------------------------ */
/* The office: dark plaster, a backdrop panel with the sign, downlights */
/* ------------------------------------------------------------------ */
const ROOMBOX = { back: -3.0, side: 13, front: 14, floor: -2.92, ceil: 5.0 };
const WASH_X = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]; // downlights along the back wall

function Shell() {
  const mats = useMemo(
    () => ({
      wall: (() => {
        const map = darkWallTexture();
        return new THREE.MeshStandardMaterial({ map, normalMap: normalMapOf(map, 5), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92 });
      })(),
      panel: new THREE.MeshPhysicalMaterial({ color: "#1d1a2b", roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
      walnut: (() => {
        const map = woodTexture();
        // varnished walnut: the grain has a little relief under a glossy topcoat
        return new THREE.MeshPhysicalMaterial({ map, normalMap: normalMapOf(map, 3), normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.12 });
      })(),
      black: new THREE.MeshPhysicalMaterial({ color: "#121115", roughness: 0.55, metalness: 0.3, clearcoat: 0.2 }),
      ceiling: new THREE.MeshStandardMaterial({ color: "#16141c", roughness: 1 }),
      can: new THREE.MeshStandardMaterial({ color: "#0d0c10", roughness: 0.6 }),
    }),
    []
  );
  const tiles = useMemo(() => tileTexture(), []);
  const tilesRelief = useMemo(() => normalMapOf(tiles, 6), [tiles]);
  const glow = useMemo(() => glowTexture(), []);
  const B = ROOMBOX;
  const H = B.ceil - B.floor;
  const cy = (B.ceil + B.floor) / 2;
  return (
    <>
      <mesh position={[0, cy, B.back]} material={mats.wall} receiveShadow>
        <planeGeometry args={[B.side * 2, H]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * B.side, cy, (B.back + B.front) / 2]} rotation={[0, -s * Math.PI / 2, 0]} material={mats.wall}>
          <planeGeometry args={[B.front - B.back, H]} />
        </mesh>
      ))}
      <mesh position={[0, B.ceil, (B.back + B.front) / 2]} rotation={[Math.PI / 2, 0, 0]} material={mats.ceiling}>
        <planeGeometry args={[B.side * 2, B.front - B.back]} />
      </mesh>
      {/* recessed downlights */}
      {WASH_X.map((x) => (
        <group key={x} position={[x, B.ceil - 0.01, B.back + 0.5]}>
          <mesh material={mats.can}>
            <cylinderGeometry args={[0.17, 0.17, 0.02, 32]} />
          </mesh>
          <mesh position={[0, -0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.11, 32]} />
            <meshBasicMaterial color="#fff1d8" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* backdrop panel, with a warm coral glow spilling round its edges */}
      <mesh position={[0, 0.7, B.back + 0.012]}>
        <planeGeometry args={[11.2, 6.6]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <RoundedBox args={[9.6, 6.0, 0.08]} radius={0.02} smoothness={2} position={[0, 0.55, B.back + 0.06]} material={mats.panel} receiveShadow />
      {/* the sign: the real logo in 3D, mounted on the panel */}
      <group position={[0, 2.85, B.back + 0.55]} scale={0.34}>
        <Suspense fallback={null}>
          <Logo3D />
        </Suspense>
      </group>
      {/* dark porcelain floor with soft reflections */}
      <mesh position={[0, B.floor, (B.back + B.front) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[B.side * 2, B.front - B.back]} />
        {LOW ? (
          <meshStandardMaterial map={tiles} normalMap={tilesRelief} color="#77767c" roughness={0.32} metalness={0.25} />
        ) : (
        <MeshReflectorMaterial
          map={tiles}
          normalMap={tilesRelief}
          normalScale={[0.6, 0.6]}
          color="#77767c"
          roughness={0.5}
          metalness={0.2}
          blur={[500, 160]}
          resolution={1024}
          mixBlur={1}
          mixStrength={2.2}
          mirror={0.55}
          depthScale={0.9}
          minDepthThreshold={0.25}
          maxDepthThreshold={1.3}
        />
        )}
      </mesh>
      {/* the desk: thick walnut top on black slab legs */}
      <RoundedBox args={[8.0, 0.16, 2.3]} radius={0.03} smoothness={4} position={[0, -0.08, -0.05]} material={mats.walnut} receiveShadow castShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.55, -1.54, -0.05]} material={mats.black} castShadow receiveShadow>
          <boxGeometry args={[0.18, 2.76, 1.95]} />
        </mesh>
      ))}
      <mesh position={[0, -0.35, -0.9]} material={mats.black} castShadow>
        <boxGeometry args={[7.0, 0.38, 0.06]} />
      </mesh>
    </>
  );
}

// Lights: a row of wall-washers along the back wall, a key light over the desk, a hero
// light that follows whichever product the camera is on, the lamp, and the laptop glow.
// They exist the whole time (so shaders never recompile mid-scroll) but only shine in the room.
function RoomLights() {
  const wash = useRef([]);
  const washTargets = useRef([]);
  const key = useRef();
  const keyTarget = useRef();
  const hero = useRef();
  const heroTarget = useRef();
  const spot = useRef();
  const spotTarget = useRef();
  const screen = useRef();
  const fill = useRef();
  const lamp = useRef(1);
  const heroAmt = useRef(0);
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    wash.current.forEach((l, i) => (l.target = washTargets.current[i]));
    key.current.target = keyTarget.current;
    hero.current.target = heroTarget.current;
    spot.current.target = spotTarget.current;
  }, []);
  useFrame((_, dt) => {
    const d = scroll.dive;
    const room = ease(seg(d, DESK.enter - 0.01, DESK.enter + 0.01));
    lamp.current = damp(lamp.current, deskState.lampOn ? 1 : 0, 8, dt);
    // which product is on stage, and how much
    let best = -1;
    let amt = 0;
    LAYOUT.forEach((_, i) => {
      const f = focusAmount(i, d);
      if (f > amt) {
        amt = f;
        best = i;
      }
    });
    heroAmt.current = damp(heroAmt.current, amt, 6, dt);
    if (best >= 0) {
      const p = LAYOUT[best].pos;
      const y = LIFT[LAYOUT[best].type];
      heroTarget.current.position.set(ROOM[0] + p[0], ROOM[1] + y, ROOM[2] + p[2]);
      hero.current.position.set(ROOM[0] + p[0] + 1.2, ROOM[1] + y + 3.2, ROOM[2] + p[2] + 2.0);
    }
    // the room dims a touch while a product has the spotlight
    const stage = 1 - heroAmt.current * 0.35;
    wash.current.forEach((l) => (l.intensity = room * 85 * stage));
    key.current.intensity = room * 230 * stage;
    hero.current.intensity = room * heroAmt.current * 42;
    spot.current.intensity = room * lamp.current * 7;
    screen.current.intensity = room * 0.7;
    fill.current.intensity = room * 0.6;
    gl.shadowMap.autoUpdate = room > 0;
    if (scene.fog) {
      scene.fog.near = lerp(12, 80, room);
      scene.fog.far = lerp(62, 300, room);
    }
  });
  const at = (p) => [ROOM[0] + p[0], ROOM[1] + p[1], ROOM[2] + p[2]];
  const head = [LAMP_AT[0] + LAMP_HEAD[0], LAMP_AT[1] + LAMP_HEAD[1], LAMP_AT[2] + LAMP_HEAD[2]];
  return (
    <>
      {WASH_X.map((x, i) => (
        <group key={x}>
          <spotLight
            ref={(l) => (wash.current[i] = l)}
            position={at([x, ROOMBOX.ceil - 0.05, ROOMBOX.back + 0.5])}
            angle={0.62}
            penumbra={0.55}
            decay={2}
            distance={0}
            intensity={0}
            color="#ffd6a3"
          />
          <object3D ref={(o) => (washTargets.current[i] = o)} position={at([x, -2.2, ROOMBOX.back + 0.05])} />
        </group>
      ))}
      <spotLight
        ref={key}
        position={at([0.6, ROOMBOX.ceil - 0.05, 2.6])}
        angle={0.62}
        penumbra={0.85}
        decay={2}
        distance={0}
        intensity={0}
        color="#fff0dc"
        castShadow
        shadow-mapSize={LOW ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={20}
      />
      <object3D ref={keyTarget} position={at([0, 0, -0.3])} />
      <spotLight ref={hero} angle={0.28} penumbra={0.7} decay={2} distance={0} intensity={0} color="#fff4e6" />
      <object3D ref={heroTarget} />
      <hemisphereLight ref={fill} args={["#8f88b8", "#2a2228", 0]} />
      <spotLight ref={spot} position={at(head)} angle={0.7} penumbra={0.8} decay={2} distance={0} intensity={0} color="#ffcf8a" />
      <object3D ref={spotTarget} position={at(LAMP_AIM)} />
      <pointLight ref={screen} position={at([3.0, 0.8, -0.2])} color="#a99cff" intensity={0} distance={3} decay={2} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The room                                                             */
/* ------------------------------------------------------------------ */
export function DeskRoom() {
  const { gl, scene, camera } = useThree();

  // live state: is the room on screen, which product is focused
  useFrame((state) => {
    clockNow.t = state.clock.elapsedTime;
    const d = scroll.dive;
    deskState.active = deskState.inSection && d > DESK.enter + 0.04;
    deskState.focus = deskState.active ? activeIndex(d) : -1;
    if (!deskState.active && deskState.hover !== -1) {
      deskState.hover = -1;
      setCursor(false);
    }
  });

  // real keyboard → 3D keys + monitor; drag-to-spin
  useEffect(() => {
    const down = (e) => {
      if (!deskState.active || e.metaKey || e.ctrlKey || e.altKey) return;
      // typing into a form (the order sheet) is not typing on the desk
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector(".sheet.open")) return;
      held.add(e.code);
      if (e.key === "Backspace") typeChar("\b");
      else if (e.key === "Enter") typeChar("\n");
      else if (e.key.length === 1) typeChar(e.key);
      else return;
      e.preventDefault(); // keep space from scrolling and / from opening quick find
    };
    const up = (e) => held.delete(e.code);
    const move = (e) => {
      const drag = deskState.drag;
      if (!drag) return;
      deskState.spin[drag.i] += (e.clientX - drag.x) * 0.012;
      drag.x = e.clientX;
    };
    const release = () => (deskState.drag = null);
    const press = (e) => {
      pressAt.x = e.clientX;
      pressAt.y = e.clientY;
    };
    const blur = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // compile the room's shaders and upload its textures early, so the reveal doesn't stutter
  useEffect(() => {
    const id = setTimeout(() => {
      ready().then(() => {
        madeTextures.forEach((t) => gl.initTexture(t));
        gl.compileAsync?.(scene, camera).catch(() => {});
      });
    }, 1200);
    return () => clearTimeout(id);
  }, [gl, scene, camera]);

  return (
    <>
      {/* reflections: warm downlights in a row, a soft front panel for highlights on the gloss */}
      <Environment resolution={LOW ? 128 : 256} environmentIntensity={0.38}>
        <color attach="background" args={["#0c0b10"]} />
        {[-6, -3, 0, 3, 6].map((x) => (
          <Lightformer key={x} form="circle" intensity={6} color="#ffd9a8" position={[x, 5, -3]} rotation-x={Math.PI / 2} scale={0.8} />
        ))}
        <Lightformer form="rect" intensity={1.6} color="#f3e8dc" position={[0, 2, 8]} rotation-y={Math.PI} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#ff6b5a" position={[-8, 1, 0]} rotation-y={Math.PI / 2} scale={[3, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#6d62d8" position={[8, 1, 0]} rotation-y={-Math.PI / 2} scale={[3, 6, 1]} />
      </Environment>
      <RoomLights />
      <group position={ROOM}>
        <Shell />
        <CozyChair position={[0.15, ROOMBOX.floor, -1.95]} rotation={[0, -0.14, 0]} />
        <Plant seed={1} position={[-6.1, ROOMBOX.floor, -2.0]} />
        <Plant seed={2} position={[6.1, ROOMBOX.floor, -2.0]} rotation={[0, 1.4, 0]} />
        <Lamp />
        <Laptop position={[3.05, 0, -0.45]} rotation={[0, -0.42, 0]} />
        <Mug position={[1.75, 0, -0.62]} />
        <DeskPad position={[0.1, 0.006, 0.05]} />
        <Books position={[-2.62, 0, -0.78]} rotation={[0, 0.18, 0]} />
        <Notebook position={[-1.25, 0.012, -0.5]} rotation={[0, 0.22, 0]} />
        <Cables />
        {LAYOUT.map((_, i) => (
          <ProductItem key={i} i={i} />
        ))}
      </group>
    </>
  );
}
