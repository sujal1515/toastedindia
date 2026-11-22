// The shopping bag: a tiny store outside React, saved in the browser so the bag
// survives a reload. Components read it with useCart() and change it through `cart`.
import { useSyncExternalStore } from "react";
import { productBySlug, packPrice } from "./products";

const KEY = "toasted-bag";
const EMPTY = { items: [], open: false, view: "bag", lastOrder: null };
let state = EMPTY;
let loaded = false;
const subs = new Set();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    const items = Array.isArray(saved)
      ? saved.filter((it) => productBySlug(it.slug) && [1, 2, 5, 10].includes(it.size) && it.qty > 0).map((it) => ({ slug: it.slug, size: it.size, qty: Math.min(99, it.qty | 0) }))
      : [];
    state = { ...state, items };
  } catch {
    /* private mode or bad data: start with an empty bag */
  }
}

function set(patch) {
  state = { ...state, ...patch };
  if ("items" in patch) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.items));
    } catch {
      /* storage unavailable: the bag still works for this visit */
    }
  }
  subs.forEach((f) => f());
}

const same = (it, slug, size) => it.slug === slug && it.size === size;

export const cart = {
  add(slug, size, qty = 1) {
    load();
    const has = state.items.find((it) => same(it, slug, size));
    const items = has
      ? state.items.map((it) => (same(it, slug, size) ? { ...it, qty: Math.min(99, it.qty + qty) } : it))
      : [...state.items, { slug, size, qty }];
    set({ items, open: true, view: "bag" });
  },
  setQty(slug, size, qty) {
    if (qty <= 0) return cart.remove(slug, size);
    set({ items: state.items.map((it) => (same(it, slug, size) ? { ...it, qty: Math.min(99, qty) } : it)) });
  },
  remove(slug, size) {
    set({ items: state.items.filter((it) => !same(it, slug, size)) });
  },
  open(view = "bag") {
    load();
    set({ open: true, view });
  },
  close() {
    // a finished order goes back to an empty bag next time
    set(state.view === "done" ? { open: false, view: "bag" } : { open: false });
  },
  view(view) {
    set({ view });
  },
  placed(order) {
    set({ items: [], view: "done", lastOrder: order });
  },
};

function subscribe(fn) {
  load();
  subs.add(fn);
  // the bag was loaded after the first render: tell this subscriber
  queueMicrotask(fn);
  return () => subs.delete(fn);
}

export function useCart() {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

export function bagLines(items) {
  return items.map((it) => {
    const product = productBySlug(it.slug);
    const each = packPrice(product, it.size);
    return { ...it, product, each, total: each * it.qty };
  });
}

export const bagCount = (items) => items.reduce((n, it) => n + it.qty, 0);
export const bagTotal = (items) => bagLines(items).reduce((n, l) => n + l.total, 0);
