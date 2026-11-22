"use client";

// The phone menu: a flat sheet of rolling paper slipped in from the right edge of the screen,
// its exposed end burning (a live shader: ember line, char, scorch, sparks, a little smoke).
// Tap it or swipe it left and the sheet slides out sideways and opens up into the menu, the
// burning edge riding along its left side. Swipe it right, tap outside, the ✕ or Esc to close.
// It renders outside #site-root so taps on it never reach the 3D scene.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { cart } from "@/lib/cart";
import { useBagCount } from "./Order";
import BurnEdge from "./BurnEdge";

const TAB = { w: 146, h: 52 };

export default function PaperMenu({ links, onJump }) {
  const [mounted, setMounted] = useState(false);
  const [phone, setPhone] = useState(false);
  const [open, setOpen] = useState(false);
  const sheet = useRef(null);
  const body = useRef(null);
  const flare = useRef(0.2);
  const swipe = useRef(null);
  const anim = useRef(null);
  const count = useBagCount();

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 820px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const toggle = (to) => {
    const el = sheet.current;
    if (!el) return;
    anim.current?.kill();
    const w = Math.min(window.innerWidth - 18, 360);
    const h = body.current.offsetHeight;
    const q = gsap.utils.selector(el);
    if (to) setOpen(true);
    const tl = gsap.timeline({ onComplete: () => !to && setOpen(false) });
    // the burn flares while the paper moves
    tl.to(flare, { current: 1, duration: 0.25 }, 0).to(flare, { current: 0.2, duration: 0.8 }, 0.45);
    if (to) {
      tl.to(q(".pm-tab"), { opacity: 0, x: -10, duration: 0.18 }, 0)
        .to(el, { width: w, height: h, rotate: 0, right: 8, duration: 0.7, ease: "power3.inOut" }, 0)
        .fromTo(q(".pm-item"), { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.05, ease: "power3.out" }, 0.42)
        .to(".pm-backdrop", { opacity: 1, duration: 0.5 }, 0);
    } else {
      tl.to(q(".pm-item"), { opacity: 0, x: 18, duration: 0.2, stagger: 0.02 }, 0)
        .to(el, { width: TAB.w, height: TAB.h, rotate: -4, right: -8, duration: 0.6, ease: "power3.inOut" }, 0.1)
        .to(q(".pm-tab"), { opacity: 1, x: 0, duration: 0.25 }, 0.55)
        .to(".pm-backdrop", { opacity: 0, duration: 0.4 }, 0.1);
    }
    anim.current = tl;
  };

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && toggle(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // swipe: left to open, right to close; a plain tap on the closed tab opens it
  const down = (e) => (swipe.current = { x: e.clientX, y: e.clientY });
  const up = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!open && (dx < -24 || (Math.abs(dx) < 8 && Math.abs(dy) < 8))) toggle(true);
    else if (open && dx > 50 && Math.abs(dy) < 60) toggle(false);
  };

  const go = (sel) => (e) => {
    e.preventDefault();
    toggle(false);
    setTimeout(() => onJump(sel), 300);
  };

  if (!mounted || !phone) return null;

  return createPortal(
    <div className={`pm ${open ? "open" : ""}`}>
      <div className="pm-backdrop" onClick={() => toggle(false)} aria-hidden="true" />
      <div
        className="pm-sheet"
        ref={sheet}
        style={{ width: TAB.w, height: TAB.h }}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={() => (swipe.current = null)}
        // links would otherwise start a native drag and cancel the swipe
        onDragStart={(e) => e.preventDefault()}
      >
        <i className="pm-paper" aria-hidden="true" />
        <BurnEdge className="pm-burn" front={40} paperLeft={56} flare={flare} />

        {/* closed: the end of the paper, with what it is written on it */}
        <button type="button" className="pm-tab" aria-expanded={open} aria-controls="pm-menu" aria-label="Open menu" tabIndex={open ? -1 : 0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(true))}>
          <span className="pm-lines" aria-hidden="true"><i /><i /><i /></span>
          <b>Menu</b>
          {count > 0 && <span className="pm-badge">{count}</span>}
        </button>

        {/* open: the menu written on the sheet */}
        <nav className="pm-body" id="pm-menu" ref={body} aria-label="Menu" aria-hidden={!open}>
          <div className="pm-item pm-head">
            <span>Toasted</span>
            <button type="button" className="pm-close" onClick={() => toggle(false)} aria-label="Close menu" tabIndex={open ? 0 : -1}>✕</button>
          </div>
          <ul>
            {links.map((l, i) => (
              <li className="pm-item" key={l.sel}>
                <a href={l.sel} onClick={go(l.sel)} tabIndex={open ? 0 : -1} draggable={false}>
                  <i>{String(i + 1).padStart(2, "0")}</i>
                  <b>{l.label}</b>
                  <span className="pm-arrow" aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="pm-item pm-order"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              toggle(false);
              cart.open();
            }}
          >
            <span>Order</span>
            <b>{count > 0 ? `${count} in your bag` : "Open your bag"} →</b>
          </button>
          <p className="pm-item pm-foot">18+ only · Swipe right to close</p>
        </nav>
      </div>
    </div>,
    document.body
  );
}
