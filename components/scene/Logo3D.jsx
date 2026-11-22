"use client";

// The Toasted logo in real 3D: the cream lettering is cut out of the actual logo art and
// stacked in depth over the coral swoosh. Used in the hero and as the sign in the office.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { logoVert, logoFrag } from "./shaders";

const C = { coral: "#ff4d4d" };

const LOGO_W = 6;
const LOGO_H = LOGO_W * (500 / 860);
const LOGO_DEPTH = 0.75;
const LOGO_SLICES = 40;

// The cream lettering is cut out of the actual logo art and stacked in depth,
// so the extrusion is the real letterforms rather than a lookalike font.
export function Logo3D() {
  const mask = useTexture("/logo-letters.png");
  const geo = useMemo(() => new THREE.PlaneGeometry(LOGO_W, LOGO_H), []);
  const face = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: logoVert,
        fragmentShader: logoFrag,
        uniforms: { uMap: { value: mask }, uTime: { value: 0 } },
      }),
    [mask]
  );
  const sides = useMemo(() => {
    mask.anisotropy = 8;
    const near = new THREE.Color("#7767c8");
    const mid = new THREE.Color("#4b3f85");
    const far = new THREE.Color("#1f173f");
    return Array.from({ length: LOGO_SLICES - 1 }, (_, i) => {
      const k = i / (LOGO_SLICES - 2);
      // bright lip right behind the face, then a long falloff into shadow
      const color = k < 0.12 ? near.clone().lerp(mid, k / 0.12) : mid.clone().lerp(far, (k - 0.12) / 0.88);
      return new THREE.MeshBasicMaterial({ map: mask, color, alphaTest: 0.5, toneMapped: false });
    });
  }, [mask]);
  useFrame((state) => {
    face.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      {/* the coral swoosh behind the letters: a solid disc with a darker rim */}
      <group position={[0.15, 0, -LOGO_DEPTH - 0.34]} rotation={[0, 0, 0.055]} scale={[2.68, 0.84, 1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1, 1, 0.4, 128]} />
          <meshBasicMaterial attach="material-0" color="#a82828" toneMapped={false} />
          <meshBasicMaterial attach="material-1" color={C.coral} toneMapped={false} />
          <meshBasicMaterial attach="material-2" color="#a82828" toneMapped={false} />
        </mesh>
      </group>
      <mesh geometry={geo} material={face} />
      {sides.map((m, i) => (
        <mesh key={i} geometry={geo} material={m} position={[0, 0, -((i + 1) / LOGO_SLICES) * LOGO_DEPTH]} />
      ))}
    </group>
  );
}

