// Upload one photo into Blobs, keyed by jobId + index.
// The browser calls this ONCE PER PHOTO before starting a valuation.
// Sending one photo at a time keeps each request under the regular
// function's 6MB limit. The background valuation function later reads
// these back out of Blobs — so the big image data never has to travel
// through the background function's tiny 256KB request limit.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    const body = await req.json();
    const { jobId, index, data, mediaType } = body;

    if (!jobId || typeof index !== "number" || !data) {
      return new Response(
        JSON.stringify({ error: "missing jobId, index, or data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const store = getStore("valuation-photos");
    // Store the photo's base64 + mediaType as JSON under a per-photo key.
    await store.setJSON(`${jobId}_${index}`, {
      data,
      mediaType: mediaType || "image/jpeg",
    });

    return new Response(JSON.stringify({ ok: true, index }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String((err && err.message) || err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
