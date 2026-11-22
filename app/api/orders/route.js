// Takes an order from the checkout form. Everything is checked again here and the order
// is priced from the catalogue (never from what the browser sent), then recorded:
//   - on your own server: appended to data/orders.json
//   - on Vercel (no lasting file storage): written to the function log, and to
//     /tmp/orders.json for as long as that instance lives
//   - anywhere, if ORDER_WEBHOOK_URL is set: posted to that webhook (Discord, Slack,
//     Google Apps Script, Zapier…) so each order arrives as a message

import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { checkCustomer, priceItems, PAYMENTS } from "@/lib/order";

export const runtime = "nodejs";

const ON_VERCEL = Boolean(process.env.VERCEL);
const FILE = ON_VERCEL ? "/tmp/orders.json" : path.join(process.cwd(), "data", "orders.json");

// one write at a time, so two orders arriving together can't overwrite each other
let queue = Promise.resolve();
function save(order) {
  const run = queue.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    let orders = [];
    try {
      orders = JSON.parse(await readFile(FILE, "utf8"));
    } catch {
      /* first order */
    }
    orders.push(order);
    await writeFile(FILE, JSON.stringify(orders, null, 2));
  });
  queue = run.catch(() => {});
  return run;
}

// Sends the order to ORDER_WEBHOOK_URL, if one is set. Resolves true when it was delivered.
async function notify(order) {
  const url = process.env.ORDER_WEBHOOK_URL;
  if (!url) return false;
  const c = order.customer;
  const lines = order.items.map((l) => `• ${l.qty} × ${l.name} (pack of ${l.size}) — ₹${l.total}`).join("\n");
  const address = [c.line1, c.line2, c.city, c.state, c.pincode].filter(Boolean).join(", ");
  const text =
    `New order ${order.id} — ₹${order.total} (${order.payment})\n${lines}\n` +
    `${c.name} · ${c.phone}${c.email ? ` · ${c.email}` : ""}\n${address}` +
    (c.notes ? `\nNote: ${c.notes}` : "");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // content: Discord, text: Slack; order: the full record for anything else
      body: JSON.stringify({ content: text.slice(0, 1900), text, order }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { customer, errors } = checkCustomer(body?.customer);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fields: errors }, { status: 422 });
  }
  const priced = priceItems(body?.items);
  if (priced.error) return NextResponse.json({ error: priced.error }, { status: 422 });

  const order = {
    id: `TST-${Date.now().toString(36).toUpperCase().slice(-5)}${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: "new",
    customer,
    payment: PAYMENTS[customer.payment],
    items: priced.lines,
    total: priced.total,
  };

  const [saved, sent] = await Promise.all([save(order).then(() => true, () => false), notify(order)]);
  if (ON_VERCEL) console.log("ORDER", JSON.stringify(order));
  // the order must have landed somewhere lasting: the file (own server), the webhook, or the Vercel log
  if (!sent && !saved && !ON_VERCEL) {
    return NextResponse.json({ error: "We couldn't save your order. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    id: order.id,
    total: order.total,
    payment: order.payment,
    items: order.items,
    name: customer.name.split(" ")[0],
    city: customer.city,
  });
}
