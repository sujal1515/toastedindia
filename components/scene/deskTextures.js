// Canvas-painted textures for the desk room: product artwork, the monitor, the wood, the neon.
// Everything is drawn here so the room needs no extra image downloads beyond the logo.
import * as THREE from "three";

const INK = { indigo: "#3a2f5f", violet: "#4b3f85", coral: "#ff4d4d", cream: "#f6f0dc", sun: "#ffd23f", night: "#0d0a16" };

/* ------------------------------------------------------------------ */
/* Shared assets: fonts and the logo                                    */
/* ------------------------------------------------------------------ */
const assets = { mask: null, fonts: { display: "Impact, sans-serif", body: "Arial, sans-serif" } };
let readyPromise;

const loadImg = (src) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

export function ready() {
  if (readyPromise) return readyPromise;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue("--font-display").trim();
  const body = css.getPropertyValue("--font-body").trim();
  if (display) assets.fonts.display = `${display}, Impact, sans-serif`;
  if (body) assets.fonts.body = `${body}, Arial, sans-serif`;
  readyPromise = Promise.all([
    loadImg("/logo-letters.png").then((img) => (assets.mask = img)),
    document.fonts.load(`40px ${assets.fonts.display}`).catch(() => {}),
    document.fonts.load(`700 40px ${assets.fonts.body}`).catch(() => {}),
  ]).catch(() => {});
  return readyPromise;
}

const D = (px) => `${px}px ${assets.fonts.display}`;
const B = (px, w = 600) => `${w} ${px}px ${assets.fonts.body}`;

// Every texture made here, so the scene can upload them to the GPU ahead of time.
export const madeTextures = [];

