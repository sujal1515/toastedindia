// Phones, tablets and low-power machines get a lighter render: fewer pixels, no live floor
// reflections, smaller shadow maps. Read once at load; it only picks quality settings.
export const LOW =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820 || (navigator.hardwareConcurrency || 8) <= 4);
