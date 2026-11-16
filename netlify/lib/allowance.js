// Shared rules for who may run a valuation, used by usage.js (check/consume)
// and start-valuation-background.js (enforces the ticket).
//
// Order of checks:
//   1. Personal unlimited key (UA_UNLIMITED_KEYS)           -> unlimited
//   2. Whitelisted device id (UA_UNLIMITED_DEVICES)         -> unlimited
//   3. Family key (UA_FAMILY_KEYS)                          -> 20 per key
//   4. Signed-in subscriber (Basic 25 / Pro 50 per billing month),
//      then any 10-Pack credits once the month's are used
//   5. Signed-in, not subscribed                            -> 2 free per email,
//                                                              plus the device's 1 if unused,
//                                                              then any 10-Pack credits
//   6. Not signed in                                        -> 1 free per device
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const ANON_FREE = 1;        // first valuation, no sign-in
export const EMAIL_FREE = 2;       // after entering an email
export const FAMILY_LIMIT = 20;
export const BASIC_LIMIT = 25;     // per billing month
export const PRO_LIMIT = 50;       // per billing month
export const PACK_SIZE = 10;
export const PACK_DAYS = 365;      // a 10-Pack is good for 12 months
export const planLimit = (plan) => (plan === "pro" ? PRO_LIMIT : BASIC_LIMIT);
export function planFromPrice(priceId) {
  if (priceId && process.env.STRIPE_PRICE_PRO && priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "basic";
}
// Unexpired 10-Packs with valuations left, soonest to expire first.
export function livePacks(acct) {
  const now = Date.now();
  return ((acct && acct.packs) || [])
    .filter((p) => p && p.total - (p.used || 0) > 0 && Date.parse(p.expires) > now)
    .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires));
}
export const packLeft = (acct) => livePacks(acct).reduce((n, p) => n + (p.total - (p.used || 0)), 0);
const TICKET_MAX_USES = 2;         // original start + one automatic retry
const TICKET_TTL_MS = 30 * 60 * 1000;