// A canvas texture that paints itself once fonts and the logo are ready.
export function makeTexture(w, h, paint, { srgb = true, repeat } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.userData.done = ready()
    .then(() => paint(canvas.getContext("2d"), w, h))
    .then(() => (tex.needsUpdate = true))
    .catch(() => {});
  madeTextures.push(tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Drawing helpers                                                      */
/* ------------------------------------------------------------------ */
const tintCache = new Map();
function tinted(color) {
  if (tintCache.has(color)) return tintCache.get(color);
  const m = assets.mask;
  const c = document.createElement("canvas");
  c.width = m.width;
  c.height = m.height;
  const x = c.getContext("2d");
  x.drawImage(m, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  tintCache.set(color, c);
  return c;
}

// The Toasted logo: coral swoosh, violet extrusion, cream face. (cx, cy) is its centre.
export function drawLogo(ctx, cx, cy, w, { swoosh = true, swooshColor = INK.coral, face = INK.cream, side = INK.violet, rot = 0 } = {}) {
  if (!assets.mask) return;
  const h = w * (1000 / 1720);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  if (swoosh) {
    ctx.fillStyle = swooshColor;
    ctx.beginPath();
    ctx.ellipse(w * 0.012, h * 0.02, w * 0.425, h * 0.25, -0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  const sideImg = tinted(side);
  for (let i = 6; i >= 1; i--) ctx.drawImage(sideImg, -w / 2 + i * w * 0.0026, -h / 2 + i * w * 0.0034, w, h);
  ctx.drawImage(tinted(face), -w / 2, -h / 2, w, h);
  ctx.restore();
}

function spacedText(ctx, text, x, y, spacing, align = "center") {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function star4(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function grain(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

// Seeded random so artwork looks the same on every visit.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/* ------------------------------------------------------------------ */
/* Packs (top of the lid; texture top = back edge of the pack)          */
/* ------------------------------------------------------------------ */
export const PACK_TEX = { w: 1320, h: 540 };

function meanderBand(ctx, x0, x1, y, u, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = u * 0.28;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  for (let x = x0; x < x1 - u * 4; x += u * 4) {
    ctx.moveTo(x, y + u * 3);
    ctx.lineTo(x, y);
    ctx.lineTo(x + u * 3, y);
    ctx.lineTo(x + u * 3, y + u * 2);
    ctx.lineTo(x + u, y + u * 2);
    ctx.lineTo(x + u, y + u);
    ctx.lineTo(x + u * 2, y + u);
  }
  ctx.moveTo(x0, y + u * 3);
  ctx.lineTo(x1, y + u * 3);
  ctx.stroke();
}

function column(ctx, x, top, height, wide) {
  const g = ctx.createLinearGradient(x - wide / 2, 0, x + wide / 2, 0);
  g.addColorStop(0, "#9d98b8");
  g.addColorStop(0.45, "#efedf6");
  g.addColorStop(1, "#8a85a8");
  ctx.fillStyle = g;
  ctx.fillRect(x - wide * 0.72, top, wide * 1.44, height * 0.07); // capital
  ctx.fillRect(x - wide * 0.6, top + height * 0.07, wide * 1.2, height * 0.04);
  ctx.fillRect(x - wide / 2, top + height * 0.11, wide, height * 0.78); // shaft
  ctx.fillRect(x - wide * 0.66, top + height * 0.89, wide * 1.32, height * 0.05);
  ctx.fillRect(x - wide * 0.78, top + height * 0.94, wide * 1.56, height * 0.06); // base
  ctx.strokeStyle = "rgba(60,55,100,0.35)";
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const fx = x - wide / 2 + (wide / 6) * i;
    ctx.beginPath();
    ctx.moveTo(fx, top + height * 0.12);
    ctx.lineTo(fx, top + height * 0.88);
    ctx.stroke();
  }
  // volutes
  ctx.strokeStyle = "#cfcbe0";
  ctx.lineWidth = 4;
  [-1, 1].forEach((s) => {
    ctx.beginPath();
    ctx.arc(x + s * wide * 0.62, top + height * 0.05, wide * 0.14, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function boneHand(ctx, x, y, s, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  ctx.strokeStyle = "#ebe7f1";
  ctx.fillStyle = "#ebe7f1";
  ctx.lineCap = "round";
  // forearm and wrist
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-170, -14);
  ctx.lineTo(-48, -10);
  ctx.moveTo(-170, 16);
  ctx.lineTo(-48, 12);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-36 + (i % 3) * 12, -14 + Math.floor(i / 3) * 24, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // fingers: metacarpal + three phalanges each, curling slightly
  const fingers = [
    { y: -26, a: -0.32, l: [62, 36, 26, 18] },
    { y: -9, a: -0.1, l: [66, 40, 28, 20] },
    { y: 8, a: 0.1, l: [64, 38, 26, 18] },
    { y: 24, a: 0.3, l: [56, 30, 22, 16] },
  ];
  ctx.lineWidth = 7;
  fingers.forEach((f) => {
    let px = -10;
    let py = f.y * 0.6;
    let a = f.a;
    f.l.forEach((len, k) => {
      const nx = px + Math.cos(a) * len;
      const ny = py + Math.sin(a) * len;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(nx, ny, 5.5, 0, Math.PI * 2);
      ctx.fill();
      px = nx;
      py = ny;
      a += k === 0 ? 0 : 0.28;
    });
  });
  // thumb
  let px = -18;
  let py = 26;
  let a = 0.9;
  [44, 30, 22].forEach((len) => {
    const nx = px + Math.cos(a) * len;
    const ny = py + Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nx, ny, 5.5, 0, Math.PI * 2);
    ctx.fill();
    px = nx;
    py = ny;
    a -= 0.45;
  });
  ctx.restore();
}

const PACK_PAINTERS = {
  "herbal-communication": (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.6);
    g.addColorStop(0, "#4a47a0");
    g.addColorStop(1, "#2e2b66");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 9000, 0.05);
    meanderBand(ctx, 30, w - 30, 22, 9, "rgba(246,240,220,0.75)");
    column(ctx, 150, 82, 330, 70);
    column(ctx, w - 150, 82, 330, 70);
    drawLogo(ctx, w / 2, h * 0.43, 600, { rot: -0.04 });
    ctx.fillStyle = INK.cream;
    ctx.font = B(24, 700);
    ctx.textBaseline = "middle";
    spacedText(ctx, "ROLLING PAPERS!", w / 2 + 120, h * 0.7, 6);
    ctx.fillStyle = INK.coral;
    ctx.fillRect(0, h - 58, w, 58);
    ctx.fillStyle = INK.cream;
    ctx.font = B(22, 700);
    spacedText(ctx, "YOU WILL GET TO WHERE YOU NEED TO BE", w / 2, h - 29, 7);
  },
  "puff-n-tough": (ctx, w, h) => {
    ctx.fillStyle = "#111014";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 14000, 0.05);
    ctx.strokeStyle = INK.coral;
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    boneHand(ctx, 260, h * 0.48, 1.05, 1);
    boneHand(ctx, w - 260, h * 0.46, 1.05, -1);
    drawLogo(ctx, w / 2, h * 0.47, 560, { rot: -0.08 });
    ctx.fillStyle = INK.coral;
    ctx.font = D(26);
    ctx.textBaseline = "middle";
    spacedText(ctx, "PUFF N TOUGH", 60, 62, 4, "left");
    ctx.fillStyle = "rgba(246,240,220,0.75)";
    ctx.font = B(17, 700);
    spacedText(ctx, "32 KING SIZE SLIM ROLLING PAPERS  ·  TIPS  ·  TRAY", w / 2, h - 52, 5);
  },
  "bombay-blaze": (ctx, w, h) => {
    ctx.fillStyle = "#efe9dc";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 9000, 0.03);
    // skyline along the bottom
    const base = h - 58;
    const r = rng(7);
    ctx.fillStyle = "#cbc5bc";
    for (let x = 20; x < w - 20; ) {
      const bw = 40 + r() * 70;
      const bh = 50 + r() * 140;
      if (Math.abs(x + bw / 2 - w / 2) > 200) ctx.fillRect(x, base - bh, bw, bh);
      x += bw + 4;
    }
    // clock tower, dome and gateway arch
    ctx.fillStyle = "#b8b1a7";
    ctx.fillRect(300, base - 300, 46, 300);
    ctx.beginPath();
    ctx.moveTo(296, base - 300);
    ctx.lineTo(323, base - 370);
    ctx.lineTo(350, base - 300);
    ctx.fill();
    ctx.fillRect(110, base - 120, 120, 120);
    ctx.beginPath();
    ctx.arc(170, base - 120, 60, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(w - 330, base - 170, 200, 170);
    ctx.fillStyle = "#efe9dc";
    ctx.beginPath();
    ctx.moveTo(w - 268, base);
    ctx.lineTo(w - 268, base - 80);
    ctx.arc(w - 230, base - 80, 38, Math.PI, 0);
    ctx.lineTo(w - 192, base);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 160; i++) ctx.fillRect(30 + r() * (w - 60), base - 20 - r() * 150, 5, 7);
    // the badge
    const cx = w / 2;
    const cy = h * 0.53;
    ctx.fillStyle = "#e8443a";
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(120,10,10,0.25)";
    for (let y = cy - 150; y < cy + 150; y += 12)
      for (let x = cx - 150; x < cx + 150; x += 12) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5 * ((y - cy + 150) / 300), 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.06);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = D(84);
    ctx.lineJoin = "round";
    ctx.lineWidth = 12;
    ctx.strokeStyle = INK.cream;
    ctx.strokeText("BOMBAY", 0, -26);
    ctx.fillStyle = "#283a92";
    ctx.fillText("BOMBAY", 0, -26);
    ctx.font = D(60);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#283a92";
    ctx.strokeText("BLAZE", 6, 46);
    ctx.fillStyle = INK.cream;
    ctx.fillText("BLAZE", 6, 46);
    ctx.restore();
    drawLogo(ctx, cx - 70, cy - 150, 190, { swoosh: false });
    star4(ctx, cx - 250, cy - 80, 30, "#283a92");
    star4(ctx, cx - 300, cy + 20, 16, "#283a92");
    star4(ctx, cx + 240, cy - 70, 22, "#e8443a");
    ctx.fillStyle = "#4a4560";
    ctx.font = B(20, 700);
    ctx.textBaseline = "middle";
    spacedText(ctx, "KING SIZE SLIM ROLLING PAPERS", cx, 40, 6);
    ctx.font = `700 34px "Nirmala UI", "Mangal", ${assets.fonts.body}`;
    ctx.textAlign = "left";
    ctx.fillText("मुंबई", 60, h * 0.4);
    ctx.textAlign = "right";
    ctx.fillText("गेट टोस्टेड", w - 60, h * 0.4);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e8443a";
    ctx.fillRect(0, h - 58, w, 58);
    ctx.fillStyle = INK.cream;
    ctx.font = B(22, 700);
    spacedText(ctx, "TRAY + GRINDER + TIPS", cx, h - 29, 8);
  },
};

const PACK_INSIDE = {
  "herbal-communication": ["You will get", "to where you", "need to be."],
  "puff-n-tough": ["Where darkness", "meets", "enlightenment."],
  "bombay-blaze": ["One puff", "at a time,", "Mumbai."],
};

export function packTopTexture(slug) {
  return makeTexture(PACK_TEX.w, PACK_TEX.h, PACK_PAINTERS[slug]);
}

// The underside of the lid: you only see it when the pack opens.
export function packInsideTexture(slug) {
  return makeTexture(PACK_TEX.w, PACK_TEX.h, (ctx, w, h) => {
    ctx.fillStyle = "#f3ecd8";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 6000, 0.035);
    ctx.fillStyle = INK.indigo;
    ctx.font = D(64);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    PACK_INSIDE[slug].forEach((line, i) => ctx.fillText(line.toUpperCase(), 70, 140 + i * 92));
    drawLogo(ctx, w - 230, h - 120, 300, { rot: -0.08 });
    ctx.fillStyle = INK.coral;
    ctx.font = B(20, 700);
    spacedText(ctx, "32 LEAVES · CHEMICAL FREE · ULTRA THIN", 70, h - 50, 4, "left");
  });
}

// The top leaf of the stack inside, with the watermark showing faintly.
export function leavesTexture() {
  return makeTexture(660, 270, (ctx, w, h) => {
    ctx.fillStyle = "#f4efe1";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(160,140,110,0.14)";
    ctx.font = "italic 900 30px Arial, sans-serif";
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 5; col++) {
        ctx.save();
        ctx.translate(col * 150 + (row % 2) * 75 - 20, row * 60 + 30);
        ctx.rotate(-0.2);
        ctx.fillText("TOASTED", 0, 0);
        ctx.restore();
      }
    // gum strip
    ctx.fillStyle = "rgba(210,190,150,0.5)";
    ctx.fillRect(0, 0, w, 16);
  });
}

/* ------------------------------------------------------------------ */
/* Trays                                                                */
/* ------------------------------------------------------------------ */
function cloud(ctx, x, y, s) {
  ctx.fillStyle = "rgba(40,30,110,0.35)";
  [[0, 10, 46], [44, 0, 58], [96, 12, 44], [60, 24, 46]].forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + (dy + 10) * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#ffffff";
  [[0, 10, 46], [44, 0, 58], [96, 12, 44], [60, 24, 46]].forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  });
}

