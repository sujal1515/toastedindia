"use client";

// Ordering on the site: the pack-size picker used on product cards, and the order sheet
// (bag → delivery details → confirmation) that slides in from the right.
// The sheet renders outside #site-root so clicks on it never reach the 3D scene.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PACK_SIZES, packPrice, packMrp } from "@/lib/products";
import { cart, useCart, bagLines, bagCount, bagTotal } from "@/lib/cart";
import { STATES, PAYMENTS, checkCustomer, rupees } from "@/lib/order";

/* ------------------------------------------------------------------ */
/* Pack size picker + add to bag                                        */
/* ------------------------------------------------------------------ */
export function PackBuy({ product, size, onSize, tone = "card", tabIndex }) {
  return (
    <div className={`packbuy packbuy-${tone}`}>
      <div className="packbuy-sizes" role="radiogroup" aria-label={`Pack size for ${product.name} ${product.name2}`}>
        <span className="packbuy-label">Pack of</span>
        {PACK_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={size === n}
            className={size === n ? "on" : ""}
            onClick={() => onSize(n)}
            tabIndex={tabIndex}
            data-cursor
          >
            {n}
          </button>
        ))}
      </div>
      <div className="packbuy-row">
        <p className="packbuy-price">
          <b>{rupees(packPrice(product, size))}</b>
          <span>
            <s>{rupees(packMrp(product, size))}</s> MRP
          </span>
        </p>
        <button type="button" className="btn btn-hot btn-sm" onClick={() => cart.add(product.slug, size)} tabIndex={tabIndex} data-cursor>
          Add to bag
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header button                                                        */
/* ------------------------------------------------------------------ */
export function useBagCount() {
  const { items } = useCart();
  return bagCount(items);
}

/* ------------------------------------------------------------------ */
/* The order sheet                                                      */
/* ------------------------------------------------------------------ */
const BLANK = { name: "", phone: "", email: "", line1: "", line2: "", city: "", state: "", pincode: "", payment: "cod", notes: "", adult: false };

