// Product details are taken word-for-word from the brand's product posters.
// The brand's Instagram, linked from the footer (orders are placed on the site itself).
export const INSTAGRAM = "https://www.instagram.com/toastedindia";

// Every product comes in packs of 1, 2, 5 and 10. A pack costs one rupee less than
// buying that many at the single price (MRP), so 1 × ₹100 is ₹99 and 5 × ₹100 is ₹499.
export const PACK_SIZES = [1, 2, 5, 10];
export const packMrp = (product, size) => product.price * size;
export const packPrice = (product, size) => product.price * size - 1;
export const productBySlug = (slug) => products.find((p) => p.slug === slug);

export const products = [
  {
    slug: "herbal-communication",
    name: "Herbal",
    name2: "Communication",
    kind: "Rolling Papers",
    includes: "32 Leaves & Tips",
    quality: "Top Quality · Chemical Free · Ultra Thin Rolling Papers",
    price: 100,
    blurb:
      "In the heart of ancient wisdom lies a secret to elevate your moments of reflection and connection. Premium watermarked rolling papers by Toasted — where the art of self-help meets the power of positivity, wrapped in a design inspired by the grandeur of Greek and Roman civilizations.",
    theme: { bg: "#4b3f85", ink: "#f6f0dc", accent: "#ffd23f", ghost: "rgba(255,255,255,0.06)" },
  },
  {
    slug: "puff-n-tough",
    name: "Puff N",
    name2: "Tough",
    kind: "Rolling Papers",
    includes: "32 Leaves, Tips & Tray",
    quality: "Top Quality · Chemical Free · Ultra Thin Rolling Papers",
    price: 150,
    blurb:
      "Step into the shadows of introspection with Puff N Tough premium watermarked rolling papers — where boldness meets contemplation in a realm inspired by the dark allure of the afterlife. Where darkness meets enlightenment, and boldness reigns supreme.",
    theme: { bg: "#ff4d4d", ink: "#ffffff", accent: "#17141f", ghost: "rgba(0,0,0,0.08)" },
  },
  {
    slug: "bombay-blaze",
    name: "Bombay",
    name2: "Blaze",
    kind: "Rolling Papers",
    includes: "32 Leaves, Tips, Tray & Grinder",
    quality: "Top Quality · Chemical Free · Ultra Thin Rolling Papers",
    price: 300,
    blurb:
      "Experience the vibrant pulse of Mumbai with Bombay Blaze premium watermarked rolling papers — where the essence of the city's everyday life is captured in every puff. Chai on a rainy day, the maze of dreams in the city of dreams — one puff at a time.",
    theme: { bg: "#f6f0dc", ink: "#ff4d4d", accent: "#3a2f5f", ghost: "rgba(58,47,95,0.07)" },
  },
  {
    slug: "toasted-blues",
    name: "Toasted",
    name2: "Blues",
    kind: "Rolling Tray",
    includes: "Rolling Tray",
    quality: "Spacious surface · Easy rolling · Zero mess",
    price: 499,
    blurb:
      "Your ultimate companion for a smooth smoking experience. Crafted with precision and style, its spacious surface provides ample room for your herbs, papers and accessories. Don't chase, attract — what is yours will find you.",
    theme: { bg: "#3a2f5f", ink: "#f6f0dc", accent: "#ffd23f", ghost: "rgba(255,255,255,0.05)" },
  },
  {
    slug: "midnight-munchies",
    name: "Midnight",
    name2: "Munchies",
    kind: "Rolling Tray",
    includes: "Rolling Tray",
    quality: "Sleek · Dark aesthetics · Built for nocturnal sessions",
    price: 499,
    blurb:
      "Indulge in your late-night cravings while keeping your focus sharp. Crafted with sleek, dark aesthetics, this tray is perfect for nocturnal sessions. Let its 'Tired but I have goals' mantra inspire you — solo reflection or group gathering.",
    theme: { bg: "#17141f", ink: "#f6f0dc", accent: "#ff4d4d", ghost: "rgba(255,255,255,0.05)" },
  },
];
