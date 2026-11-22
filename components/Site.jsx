"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { scroll } from "@/lib/store";
import { DESK, LAYOUT, deskState, activeIndex } from "@/lib/desk";
import { products } from "@/lib/products";
import { CALLOUTS, CHAPTERS } from "@/lib/callouts";
import Gate from "./Gate";
import { PackBuy, OrderSheet, useBagCount } from "./Order";
import PaperMenu from "./PaperMenu";
import Footer from "./Footer";
import { cart, useCart } from "@/lib/cart";
import { packPrice } from "@/lib/products";

const NAV_LINKS = [
  { label: "Ritual", sel: "#story" },
  { label: "Dive in", sel: "#dive" },
  { label: "The drop", sel: "#drop" },
];

const Scene = dynamic(() => import("./scene/Scene"), { ssr: false });

const Letters = ({ text }) =>
  text.split("").map((ch, i) => (
    <span className="ch" key={i}>
      <span>{ch === " " ? " " : ch}</span>
    </span>
  ));

export default function Site() {
  const root = useRef(null);
  const lenisRef = useRef(null);
  const [gate, setGate] = useState("up"); // up (age gate / loader showing) | done
  const [active, setActive] = useState(-1);
  // chosen pack size per product (shared by the desk cards and the drop panels)
  const [sizes, setSizes] = useState({});
  const sizeOf = (slug) => sizes[slug] ?? 1;
  const pickSize = (slug) => (n) => setSizes((s) => ({ ...s, [slug]: n }));
  const bagCount = useBagCount();
  const { open: sheetOpen } = useCart();

  // the page holds still while the order sheet is open
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (sheetOpen) lenis.stop();
    else if (sheetWasOpen.current && gate === "done") lenis.start();
    sheetWasOpen.current = sheetOpen;
  }, [sheetOpen, gate]);

  /* ---------- smooth scroll + scroll-driven state ---------- */
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    // phones resize the viewport as the address bar slides; don't recalculate everything for that
    ScrollTrigger.config({ ignoreMobileResize: true });
    const lenis = new Lenis({ lerp: 0.09 });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // feature callouts follow the points the 3D scene projects for them
    const labels = gsap.utils.toArray(".callout");
    const place = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      labels.forEach((el, i) => {
        const c = scroll.callouts[i];
        el.style.opacity = c.o;
        if (c.o <= 0) return;
        const x = c.x * w;
        el.style.transform = `translate3d(${x}px, ${c.y * h}px, 0)`;
        // keep the label on screen: on narrow phones the 3D point can sit near an edge,
        // so slide the label box (not the dot) back inside an 8px margin
        const box = el.lastElementChild;
        const bw = box.offsetWidth;
        const left = el.classList.contains("callout-left") ? x - 48 - bw : x + 48;
        const shift = Math.max(0, 8 - left) + Math.min(0, w - 8 - (left + bw));
        box.style.translate = shift ? `${shift}px 0` : "";
      });
    };
    gsap.ticker.add(place);

    const tip = document.querySelector(".desk-tip");
    const tipName = tip.querySelector("b");
    const tipHint = tip.querySelector("span");
    const follow = () => {
      const i = deskState.hover;
      const show = deskState.active && i >= 0;
      tip.style.opacity = show ? 1 : 0;
      if (!show) return;
      tipName.textContent = `${products[i].name} ${products[i].name2}`;
      const focused = i === deskState.focus;
      const pack = LAYOUT[i].type === "pack";
      tipHint.textContent = !focused ? "Click to take a closer look" : pack ? "Drag to spin · click to open or close" : "Drag to spin";
      tip.style.transform = `translate3d(${deskState.pointer.x + 18}px, ${deskState.pointer.y + 18}px, 0)`;
    };
    gsap.ticker.add(follow);

    // the scene asks for a product: scroll the camera to its stop
    const onFocus = (e) => focusProduct(e.detail);
    window.addEventListener("desk:focus", onFocus);
    lenis.stop();

    const onMove = (e) => {
      scroll.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      scroll.mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
      deskState.pointer.x = e.clientX;
      deskState.pointer.y = e.clientY;
      // the header logo turns to face the pointer
      const logo = document.querySelector(".logo3d-inner");
      if (logo) {
        logo.style.setProperty("--mx", scroll.mouse.x.toFixed(3));
        logo.style.setProperty("--my", scroll.mouse.y.toFixed(3));
      }
    };
    window.addEventListener("pointermove", onMove);

    const ctx = gsap.context(() => {
      // hero drifts away
      gsap.to(".hero-inner", {
        yPercent: -18,
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 35%", scrub: true },
      });

      // story chapters
      const chapters = gsap.utils.toArray(".chapter");
      ScrollTrigger.create({
        trigger: ".story",
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          scroll.story = p;
          chapters.forEach((el, i) => {
            const c = CHAPTERS[i];
            const fadeIn = i === 0 ? 1 : gsap.utils.clamp(0, 1, (p - c.from) / 0.025);
            const fadeOut = gsap.utils.clamp(0, 1, (c.to - p) / 0.025);
            const mid = (c.from + c.to) / 2;
            el.style.opacity = Math.min(fadeIn, fadeOut);
            el.style.transform = `translate3d(0, ${(p - mid) * -160}px, 0)`;
          });
          gsap.set(".story-bar i", { scaleY: p });
        },
      });

      // dive into the smoke, then the desk
      let last = -1;
      const fadeWin = (p, a, b, edge = 0.02) => Math.min(gsap.utils.clamp(0, 1, (p - a) / edge), gsap.utils.clamp(0, 1, (b - p) / edge));
      const show = (sel, o) => {
        const el = document.querySelector(sel);
        el.style.opacity = o;
        el.style.pointerEvents = o > 0.5 ? "auto" : "none";
        el.style.visibility = o > 0.001 ? "visible" : "hidden";
      };
      ScrollTrigger.create({
        trigger: ".dive",
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onToggle: (self) => (deskState.inSection = self.isActive),
        onUpdate: (self) => {
          const p = self.progress;
          scroll.dive = p;
          deskState.inSection = self.isActive;
          const a = activeIndex(p);
          if (a !== last) {
            last = a;
            setActive(a);
          }
          document.querySelector(".desk-vignette").style.opacity = p > DESK.enter + 0.02 ? 1 : 0;
          // "Step inside the sesh." writes itself in as the smoke clears, then lifts away
          const intro = document.querySelector(".desk-intro");
          const k = gsap.utils.clamp(0, 1, (p - (DESK.enter + 0.004)) / 0.08);
          const out = gsap.utils.clamp(0, 1, (p - (DESK.overview[1] - 0.004)) / 0.04);
          intro.style.setProperty("--k", k.toFixed(4));
          intro.style.setProperty("--out", out.toFixed(4));
          intro.style.visibility = k > 0 && out < 1 ? "visible" : "hidden";
          show(".desk-ui", fadeWin(p, DESK.enter + 0.07, DESK.finale - 0.01));
          show(".desk-finale", fadeWin(p, DESK.finale, 1.2, 0.03));
        },
      });

      // horizontal drop
      const track = document.querySelector(".drop-track");
      const panels = gsap.utils.toArray(".panel");
      const slide = gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth),
        ease: "none",
        scrollTrigger: {
          trigger: ".drop",
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
      panels.forEach((panel) => {
        const bits = panel.querySelectorAll(".rise");
        if (!bits.length) return;
        gsap.from(bits, {
          yPercent: 60,
          opacity: 0,
          stagger: 0.06,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left 65%" },
        });
        const img = panel.querySelector(".shot");
        if (img) {
          gsap.fromTo(
            img,
            { rotate: -10, scale: 0.8 },
            {
              rotate: 4,
              scale: 1,
              ease: "none",
              scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left right", end: "right left", scrub: true },
            }
          );
        }
      });

      // mantra marquee
      gsap.utils.toArray(".mantra-row").forEach((row, i) => {
        gsap.fromTo(
          row,
          { xPercent: i % 2 ? -30 : 0 },
          {
            xPercent: i % 2 ? 0 : -30,
            ease: "none",
            scrollTrigger: { trigger: ".mantra", start: "top bottom", end: "bottom top", scrub: true },
          }
        );
      });

      // global progress bar
      gsap.to(".bar-burn i", { left: "100%", ease: "none", scrollTrigger: { start: 0, end: "max", scrub: true } });
      gsap.to(".bar-burn b", {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: true },
      });

      // hide the canvas once opaque sections cover it
      ScrollTrigger.create({
        trigger: ".drop",
        start: "top top",
        onEnter: () => gsap.set(".webgl", { visibility: "hidden" }),
        onLeaveBack: () => gsap.set(".webgl", { visibility: "visible" }),
      });
    }, root);


    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      gsap.ticker.remove(place);
      gsap.ticker.remove(follow);
      window.removeEventListener("desk:focus", onFocus);
      window.removeEventListener("pointermove", onMove);
      lenis.destroy();
    };
  }, []);

  /* ---------- entering the site ---------- */
  useEffect(() => {
    if (gate !== "done") return;
    const tl = gsap.timeline({ onComplete: () => lenisRef.current?.start() });
    tl.to(scroll, { intro: 1, duration: 1.8, ease: "power3.out" }, 0);
    tl.fromTo(".hero .ch > span", { y: 0, yPercent: 115, rotate: 8 }, { y: 0, yPercent: 0, rotate: 0, duration: 1, stagger: 0.035, ease: "power4.out" })
      .fromTo(".hero .fade", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: "power3.out" }, "-=0.6")
      .fromTo(".nav", { y: 0, yPercent: -120 }, { y: 0, yPercent: 0, duration: 0.8, ease: "power3.out" }, "-=0.9");
    return () => tl.kill();
  }, [gate]);

  // Scroll the dive section so the camera parks on product i.
  const focusProduct = (i) => {
    if (i < 0 || i >= products.length) return;
    const el = document.querySelector(".dive");
    const top = el.offsetTop + (el.offsetHeight - window.innerHeight) * DESK.centers[i];
    lenisRef.current?.scrollTo(top, { duration: 1.6 });
  };

  const jump = (sel) => (e) => {
    e.preventDefault();
    lenisRef.current?.scrollTo(sel, { duration: 2.2 });
  };

  /* ---------- 3D-ish tilt on product shots ---------- */
  const tilt = (e) => {
    const el = e.currentTarget.querySelector(".shot-tilt");
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(el, { rotateY: x * 22, rotateX: -y * 22, duration: 0.5, ease: "power2.out" });
  };
  const untilt = (e) => {
    const el = e.currentTarget.querySelector(".shot-tilt");
    if (el) gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.9, ease: "elastic.out(1, 0.5)" });
  };

  return (
    <div ref={root} id="site-root">

      {/* ---------- 18+ gate, which is also the loader ---------- */}
      {gate !== "done" && <Gate onDone={() => setGate("done")} />}

      {/* ---------- Phone menu: a burning sheet of paper that slides open ---------- */}
      <PaperMenu links={NAV_LINKS} onJump={(sel) => lenisRef.current?.scrollTo(sel, { duration: 2.2 })} />

      {/* ---------- Bag, delivery details, confirmation ---------- */}
      <OrderSheet />

      {/* ---------- WebGL ---------- */}
      <div className="webgl" aria-hidden="true"><Scene /></div>

      {/* Header: a free-standing 3D logo on the left, a square link box in the middle,
          a square order box on the right. The boxes are styled like printed packaging:
          crop marks at the corners, a gum strip on top, and a burn line for scroll progress. */}
      <header className="nav">
        <a href="#top" onClick={jump("#top")} className="logo3d" data-cursor aria-label="Toasted — back to top">
          <span className="logo3d-sway">
            <span className="logo3d-inner">
              <i className="l-shadow" />
              <i className="l-swoosh" />
              {Array.from({ length: 14 }, (_, i) => (
                <i className="l-layer" key={i} style={{ "--i": 14 - i }} />
              ))}
              <i className="l-face" />
            </span>
          </span>
        </a>

        <nav className="navbox nav-links" aria-label="Sections">
          <a href="#story" onClick={jump("#story")} data-cursor><span>Ritual</span></a>
          <a href="#dive" onClick={jump("#dive")} data-cursor><span>Dive in</span></a>
          <a href="#drop" onClick={jump("#drop")} data-cursor><span>The drop</span></a>
          <span className="bar-burn" aria-hidden="true"><b /><i /></span>
        </nav>

        <button type="button" className="navbox nav-cta" onClick={() => cart.open()} data-cursor aria-label={bagCount ? `Your bag, ${bagCount} items` : "Order — open your bag"}>
          {/* a tiny rolled paper, lit at the end, where a status dot would be */}
          <svg className="nav-joint" viewBox="0 0 46 24" aria-hidden="true">
            <path className="nj-smoke" d="M40 10c-3-3 3-5 0-8" />
            <path className="nj-paper" d="M8 13.6 34 11.6v6.8L8 16.4Z" />
            <rect className="nj-tip" x="1.5" y="13.3" width="7.5" height="3.4" rx="0.8" />
            <path className="nj-ash" d="M34 11.6l4-.5v8.3l-4-.5Z" />
            <ellipse className="nj-ember" cx="38.6" cy="15.3" rx="1.7" ry="3.9" />
          </svg>
          <span>Order</span>
          {bagCount > 0 ? <b className="nav-count" aria-hidden="true">{bagCount}</b> : <b aria-hidden="true">↗</b>}
        </button>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        {/* Hero: one object, one line, one button. The 3D logo is the whole show. */}
        <section className="hero" id="top">
          <div className="hero-inner">
            <div className="hero-copy">
              <h1 className="hero-title" aria-label="Papers with a whole personality.">
                <span className="line"><Letters text="Papers with a" /></span>
                <span className="line"><Letters text="whole " /><em><Letters text="personality." /></em></span>
              </h1>
              <p className="hero-sub fade">Rolling papers &amp; trays <i>✦</i> ultra thin <i>✦</i> chemical free</p>
              <div className="hero-actions fade">
                <a className="hero-cta" href="#story" onClick={jump("#story")}>
                  <span>Start the ritual</span>
                  <i aria-hidden="true">↓</i>
                </a>
                <a className="hero-link" href="#drop" onClick={jump("#drop")}>Shop the drop</a>
              </div>
            </div>
            <a className="hero-scroll fade" href="#story" onClick={jump("#story")} aria-label="Scroll down">
              <span>Scroll</span>
              <i aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* ---------- Scroll story ---------- */}
        <section className="story" id="story">
          <div className="sticky">
            <div className="story-bar"><i /></div>
            {CALLOUTS.map((c) => (
              <div className={`callout callout-${c.side}`} key={c.id} aria-hidden="true">
                <i />
                <div>
                  <b>{c.title}</b>
                  <span>{c.note}</span>
                </div>
              </div>
            ))}
            {CHAPTERS.map((c, i) => (
              <article className={`chapter ${i % 2 ? "right" : "left"}`} key={c.n}>
                <span className="chapter-n">{c.n}</span>
                <h2>{c.title}</h2>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- Dive: through the smoke and onto the desk ---------- */}
        <section className="dive" id="dive">
          <div className="sticky">
            <div className="desk-vignette" aria-hidden="true" />
            {/* revealed letter by letter as the smoke clears onto the room, then drifts away */}
            <div className="desk-intro">
              <h2 className="desk-step" aria-label="Step inside the sesh.">
                {["Step inside", "the sesh."].map((row, r) => (
                  <span className={`desk-step-row ${r ? "accent" : ""}`} key={row} aria-hidden="true">
                    {row.split("").map((ch, i) => (
                      <span className="l" key={i} style={{ "--i": i + r * 11 }}>{ch === " " ? "\u00A0" : ch}</span>
                    ))}
                  </span>
                ))}
              </h2>
              <p className="desk-step-sub">Everything we make, on one desk.</p>
            </div>

            <div className="desk-ui">
              {products.map((p, i) => (
                <article className={`desk-card ${active === i ? "on" : ""}`} key={p.slug} aria-hidden={active !== i}>
                  <span className="desk-card-n">{String(i + 1).padStart(2, "0")} / 05 — {p.kind}</span>
                  <h3>{p.name} <span className="outline">{p.name2}</span></h3>
                  <p className="desk-card-inc">{p.includes}</p>
                  <p className="desk-card-q">{p.quality}</p>
                  <PackBuy product={p} size={sizeOf(p.slug)} onSize={pickSize(p.slug)} tabIndex={active === i ? 0 : -1} />
                  <p className="desk-card-hint">
                    {LAYOUT[i].type === "pack" ? "Drag to spin · click the pack to open or close it" : "Drag to spin it"}
                  </p>
                  <div className="desk-card-nav">
                    <button onClick={() => focusProduct(i - 1)} disabled={i === 0} data-cursor tabIndex={active === i ? 0 : -1}>← Prev</button>
                    <button onClick={() => focusProduct(i + 1)} disabled={i === products.length - 1} data-cursor tabIndex={active === i ? 0 : -1}>Next →</button>
                  </div>
                </article>
              ))}

              <nav className="desk-rail" aria-label="Products on the desk">
                {products.map((p, i) => (
                  <button key={p.slug} className={active === i ? "on" : ""} onClick={() => focusProduct(i)} data-cursor>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                    <span>{p.name} {p.name2}</span>
                  </button>
                ))}
              </nav>

            </div>

            <div className="desk-finale">
              <p className="eyebrow">That&apos;s the setup</p>
              <h2>Your desk is<br /><span className="outline">missing something.</span></h2>
              <a className="btn btn-hot" href="#drop" onClick={jump("#drop")} data-cursor>See the drop</a>
            </div>
          </div>
        </section>

        <div className="desk-tip" aria-hidden="true"><b /><span /></div>

        {/* ---------- The drop (horizontal) ---------- */}
        <section className="drop" id="drop" style={{ height: `${(products.length + 1) * 100}vh` }}>
          <div className="sticky">
            <div className="drop-track">
              <div className="panel panel-intro">
                <p className="eyebrow">The drop</p>
                <h2>Five pieces.<br /><span className="outline">Zero filler.</span></h2>
                <p className="panel-intro-sub">Three packs. Two trays. Keep scrolling →</p>
              </div>

              {products.map((p, i) => (
                <article
                  className="panel"
                  key={p.slug}
                  style={{ "--bg": p.theme.bg, "--ink": p.theme.ink, "--accent": p.theme.accent, "--ghost": p.theme.ghost }}
                  onPointerMove={tilt}
                  onPointerLeave={untilt}
                >
                  <div className="ghost" aria-hidden="true">{p.name} {p.name2}</div>
                  <div className="panel-media">
                    <div className="shot">
                      <div className="shot-tilt">
                        <img src={`/products/${p.slug}.jpg`} alt={`${p.name} ${p.name2} by Toasted`} loading="lazy" />
                        <span className="sticker">from ₹{packPrice(p, 1)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="panel-copy">
                    <span className="rise panel-n">{String(i + 1).padStart(2, "0")} — {p.kind}</span>
                    <h2 className="rise">
                      {p.name}
                      <span className="outline">{p.name2}</span>
                    </h2>
                    <p className="rise includes">{p.includes}</p>
                    <p className="rise quality">{p.quality}</p>
                    <p className="rise blurb">{p.blurb}</p>
                    <div className="rise buy">
                      <PackBuy product={p} size={sizeOf(p.slug)} onSize={pickSize(p.slug)} tone="panel" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Mantra ---------- */}
        <section className="mantra" aria-label="Words printed on our products">
          <div className="mantra-row">Don&apos;t chase, attract ✦ What is yours will find you ✦ Don&apos;t chase, attract ✦ What is yours will find you ✦</div>
          <div className="mantra-row outline">Tired but I have goals ✦ Tired but I have goals ✦ Tired but I have goals ✦ Tired but I have goals ✦</div>
          <div className="mantra-row">You will get to where you need to be ✦ You will get to where you need to be ✦</div>
        </section>

        {/* ---------- Footer ---------- */}
        <Footer
          links={NAV_LINKS}
          onJump={(sel) => lenisRef.current?.scrollTo(sel, { duration: 2.2 })}
          onProduct={(i) => {
            // each product has its own screen in the sideways drop: scroll to it
            const el = document.querySelector(".drop");
            lenisRef.current?.scrollTo(el.offsetTop + (el.offsetHeight - window.innerHeight) * ((i + 1) / products.length), { duration: 2.4 });
          }}
        />
      </main>
    </div>
  );
}
