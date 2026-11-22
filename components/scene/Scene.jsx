"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { scroll, seg, ease, lerp } from "@/lib/store";
import { CALLOUTS } from "@/lib/callouts";
import { DESK } from "@/lib/desk";
import { LOW } from "@/lib/device";
import { DeskRoom, roomCamera } from "./Desk";
import { RoomFX } from "./RoomFX";
import { Logo3D } from "./Logo3D";
import {
  bgVert, bgFrag, paperVert, paperFrag, smokeVert, smokeFrag, logoVert, logoFrag, veilVert, veilFrag,
} from "./shaders";

const C = {
  indigo: "#3a2f5f",
  violet: "#4b3f85",
  coral: "#ff4d4d",
  cream: "#f6f0dc",
  night: "#0d0a16",
};

const PAPER_W = 3.2;
const PAPER_H = 1.1;

// The brand name, repeated on the diagonal, pressed into every leaf as a watermark.
let markTexture;
function getMarkTexture() {
  if (markTexture) return markTexture;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.font = "italic 900 58px Arial, Helvetica, sans-serif";
  ctx.textBaseline = "middle";
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.save();
      ctx.translate(col * 342 + (row % 2) * 171 + 20, row * 128 + 64);
      ctx.rotate(-0.2);
      ctx.fillText("TOASTED", 0, 0);
      ctx.restore();
    }
  }
  markTexture = new THREE.CanvasTexture(c);
  markTexture.wrapS = markTexture.wrapT = THREE.RepeatWrapping;
  markTexture.anisotropy = 8;
  return markTexture;
}

const paperUniforms = () => ({
  uRoll: { value: 0 },
  uTight: { value: 0 },
  uWave: { value: 0 },
  uFold: { value: 0 },
  uEmber: { value: 0 },
  uTime: { value: 0 },
  uOpacity: { value: 1 },
  uFade: { value: 0 },
  uFogCol: { value: new THREE.Color("#1a1236") },
  uMark: { value: getMarkTexture() },
  uL1: { value: new THREE.Vector3(0.45, 0.75, 0.9).normalize() },
  uH: { value: PAPER_H },
});

/* ------------------------------------------------------------------ */
/* Background smoke                                                     */
/* ------------------------------------------------------------------ */
function Background() {
  const { size } = useThree();
  const palette = useMemo(
    () => ({
      hero: [new THREE.Color("#17112f"), new THREE.Color("#3a2f78"), new THREE.Color("#7a3a8c")],
      story: [new THREE.Color("#120e1f"), new THREE.Color(C.indigo), new THREE.Color("#ff5a3c")],
      dive: [new THREE.Color("#07050d"), new THREE.Color("#2a2147"), new THREE.Color(C.coral)],
    }),
    []
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uWarp: { value: 0 },
      uHero: { value: 1 },
      uCenter: { value: new THREE.Vector2() },
      uMouse: { value: new THREE.Vector2() },
      uDeep: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHot: { value: new THREE.Color() },
    }),
    []
  );

  useFrame((state) => {
    const u = uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uAspect.value = size.width / size.height;
    u.uMouse.value.lerp(scroll.mouse, 0.05);
    const a = ease(seg(scroll.story, 0, 0.4));
    const b = ease(seg(scroll.dive, 0, 0.12));
    ["uDeep", "uMid", "uHot"].forEach((k, i) => {
      u[k].value.copy(palette.hero[i]).lerp(palette.story[i], a).lerp(palette.dive[i], b);
    });
    u.uWarp.value = b;
    u.uHero.value = 1 - ease(seg(scroll.story, 0, 0.16));
    u.uCenter.value.lerp(scroll.stage, 0.08);
  });

  // Built by hand so the material keeps these exact uniform objects
  // (passing them as a JSX prop copies them, and the updates never arrive).
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bgVert,
        fragmentShader: bgFrag,
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    [uniforms]
  );

  return (
    <mesh frustumCulled={false} renderOrder={-10} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* The pack: procedural box, lid printed with the real logo             */
/* ------------------------------------------------------------------ */
function useLidTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = 460;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, []);

  useEffect(() => {
    const canvas = texture.image;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      // sample the logo's own background so the lid matches it exactly
      ctx.drawImage(img, 0, 0, 4, 4, 0, 0, 4, 4);
      const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const h = 400;
      const w = h * (img.width / img.height);
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2 - 6, w, h);

      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(0, canvas.height - 26, canvas.width, 26);
      ctx.fillStyle = "rgba(246,240,220,0.85)";
      ctx.font = "600 22px Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("KING SIZE SLIM", 44, 54);
      ctx.textAlign = "right";
      ctx.fillText("ROLLING PAPERS", canvas.width - 44, 54);
      texture.needsUpdate = true;
    };
    img.src = "/logo-wide.jpg";
  }, [texture]);

  return texture;
}

