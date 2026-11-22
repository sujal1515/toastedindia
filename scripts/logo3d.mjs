// Pulls the cream lettering out of logo.jpg as a white-on-transparent mask.
// The 3D logo stacks this mask in depth to give the letters a real extrusion.
import sharp from "sharp";

const W = 1720, H = 1000;
const { data } = await sharp("logo.jpg")
  .extract({ left: 110, top: 290, width: 860, height: 500 })
  .resize(W, H, { kernel: "lanczos3" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  // cream is the only bright, low-saturation colour in the logo
  const bright = Math.min(r, g, b);
  const a = Math.max(0, Math.min(1, (bright - 120) / 70));
  out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255; out[i * 4 + 3] = Math.round(a * 255);
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/logo-letters.png");
console.log("logo mask written");
