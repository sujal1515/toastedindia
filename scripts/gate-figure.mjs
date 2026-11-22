// Cuts the wooden mannequin (with the packs it holds and its stand) out of the gate photo,
// so the age-gate card can frost the rest of the photo and keep the mannequin sharp.
// The outline is traced by hand in the photo's 1080 × 1080 pixel space and feathered.
// Run: node scripts/gate-figure.mjs
import sharp from "sharp";

const SRC = "public/gate/sesh.jpg";
const OUT = "public/gate/sesh-figure.webp";

// clockwise from the top of the head
const outline = [
  [712, 272], [739, 282], [757, 305], [759, 333], [751, 360], [744, 376],
  // across the top of the black pack to its far corner
  [898, 341], [914, 350], [944, 512], [927, 522],
  // the blue pack, then the right hand and forearm
  [926, 564], [806, 566], [808, 602], [792, 618], [764, 606],
  // right leg down to the foot
  [752, 642], [764, 700], [781, 750], [793, 800], [803, 858], [821, 902], [826, 960], [810, 975], [790, 958], [772, 930],
  // the round stand
  [765, 944], [736, 955], [650, 956], [604, 938],
  // left foot and leg back up
  [576, 922], [540, 938], [525, 916], [544, 888], [580, 858], [597, 800], [606, 760], [614, 728],
  // left hand and the white pack
  [552, 732], [526, 724], [456, 585], [536, 524],
  // left arm and shoulder, neck, back to the head
  [546, 488], [574, 438], [598, 400], [626, 395], [650, 383], [666, 360], [666, 330], [671, 300], [690, 281],
];

const { width, height } = await sharp(SRC).metadata();
const points = outline.map(([x, y]) => `${(x * width) / 1080},${(y * height) / 1080}`).join(" ");
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><polygon points="${points}" fill="white"/></svg>`
);
// feather the edge so the cut-out melts into the frosted glass
const blurred = await sharp(svg).blur(5).extractChannel(0).raw().toBuffer();
// a white image whose alpha is the feathered outline, used to keep only the mannequin
const mask = await sharp(Buffer.alloc(width * height * 3, 255), { raw: { width, height, channels: 3 } })
  .joinChannel(blurred, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();

await sharp(SRC)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .webp({ quality: 88, alphaQuality: 90 })
  .toFile(OUT);

console.log("wrote", OUT);