export function OrderSheet() {
  const { items, open, view, lastOrder } = useCart();
  const [mounted, setMounted] = useState(false);
  const panel = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => setMounted(true), []);

  // focus the sheet when it opens, give focus back when it closes, Esc to close
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    const t = setTimeout(() => panel.current?.focus(), 60);
    const onKey = (e) => e.key === "Escape" && cart.close();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      lastFocus.current?.focus?.();
    };
  }, [open]);

  // each step starts at the top
  useEffect(() => {
    panel.current?.querySelector(".sheet-body")?.scrollTo(0, 0);
  }, [view]);

  if (!mounted) return null;
  const titles = { bag: "Your bag", checkout: "Delivery details", done: "Order placed" };

  return createPortal(
    <div className={`sheet ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="sheet-backdrop" onClick={() => cart.close()} />
      <aside className="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={panel} tabIndex={-1}>
        <header className="sheet-head">
          {view === "checkout" ? (
            <button type="button" className="sheet-back" onClick={() => cart.view("bag")} aria-label="Back to your bag">←</button>
          ) : (
            <span className="sheet-step">{view === "done" ? "✓" : bagCount(items)}</span>
          )}
          <h2 id="sheet-title">{titles[view]}</h2>
          <button type="button" className="sheet-close" onClick={() => cart.close()} aria-label="Close">✕</button>
        </header>
        <ol className="sheet-steps" aria-hidden="true">
          <li className={view === "bag" ? "on" : "past"}>Bag</li>
          <li className={view === "checkout" ? "on" : view === "done" ? "past" : ""}>Details</li>
          <li className={view === "done" ? "on" : ""}>Done</li>
        </ol>
        <div className="sheet-body" data-lenis-prevent>
          {open && view === "bag" && <Bag items={items} />}
          {open && view === "checkout" && <Checkout items={items} />}
          {open && view === "done" && <Done order={lastOrder} />}
        </div>
      </aside>
    </div>,
    document.body
  );
}

function Bag({ items }) {
  const lines = bagLines(items);
  if (!lines.length) {
    return (
      <div className="sheet-empty">
        <p className="sheet-empty-big">Nothing rolled up yet.</p>
        <p>Pick a pack size on any product and add it to your bag.</p>
        <button
          type="button"
          className="btn btn-hot"
          onClick={() => {
            cart.close();
            document.querySelector("#drop")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          See the drop
        </button>
      </div>
    );
  }
  return (
    <>
      <ul className="bag-lines">
        {lines.map((l) => (
          <li key={`${l.slug}-${l.size}`} className="bag-line">
            <img src={`/products/${l.slug}.jpg`} alt="" />
            <div className="bag-line-info">
              <b>{l.product.name} {l.product.name2}</b>
              <span>Pack of {l.size} · {rupees(l.each)} each</span>
              <div className="qty" aria-label="Quantity">
                <button type="button" onClick={() => cart.setQty(l.slug, l.size, l.qty - 1)} aria-label={`One less ${l.product.name} ${l.product.name2}, pack of ${l.size}`}>−</button>
                <output aria-live="polite">{l.qty}</output>
                <button type="button" onClick={() => cart.setQty(l.slug, l.size, l.qty + 1)} aria-label={`One more ${l.product.name} ${l.product.name2}, pack of ${l.size}`}>+</button>
              </div>
            </div>
            <div className="bag-line-end">
              <b>{rupees(l.total)}</b>
              <button type="button" className="bag-remove" onClick={() => cart.remove(l.slug, l.size)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="sheet-foot">
        <p className="sheet-total"><span>Total</span><b>{rupees(bagTotal(items))}</b></p>
        <button type="button" className="btn btn-hot sheet-go" onClick={() => cart.view("checkout")}>Checkout →</button>
      </div>
    </>
  );
}

function Field({ id, label, error, optional, children }) {
  return (
    <div className={`field ${error ? "bad" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional && <i> (optional)</i>}
      </label>
      {children}
      {error && <p className="field-err" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

function Checkout({ items }) {
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const formRef = useRef(null);

  // keep what was typed if the visitor steps back to the bag and returns
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("toasted-details") || "null");
      if (saved) setForm({ ...BLANK, ...saved, adult: false });
    } catch {}
  }, []);
  const update = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    const next = { ...form, [key]: value };
    setForm(next);
    if (touched) setErrors(checkCustomer(next).errors);
    try {
      const { adult, ...keep } = next;
      sessionStorage.setItem("toasted-details", JSON.stringify(keep));
    } catch {}
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    setFailure("");
    const { errors: found } = checkCustomer(form);
    setErrors(found);
    if (Object.keys(found).length) {
      // bring the first problem into view
      requestAnimationFrame(() => formRef.current?.querySelector(".field.bad input, .field.bad select, .field.bad textarea")?.focus());
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: form, items: items.map(({ slug, size, qty }) => ({ slug, size, qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) setErrors(data.fields);
        setFailure(data.error || "Something went wrong. Please try again.");
        return;
      }
      try {
        sessionStorage.removeItem("toasted-details");
      } catch {}
      cart.placed(data);
    } catch {
      setFailure("You seem to be offline. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const lines = bagLines(items);
  if (!lines.length) {
    return <Bag items={items} />;
  }
  const err = (k) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `f-${k}-err` } : {});

  return (
    <form className="checkout" onSubmit={submit} noValidate ref={formRef}>
      <details className="mini-bag">
        <summary>
          <span>{bagCount(items)} {bagCount(items) === 1 ? "item" : "items"}</span>
          <b>{rupees(bagTotal(items))}</b>
        </summary>
        <ul>
          {lines.map((l) => (
            <li key={`${l.slug}-${l.size}`}>
              <span>{l.qty} × {l.product.name} {l.product.name2} <i>(pack of {l.size})</i></span>
              <b>{rupees(l.total)}</b>
            </li>
          ))}
        </ul>
      </details>

      <fieldset>
        <legend>You</legend>
        <Field id="f-name" label="Full name" error={errors.name}>
          <input id="f-name" autoComplete="name" value={form.name} onChange={update("name")} {...err("name")} />
        </Field>
        <div className="field-row">
          <Field id="f-phone" label="Mobile number" error={errors.phone}>
            <div className="field-prefix">
              <span>+91</span>
              <input id="f-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={form.phone} onChange={update("phone")} {...err("phone")} />
            </div>
          </Field>
          <Field id="f-email" label="Email" optional error={errors.email}>
            <input id="f-email" type="email" autoComplete="email" value={form.email} onChange={update("email")} {...err("email")} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Delivery address</legend>
        <Field id="f-line1" label="House / flat, building, street" error={errors.line1}>
          <input id="f-line1" autoComplete="address-line1" value={form.line1} onChange={update("line1")} {...err("line1")} />
        </Field>
        <Field id="f-line2" label="Area, landmark" optional>
          <input id="f-line2" autoComplete="address-line2" value={form.line2} onChange={update("line2")} />
        </Field>
        <div className="field-row">
          <Field id="f-city" label="City" error={errors.city}>
            <input id="f-city" autoComplete="address-level2" value={form.city} onChange={update("city")} {...err("city")} />
          </Field>
          <Field id="f-pincode" label="PIN code" error={errors.pincode}>
            <input id="f-pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={update("pincode")} {...err("pincode")} />
          </Field>
        </div>
        <Field id="f-state" label="State / UT" error={errors.state}>
          <select id="f-state" autoComplete="address-level1" value={form.state} onChange={update("state")} {...err("state")}>
            <option value="">Select…</option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset>
        <legend>Payment</legend>
        <div className="pay" role="radiogroup" aria-label="Payment">
          {Object.entries(PAYMENTS).map(([key, label]) => (
            <label key={key} className={`pay-opt ${form.payment === key ? "on" : ""}`}>
              <input type="radio" name="payment" value={key} checked={form.payment === key} onChange={update("payment")} />
              <b>{label}</b>
              <span>{key === "cod" ? "Pay in cash when it arrives" : "Scan & pay by UPI when it arrives"}</span>
            </label>
          ))}
        </div>
        <Field id="f-notes" label="Anything we should know?" optional>
          <textarea id="f-notes" rows={2} value={form.notes} onChange={update("notes")} placeholder="Delivery instructions, gate code…" />
        </Field>
      </fieldset>

      <label className={`adult ${errors.adult ? "bad" : ""}`}>
        <input type="checkbox" checked={form.adult} onChange={update("adult")} />
        <span>I confirm I&apos;m 18 or older. Smoking accessories are sold to adults only.</span>
      </label>
      {errors.adult && <p className="field-err">{errors.adult}</p>}

      {failure && <p className="checkout-fail" role="alert">{failure}</p>}

      <div className="sheet-foot">
        <p className="sheet-total"><span>To pay on delivery</span><b>{rupees(bagTotal(items))}</b></p>
        <button type="submit" className="btn btn-hot sheet-go" disabled={busy}>
          {busy ? "Placing order…" : "Place order"}
        </button>
      </div>
    </form>
  );
}

