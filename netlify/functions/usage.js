import { getStore } from "@netlify/blobs";

// Server-side usage cap, keyed to a device id the browser generates once.
// The count lives in Blobs, so clearing browser storage does NOT reset it.
// POST { deviceId, action }  action = "check" | "consume"
//   check   -> returns { used, limit, allowed } without incrementing
//   consume -> increments if under limit, returns { used, limit, allowed }
// Optional { key }: if it matches one of the comma-separated keys in the
// UA_UNLIMITED_KEYS environment variable, the cap is skipped (unlimited: true).
// Remove a key from that variable and redeploy to cut that one person off.
const FREE_LIMIT = 20;

function unlimitedKeys() {
  return String(process.env.UA_UNLIMITED_KEYS || "")
    .split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const { deviceId, action, key: accessKey } = await req.json();
    const cleanKey = typeof accessKey === "string" ? accessKey.trim().toLowerCase() : "";
    const unlimited = !!cleanKey && unlimitedKeys().includes(cleanKey);
    if (!deviceId || typeof deviceId !== "string") {
      return new Response(JSON.stringify({ error: "missing deviceId" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const store = getStore("usage");
    const key = "dev_" + deviceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    let used = 0;
    try {
      const rec = await store.get(key, { type: "json" });
      if (rec && typeof rec.used === "number") used = rec.used;
    } catch { /* first time — no record yet */ }

    if (unlimited) {
      // Key holder: no cap. Still count per key so usage per person is visible
      // in the Blobs "usage" store (entries named key_<key>).
      const kKey = "key_" + cleanKey.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
      let kUsed = 0;
      try {
        const kr = await store.get(kKey, { type: "json" });
        if (kr && typeof kr.used === "number") kUsed = kr.used;
      } catch { /* first use of this key */ }
      if (action === "consume") {
        kUsed += 1;
        await store.setJSON(kKey, { used: kUsed, at: new Date().toISOString() });
      }
      return json({ used: kUsed, limit: FREE_LIMIT, allowed: true, unlimited: true });
    }

    if (action === "consume") {
      if (used >= FREE_LIMIT) {
        return json({ used, limit: FREE_LIMIT, allowed: false });
      }
      used += 1;
      await store.setJSON(key, { used, at: new Date().toISOString() });
      return json({ used, limit: FREE_LIMIT, allowed: true });
    }

    // default: check only
    return json({ used, limit: FREE_LIMIT, allowed: used < FREE_LIMIT, unlimited: false });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json" },
  });
}