function toast(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#f2c88a";
  ctx.strokeStyle = "#c9864a";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-60, 60);
  ctx.lineTo(-60, -20);
  ctx.arc(-28, -28, 34, Math.PI, Math.PI * 1.6);
  ctx.arc(28, -28, 34, Math.PI * 1.4, 0);
  ctx.lineTo(60, 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Tray colours sampled from the product photos.
export const TRAY_INK = { "toasted-blues": "#2f3069", "midnight-munchies": "#0c0c0d" };

const TRAY_PAINTERS = {
  // The whole printed floor, taken from the photo. The edges fade into the tray's own
  // indigo so the print meets the walls cleanly, and two glare spots are painted out.
  "toasted-blues": async (ctx, w, h) => {
    const img = await loadImg("/trays/toasted-blues.jpg");
    ctx.drawImage(img, 0, 0, w, h);
    const ink = "47,48,105";
    [[70, 10, 90], [940, 10, 110]].forEach(([x, y, r]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${ink},1)`);
      g.addColorStop(0.55, `rgba(${ink},0.85)`);
      g.addColorStop(1, `rgba(${ink},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    const edge = 46;
    [
      [0, 0, w, edge, 0, 0, 0, edge],
      [0, h - edge, w, edge, 0, h, 0, h - edge],
      [0, 0, edge, h, 0, 0, edge, 0],
      [w - edge, 0, edge, h, w, 0, w - edge, 0],
    ].forEach(([x, y, ww, hh, x0, y0, x1, y1]) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(${ink},0.9)`);
      g.addColorStop(1, `rgba(${ink},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, ww, hh);
    });
  },
  // Plain black tray with the "TIRED but i have goals." card and a monochrome logo.
  "midnight-munchies": async (ctx, w, h) => {
    const card = await loadImg("/trays/midnight-sticker.png");
    ctx.fillStyle = "#0c0c0d";
    ctx.fillRect(0, 0, w, h);
    const cw = w * 0.38;
    const ch = cw * (card.height / card.width);
    ctx.save();
    ctx.translate(w * 0.45, h * 0.44);
    ctx.rotate(-0.15);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(card, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    drawLogo(ctx, w * 0.62, h * 0.86, w * 0.19, { rot: -0.32, face: "#f4f4f4", side: "#6d6d72", swooshColor: "#4a4a50" });
  },
};

export const TRAY_TEX = { w: 1080, h: 840 };
export function trayArtTexture(slug) {
  return makeTexture(TRAY_TEX.w, TRAY_TEX.h, TRAY_PAINTERS[slug]);
}

/* ------------------------------------------------------------------ */
/* Room surfaces                                                        */
/* ------------------------------------------------------------------ */
export function woodTexture() {
  return makeTexture(2048, 896, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#6a4630");
    g.addColorStop(1, "#58392566");
    ctx.fillStyle = "#62412c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = rng(42);
    const tones = ["#4a2f1f", "#7b5538", "#3f281b", "#86603f", "#55361f"];
    for (let i = 0; i < 1100; i++) {
      const y0 = r() * h;
      const amp = 4 + r() * 14;
      const freq = 0.002 + r() * 0.004;
      const ph = r() * 10;
      ctx.strokeStyle = tones[Math.floor(r() * tones.length)];
      ctx.globalAlpha = 0.18 + r() * 0.4;
      ctx.lineWidth = 0.6 + r() * 2.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph * 2) * amp * 0.3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // a couple of knots
    [[520, 300], [1500, 640]].forEach(([kx, ky]) => {
      for (let k = 1; k < 9; k++) {
        ctx.strokeStyle = "#3a2417";
        ctx.globalAlpha = 0.35 - k * 0.03;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 10 + k * 9, 5 + k * 3.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  });
}

// Warm white plaster, very slightly mottled.
export function wallTexture() {
  return makeTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = "#efebe4";
      ctx.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let i = 0; i < 260; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 30 + r() * 140;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const tone = r() > 0.5 ? "255,255,255" : "190,180,165";
        g.addColorStop(0, `rgba(${tone},0.05)`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      grain(ctx, w, h, 50000, 0.025);
    },
    { repeat: [3, 2] }
  );
}

// Polished concrete: soft clouds, a few hairline cracks and aggregate flecks.
export function concreteTexture() {
  return makeTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = "#a7a39d";
      ctx.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let i = 0; i < 380; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 20 + r() * 160;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const tone = r() > 0.5 ? "230,226,220" : "120,116,110";
        g.addColorStop(0, `rgba(${tone},0.08)`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.12)" : "rgba(60,55,50,0.12)";
        ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      ctx.strokeStyle = "rgba(80,76,70,0.18)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        let x = r() * w;
        let y = r() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 12; k++) ctx.lineTo((x += (r() - 0.5) * 60), (y += (r() - 0.3) * 40));
        ctx.stroke();
      }
    },
    { repeat: [5, 5] }
  );
}

