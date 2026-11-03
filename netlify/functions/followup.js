import { getStore } from "@netlify/blobs";

// Feature B: post-result conversation. The user, after seeing a valuation,
// sends a follow-up (a question, a correction, and/or a new photo). The model
// decides — at its own discretion — whether to simply ANSWER the question or
// to RE-VALUE the item with the new information, and returns whichever fits.
//
// POST body: { jobId, message, newPhoto?: {data, mediaType}, priorResult, priorKlass }
// Writes the outcome to the same job record the poller reads, using a distinct
// status so the frontend can render it: "followup_done".

// --- Wholesale enforcement (same logic as start-valuation-background.js) ---
function parseRange(s) {
  if (typeof s !== "string") return null;
  const nums = (s.replace(/,/g, "").match(/\d+(\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  let lo = nums[0], hi = nums.length > 1 ? nums[1] : nums[0];
  if (hi < lo) [lo, hi] = [hi, lo];
  return { lo, hi };
}
// Under $1 rounds to 5 cents, under $10 to 50 cents, then whole dollars.
function roundMoney(n) {
  if (n < 1) return Math.max(0.05, Math.round(n * 20) / 20);
  if (n < 10) return Math.round(n * 2) / 2;
  if (n < 100) return Math.round(n);
  if (n < 1000) return Math.round(n / 5) * 5;
  return Math.round(n / 25) * 25;
}
// Formats like "35\u201350\u00a2", "50\u00a2\u2013$1.50", "$1.50\u20133", "$15\u201325".
function fmtRange(lo, hi) {
  const cents = (n) => Math.round(n * 100) + "\u00a2";
  const dollars = (n) => (n % 1 ? n.toFixed(2) : n.toLocaleString("en-US"));
  if (hi < 1) return lo === hi ? cents(lo) : Math.round(lo * 100) + "\u2013" + cents(hi);
  if (lo < 1) return cents(lo) + "\u2013$" + dollars(hi);
  return lo === hi ? "$" + dollars(lo) : "$" + dollars(lo) + "\u2013" + dollars(hi);
}
function fixWholesale(valueStr, wsStr) {
  const r = parseRange(valueStr);
  if (!r || r.hi <= 0) return wsStr;
  const w = parseRange(wsStr);
  const bound = (retail, cand) => {
    const min = retail / 3, max = retail / 2;
    const x = cand == null ? retail * 0.4 : cand;
    return Math.min(max, Math.max(min, x));
  };
  let lo = roundMoney(bound(r.lo, w ? w.lo : null));
  let hi = roundMoney(bound(r.hi, w ? w.hi : null));
  if (lo > hi) lo = hi;
  return fmtRange(lo, hi);
}
function enforceWholesale(p) {
  if (!p || typeof p !== "object") return;
  if (p.value) {
    p.walkAway = fixWholesale(p.value, p.walkAway || p.wholesale);
    delete p.wholesale;
  }
  if (Array.isArray(p.scenarios)) {
    for (const sc of p.scenarios) {
      if (sc && sc.value) sc.walkAway = fixWholesale(sc.value, sc.walkAway);
    }
  }
}

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
          itemType: priorResult.itemType,
          value: priorResult.value,
          walkAway: priorResult.walkAway || priorResult.wholesale,
          confidence: priorResult.confidence,
          scenarios: priorResult.scenarios,
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
      "id, itemType (Local, Collectible, or SpecificBuyer), confidence, value, walkAway, scenarios (each with condition, value, walkAway), reasoning, cantVerify; otherwise null> }\n" +
      "When re-valuing, keep the same honest, realized-price, reasoned methodology. State what changed and why.\n" +
      "RULES WHEN RE-VALUING: value = retail range: what the item realistically SELLS for at a dealer's shop or booth, or online at a sold price — not a yard-sale price and not an asking price. Price the visible form, period, and condition at full honest value; leave out only UNCONFIRMED premiums (maker, authenticity, rarity, precious material) and put those in an 'If ...' scenario (scenarios may sit outside the headline). Never anchor on a single comp. " +
      "walkAway = wholesale, what a reseller should pay: each end is one-third to one-half of the matching retail end, about one-half for easy, fast sellers and about one-third for slow, bulky, niche, or low-dollar items. " +
      "itemType is the best market: Collectible only with an identifiable maker or a recognized collector category; bulky furniture and plain household goods, even old ones, are Local. " +
      "Date the item from visible evidence and name the clues. Do not state a maker or material (solid brass, sterling) as fact without a visible mark or the user's confirmation. " +
      "The user's stated facts about the item are authoritative.";

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
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
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

    if (parsed.mode === "revalue" && parsed.result) enforceWholesale(parsed.result);
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