const list = (v, clean) => String(v || "").split(",").map(clean).filter(Boolean);
const cleanKey = (k) => String(k || "").trim().toLowerCase();
export function cleanDeviceId(id) {
  return String(id || "").trim().replace(/^dev_/, "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}
export function cleanEmail(e) {
  const s = String(e || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200 ? s : "";
}
export const accountKey = (email) => "a_" + email.replace(/[^a-z0-9@._+-]/g, "");
export const hashCode = (email, code) => crypto.createHash("sha256").update(email + ":" + code).digest("hex");
export const customerKey = (cid) => "c_" + String(cid).replace(/[^a-zA-Z0-9_]/g, "");

export async function getJSON(store, key) {
  try { return (await store.get(key, { type: "json" })) || null; } catch { return null; }
}

export async function emailFromToken(token) {
  if (!token || typeof token !== "string" || token.length > 128) return "";
  const s = await getJSON(getStore({ name: "sessions", consistency: "strong" }), "s_" + token.replace(/[^a-f0-9]/g, ""));
  return s && s.email ? s.email : "";
}

export function subscriptionActive(acct) {
  if (!acct || !acct.subscriptionId) return false;
  return ["active", "trialing", "past_due"].includes(acct.status);
}

// Works out the person's situation. Does not change anything.
export async function resolve({ deviceId, key, token }) {
  const k = cleanKey(key);
  const dev = cleanDeviceId(deviceId);
  if (k && list(process.env.UA_UNLIMITED_KEYS, cleanKey).includes(k)) return { mode: "unlimited", key: k, dev };
  if (dev && list(process.env.UA_UNLIMITED_DEVICES, cleanDeviceId).includes(dev)) return { mode: "unlimited", dev };
  if (k && list(process.env.UA_FAMILY_KEYS, cleanKey).includes(k)) return { mode: "family", key: k, dev };

  const usage = getStore({ name: "usage", consistency: "strong" });
  const devRec = dev ? await getJSON(usage, "dev_" + dev) : null;
  const devUsed = !dev ? ANON_FREE : devRec && typeof devRec.used === "number" ? devRec.used : 0;
  const email = await emailFromToken(token);
  if (email) {
    const acct = (await getJSON(getStore({ name: "accounts", consistency: "strong" }), accountKey(email))) || { email };
    if (subscriptionActive(acct)) return { mode: "subscriber", email, acct, dev, devRec, devUsed };
    return { mode: "free_email", email, acct, dev, devRec, devUsed };
  }
  return { mode: "anon", dev, devRec, devUsed };
}

// Plain summary for the screen.
export async function summarize(r) {
  const out = { mode: r.mode, email: r.email || "", allowed: true, remaining: null, limit: null, needs: null };
  if (r.mode === "unlimited") { out.unlimited = true; return out; }
  if (r.mode === "family") {
    const f = await getJSON(getStore({ name: "usage", consistency: "strong" }), "family_" + r.key.replace(/[^a-z0-9_-]/g, "").slice(0, 64));
    const used = f && typeof f.used === "number" ? f.used : 0;
    out.family = true; out.limit = FAMILY_LIMIT; out.remaining = Math.max(0, FAMILY_LIMIT - used);
    if (!out.remaining) { out.allowed = false; out.needs = "family_done"; }
    return out;
  }
  const devLeft = Math.max(0, ANON_FREE - r.devUsed);
  if (r.mode === "subscriber") {
    const used = r.acct.periodUsed || 0;
    out.plan = r.acct.plan === "pro" ? "pro" : "basic";
    out.limit = planLimit(out.plan);
    out.monthLeft = Math.max(0, out.limit - used);
    out.packLeft = packLeft(r.acct);
    out.remaining = out.monthLeft + out.packLeft;
    out.periodEnd = r.acct.periodEnd || null;
    out.cancelAtPeriodEnd = !!r.acct.cancelAtPeriodEnd;
    if (!out.remaining) { out.allowed = false; out.needs = "month_done"; }
    return out;
  }
  if (r.mode === "free_email") {
    const emailLeft = Math.max(0, EMAIL_FREE - (r.acct.freeUsed || 0));
    out.packLeft = packLeft(r.acct);
    out.freeLeft = emailLeft + devLeft;
    out.remaining = out.freeLeft + out.packLeft;
    out.hasCustomer = !!r.acct.customerId;
    if (!out.remaining) { out.allowed = false; out.needs = "subscribe"; }
    return out;
  }
  out.remaining = devLeft;
  if (!out.remaining) { out.allowed = false; out.needs = "signin"; }
  return out;
}

// Where one valuation is counted, so a failed one can be given back.
async function adjust(bucket, id, delta) {
  const now = new Date().toISOString();
  const usage = getStore({ name: "usage", consistency: "strong" });
  const accounts = getStore({ name: "accounts", consistency: "strong" });
  const bump = (n) => Math.max(0, (n || 0) + delta);
  if (bucket === "key" || bucket === "family") {
    const k = (bucket === "key" ? "key_" : "family_") + id.key.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
    const r = (await getJSON(usage, k)) || {};
    await usage.setJSON(k, { ...r, used: bump(r.used), at: now });
  } else if (bucket === "dev" || bucket === "unlimdev") {
    const k = "dev_" + id.dev;
    const r = (await getJSON(usage, k)) || {};
    await usage.setJSON(k, { ...r, used: bump(r.used), at: now, ...(bucket === "unlimdev" ? { unlimitedDevice: true } : {}) });
  } else if (bucket === "pack") {
    const k = accountKey(id.email);
    const r = (await getJSON(accounts, k)) || { email: id.email };
    const packs = (r.packs || []).map((p) => (p.id === id.packId ? { ...p, used: bump(p.used) } : p));
    await accounts.setJSON(k, { ...r, packs, lastValuation: now });
  } else if (bucket === "period" || bucket === "free") {
    const k = accountKey(id.email);
    const r = (await getJSON(accounts, k)) || { email: id.email };
    const field = bucket === "period" ? "periodUsed" : "freeUsed";
    await accounts.setJSON(k, { ...r, [field]: bump(r[field]), lastValuation: now });
  }
}

// Uses one valuation and returns a ticket the valuation function will accept.
export async function consume(r) {
  const s = await summarize(r);
  if (!s.allowed) return s;
  let bucket;
  if (r.mode === "unlimited") bucket = r.key ? "key" : "unlimdev";
  else if (r.mode === "family") bucket = "family";
  else if (r.mode === "subscriber") bucket = s.monthLeft > 0 ? "period" : "pack";
  else if (r.mode === "free_email" && (r.acct.freeUsed || 0) < EMAIL_FREE) bucket = "free";
  else if (r.mode === "free_email" && r.devUsed < ANON_FREE) bucket = "dev";
  else if (r.mode === "free_email") bucket = "pack";
  else bucket = "dev"; // not signed in
  const id = { key: r.key || "", dev: r.dev || "", email: r.email || "" };
  if (bucket === "pack") id.packId = livePacks(r.acct)[0].id;
  await adjust(bucket, id, +1);
  if (r.mode !== "unlimited") s.remaining -= 1;
  if (bucket === "period") s.monthLeft -= 1;
  if (bucket === "pack") s.packLeft -= 1;
  if (r.mode === "free_email" && (bucket === "free" || bucket === "dev")) s.freeLeft -= 1;

  const ticket = crypto.randomBytes(16).toString("hex");
  await getStore({ name: "tickets", consistency: "strong" }).setJSON("t_" + ticket, { created: Date.now(), uses: 0, mode: r.mode, bucket, id, charged: true });
  s.ticket = ticket;
  if (s.remaining === 0 && s.mode !== "unlimited") {
    s.needsNext = s.mode === "anon" ? "signin" : s.mode === "free_email" ? "subscribe" : s.mode === "family" ? "family_done" : "month_done";
  }
  return s;
}

// Called by the valuation function. New jobs need a valid ticket; answers to a
// clarifying question reuse the job that was already approved.
export async function authorizeJob({ jobId, ticket, isResume }) {
  const tickets = getStore({ name: "tickets", consistency: "strong" });
  const jobKey = "j_" + String(jobId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  if (isResume && (await getJSON(tickets, jobKey))) return true;
  if (!ticket || typeof ticket !== "string") return false;
  const tKey = "t_" + ticket.replace(/[^a-f0-9]/g, "");
  const t = await getJSON(tickets, tKey);
  if (!t || Date.now() - t.created > TICKET_TTL_MS || t.uses >= TICKET_MAX_USES) return false;
  await tickets.setJSON(tKey, { ...t, uses: t.uses + 1 });
  await tickets.setJSON(jobKey, { at: Date.now(), ticket: tKey });
  return true;
}

// Gives back a ticket that never started a job (photo upload failed, etc.).
// A ticket that started any job is settled by the job instead.
export async function releaseTicket(ticket) {
  if (!ticket || typeof ticket !== "string") return;
  const tickets = getStore({ name: "tickets", consistency: "strong" });
  const tKey = "t_" + ticket.replace(/[^a-f0-9]/g, "");
  const t = await getJSON(tickets, tKey);
  if (!t || t.uses > 0 || !t.charged) return;
  await adjust(t.bucket, t.id, -1);
  await tickets.setJSON(tKey, { ...t, charged: false, uses: TICKET_MAX_USES }); // can't be used afterward
}

// Called when a job ends. A failed job gives the valuation back; a job that
// delivers a price keeps it counted. Each ticket counts at most once, so an
// error followed by a successful automatic retry counts one valuation.
// Every failure is logged in the Blobs "failures" store.
export async function settleJob(jobId, outcome, detail) {
  try {
    const tickets = getStore({ name: "tickets", consistency: "strong" });
    const j = await getJSON(tickets, "j_" + String(jobId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100));
    const t = j && j.ticket ? await getJSON(tickets, j.ticket) : null;
    if (outcome !== "success") {
      await getStore({ name: "failures", consistency: "strong" }).setJSON("f_" + Date.now() + "_" + String(jobId).slice(-8), {
        at: new Date().toISOString(), jobId, outcome, detail: String(detail || "").slice(0, 500),
        mode: t ? t.mode : "", email: t && t.id ? t.id.email : "",
      });
    }
    if (!t) return;
    if (outcome === "success" && !t.charged) {
      await adjust(t.bucket, t.id, +1);
      await tickets.setJSON(j.ticket, { ...t, charged: true });
    } else if (outcome !== "success" && t.charged) {
      await adjust(t.bucket, t.id, -1);
      await tickets.setJSON(j.ticket, { ...t, charged: false });
    }
  } catch { /* never let accounting break the valuation */ }
}
