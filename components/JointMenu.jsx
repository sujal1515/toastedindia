"use client";

// The phone menu: a rolled paper hangs from the top-right corner, lit at the end, with a
// thread of smoke. Tap it, or drag it left / down, and it unrolls into a sheet of rolling
// paper (gum strip, laid lines, a burnt edge) holding the links and the order button.
// Dragging follows your finger; let go past a third of the way and it finishes unrolling.
// It renders outside #site-root so taps on it never reach the 3D scene.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { cart } from "@/lib/cart";
import { useBagCount } from "./Order";

const PULL = 230; // px of drag for a full unroll

export default function JointMenu({ links, onJump }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const tl = useRef(null);
  const drag = useRef(null);
  const count = useBagCount();

  useEffect(() => setMounted(true), []);

  // one timeline for the unroll; dragging scrubs it, a tap plays it
  useEffect(() => {
    if (!mounted) return;
    const q = gsap.utils.selector(root);
    const t = gsap.timeline({
      paused: true,
      onComplete: () => setOpen(true),
      onReverseComplete: () => setOpen(false),
    });
    t.set(q(".jm-wrap"), { visibility: "visible" }, 0)
      .fromTo(q(".jm-wrap"), { "--p": 0 }, { "--p": 1, duration: 0.75, ease: "power2.inOut" }, 0)
      .fromTo(q(".jm-curl"), { opacity: 1 }, { opacity: 0, duration: 0.15 }, 0.62)
      .fromTo(q(".jm-joint"), { rotate: 0 }, { rotate: -8, duration: 0.4, ease: "power2.out" }, 0)
      .fromTo(q(".jm-item"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: "power3.out" }, 0.4)
      .fromTo(q(".jm-backdrop"), { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
    tl.current = t;
    return () => t.kill();
  }, [mounted]);

  const play = (to) => {
    const t = tl.current;
    if (!t) return;
    if (to) {
      setOpen(true);
      t.play();
    } else t.reverse();
  };

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && play(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onDown = (e) => {
    const t = tl.current;
    if (!t) return;
    t.pause();
    drag.current = { x: e.clientX, y: e.clientY, from: t.progress(), moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    // left or down unrolls; right or up rolls it back
    const pull = Math.max(d.x - e.clientX, e.clientY - d.y);
    const back = Math.max(e.clientX - d.x, d.y - e.clientY);
    const delta = (pull > back ? pull : -back) / PULL;
    if (Math.abs(delta) * PULL > 6) d.moved = true;
    if (!d.moved) return;
    if (!open) setOpen(true);
    tl.current.progress(Math.min(1, Math.max(0, d.from + delta)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = tl.current.progress();
    if (!d.moved) return play(p < 0.5); // a tap toggles
    // past a third of the way it finishes; otherwise it springs back
    play(d.from < 0.5 ? p > 0.33 : p > 0.67);
  };

  const go = (sel) => (e) => {
    e.preventDefault();
    play(false);
    setTimeout(() => onJump(sel), 250);
  };

  if (!mounted) return null;

  return createPortal(
    <div className={`jm ${open ? "open" : ""}`} ref={root}>
      <div className="jm-backdrop" onClick={() => play(false)} aria-hidden="true" />

      <nav className="jm-wrap" id="jm-menu" aria-label="Menu" aria-hidden={!open}>
        <div className="jm-sheet">
          <div className="jm-paper">
            <p className="jm-item jm-head">
              <span>Toasted</span>
              <span>Rolling papers &amp; trays</span>
            </p>
            <ul>
              {links.map((l, i) => (
                <li className="jm-item" key={l.sel}>
                  <a href={l.sel} onClick={go(l.sel)} tabIndex={open ? 0 : -1}>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                    <b>{l.label}</b>
                    <span className="jm-arrow" aria-hidden="true">→</span>
                  </a>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="jm-item jm-order"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                play(false);
                cart.open();
              }}
            >
              <span>Order</span>
              {count > 0 ? <b className="jm-count">{count} in bag</b> : <b>Open your bag ↗</b>}
            </button>
            <p className="jm-item jm-foot">18+ only · Smoke responsibly</p>
          </div>
        </div>
        {/* the paper's rolled edge, travelling left as it unrolls */}
        <i className="jm-curl" aria-hidden="true" />
      </nav>

      {/* the rolled paper itself: drag it or tap it */}
      <button
        type="button"
        className="jm-joint"
        aria-expanded={open}
        aria-controls="jm-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg viewBox="0 0 44 168" aria-hidden="true">
          <defs>
            <linearGradient id="jmPaper" x1="0" x2="1">
              <stop offset="0" stopColor="#d9cfb7" />
              <stop offset="0.35" stopColor="#fffaf0" />
              <stop offset="0.7" stopColor="#f1e8d4" />
              <stop offset="1" stopColor="#bfb39a" />
            </linearGradient>
            <linearGradient id="jmAsh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7d746c" />
              <stop offset="1" stopColor="#3b3532" />
            </linearGradient>
            <radialGradient id="jmEmber" cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.35" stopColor="#ffb02e" />
              <stop offset="0.7" stopColor="#ff4d1a" />
              <stop offset="1" stopColor="#7a1a08" />
            </radialGradient>
          </defs>
          {/* paper: wider toward the lit end, a seam running down it */}
          <path d="M9 0 H35 L38 132 Q22 137 6 132 Z" fill="url(#jmPaper)" />
          <path d="M27 0 L29.5 132" stroke="rgba(150,130,100,0.35)" strokeWidth="1" />
          {[18, 40, 62, 84, 106, 126].map((y) => (
            <path key={y} d={`M${8.5 + y * 0.022} ${y} H${35.5 + y * 0.018}`} stroke="rgba(160,140,110,0.18)" strokeWidth="0.8" />
          ))}
          {/* charred band, ash, ember */}
          <path d="M6 128 Q22 134 38 128 L38.4 136 Q22 141 5.6 136 Z" fill="#2a1d17" opacity="0.85" />
          <path d="M5.6 134 Q22 140 38.4 134 L37 150 Q22 156 7 150 Z" fill="url(#jmAsh)" />
          <ellipse className="jm-ember" cx="22" cy="152" rx="14" ry="7" fill="url(#jmEmber)" />
          <circle className="jm-spark" cx="13" cy="156" r="1.4" fill="#ffd27a" />
          <circle className="jm-spark s2" cx="30" cy="157" r="1.1" fill="#ffb347" />
        </svg>
        <span className="jm-label">{open ? "Stub it" : "Spark it"}</span>
        {count > 0 && !open && <span className="jm-badge">{count}</span>}
        <span className="jm-smoke" aria-hidden="true"><i /><i /><i /></span>
      </button>
    </div>,
    document.body
  );
}