function Pack({ packRef, lidRef }) {
  const lid = useLidTexture();
  return (
    <group ref={packRef}>
      {/* tray of the box, with the stack of leaves showing on top */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[3.6, 0.26, 1.15]} />
        <meshStandardMaterial attach="material-0" color={C.coral} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={C.coral} roughness={0.55} />
        <meshStandardMaterial attach="material-2" color="#2a2147" roughness={0.8} />
        <meshStandardMaterial attach="material-3" color={C.indigo} roughness={0.6} />
        <meshStandardMaterial attach="material-4" color={C.coral} roughness={0.55} />
        <meshStandardMaterial attach="material-5" color={C.coral} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.112, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.3, 0.98]} />
        <meshStandardMaterial color="#e9e2cc" roughness={0.9} />
      </mesh>
      {/* lid, hinged along the back edge */}
      <group ref={lidRef} position={[0, 0.11, -0.575]}>
        <mesh position={[0, 0.02, 0.575]}>
          <boxGeometry args={[3.6, 0.04, 1.15]} />
          <meshStandardMaterial attach="material-0" color={C.coral} roughness={0.55} />
          <meshStandardMaterial attach="material-1" color={C.coral} roughness={0.55} />
          <meshStandardMaterial attach="material-2" map={lid} roughness={0.5} />
          <meshStandardMaterial attach="material-3" color={C.coral} roughness={0.6} />
          <meshStandardMaterial attach="material-4" color={C.coral} roughness={0.55} />
          <meshStandardMaterial attach="material-5" color={C.coral} roughness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Paper leaf + smoke                                                   */
/* ------------------------------------------------------------------ */
function Paper({ paperRef, uniforms }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: paperVert,
        fragmentShader: paperFrag,
        uniforms,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    [uniforms]
  );
  return (
    <mesh ref={paperRef} visible={false} material={material}>
      <planeGeometry args={[PAPER_W, PAPER_H, 48, 96]} />
    </mesh>
  );
}

function Smoke({ smokeRef, uniforms }) {
  const geo = useMemo(() => {
    const n = 260;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) {
      pos[i] = (Math.random() - 0.5) * 0.08;
      seed[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: smokeVert,
        fragmentShader: smokeFrag,
        uniforms,
        transparent: true,
        depthWrite: false,
      }),
    [uniforms]
  );
  return <points ref={smokeRef} geometry={geo} material={material} frustumCulled={false} visible={false} />;
}

/* ------------------------------------------------------------------ */
/* Hero: the real logo in 3D                                            */
/* ------------------------------------------------------------------ */
/* A few leaves hanging at the edges of the frame, well clear of the copy and the logo.
   Each one runs the whole ritual on a loop: folded as it left the pack, opens flat,
   rolls itself up, lets go again. */
const LEAF_SPOTS = [
  { pos: [7.0, 3.0, -3.0], rot: [0.3, -0.5, -0.35], scale: 0.62 },
  { pos: [-0.4, 3.9, -4.6], rot: [0.45, 0.25, 0.2], scale: 0.66 },
  { pos: [0.6, -3.5, -3.4], rot: [-0.4, 0.3, -0.18], scale: 0.6 },
  { pos: [8.4, -0.5, -4.4], rot: [0.2, -0.65, 0.55], scale: 0.7 },
];

