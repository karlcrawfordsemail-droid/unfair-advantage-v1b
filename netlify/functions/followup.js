import { getStore } from "@netlify/blobs";

// Feature B: post-result conversation. The user, after seeing a valuation,
// sends a follow-up (a question, a correction, and/or a new photo). The model
// decides — at its own discretion — whether to simply ANSWER the question or
// to RE-VALUE the item with the new information, and returns whichever fits.
//
// POST body: { jobId, message, newPhoto?: {data, mediaType}, priorResult, priorKlass }
// Writes the outcome to the same job record the poller reads, using a distinct
// status so the frontend can render it: "followup_done".

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const store = getStore("valuations");
  let jobId;
  try {
    const body = await req.json();
    jobId = body.jobId;
    const { message, newPhoto, priorResult, priorKlass } = body;
    if (!jobId) return new Response("missing jobId");
    if (!message && !newPhoto) return new Response("nothing to process");

    await store.setJSON(jobId, { status: "followup_pending" });

    // Reassemble the images: prior photos from Blobs + any new one.
    const photoStore = getStore("valuation-photos");
    const imageBlocks = [];
    // Prior photos (best-effort; the follow-up still works on text alone).
    for (let i = 0; i < 8; i++) {
      try {
        const p = await photoStore.get(`${jobId}_${i}`, { type: "json" });
        if (p && p.data) {
          imageBlocks.push({
            type: "image",
            source: { type: "base64", media_type: p.mediaType || "image/jpeg", data: p.data },
          });
        } else break;
      } catch { break; }
    }
    // New photo the user just added with the follow-up.
    if (newPhoto && newPhoto.data) {
      imageBlocks.push({
        type: "image",
        source: { type: "base64", media_type: newPhoto.mediaType || "image/jpeg", data: newPhoto.data },
      });
    }

    const priorSummary = priorResult
      ? JSON.stringify({
          id: priorResult.id,
          listPrice: priorResult.listPrice,
          wholesale: priorResult.wholesale,
          value: priorResult.value,
          confidence: priorResult.confidence,
        })
      : "(prior valuation unavailable)";

    const system =
      "You are the same expert resale appraiser who just produced a valuation for this item. " +
      "The user has now sent a FOLLOW-UP after seeing your result. Use YOUR DISCRETION:\n" +
      "- If it's a QUESTION about your reasoning or the market (e.g. 'why so low?', 'what makes it collectible?', " +
      "'would a chip change this?'), just ANSWER it clearly and concisely — do NOT re-value.\n" +
      "- If it adds NEW INFORMATION that could change the price (a correction like 'it's signed X', a new photo of a " +
      "mark/signature/label, a measurement, a condition detail, set completeness), RE-VALUE the item incorporating it.\n" +
      "- If it's both, answer briefly AND re-value.\n\n" +
      "Your PRIOR valuation was: " + priorSummary + "\n\n" +
      "Respond with ONLY valid JSON, no markdown, in this shape:\n" +
      "{ \"mode\": \"answer\" | \"revalue\", \"reply\": \"<your conversational answer to the user, 1-4 sentences>\", " +
      "\"result\": <if mode is revalue, a FULL updated valuation object with the same fields as before: " +
      "id, listPrice, wholesale, value, confidence, bestMarket, scenarios, reasoning, cantVerify; otherwise null> }\n" +
      "When re-valuing, keep the same honest, realized-price, reasoned methodology. State what changed and why.";

    const userText =
      "The user's follow-up message: \"" + (message || "(no text, see new photo)") + "\"" +
      (newPhoto ? "\n\n(The user also attached a new photo — it is the LAST image.)" : "");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system,
        messages: [
          { role: "user", content: [...imageBlocks, { type: "text", text: userText }] },
        ],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    const data = await resp.json();
    if (data.type === "error" || data.error) {
      await store.setJSON(jobId, { status: "error", error: data.error?.message || "API error" });
      return new Response("error stored");
    }

    // Pull the text output and parse the JSON.
    let text = "";
    for (const block of data.content || []) {
      if (block.type === "text") text += block.text;
    }
    let parsed = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { parsed = null; }

    if (!parsed || !parsed.mode) {
      // Fallback: treat the raw text as a plain answer.
      await store.setJSON(jobId, {
        status: "followup_done",
        followup: { mode: "answer", reply: text.trim() || "Sorry — I couldn't process that. Try rephrasing?", result: null },
      });
      return new Response("followup done (fallback)");
    }

    await store.setJSON(jobId, {
      status: "followup_done",
      followup: {
        mode: parsed.mode === "revalue" ? "revalue" : "answer",
        reply: parsed.reply || "",
        result: parsed.mode === "revalue" ? (parsed.result || null) : null,
      },
    });
    return new Response("followup done");
  } catch (err) {
    try {
      if (jobId) await store.setJSON(jobId, { status: "error", error: String((err && err.message) || err) });
    } catch {}
    return new Response("caught error");
  }
};
