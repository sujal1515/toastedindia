// Cuts the product photos and logo out of the source posters into /public.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const src = (f) => new URL(f, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");

await mkdir(src("public/products"), { recursive: true });

const posters = {
  "herbalcommunication.jpg": "herbal-communication",
  "puff.jpg": "puff-n-tough",
  "bombayblaze.jpg": "bombay-blaze",
  "rollingtray.jpg": "toasted-blues",
  "rollingtray2.jpg": "midnight-munchies",
};

for (const [file, slug] of Object.entries(posters)) {
  await sharp(decodeURIComponent(src(file)))
    .extract({ left: 100, top: 90, width: 440, height: 380 })
    .resize(880, 760, { kernel: "lanczos3" })
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 90 })
    .toFile(decodeURIComponent(src(`public/products/${slug}.jpg`)));
}

await sharp(decodeURIComponent(src("logo.jpg")))
  .extract({ left: 110, top: 290, width: 860, height: 500 })
  .jpeg({ quality: 92 })
  .toFile(decodeURIComponent(src("public/logo-wide.jpg")));

await sharp(decodeURIComponent(src("logo.jpg")))
  .resize(512, 512)
  .jpeg({ quality: 90 })
  .toFile(decodeURIComponent(src("public/logo.jpg")));

console.log("cropped");