// A framed print for the wall: the logo on a cream mat.
export function printTexture() {
  return makeTexture(900, 700, (ctx, w, h) => {
    ctx.fillStyle = "#f6f0dc";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a2f5f";
    ctx.fillRect(110, 100, w - 220, h - 240);
    drawLogo(ctx, w / 2, h / 2 - 50, 520, { rot: -0.05 });
    ctx.fillStyle = "#3a2f5f";
    ctx.font = B(20, 700);
    ctx.textBaseline = "middle";
    spacedText(ctx, "YOU WILL GET TO WHERE YOU NEED TO BE", w / 2, h - 80, 5);
  });
}

export function rugTexture() {
  return makeTexture(1024, 1024, (ctx, w, h) => {
    const rings = ["#211b40", "#8a2f3a", "#211b40", "#2b2457", "#211b40", "#6b5a2a", "#211b40", "#2b2457", "#1b1636"];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - i * 52, 0, Math.PI * 2);
      ctx.fill();
    });
    grain(ctx, w, h, 40000, 0.07);
  });
}

export function matTexture() {
  return makeTexture(1536, 576, (ctx, w, h) => {
    ctx.fillStyle = "#2a2356";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 60000, 0.06);
    ctx.strokeStyle = "rgba(246,240,220,0.32)";
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 3;
    roundRect(ctx, 22, 22, w - 44, h - 44, 30);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLogo(ctx, w - 190, h - 90, 220, { rot: -0.06 });
    ctx.fillStyle = "rgba(246,240,220,0.5)";
    ctx.font = B(20, 600);
    ctx.textBaseline = "middle";
    spacedText(ctx, "YOU WILL GET TO WHERE YOU NEED TO BE", 60, h - 64, 5, "left");
  });
}

