// Shared layout and live state for the desk room the camera dives into after the smoke.
// The page (Site.jsx) and the 3D scene (Desk.jsx / Scene.jsx) both read from here.
import { ease, seg } from "./store";

// The room is built far below the story so the two never share the frame.
export const ROOM = [0, -60, 0];

// Dive-section scroll (0..1): smoke fills the screen until `enter`, then the room tour.
// Each product owns a stop centred on `centers[i]`, held for ±`hold`.
export const DESK = {
  enter: 0.1,
  overview: [0.19, 0.25],
  centers: [0.33, 0.45, 0.57, 0.69, 0.81],
  hold: 0.035,
  finale: 0.9,
};

// Where each product sits on the desk (room units: desk top is y = 0, 1 unit ≈ 25 cm).
// Order matches lib/products.js.
export const LAYOUT = [
  { slug: "herbal-communication", type: "pack", pos: [-0.95, 0, 0.28], yaw: 0.12 },
  { slug: "puff-n-tough", type: "pack", pos: [1.05, 0, 0.32], yaw: -0.18 },
  { slug: "bombay-blaze", type: "pack", pos: [0.25, 0, -0.42], yaw: -0.06 },
  { slug: "toasted-blues", type: "tray", pos: [-2.2, 0, 0.3], yaw: 0.14 },
  { slug: "midnight-munchies", type: "tray", pos: [2.2, 0, 0.36], yaw: -0.14 },
];

// How high a product floats, and how far it tips toward the camera, while it's in focus.
export const LIFT = { pack: 0.42, tray: 0.5 };
export const TILT = { pack: 0.7, tray: 0.95 };

// Live state written by the scene and the page every frame. Kept outside React on purpose.
export const deskState = {
  active: false, // the room is on screen and accepting input
  inSection: false, // the dive section is the one being scrolled
  focus: -1, // product the camera is parked on
  hover: -1, // product under the pointer
  pointer: { x: 0, y: 0 }, // pointer in CSS pixels
  typed: "", // what the visitor has typed on their real keyboard
  dirty: true, // the monitor needs repainting
  lampOn: true,
  open: [true, true, true, true, true], // packs open when focused (click toggles)
  spin: [0, 0, 0, 0, 0], // drag-to-spin, per product
  drag: null, // { i, x } while dragging a product
};

// 0..1: how much the camera is parked on product i at dive progress d.
export const focusAmount = (i, d) => 1 - ease(seg(Math.abs(d - DESK.centers[i]), DESK.hold, DESK.hold + 0.04));

// Which product's card should show at dive progress d (-1 for none).
export function activeIndex(d) {
  for (let i = 0; i < DESK.centers.length; i++) {
    if (Math.abs(d - DESK.centers[i]) < DESK.hold + 0.025) return i;
  }
  return -1;
}

// Ask the page to scroll the camera to product i.
export const requestFocus = (i) => window.dispatchEvent(new CustomEvent("desk:focus", { detail: i }));

