import { getStore } from "@netlify/blobs";

// Receives tester feedback and stores it in Netlify Blobs.
// Read submissions from the Netlify dashboard, or via a small admin fetch.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const body = await req.json();
    const store = getStore("feedback");
    const id = "fb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const record = {
      id,
      at: new Date().toISOString(),
      reliable: body.reliable ?? null,   // "Yes" | "Not sure" | "No"
      change: (body.change || "").slice(0, 2000),
      rot_q: (body.rot_q || "").slice(0, 200),      // which rotating question was asked
      rot_a: (body.rot_a || "").slice(0, 100),      // the tester's chip answer
      valuation_num: Number.isFinite(body.valuation_num) ? body.valuation_num : null,
      item: (body.item || "").slice(0, 300),   // optional: what it was valued at / desc
      version: body.version || "",
    };
    await store.setJSON(id, record);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