export function neonTexture() {
  return makeTexture(1280, 360, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `italic 700 170px ${assets.fonts.body}`;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const text = "get toasted";
    ctx.shadowColor = "#ff3b3b";
    ctx.shadowBlur = 50;
    ctx.strokeStyle = "#ff4d4d";
    ctx.lineWidth = 16;
    ctx.strokeText(text, w / 2, h / 2);
    ctx.shadowBlur = 18;
    ctx.strokeText(text, w / 2, h / 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffd9d4";
    ctx.lineWidth = 5;
    ctx.strokeText(text, w / 2, h / 2);
    star4(ctx, w - 90, 80, 30, "#ffd23f");
  });
}

export function phoneTexture() {
  return makeTexture(360, 760, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#3a2f78");
    g.addColorStop(1, "#140f2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f6f0dc";
    ctx.textAlign = "center";
    ctx.font = B(96, 300);
    ctx.fillText("4:20", w / 2, 210);
    ctx.font = B(20, 500);
    ctx.fillStyle = "rgba(246,240,220,0.7)";
    ctx.fillText("Friday", w / 2, 250);
    ctx.fillStyle = "rgba(246,240,220,0.14)";
    roundRect(ctx, 22, 320, w - 44, 120, 22);
    ctx.fill();
    drawLogo(ctx, 74, 360, 70, { swoosh: false });
    ctx.textAlign = "left";
    ctx.fillStyle = "#f6f0dc";
    ctx.font = B(20, 700);
    ctx.fillText("toasted", 120, 362);
    ctx.font = B(17, 500);
    ctx.fillStyle = "rgba(246,240,220,0.8)";
    ctx.fillText("Five pieces. Zero filler.", 44, 412);
    ctx.fillStyle = "rgba(246,240,220,0.5)";
    roundRect(ctx, w / 2 - 60, h - 30, 120, 6, 3);
    ctx.fill();
  });
}

