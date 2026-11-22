"use client";

// Camera-like finishing for the desk room, the difference between "3D render" and "photo":
//   - ambient occlusion: soft contact shadow wherever things meet or sit close together
//   - depth of field: the lens focuses on the product the camera is looking at
//   - bloom: light sources (lamp, laptop screen, downlights, the sign) glow a little
//   - filmic tone mapping: highlights roll off softly instead of clipping
//   - vignette and fine film grain
// It only runs inside the room (it switches on while the smoke covers the screen),
// and never on phones or low-power devices.
import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { scroll, lerp } from "@/lib/store";
import { ROOM, DESK, LAYOUT, LIFT, focusAmount } from "@/lib/desk";
import { LOW } from "@/lib/device";

export function RoomFX() {
  const [on, setOn] = useState(false);
  const dof = useRef();
  const aim = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    // switch on once the smoke covers everything, off again on the way back out
    const inRoom = scroll.dive >= DESK.enter - 0.004;
    if (inRoom !== on) setOn(inRoom);
    const effect = dof.current;
    if (!effect?.target) return;
    // focus on the product in the spotlight, or the middle of the desk
    let best = -1;
    let amt = 0;
    LAYOUT.forEach((_, i) => {
      const f = focusAmount(i, scroll.dive);
      if (f > amt) {
        amt = f;
        best = i;
      }
    });
    if (best >= 0 && amt > 0.2) {
      const p = LAYOUT[best].pos;
      aim.set(ROOM[0] + p[0], ROOM[1] + LIFT[LAYOUT[best].type], ROOM[2] + p[2]);
    } else aim.set(ROOM[0], ROOM[1] + 0.2, ROOM[2] - 0.2);
    effect.target.lerp(aim, 1 - Math.exp(-6 * dt));
    // shallow focus while a product has the stage, deep focus for the wide shots
    effect.bokehScale = lerp(1.2, 5.5, amt);
  });

  if (LOW || !on) return null;
  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes quality="medium" aoRadius={0.9} distanceFalloff={0.9} intensity={2.4} color="#06040c" />
      <DepthOfField ref={dof} target={[ROOM[0], ROOM[1], ROOM[2]]} worldFocusRange={1.3} focalLength={0.02} bokehScale={2} />
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.78} luminanceSmoothing={0.2} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.55} />
      <Noise opacity={0.028} premultiply />
    </EffectComposer>
  );
}
