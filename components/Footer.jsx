"use client";

// The footer, "last light":
//   - embers drift up through the whole footer (a light 2D canvas); on desktop the pointer
//     leaves a faint trail of sparks
//   - a big call to action that rises into place, with Order and Shop buttons
//   - the five products as rows; pointing at one burns a coral fill across it from the left
//   - a giant TOASTED wordmark: touch or point at a letter and it catches, glows, chars,
//     throws sparks and smoke, then cools back to cream
//   - an ember line burns across under the wordmark as the footer comes into view
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { products, packPrice, INSTAGRAM } from "@/lib/products";
import { cart } from "@/lib/cart";

const WORD = "TOASTED".split("");

// Embers: a small particle system drawn with additive glows.
function startEmbers(canvas, host) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const sc = sprite.getContext("2d");
  const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,236,190,1)");
  g.addColorStop(0.18, "rgba(255,170,80,0.9)");
  g.addColorStop(0.45, "rgba(255,90,30,0.35)");
  g.addColorStop(1, "rgba(255,60,20,0)");
  sc.fillStyle = g;
  sc.fillRect(0, 0, 64, 64);

  let W = 0;
  let H = 0;
  const size = () => {
    W = host.clientWidth;
    H = host.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  const parts = [];
  const spawn = (x, y, o = {}) => {
    if (parts.length > 260) return;
    const life = o.life ?? 4 + Math.random() * 5;
    parts.push({
      x, y,
      vx: o.vx ?? (Math.random() - 0.5) * 14,
      vy: o.vy ?? -(18 + Math.random() * 46),
      life, max: life,
      s: o.s ?? 1.4 + Math.random() * 2.8,
      f: 0.6 + Math.random() * 1.6,
      ph: Math.random() * 6.28,
    });
  };
  const api = {
    burst(cx, cy, n = 16) {
      const r = host.getBoundingClientRect();
      for (let i = 0; i < n; i++)
        spawn(cx - r.left, cy - r.top, {
          vx: (Math.random() - 0.5) * 170,
          vy: -(60 + Math.random() * 160),
          life: 0.7 + Math.random() * 1.1,
          s: 1.2 + Math.random() * 2.4,
        });
    },
    trail(cx, cy) {
      const r = host.getBoundingClientRect();
      if (Math.random() < 0.55) spawn(cx - r.left, cy - r.top, { vy: -(20 + Math.random() * 40), life: 0.8 + Math.random() * 0.8, s: 1 + Math.random() * 1.6 });
    },
  };

  let visible = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);
  let raf;
  let last = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    // a steady rise of embers from the bottom edge
    const rate = W < 700 ? 9 : 16;
    if (Math.random() < rate * dt) spawn(Math.random() * W, H + 8);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const t = now / 1000;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0 || p.y < -20) {
        parts.splice(i, 1);
        continue;
      }
      p.x += (p.vx + Math.sin(t * p.f + p.ph) * 14) * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.992 - 6 * dt;
      const k = p.life / p.max;
      const flick = 0.65 + 0.35 * Math.sin(t * 9 * p.f + p.ph);
      ctx.globalAlpha = Math.min(1, k * 1.6) * flick;
      const d = p.s * 7;
      ctx.drawImage(sprite, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  };
  raf = requestAnimationFrame(frame);
  return {
    api,
    stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    },
  };
}