export function stickyTexture(text, color) {
  return makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = "#2a2147";
    ctx.font = `italic 700 34px ${assets.fonts.body}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    text.forEach((line, i) => ctx.fillText(line, w / 2, 100 + i * 46));
  });
}

export function mugTexture() {
  return makeTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1e1c24";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 8000, 0.05);
    ctx.fillStyle = INK.coral;
    ctx.font = D(40);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CHAI O'CLOCK", w / 2, h / 2 + 6);
  });
}

export function grinderTopTexture() {
  return makeTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#c93a35";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    for (let r = 40; r < 256; r += 18) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawLogo(ctx, w / 2, h / 2, 360, { swoosh: false, rot: -0.1 });
  });
}

// One keycap legend (transparent background).
export function legendTexture(label, wUnits, color) {
  return makeTexture(Math.round(96 * wUnits), 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = label.length > 2 ? B(22, 700) : B(38, 700);
    ctx.fillText(label, w / 2, h / 2);
  });
}

/* ------------------------------------------------------------------ */
/* Monitor: a little desktop that shows what you type and what you view */
/* ------------------------------------------------------------------ */
export const MONITOR = { w: 1280, h: 720 };

export function paintMonitor(ctx, { typed, caret, product, time }) {
  const { w, h } = MONITOR;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#2b2366");
  g.addColorStop(0.6, "#4b2a6e");
  g.addColorStop(1, "#7a3366");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.12;
  drawLogo(ctx, w * 0.68, h * 0.62, 760, { rot: -0.08 });
  ctx.globalAlpha = 1;

  // menu bar
  ctx.fillStyle = "rgba(13,10,22,0.55)";
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = INK.cream;
  ctx.font = B(20, 700);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("toasted.os", 22, 21);
  ctx.font = B(18, 500);
  ctx.fillStyle = "rgba(246,240,220,0.75)";
  ctx.fillText("File    Edit    View    Roll", 160, 21);
  ctx.textAlign = "right";
  ctx.fillStyle = INK.cream;
  ctx.fillText(time, w - 22, 21);

  // notes window
  const nx = 60;
  const ny = 90;
  const nw = 700;
  const nh = 560;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, nx + 10, ny + 14, nw, nh, 18);
  ctx.fill();
  ctx.fillStyle = "#f6f0dc";
  roundRect(ctx, nx, ny, nw, nh, 18);
  ctx.fill();
  ctx.fillStyle = "#e6dcc0";
  roundRect(ctx, nx, ny, nw, 48, [18, 18, 0, 0]);
  ctx.fill();
  [INK.coral, INK.sun, "#7bd389"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(nx + 30 + i * 28, ny + 24, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = INK.indigo;
  ctx.textAlign = "center";
  ctx.font = B(19, 700);
  ctx.fillText("sesh-notes.txt", nx + nw / 2, ny + 25);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `500 34px ui-monospace, Consolas, monospace`;
  const lineH = 46;
  const maxW = nw - 70;
  const lines = [];
  const source = typed.length ? typed : "";
  source.split("\n").forEach((para) => {
    let line = "";
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  });
  const visible = lines.slice(-10);
  if (!typed.length) {
    ctx.fillStyle = "rgba(58,47,95,0.4)";
    ctx.fillText("type something on your keyboard…", nx + 36, ny + 80);
    if (caret) {
      ctx.fillStyle = INK.coral;
      ctx.fillRect(nx + 36, ny + 78, 4, 38);
    }
  } else {
    ctx.fillStyle = INK.indigo;
    visible.forEach((l, i) => ctx.fillText(l, nx + 36, ny + 80 + i * lineH));
    if (caret) {
      const last = visible[visible.length - 1] || "";
      ctx.fillStyle = INK.coral;
      ctx.fillRect(nx + 38 + ctx.measureText(last).width, ny + 78 + (visible.length - 1) * lineH, 4, 38);
    }
  }

  // "now viewing" card
  const cx = 820;
  const cy = 90;
  const cw = 400;
  ctx.fillStyle = "rgba(13,10,22,0.6)";
  roundRect(ctx, cx, cy, cw, 300, 18);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK.sun;
  ctx.font = B(17, 700);
  spacedText(ctx, product ? "NOW VIEWING" : "THE DESK", cx + 30, cy + 40, 4, "left");
  ctx.fillStyle = INK.cream;
  if (product) {
    ctx.font = D(44);
    ctx.fillText(product.name.toUpperCase(), cx + 30, cy + 100);
    ctx.fillStyle = INK.coral;
    ctx.fillText(product.name2.toUpperCase(), cx + 30, cy + 150);
    ctx.fillStyle = "rgba(246,240,220,0.8)";
    ctx.font = B(22, 500);
    ctx.fillText(product.includes, cx + 30, cy + 205);
    ctx.fillStyle = INK.cream;
    ctx.font = D(48);
    ctx.fillText(`₹${product.price}`, cx + 30, cy + 260);
  } else {
    ctx.font = D(40);
    ctx.fillText("CLICK", cx + 30, cy + 110);
    ctx.fillText("ANYTHING.", cx + 30, cy + 160);
    ctx.fillStyle = "rgba(246,240,220,0.75)";
    ctx.font = B(22, 500);
    ctx.fillText("Five pieces on this desk.", cx + 30, cy + 220);
    ctx.fillText("Tap the lamp, too.", cx + 30, cy + 254);
  }

  // dock
  ctx.fillStyle = "rgba(13,10,22,0.45)";
  roundRect(ctx, w / 2 - 210, h - 70, 420, 54, 18);
  ctx.fill();
  [INK.coral, INK.sun, INK.cream, "#7a74d6", "#7bd389"].forEach((c, i) => {
    ctx.fillStyle = c;
    roundRect(ctx, w / 2 - 180 + i * 76, h - 60, 40, 34, 9);
    ctx.fill();
  });
}

/* ------------------------------------------------------------------ */
/* Executive office surfaces                                            */
/* ------------------------------------------------------------------ */
// Dark troweled plaster with an indigo cast.
export function darkWallTexture() {
  return makeTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = "#2c2938";
      ctx.fillRect(0, 0, w, h);
      const r = rng(23);
      for (let i = 0; i < 520; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 20 + r() * 150;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const tone = r() > 0.5 ? "90,86,110" : "10,9,16";
        g.addColorStop(0, `rgba(${tone},0.09)`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // trowel sweeps
      ctx.lineCap = "round";
      for (let i = 0; i < 160; i++) {
        ctx.strokeStyle = r() > 0.5 ? "rgba(120,115,140,0.05)" : "rgba(0,0,0,0.07)";
        ctx.lineWidth = 6 + r() * 30;
        const x = r() * w;
        const y = r() * h;
        ctx.beginPath();
        ctx.arc(x, y, 60 + r() * 200, r() * 6, r() * 6 + 0.8);
        ctx.stroke();
      }
      grain(ctx, w, h, 70000, 0.035);
    },
    { repeat: [4, 2] }
  );
}

// Large-format dark porcelain tiles with fine grout.
export function tileTexture() {
  return makeTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const r = rng(31);
      const n = 2;
      const s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const base = 44 + Math.floor(r() * 8);
          ctx.fillStyle = `rgb(${base},${base},${base + 4})`;
          ctx.fillRect(i * s, j * s, s, s);
          for (let k = 0; k < 120; k++) {
            const x = i * s + r() * s;
            const y = j * s + r() * s;
            const rad = 20 + r() * 90;
            const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
            const tone = r() > 0.5 ? "255,255,255" : "0,0,0";
            g.addColorStop(0, `rgba(${tone},0.035)`);
            g.addColorStop(1, `rgba(${tone},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          }
        }
      grain(ctx, w, h, 50000, 0.04);
      ctx.fillStyle = "#1a191d";
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * s - 2, 0, 4, h);
        ctx.fillRect(0, i * s - 2, w, 4);
      }
    },
    { repeat: [8, 8] }
  );
}

