import { getStore } from "@netlify/blobs";
import { resolve, summarize, consume, releaseTicket } from "../lib/allowance.js";

// POST { deviceId, key?, token?, action }  action = "check" | "consume"
//   check   -> what this person can do right now (no change)
//   consume -> uses one valuation and returns a ticket for start-valuation-background
//   release -> gives back a ticket that never started a valuation (upload failed, etc.)
// The rules live in netlify/lib/allowance.js.
// Env vars: UA_UNLIMITED_KEYS, UA_UNLIMITED_DEVICES, UA_FAMILY_KEYS (comma-separated).
// Every open is logged on the device's entry (lastSeen, phone) so a specific
// person's entry can be found by when they opened the app.

function phoneType(ua) {
  ua = String(ua || "");
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  const m = ua.match(/Android[^;)]*;\s*([^;)]+)/i);
  if (/Android/i.test(ua)) return "Android" + (m && m[1] && !/^wv$/i.test(m[1].trim()) ? " (" + m[1].trim() + ")" : "");
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "Unknown";
}
function easternTime(d) {
  try {
    return d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " Eastern";
  } catch { return d.toISOString(); }
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { deviceId, action, key, token, ticket } = await req.json();
    if (!deviceId || typeof deviceId !== "string") return json({ error: "missing deviceId" }, 400);
    const r = await resolve({ deviceId, key, token });
    if (action === "release") {
      await releaseTicket(ticket);
      return json(await summarize(await resolve({ deviceId, key, token })));
    }

    // Log this open on the device's entry (best-effort, keeps existing fields).
    if (r.dev && action !== "consume") {
      try {
        const now = new Date();
        const ua = req.headers.get("user-agent") || "";
        const rec = (await getStore("usage").get("dev_" + r.dev, { type: "json" })) || {};
        const extra = r.mode === "unlimited" ? (r.key ? { keyHolder: r.key } : { unlimitedDevice: true })
          : r.mode === "family" ? { familyKey: r.key } : r.email ? { email: r.email } : {};
        await getStore("usage").setJSON("dev_" + r.dev, {
          used: 0, ...rec, lastSeen: now.toISOString(), lastSeenEastern: easternTime(now),
          phone: phoneType(ua), userAgent: ua.slice(0, 300), ...extra,
        });
      } catch { /* logging is best-effort */ }
    }

    return json(action === "consume" ? await consume(r) : await summarize(r));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};
