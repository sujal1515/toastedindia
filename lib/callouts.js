// Feature labels that stick to points on the paper leaf while the camera moves round it.
// `anchor` is a point in the leaf's own space (the leaf is 3.2 wide and 1.1 tall, centred
// on 0,0). `from`/`to` are story-scroll positions (0..1). The scene projects each anchor
// to the screen every frame; the page moves the matching label there.
export const CALLOUTS = [
  { id: "mark", title: "Watermarked", note: "Pressed into every leaf", anchor: [-0.75, 0.2, 0], from: 0.385, to: 0.455, side: "left" },
  { id: "gum", title: "Gum strip", note: "Seals the roll", anchor: [0.95, 0.52, 0], from: 0.395, to: 0.455, side: "right" },
  { id: "thin", title: "Ultra thin", note: "Turn it sideways and it nearly disappears", anchor: [0.2, -0.5, 0], from: 0.46, to: 0.505, side: "left" },
  { id: "light", title: "Hold it to the light", note: "The watermark glows straight through", anchor: [0.35, 0.05, 0], from: 0.515, to: 0.575, side: "right" },
  { id: "tip", title: "Tip included", note: "Every pack comes with tips", anchor: [-1.3, 0, 0], from: 0.815, to: 0.87, side: "left" },
];

// Story chapters and the stretch of the scroll each one owns.
export const CHAPTERS = [
  { n: "01", title: "Pick your pack", body: "King size slim. Watermarked. Every pack is a whole mood — pick the one that matches yours.", from: 0.0, to: 0.11 },
  { n: "02", title: "Crack it open", body: "32 leaves and tips, stacked and waiting. Flip the lid.", from: 0.11, to: 0.24 },
  { n: "03", title: "Pull a leaf", body: "One leaf is all it takes.", from: 0.24, to: 0.37 },
  { n: "04", title: "Look closer", body: "Watermarked, creased from the pack, and thin enough to glow.", from: 0.37, to: 0.6 },
  { n: "05", title: "Let it roll", body: "Keep scrolling — it rolls itself. No mess, no stress, just the ritual.", from: 0.6, to: 0.8 },
  { n: "06", title: "Get toasted", body: "You will get to where you need to be.", from: 0.8, to: 1.0 },
];