function Done({ order }) {
  if (!order) return null;
  return (
    <div className="done">
      <svg className="done-joint" viewBox="0 0 46 24" aria-hidden="true">
        <path className="nj-smoke" d="M40 10c-3-3 3-5 0-8" />
        <path className="nj-paper" d="M8 13.6 34 11.6v6.8L8 16.4Z" />
        <rect className="nj-tip" x="1.5" y="13.3" width="7.5" height="3.4" rx="0.8" />
        <path className="nj-ash" d="M34 11.6l4-.5v8.3l-4-.5Z" />
        <ellipse className="nj-ember" cx="38.6" cy="15.3" rx="1.7" ry="3.9" />
      </svg>
      <p className="done-big">You&apos;re sorted, {order.name}.</p>
      <p>Your order is in. Keep your phone nearby in case we need to confirm delivery to {order.city}.</p>
      <div className="done-id">
        <span>Order number</span>
        <b>{order.id}</b>
      </div>
      <ul className="done-lines">
        {order.items.map((l) => (
          <li key={`${l.slug}-${l.size}`}>
            <span>{l.qty} × {l.name} <i>(pack of {l.size})</i></span>
            <b>{rupees(l.total)}</b>
          </li>
        ))}
      </ul>
      <p className="sheet-total"><span>{order.payment}</span><b>{rupees(order.total)}</b></p>
      <button type="button" className="btn btn-hot sheet-go" onClick={() => cart.close()}>Back to the site</button>
    </div>
  );
}
