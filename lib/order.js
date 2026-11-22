// Order checks shared by the checkout form (instant feedback) and the order API
// (the source of truth: it re-checks everything and prices the order itself).
import { PACK_SIZES, productBySlug, packPrice, packMrp } from "./products";

export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

export const PAYMENTS = {
  cod: "Cash on delivery",
  upi: "UPI on delivery",
};

const clean = (v, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// 10-digit Indian mobile number, with or without +91 / 0 in front
export function normalisePhone(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

// Returns { customer, errors }: customer is the cleaned form, errors maps field → message.
export function checkCustomer(raw = {}) {
  const c = {
    name: clean(raw.name, 80),
    phone: clean(raw.phone, 20),
    email: clean(raw.email, 120).toLowerCase(),
    line1: clean(raw.line1),
    line2: clean(raw.line2),
    city: clean(raw.city, 80),
    state: clean(raw.state, 60),
    pincode: clean(raw.pincode, 10).replace(/\s/g, ""),
    payment: clean(raw.payment, 10),
    notes: clean(raw.notes, 500),
    adult: raw.adult === true,
  };
  const errors = {};
  if (c.name.length < 2) errors.name = "Enter your full name.";
  const phone = normalisePhone(c.phone);
  if (!phone) errors.phone = "Enter a 10-digit Indian mobile number.";
  else c.phone = phone;
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) errors.email = "That email doesn't look right.";
  if (c.line1.length < 5) errors.line1 = "Enter your house / flat and street.";
  if (c.city.length < 2) errors.city = "Enter your city.";
  if (!STATES.includes(c.state)) errors.state = "Pick your state.";
  if (!/^[1-9]\d{5}$/.test(c.pincode)) errors.pincode = "Enter a 6-digit PIN code.";
  if (!PAYMENTS[c.payment]) errors.payment = "Pick how you'll pay.";
  if (!c.adult) errors.adult = "You must be 18 or older to order.";
  return { customer: c, errors };
}

// Prices a list of { slug, size, qty } from the catalogue. Returns { lines, total } or { error }.
export function priceItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { error: "Your bag is empty." };
  if (items.length > 50) return { error: "Too many lines in one order." };
  const lines = [];
  for (const it of items) {
    const product = productBySlug(it?.slug);
    const size = Number(it?.size);
    const qty = Number(it?.qty);
    if (!product || !PACK_SIZES.includes(size) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return { error: "Something in your bag isn't available. Please check it and try again." };
    }
    const each = packPrice(product, size);
    lines.push({
      slug: product.slug,
      name: `${product.name} ${product.name2}`,
      size,
      qty,
      each,
      mrp: packMrp(product, size),
      total: each * qty,
    });
  }
  return { lines, total: lines.reduce((n, l) => n + l.total, 0) };
}

export const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