function HeroLeaves() {
  const group = useRef();
  const leaves = useMemo(
    () =>
      LEAF_SPOTS.map((spot, i) => {
        const uniforms = paperUniforms();
        uniforms.uWave.value = 1;
        // only a light haze, so distant leaves stay cream rather than going grey
        uniforms.uFade.value = Math.min(0.26, Math.max(0, (-spot.pos[2] - 2) * 0.1));
        uniforms.uFogCol.value.set("#4a3c86");
        return {
          ...spot,
          uniforms,
          offset: i / LEAF_SPOTS.length,
          material: new THREE.ShaderMaterial({ vertexShader: paperVert, fragmentShader: paperFrag, uniforms, side: THREE.DoubleSide }),
        };
      }),
    []
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    group.current.children.forEach((m, i) => {
      const d = leaves[i];
      const c = (t * 0.045 + d.offset) % 1; // one full ritual every ~22s
      m.visible = state.viewport.aspect >= 1.25; // tall screens have no spare room for them
      const letGo = ease(seg(c, 0.86, 1));
      d.uniforms.uTime.value = t + i * 3.1;
      d.uniforms.uFold.value = (1 - ease(seg(c, 0.08, 0.26))) * (1 - letGo) + ease(seg(c, 0.93, 1));
      d.uniforms.uRoll.value = ease(seg(c, 0.3, 0.74)) * (1 - letGo) * 0.96;
      m.position.set(
        d.pos[0] + Math.sin(t * 0.21 + i * 1.9) * 0.22,
        d.pos[1] + Math.cos(t * 0.17 + i * 2.3) * 0.2,
        d.pos[2]
      );
      m.rotation.set(
        d.rot[0] + Math.sin(t * 0.23 + i) * 0.2,
        d.rot[1] + Math.sin(t * 0.19 + i * 1.3) * 0.24,
        d.rot[2] + Math.sin(t * 0.13 + i * 0.7) * 0.1
      );
    });
  });
  return (
    <group ref={group}>
      {leaves.map((d, i) => (
        <mesh key={i} material={d.material} scale={d.scale}>
          <planeGeometry args={[PAPER_W, PAPER_H, 32, 110]} />
        </mesh>
      ))}
    </group>
  );
}