// Soft glow that spills on the wall from LEDs hidden behind the panel.
export function glowTexture(color = "255,110,80") {
  return makeTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const inset = 70;
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      ctx.strokeStyle = `rgba(${color},${0.06 * (1 - t) * (1 - t)})`;
      ctx.lineWidth = 6;
      roundRect(ctx, inset - t * inset, inset - t * inset, w - 2 * (inset - t * inset), h - 2 * (inset - t * inset), 30 + t * 40);
      ctx.stroke();
    }
  });
}

// One leaf: a lance-shaped blade with a pale midrib and fine side veins (transparent outside).
export function leafTexture() {
  return makeTexture(256, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const half = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.9) * 108;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(w / 2, h - 4);
      for (let k = 0; k <= 60; k++) {
        const t = k / 60;
        ctx.lineTo(w / 2 + half(t), h - 4 - t * (h - 12));
      }
      for (let k = 60; k >= 0; k--) {
        const t = k / 60;
        ctx.lineTo(w / 2 - half(t), h - 4 - t * (h - 12));
      }
      ctx.closePath();
    };
    path();
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "#28502a");
    g.addColorStop(0.45, "#3b7337");
    g.addColorStop(1, "#4f8a40");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    const across = ctx.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, "rgba(10,30,10,0.45)");
    across.addColorStop(0.5, "rgba(255,255,255,0)");
    across.addColorStop(1, "rgba(10,30,10,0.45)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(190,230,160,0.16)";
    ctx.lineWidth = 2;
    for (let y = h - 60; y > 40; y -= 34) {
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(w / 2, y);
        ctx.quadraticCurveTo(w / 2 + s * 50, y - 30, w / 2 + s * 110, y - 70);
        ctx.stroke();
      });
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(196,226,160,0.7)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 4);
    ctx.lineTo(w / 2, 40);
    ctx.stroke();
    path();
    ctx.strokeStyle = "rgba(170,200,110,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}


