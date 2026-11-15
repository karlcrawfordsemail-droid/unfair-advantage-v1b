// Minimal Stripe API helper (no extra package needed).
// Env: STRIPE_SECRET_KEY (sk_test_... while testing, sk_live_... after launch).
import crypto from "node:crypto";

function encode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v, name, out);
    else out.push(encodeURIComponent(name) + "=" + encodeURIComponent(String(v)));
  }
  return out;
}

export async function stripe(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const url = "https://api.stripe.com/v1" + path + (method === "GET" && params ? "?" + encode(params).join("&") : "");
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" || !params ? undefined : encode(params).join("&"),
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || "Stripe error " + r.status);
  return data;
}

// Checks the Stripe-Signature header against the raw body.
export function verifySignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(",").map((p) => p.trim()).filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = parts.t;
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// Newer Stripe API versions moved the billing period onto the subscription item.
export function periodEnd(sub) {
  if (!sub) return null;
  const t = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end);
  return t ? new Date(t * 1000).toISOString() : null;
}