/* Embers rising slowly through the scene. */
function Embers() {
  const geo = useMemo(() => {
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = -6 + Math.random() * 5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state, dt) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * (0.14 + (i % 7) * 0.04);
      if (y > 5) y = -5;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial color="#ff9a4d" size={0.035} sizeAttenuation transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Director: maps scroll → every object + the camera                    */
/* ------------------------------------------------------------------ */
/* The camera's shot list for the story. `s` is story scroll (0..1); between two entries the
   camera glides from one to the next. Positions are world units; the leaf floats at z = 1.25. */
const SHOTS = [
  { s: 0.0, pos: [0, 0, 7], look: [0, 0, 0] }, // hero framing
  { s: 0.1, pos: [-3.0, -1.3, 5.4], look: [0, 0, 0] }, // low three-quarter on the pack
  { s: 0.17, pos: [2.6, 1.9, 4.9], look: [0, 0.3, 0] }, // over the shoulder as the lid opens
  { s: 0.24, pos: [0.4, 1.2, 5.6], look: [0, 0.2, 0.2] }, // looking into the box
  { s: 0.33, pos: [3.3, 0.5, 3.4], look: [0, 0.15, 0.8] }, // side-on as the leaf lifts past
  { s: 0.41, pos: [-0.7, 0.15, 4.5], look: [-0.2, 0, 1.25] }, // macro: watermark and gum strip
  { s: 0.47, pos: [3.9, -0.25, 1.35], look: [0, 0, 1.25] }, // edge-on: how thin it is
  { s: 0.53, pos: [1.3, 0.5, -1.9], look: [0, 0, 1.25] }, // behind it: light shining through
  { s: 0.565, pos: [-3.8, 0.5, 1.0], look: [0, 0, 1.25] }, // swing round the far end
  { s: 0.6, pos: [-1.6, 0.6, 4.6], look: [0, 0, 1.2] }, // back in front, ready to roll
  { s: 0.7, pos: [3.4, 0.9, 3.2], look: [0.2, 0, 1.2] }, // down the barrel of the roll
  { s: 0.79, pos: [-0.5, 0.3, 4.6], look: [0, 0, 1.2] }, // front-on as it tightens
  { s: 0.84, pos: [-2.6, 0.2, 3.3], look: [-1.0, 0, 1.2] }, // close on the tip
  { s: 0.92, pos: [2.9, 0.9, 3.3], look: [1.4, 0.35, 1.2] }, // close on the ember
  { s: 1.0, pos: [2.7, 1.2, 3.7], look: [1.5, 1.45, 1.3] }, // tilt up into the smoke
];
const WORLD_LIGHT = new THREE.Vector3(0.3, 0.6, 0.9).normalize();
// During the dive the camera rides up the smoke column, relative to the lit tip.
const DIVE_POS = new THREE.Vector3(0.25, 2.3, 0.7);
const DIVE_LOOK = new THREE.Vector3(0, 4.6, -0.4);

function Director() {
  const pack = useRef();
  const lid = useRef();
  const paper = useRef();
  const smoke = useRef();
  const rig = useRef();
  const hero = useRef();
  const stage = useRef();
  const logo = useRef();
  const tip = useMemo(() => new THREE.Vector3(), []);
  const cam = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
    }),
    []
  );
  const { camera, viewport, gl } = useThree();

  const paperU = useMemo(paperUniforms, []);
  const smokeU = useMemo(
    () => ({ uTime: { value: 0 }, uAlpha: { value: 0 }, uPixelRatio: { value: 1 } }),
    []
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const s = scroll.story;
    const d = scroll.dive;
    const mx = scroll.mouse.x;
    const my = scroll.mouse.y;

    // fit the hero objects to narrow screens
    const fit = Math.min(1, (viewport.aspect * 6.5) / 4.8);
    rig.current.scale.setScalar(fit);

    /* --- hero: logo, leaves and rings leave as the story starts --- */
    const heroOut = ease(seg(s, 0, 0.08));
    // the logo sits centred in the upper half; the copy is centred underneath it
    const narrow = viewport.aspect < 1.25;
    const stageX = 0;
    const stageY = narrow ? 1.35 / fit : 1.2;
    const stageScale = narrow ? 0.43 / fit : Math.min(0.78, 0.2 * viewport.aspect + 0.42);
    scroll.stage.set((stageX * fit) / 6.53, (stageY * fit) / 6.53);
    hero.current.visible = heroOut < 1;
    hero.current.position.y = heroOut * 7;
    hero.current.scale.setScalar(1 - heroOut * 0.5);
    // entrance: the logo spins up and grows into place as the gate clears
    const intro = ease(scroll.intro);
    stage.current.position.set(stageX, stageY + Math.sin(t * 0.8) * 0.07 - (1 - intro) * 0.6, 0);
    stage.current.scale.setScalar(stageScale * lerp(0.5, 1, intro));
    logo.current.rotation.set(-my * 0.14 + Math.sin(t * 0.45) * 0.05 - 0.05, mx * 0.26 + Math.sin(t * 0.5) * 0.18 - (1 - intro) * 2.4, Math.sin(t * 0.35) * 0.012);

    /* --- pack --- */
    const face = ease(seg(s, 0.0, 0.1)); // grows in and turns to face the camera
    const open = ease(seg(s, 0.12, 0.22)); // lid swings open
    const drop = ease(seg(s, 0.3, 0.4)); // box falls away once the leaf is out
    lid.current.rotation.x = -open * 2.45 - Math.sin(t * 2.2) * 0.03 * open;
    const p = pack.current;
    p.rotation.x = lerp(0.55 + Math.sin(t * 0.7) * 0.12 + my * 0.15, Math.PI / 2, face);
    p.rotation.y = lerp(Math.sin(t * 0.45) * 0.55 + mx * 0.3, 0, face);
    p.rotation.z = lerp(-0.28, 0, face) - drop * 0.7;
    p.position.set(0, -drop * 8, -drop * 3);
    p.scale.setScalar(lerp(0.001, 1.15, face));
    p.visible = drop < 0.999;

    /* --- paper leaf --- */
    const out = ease(seg(s, 0.24, 0.36)); // leaf lifts out of the open box
    const roll = seg(s, 0.6, 0.78); // slow, linear: scroll speed = roll speed
    const tight = ease(seg(s, 0.78, 0.84)); // twists into a cone
    const lit = ease(seg(s, 0.86, 0.96));
    const E = DESK.enter;
    const inRoom = d >= E;
    const leaf = paper.current;
    leaf.visible = open > 0.02 && !inRoom;
    rig.current.visible = !inRoom;
    const peel = Math.sin(out * Math.PI); // tilts while it is being pulled
    leaf.position.set(0, lerp(0, 0.1, lit) + peel * 0.35, lerp(0.15, 1.25, out));
    leaf.rotation.set(
      -peel * 0.55 + lerp(0, -0.2, tight) + Math.sin(t * 0.8) * 0.04 * out,
      lerp(0, 0.5, lit) + Math.sin(t * 0.5) * 0.03 * out,
      lerp(0, 0.02, out) + lerp(0, 0.3, lit) + Math.sin(t * 0.6) * 0.02 * out
    );
    leaf.scale.setScalar(lerp(1, 1.12, out));
    paperU.uRoll.value = roll;
    paperU.uTight.value = tight;
    paperU.uWave.value = out * (1 - roll);
    paperU.uFold.value = 0.35 * out * (1 - ease(seg(s, 0.56, 0.62)));
    paperU.uEmber.value = lit;
    paperU.uTime.value = t;
    paperU.uOpacity.value = 1;

    /* --- smoke from the lit tip --- */
    const sm = smoke.current;
    sm.visible = lit > 0.01 && !inRoom;
    if (sm.visible) {
      leaf.updateWorldMatrix(true, false);
      tip.set(PAPER_W / 2, 0, 0);
      leaf.localToWorld(tip);
      sm.position.copy(tip);
    }
    smokeU.uTime.value = t;
    // the smoke thickens as the camera rides up into it
    const rise = ease(seg(d, 0, E));
    smokeU.uAlpha.value = lit * (1 + rise * 2.5);
    smokeU.uPixelRatio.value = gl.getPixelRatio() * (gl.domElement.height / gl.getPixelRatio() / 900) * (1 + rise * 1.5);

    /* --- camera --- */
    let fov = 50;
    if (d <= 0) {
      // the story: glide from one shot to the next
      let i = 0;
      while (i < SHOTS.length - 2 && s > SHOTS[i + 1].s) i++;
      const a = SHOTS[i];
      const b = SHOTS[i + 1];
      const k = ease(seg(s, a.s, b.s));
      // the pointer nudges the camera round the subject, more so once the story is under way
      const orbit = 0.35 + 0.4 * ease(seg(s, 0.06, 0.16)) * (1 - ease(seg(s, 0.94, 1)));
      cam.pos.set(
        lerp(a.pos[0], b.pos[0], k) + mx * orbit,
        lerp(a.pos[1], b.pos[1], k) + my * orbit * 0.6,
        lerp(a.pos[2], b.pos[2], k)
      );
      // subjects shrink with the rig on narrow screens, so aim at where they actually are
      cam.look.set(lerp(a.look[0], b.look[0], k), lerp(a.look[1], b.look[1], k), lerp(a.look[2], b.look[2], k)).multiplyScalar(fit);
    } else if (!inRoom) {
      // the dive: from the last story shot, up the smoke column off the ember
      const a = SHOTS[SHOTS.length - 1];
      const k = ease(seg(d, 0, E));
      cam.pos.set(...a.pos).lerp(cam.tmp.copy(tip).add(DIVE_POS), k);
      cam.look.set(...a.look).multiplyScalar(fit).lerp(cam.tmp2.copy(tip).add(DIVE_LOOK), k);
      fov = lerp(50, 72, k);
    } else {
      // the room: tour the desk
      fov = roomCamera(d, viewport.aspect, cam);
    }
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // the key light lives in the world, so walking behind the leaf really does backlight it
    paperU.uL1.value.copy(WORLD_LIGHT).transformDirection(camera.matrixWorldInverse);

    /* --- feature callouts: project each anchor on the leaf to the screen --- */
    leaf.updateWorldMatrix(true, false);
    CALLOUTS.forEach((c, n) => {
      const slot = scroll.callouts[n];
      const o = d > 0 ? 0 : ease(seg(s, c.from, c.from + 0.015)) * (1 - ease(seg(s, c.to - 0.015, c.to)));
      if (o <= 0) {
        slot.o = 0;
        return;
      }
      cam.tmp.set(c.anchor[0], c.anchor[1], c.anchor[2]).applyMatrix4(leaf.matrixWorld).project(camera);
      slot.x = cam.tmp.x * 0.5 + 0.5;
      slot.y = -cam.tmp.y * 0.5 + 0.5;
      slot.o = cam.tmp.z < 1 ? o : 0;
    });

  });

  return (
    <>
      <group ref={rig}>
        <Pack packRef={pack} lidRef={lid} />
        <Paper paperRef={paper} uniforms={paperU} />
        <group ref={hero}>
          <group ref={stage}>
            <group ref={logo}>
              <Suspense fallback={null}>
                <Logo3D />
              </Suspense>
            </group>
          </group>
        </group>
      </group>
      <Smoke smokeRef={smoke} uniforms={smokeU} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Smoke veil: the screen fills with smoke, then clears onto the desk   */
/* ------------------------------------------------------------------ */
function SmokeVeil() {
  const { size } = useThree();
  const mesh = useRef();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: veilVert,
        fragmentShader: veilFrag,
        uniforms: { uAmount: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    []
  );
  useFrame((state) => {
    const d = scroll.dive;
    const E = DESK.enter;
    const amount = d < E ? ease(seg(d, E * 0.35, E * 0.95)) : 1 - ease(seg(d, E + 0.01, E + 0.08));
    material.uniforms.uAmount.value = amount;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uAspect.value = size.width / size.height;
    mesh.current.visible = amount > 0.001;
  });
  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={1000} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

// The story's lights, dimmed once the room's own lighting takes over.
function StoryLights() {
  const amb = useRef();
  const dir = useRef();
  const pt = useRef();
  useFrame(() => {
    const room = ease(seg(scroll.dive, DESK.enter - 0.01, DESK.enter + 0.01));
    amb.current.intensity = lerp(1.5, 0.3, room);
    dir.current.intensity = lerp(2.2, 0.15, room);
    pt.current.intensity = lerp(30, 0, room);
  });
  return (
    <>
      <ambientLight ref={amb} intensity={1.5} />
      <directionalLight ref={dir} position={[3, 5, 6]} intensity={2.2} />
      <pointLight ref={pt} position={[-4, -2, 3]} intensity={30} color={C.coral} />
    </>
  );
}

// Tells the page how loading is going, so the age gate can double as a loader.
// Ready = nothing left loading and the scene has drawn a few frames.
function ReadySignal() {
  const state = useRef({ busy: 0, frames: 0, sent: false });
  useEffect(() => {
    const m = THREE.DefaultLoadingManager;
    const st = state.current;
    const prev = { onStart: m.onStart, onLoad: m.onLoad, onProgress: m.onProgress };
    m.onStart = (...a) => {
      st.busy = 1;
      prev.onStart?.(...a);
    };
    m.onLoad = (...a) => {
      st.busy = 0;
      prev.onLoad?.(...a);
    };
    m.onProgress = (url, loaded, total) => {
      window.dispatchEvent(new CustomEvent("scene:progress", { detail: total ? loaded / total : 1 }));
      prev.onProgress?.(url, loaded, total);
    };
    return () => Object.assign(m, prev);
  }, []);
  useFrame(() => {
    const st = state.current;
    if (st.sent) return;
    st.frames++;
    if (st.frames > 24 && !st.busy) {
      st.sent = true;
      window.__sceneReady = true;
      window.dispatchEvent(new Event("scene:ready"));
    }
  });
  return null;
}

export default function Scene() {
  // Pointer events come from the whole page, not just the canvas, because the page's
  // sections sit on top of it. Desk.jsx ignores events aimed at the page's own buttons.
  const source = typeof document !== "undefined" ? document.getElementById("site-root") : undefined;
  return (
    <Canvas
      flat
      shadows
      dpr={LOW ? [1, 1.25] : [1, 1.75]}
      camera={{ fov: 50, near: 0.05, far: 220, position: [0, 0, 7] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      eventSource={source || undefined}
      eventPrefix="client"
    >
      <fog attach="fog" args={["#07050d", 12, 62]} />
      <StoryLights />
      <Background />
      <Director />
      <DeskRoom />
      <SmokeVeil />
      <ReadySignal />
      <RoomFX />
    </Canvas>
  );
}