export default function Footer({ links, onJump, onProduct }) {
  const root = useRef(null);
  const canvas = useRef(null);
  const embers = useRef(null);

  useEffect(() => {
    const e = startEmbers(canvas.current, root.current);
    embers.current = e.api;
    const fine = window.matchMedia("(hover: hover)").matches;
    const move = (ev) => fine && e.api.trail(ev.clientX, ev.clientY);
    root.current.addEventListener("pointermove", move);
    const host = root.current;
    return () => {
      e.stop();
      host.removeEventListener("pointermove", move);
    };
  }, []);

  // reveal: the headline rises, rows slide in, the letters drop and the ember line burns across
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const q = gsap.utils.selector(root);
    const ctx = gsap.context(() => {
      gsap.set(q(".ft-head b"), { yPercent: 110, rotate: 6 });
      gsap.set(q(".ft-row"), { x: -30, opacity: 0 });
      gsap.set(q(".ft-kicker, .ft-actions"), { opacity: 0, y: 16 });
      gsap.set(q(".ft-l"), { yPercent: 110, rotate: () => gsap.utils.random(-18, 18) });
      gsap.set(q(".ft-burnline i"), { scaleX: 0 });
      gsap
        .timeline({ scrollTrigger: { trigger: q(".ft-inner")[0], start: "top 80%", once: true } })
        .to(q(".ft-head b"), { yPercent: 0, rotate: 0, duration: 0.9, stagger: 0.08, ease: "power4.out" })
        .to(q(".ft-kicker, .ft-actions"), { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.2)
        .to(q(".ft-row"), { x: 0, opacity: 1, duration: 0.6, stagger: 0.07, ease: "power3.out" }, 0.25);
      gsap
        .timeline({ scrollTrigger: { trigger: q(".ft-word")[0], start: "top 92%", once: true } })
        .to(q(".ft-l"), { yPercent: 0, rotate: 0, duration: 1, stagger: 0.06, ease: "back.out(1.6)" })
        .to(q(".ft-burnline i"), { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0.3);
    }, root);
    return () => ctx.revert();
  }, []);

  // a letter catches: glow, char, sparks, smoke, then it cools back
  const heat = (el) => {
    if (!el || el.classList.contains("hot")) return;
    el.classList.add("hot");
    const r = el.getBoundingClientRect();
    embers.current?.burst(r.left + r.width / 2, r.top + r.height * 0.35, 18);
    setTimeout(() => el.classList.remove("hot"), 1800);
  };
  const touchLetter = (ev) => heat(document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".ft-l"));

  return (
    <footer className="ft" ref={root}>
      <canvas className="ft-embers" ref={canvas} aria-hidden="true" />

      <div className="ft-inner">
        <div className="ft-cta">
          <p className="ft-kicker"><i aria-hidden="true" /> Last light</p>
          <h2 className="ft-head" aria-label="Light one up.">
            <span><b>Light</b></span> <span><b>one</b></span> <span><b className="o">up.</b></span>
          </h2>
          <div className="ft-actions">
            <button type="button" className="btn btn-hot" onClick={() => cart.open()} data-cursor>Order now</button>
            <a href="#drop" className="ft-more" onClick={(e) => { e.preventDefault(); onJump("#drop"); }}>Shop the drop →</a>
          </div>
        </div>

        <ol className="ft-list" aria-label="Products">
          {products.map((p, i) => (
            <li className="ft-row" key={p.slug}>
              <button type="button" onClick={() => onProduct(i)} data-cursor>
                <i>{String(i + 1).padStart(2, "0")}</i>
                <span className="ft-name">
                  <b>{p.name} {p.name2}</b>
                  <span>{p.kind}</span>
                </span>
                <em>from ₹{packPrice(p, 1)}</em>
                <u aria-hidden="true">→</u>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="ft-word" aria-label="Toasted" role="img" onPointerMove={touchLetter} onPointerDown={touchLetter}>
        {WORD.map((ch, i) => (
          <span className="ft-l" data-ch={ch} key={i} aria-hidden="true">{ch}</span>
        ))}
      </div>
      <div className="ft-burnline" aria-hidden="true"><i /></div>

      <div className="ft-bottom">
        <nav aria-label="Footer">
          {links.map((l) => (
            <a key={l.sel} href={l.sel} onClick={(e) => { e.preventDefault(); onJump(l.sel); }}>{l.label}</a>
          ))}
          <a href={INSTAGRAM} target="_blank" rel="noreferrer">Instagram ↗</a>
        </nav>
        <p>For adults 18+ only. Smoking is injurious to health. Toasted sells smoking accessories only.</p>
        <p>© {new Date().getFullYear()} Toasted India</p>
      </div>
    </footer>
  );
}
