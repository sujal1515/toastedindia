// Flattens the real tray artwork out of the product photos, so the 3D trays carry the actual print.
// Each job maps a four-cornered area of a photo (corners in photo pixels: TL, TR, BR, BL)
// onto a flat rectangle, undoing the camera's perspective.
//   node scripts/trays.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const JOBS = [
  // Toasted Blues: the whole printed floor of the tray
  {
    src: "rollingtray.jpg",
    out: "public/trays/toasted-blues.jpg",
    size: [1080, 840],
    quad: [[106, 186], [496, 112], [556, 322], [134, 398]],
    // trim/extend inside that first guess (in its 1080x800 output pixels) to land on the floor's edges
    refine: [6, 44, 1050, 856],
  },
  // Midnight Munchies: the sticker card (the tray itself is plain black)
  {
    src: "rollingtray2.jpg",
    out: "public/trays/midnight-sticker.png",
    size: [860, 1000],
    quad: [[163.5, 192.5], [326, 148.5], [437.5, 300], [262.5, 359]],
  },
];

// Solve the 3x3 homography that sends rectangle corners to the photo's quad.
function homography(w, h, quad) {
  const dst = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [];
  const b = [];
  dst.forEach(([u, v], i) => {
    const [x, y] = quad[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  });
  // Gaussian elimination
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const hv = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * hv[k];
    hv[r] = s / A[r][r];
  }
  return [...hv, 1];
}

await mkdir("public/trays", { recursive: true });

for (const job of JOBS) {
  const { data, info } = await sharp(job.src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [W, H] = job.size;
  let quad = job.quad;
  if (job.refine) {
    const g = homography(1080, 800, job.quad);
    const at = (u, v) => {
      const z = g[6] * u + g[7] * v + g[8];
      return [(g[0] * u + g[1] * v + g[2]) / z, (g[3] * u + g[4] * v + g[5]) / z];
    };
    const [u0, v0, u1, v1] = job.refine;
    quad = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  }
  const m = homography(W, H, quad);
  const out = Buffer.alloc(W * H * 3);
  const px = (x, y, c) => data[(Math.min(info.height - 1, Math.max(0, y)) * info.width + Math.min(info.width - 1, Math.max(0, x))) * 3 + c];
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const z = m[6] * u + m[7] * v + m[8];
      const x = (m[0] * u + m[1] * v + m[2]) / z;
      const y = (m[3] * u + m[4] * v + m[5]) / z;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      for (let c = 0; c < 3; c++) {
        const top = px(x0, y0, c) * (1 - fx) + px(x0 + 1, y0, c) * fx;
        const bot = px(x0, y0 + 1, c) * (1 - fx) + px(x0 + 1, y0 + 1, c) * fx;
        out[(v * W + u) * 3 + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  let img = sharp(out, { raw: { width: W, height: H, channels: 3 } }).sharpen({ sigma: 0.8 });
  img = job.out.endsWith(".png") ? img.png() : img.jpeg({ quality: 92 });
  await img.toFile(job.out);
  console.log("wrote", job.out);
}
