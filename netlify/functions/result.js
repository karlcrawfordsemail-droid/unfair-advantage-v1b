// The browser polls this with a jobId to check if the valuation is done.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return new Response(JSON.stringify({ error: "missing jobId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const store = getStore("valuations");
    const data = await store.get(jobId, { type: "json" });
    if (!data) {
      return new Response(JSON.stringify({ status: "pending" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
