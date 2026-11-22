"use client";

// The footer: TOAS ··· TED in giant letters running off both edges, with the five
// products in a tight little cluster between them. Point at the cluster (or tap it) and
// it bursts open: the product's photo floods the whole footer from where you pointed,
// and the product names blow up into huge rows drifting across it. Point at a name to
// switch the photo. As the footer scrolls in, the two halves of the word slide together.
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { products, INSTAGRAM } from "@/lib/products";

const NAMES = products.map((p) => `${p.name} ${p.name2}`);

export default function Footer({ links, onJump }) {
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const at = useRef({ x: 50, y: 50 });

  // the halves slide together, the mark turns, the cluster settles in
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const q = gsap.utils.selector(root);
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom bottom", scrub: 0.8 },
      });
      tl.fromTo(q(".ft-word.l"), { xPercent: -28 }, { xPercent: 0, ease: "none" }, 0)
        .fromTo(q(".ft-word.r"), { xPercent: 28 }, { xPercent: 0, ease: "none" }, 0)
        .fromTo(q(".ft-mark"), { rotate: -32, scale: 0.85 }, { rotate: -14, scale: 1, ease: "none" }, 0)
        .fromTo(q(".ft-cluster"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, ease: "power2.out" }, 0.25)
        .fromTo(q(".ft-row > *"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.05, ease: "power2.out" }, 0.3);
    }, root);
    return () => ctx.revert();
  }, []);

  // tap outside closes it on touch screens
  useEffect(() => {
    if (!open) return;
    const close = (e) => !root.current?.querySelector(".ft-stage")?.contains(e.target) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const burst = (e) => {
    const r = e.currentTarget.closest(".ft-stage").getBoundingClientRect();
    at.current = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    root.current.style.setProperty("--bx", `${at.current.x}%`);
    root.current.style.setProperty("--by", `${at.current.y}%`);
    setOpen(true);
  };
  const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  return (
    <footer className={`ft ${open ? "open" : ""}`} ref={root}>
      {/* a huge outline of a lit rolled paper, turning slowly behind everything */}
      <svg className="ft-mark" viewBox="0 0 44 168" aria-hidden="true">
        <path d="M9 0 H35 L38 132 Q22 137 6 132 Z" />
        <path d="M5.6 134 Q22 140 38.4 134 L37 150 Q22 156 7 150 Z" />
        <ellipse cx="22" cy="152" rx="14" ry="7" />
      </svg>

      <div className="ft-row ft-top">
        <nav aria-label="Footer">
          {links.map((l) => (
            <a key={l.sel} href={l.sel} onClick={(e) => { e.preventDefault(); onJump(l.sel); }}>{l.label}</a>
          ))}
          <a href={INSTAGRAM} target="_blank" rel="noreferrer">Instagram ↗</a>
        </nav>
        <p>© {new Date().getFullYear()} Toasted India. All rights reserved.</p>
      </div>

      <div className="ft-stage">
        <div className="ft-word l" aria-hidden="true">Toas</div>

        <button
          type="button"
          className="ft-cluster"
          aria-expanded={open}
          aria-label="Show the products"
          onPointerEnter={(e) => !touch && burst(e)}
          onClick={(e) => (open && touch ? setOpen(false) : burst(e))}
        >
          {NAMES.map((n, i) => (
            <span
              key={n}
              className={pick === i ? "on" : ""}
              onPointerEnter={() => setPick(i)}
              onClick={() => setPick(i)}
            >
              <i>{String(i + 1).padStart(2, "0")}</i>
              {n}
            </span>
          ))}
        </button>

        <div className="ft-word r" aria-hidden="true">ted</div>

        {/* the burst: the picked product's photo floods in, the names blow up across it */}
        <div className="ft-burst" aria-hidden="true" onPointerLeave={() => !touch && setOpen(false)} onClick={() => touch && setOpen(false)}>
          {products.map((p, i) => (
            <img key={p.slug} src={`/products/${p.slug}.jpg`} alt="" className={pick === i ? "on" : ""} loading="lazy" />
          ))}
          <div className="ft-rows">
            {[0, 1, 2, 3].map((r) => (
              <div className={`ft-marquee ${r % 2 ? "rev" : ""}`} key={r}>
                <div>
                  {[...NAMES, ...NAMES].map((n, i) => (
                    <span
                      key={i}
                      className={i % NAMES.length === pick ? "on" : ""}
                      onPointerEnter={() => setPick(i % NAMES.length)}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ft-row ft-bottom">
        <p>For adults 18+ only. Smoking is injurious to health. Toasted sells smoking accessories only.</p>
        <p>Rolled in India ✦</p>
      </div>
    </footer>
  );
}