/* ------------------------------------------------------------------ */
/* Surface relief                                                       */
/* ------------------------------------------------------------------ */
// A normal map made from another texture's brightness: dark grain reads as dips, light as
// rises, so grazing light picks out wood grain, trowel marks and grout like a real surface.
export function normalMapOf(source, strength = 2, { invert = false } = {}) {
  const img = source.image;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = source.wrapS;
  tex.wrapT = source.wrapT;
  tex.repeat.copy(source.repeat);
  (source.userData.done || Promise.resolve()).then(() => {
    const w = img.width;
    const h = img.height;
    const src = img.getContext("2d").getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
    const ctx = canvas.getContext("2d");
    const out = ctx.createImageData(w, h);
    const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
    const k = invert ? -strength : strength;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * k;
        const dy = (at(x, y + 1) - at(x, y - 1)) * k;
        const len = Math.hypot(dx, dy, 1);
        const o = (y * w + x) * 4;
        out.data[o] = (-dx / len * 0.5 + 0.5) * 255;
        out.data[o + 1] = (dy / len * 0.5 + 0.5) * 255;
        out.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
        out.data[o + 3] = 255;
      }
    ctx.putImageData(out, 0, 0);
    tex.needsUpdate = true;
  });
  madeTextures.push(tex);
  return tex;
}

// Pebbled leather for the desk pad: deep indigo-black with a coral stitch round the edge.
export function leatherTexture() {
  return makeTexture(1536, 512, (ctx, w, h) => {
    ctx.fillStyle = "#1b1828";
    ctx.fillRect(0, 0, w, h);
    const r = rng(77);
    for (let i = 0; i < 26000; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 1.5 + r() * 4;
      ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * (0.6 + r() * 0.5), r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.6);
    g.addColorStop(0, "rgba(255,255,255,0.03)");
    g.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,90,80,0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 9]);
    roundRect(ctx, 22, 22, w - 44, h - 44, 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.5;
    drawLogo(ctx, w - 150, h - 70, 150, { swoosh: false, face: "#3a3550", side: "#141220" });
    ctx.globalAlpha = 1;
  });
}

// Book covers: cloth-bound, in a few muted colours, with a faint weave.
export function clothTexture(color) {
  return makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = x % 4 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(x, 0, 1, h);
    }
  });
}

// Fine ruled page edges for books and the notebook.
export function pagesTexture() {
  return makeTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#efe8d8";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = "rgba(120,100,70," + (0.05 + Math.random() * 0.1) + ")";
      ctx.fillRect(0, y, w, 1);
    }
  });
}

// Bouclé: a soft, nubbly loop-yarn upholstery in warm cream. Tiny overlapping loops,
// each a little lighter on top and darker underneath, so the normal map reads as texture.
export function boucleTexture() {
  return makeTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#d9ccb6";
    ctx.fillRect(0, 0, w, h);
    const r = rng(311);
    for (let i = 0; i < 9000; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 2 + r() * 3.5;
      const a = r() * Math.PI * 2;
      ctx.lineWidth = 1.2 + r() * 1.2;
      ctx.strokeStyle = r() > 0.45 ? `rgba(255,250,240,${0.25 + r() * 0.35})` : `rgba(90,70,50,${0.12 + r() * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, a, a + Math.PI * (1.1 + r() * 0.8));
      ctx.stroke();
    }
  }, { repeat: [3, 3] });
}

// A chunky hand knit for the throw blanket: rows of V stitches in warm rust.
export function knitTexture() {
  return makeTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#7a2f22";
    ctx.fillRect(0, 0, w, h);
    const cols = 16;
    const rows = 22;
    const cw = w / cols;
    const rh = h / rows;
    const r = rng(57);
    for (let row = 0; row < rows; row++)
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw / 2;
        const y = row * rh;
        const tone = 0.85 + r() * 0.3;
        for (const s of [-1, 1]) {
          const g = ctx.createLinearGradient(x, y, x + s * cw * 0.5, y + rh * 1.3);
          g.addColorStop(0, `rgb(${226 * tone | 0},${112 * tone | 0},${84 * tone | 0})`);
          g.addColorStop(1, `rgb(${140 * tone | 0},${58 * tone | 0},${42 * tone | 0})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x + s * cw * 0.24, y + rh * 0.65, cw * 0.22, rh * 0.75, s * -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
  }, { repeat: [2, 3] });
}
