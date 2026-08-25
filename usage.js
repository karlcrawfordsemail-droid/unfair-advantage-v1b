import { getStore } from "@netlify/blobs";

// Server-side usage cap, keyed to a device id the browser generates once.
// The count lives in Blobs, so clearing browser storage does NOT reset it.
// POST { deviceId, action }  action = "check" | "consume"
//   check   -> returns { used, limit, allowed } without incrementing
//   consume -> increments if under limit, returns { used, limit, allowed }
const FREE_LIMIT = 1000;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const { deviceId, action } = await req.json();
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

    if (action === "consume") {
      if (used >= FREE_LIMIT) {
        return json({ used, limit: FREE_LIMIT, allowed: false });
      }
      used += 1;
      await store.setJSON(key, { used, at: new Date().toISOString() });
      return json({ used, limit: FREE_LIMIT, allowed: true });
    }

    // default: check only
    return json({ used, limit: FREE_LIMIT, allowed: used < FREE_LIMIT });
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
