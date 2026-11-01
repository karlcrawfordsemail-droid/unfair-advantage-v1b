import { getStore } from "@netlify/blobs";

// Server-side usage cap, keyed to a device id the browser generates once.
// The count lives in Blobs, so clearing browser storage does NOT reset it.
// POST { deviceId, action }  action = "check" | "consume"
//   check   -> returns { used, limit, allowed } without incrementing
//   consume -> increments if under limit, returns { used, limit, allowed }
// Optional { key }: if it matches one of the comma-separated keys in the
// UA_UNLIMITED_KEYS environment variable, the cap is skipped (unlimited: true).
// Remove a key from that variable and redeploy to cut that one person off.
// UA_UNLIMITED_DEVICES: comma-separated device ids that are unlimited with no
// key at all (for people who can't open a key link). Copy the entry name from
// the Blobs "usage" store, with or without its "dev_" prefix.
// Every open is logged on the device's entry (lastSeen, lastSeenEastern, phone)
// so a specific person's entry can be found by when they opened the app.
// UA_FAMILY_KEYS: comma-separated keys for friends and family. Same 20-valuation
// cap as testers, counted per key (works across their devices); their end
// screen says a family rate is coming. Add/remove a key, then redeploy.
const FREE_LIMIT = 20;
const FAMILY_LIMIT = 20;

function familyKeys() {
  return String(process.env.UA_FAMILY_KEYS || "")
    .split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
}

function cleanDeviceId(id) {
  return String(id || "").trim().replace(/^dev_/, "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function unlimitedDevices() {
  return String(process.env.UA_UNLIMITED_DEVICES || "")
    .split(",").map(cleanDeviceId).filter(Boolean);
}

// Short readable phone description from the browser's user-agent string.
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
    const family = !unlimited && !!cleanKey && familyKeys().includes(cleanKey);
    if (!deviceId || typeof deviceId !== "string") {
      return new Response(JSON.stringify({ error: "missing deviceId" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const store = getStore("usage");
    const devId = cleanDeviceId(deviceId);
    const key = "dev_" + devId;
    let used = 0;
    let rec = null;
    try {
      rec = await store.get(key, { type: "json" });
      if (rec && typeof rec.used === "number") used = rec.used;
    } catch { /* first time — no record yet */ }

    // Log this open on the device's entry (keeps used/at as they were).
    const now = new Date();
    const ua = req.headers.get("user-agent") || "";
    const seen = {
      lastSeen: now.toISOString(),
      lastSeenEastern: easternTime(now),
      phone: phoneType(ua),
      userAgent: ua.slice(0, 300),
    };
    const saveDevice = async (fields) => {
      try {
        await store.setJSON(key, { ...(rec || {}), used, ...seen, ...fields });
      } catch { /* logging is best-effort */ }
    };

    // Whitelisted device: unlimited with no key. Count still goes up so his
    // usage stays visible, but the cap never applies.
    if (!unlimited && unlimitedDevices().includes(devId)) {
      if (action === "consume") {
        used += 1;
        await saveDevice({ at: now.toISOString(), unlimitedDevice: true });
      } else {
        await saveDevice({ unlimitedDevice: true });
      }
      return json({ used, limit: FREE_LIMIT, allowed: true, unlimited: true });
    }

    if (unlimited) {
      await saveDevice({ keyHolder: cleanKey });
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

    if (family) {
      await saveDevice({ familyKey: cleanKey });
      const fKey = "family_" + cleanKey.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
      let fUsed = 0;
      try {
        const fr = await store.get(fKey, { type: "json" });
        if (fr && typeof fr.used === "number") fUsed = fr.used;
      } catch { /* first use of this key */ }
      if (action === "consume") {
        if (fUsed >= FAMILY_LIMIT) {
          return json({ used: fUsed, limit: FAMILY_LIMIT, allowed: false, unlimited: false, family: true });
        }
        fUsed += 1;
        await store.setJSON(fKey, { used: fUsed, at: new Date().toISOString() });
        return json({ used: fUsed, limit: FAMILY_LIMIT, allowed: true, unlimited: false, family: true });
      }
      return json({ used: fUsed, limit: FAMILY_LIMIT, allowed: fUsed < FAMILY_LIMIT, unlimited: false, family: true });
    }

    if (action === "consume") {
      if (used >= FREE_LIMIT) {
        return json({ used, limit: FREE_LIMIT, allowed: false });
      }
      used += 1;
      await saveDevice({ at: now.toISOString() });
      return json({ used, limit: FREE_LIMIT, allowed: true });
    }

    // default: check only (still logs the open)
    await saveDevice({});
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
