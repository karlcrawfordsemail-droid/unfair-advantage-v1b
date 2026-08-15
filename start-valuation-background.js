// Background function: runs the (slow) valuation and stores the result.
// Netlify background functions can run up to 15 minutes — no timeout risk.
// The browser calls THIS directly; Netlify returns 202 immediately and
// runs this in the background. The browser passes in its own jobId and
// polls /result for the stored answer.

import { getStore } from "@netlify/blobs";

const SYSTEM_PROMPT = `You are an expert antiques and resale appraiser. You evaluate items the way a seasoned dealer does. You have a web search tool — USE IT before pricing.

YOUR ROLE — READ THIS FIRST: You are a VALUATION tool, nothing more. You tell the user what an item is worth and how to get the most for it. You NEVER tell the user what to do with it — never say whether they should sell it, keep it, donate it, toss it, or that it "isn't worth" their time or effort. You cannot see the user's situation, motivations, or why they want the value, so you are in no position to make that decision for them. Be fully honest about value, including low values, but always frame advice around getting the most for the item or making the sale — never around whether to bother. The user makes every decision; you just give them powerful information.

__MODE_LINE__
__ZIP_LINE__

PROCESS (in order):

1. IDENTIFY from the photos: what it is, maker/signature, era, material. Read marks carefully.
   - EVIDENCE RULE (critical): State a SPECIFIC maker, brand, origin, or date range ONLY when there is visible evidence for it — an actual maker's mark, signature, stamp, label, or a genuinely diagnostic documented feature. If there is NO visible mark, do NOT assert a specific maker as fact. Say "appears to be" or "in the style of" and name the possibility, not a certainty. Example: unmarked grape-pattern pewter shakers are "cast pewter-style shakers, grape/vine motif, in the style of Wilton Armetale but NO mark visible to confirm" — NOT "Wilton Armetale RWP, Columbia PA, 1970s." Inventing a pedigree the photo doesn't support is a serious error.
   - CONFIDENCE FOLLOWS EVIDENCE: a confirmed mark → High confidence, price to the strong end. No mark / "in the style of" → Moderate or Low confidence, WIDER range, and price to the CONSERVATIVE (lower) end of what it would be worth. Never pay or ask confirmed-maker money for an unconfirmed guess.
   - TELL THE USER WHAT TO CHECK: when the ID hinges on a mark you can't see, put it in cantVerify — e.g. "Check the underside for a 'Wilton' or 'RWP' stamp — if marked, worth $X; if unmarked/generic, more like $Y." Turn the uncertainty into a useful action.

2. DECIDE THE PRICING BASIS (critical):
   - COMMON LOCAL-MARKET item (furniture, household goods, décor, tools, toys, common glassware): price for LOCAL sale. ZIP matters. These move for a fraction of retail.
   - COLLECTIBLE / NATIONAL-MARKET item (identifiable maker, art pottery, antiques, sought brands, real online collector market): price to the NATIONAL market. ZIP irrelevant. If worth notably more than local money, SAY SO — tell a seller to sell online, alert a buyer it's a score.
   - SPECIFIC-BUYER item (branded/personalized goods still relevant to a named active party, machine parts, club/team items): do NOT price as worthless commodity. Price against that buyer's REPLACEMENT COST. If the user's notes say a specific buyer exists, weight that heavily.

3. SEARCH THE WEB before pricing — HARD SEARCH LIMITS (this controls cost and speed, follow strictly):
   - DEFAULT ASSUMPTION: most items are COMMON. Only treat an item as collectible if there is a clear, identifiable reason (a real maker's mark, a known brand with a collector market, obvious age/rarity). When in doubt, treat it as COMMON.
   - COMMON LOCAL item → EXACTLY 1 search (2 only if the first returns nothing usable). Then STOP and price it. Do NOT keep searching a common item to refine a small-dollar answer — it wastes time and money for no real gain. A rough local range is the correct answer for these.
   - COLLECTIBLE / SPECIFIC-BUYER / named maker → up to 3 searches MAXIMUM, and only as many as you actually need. Stop as soon as you have a tight cluster of sold prices; extra searches that only confirm what you already found are not allowed. Most identifiable items are well-priced within 2 searches.
   - NEVER exceed 3 searches for any item, ever. If you cannot pin it down in 3, give an honest wide range at Low confidence and say so — do not keep searching.
   Prefer actual SOLD/auction results over asking prices. A tight cluster = the real market; a lone high price = fantasy, distrust it.

4. SET CONFIDENCE honestly: GOOD data → tighter range, High. THIN data → wider range, Moderate. NO data → wide ballpark, Low, say it can't be pinned down. Never fabricate comps.

5. CONDITION drives price HARD and can OVERRIDE a strong ID. A confirmed maker sets the ceiling; condition decides where in the range it lands:
   - Heavy damage (deep pitting, rust, dead/chipped edge, cracks, repairs, material degradation, missing parts) pulls to the BOTTOM of the range or below — even for a desirable maker. An identified-but-beat-up piece is a display/restoration item, priced as such.
   - A clean example earns the TOP.
   - Never price a rough example near the top just because the maker is collectible. Say so in the reasoning.
   - You often can't fully judge condition from a photo — flag it, and price visible damage in.

6. COMMON / COMMODITY PRICING RULES (critical — do not violate):
   - The current NEW retail price is a HARD CEILING for any used common item. A used item must be priced MEANINGFULLY BELOW what a new one costs today. Never price a used common item at or above its new price — nobody pays used money when new is a click away.
   - Typical used resale for ordinary goods runs roughly 20-40% of current new retail — often LESS at an actual yard sale. Rough guide by category: quality tools and solid furniture hold value best (~40-50% of new); ordinary household goods and décor (~25-40%); cheap electronics, accessories, clothing, toys, and generic housewares crater (~10-25% or less).
   - For CHEAP MASS-MARKET COMMODITY items (e.g. a generic wireless mouse, phone cases, common cables, fast-fashion clothing) where new retail is already low, be honest about the low number: give the realistic used value even if it is only a dollar or two. If the item is worth more sold as part of a bulk lot than individually, say so as a how-to-maximize tip (e.g. "bundles with other electronics for a better return"). Do NOT invent a resale premium on cheap goods. Never tell the user the item isn't worth selling, to donate it, or to toss it — state the value and the best way to get it, and let the user decide.
   - To price a common item, use your KNOWLEDGE of its typical new price and apply the fraction above. Only search if you are not confident of the current new price from memory.

Output ONLY valid JSON, no markdown, no preamble, exactly this shape:
{
  "id": "what it is, likely maker, era, material",
  "itemType": "one of: Local, Collectible, SpecificBuyer",
  "confidence": "High, Moderate, or Low",
  "value": "realistic market value RANGE like '$40-65' — the honest worth",
  "listPrice": "what a SELLER should list/ask to get top dollar — at or slightly above the value HIGH end. Must relate to value; never float below the value midpoint.",
  "walkAway": "the most a BUYER should pay and still get a deal — at or below value low end",
  "scenarios": [
    { "condition": "short label e.g. 'If maker is unlisted'", "value": "tighter value range", "listPrice": "tighter ask range", "walkAway": "tighter walk-away range" }
  ],
  "reasoning": [ { "point": "short bold summary (3-6 words)", "detail": "one plain sentence" } ],
  "advice": [ { "point": "short bold summary (3-6 words)", "detail": "one plain actionable sentence" } ],
  "cantVerify": [ { "point": "short bold summary (3-6 words)", "detail": "what to check and how much it moves price" } ]
}

ARRAY RULES: each is 2-4 points, never a paragraph. "point" = skimmable bold summary; "detail" = one plain sentence. For a COMMON everyday item, keep it TIGHT — 2 points max per array, short scenarios or none. Save the long, detailed treatment for genuinely collectible items where it earns its keep.
SCENARIOS: include whenever a specific condition would meaningfully change price (unconfirmed maker, unknown authenticity, unclear condition). Return [] only when cleanly identified with solid data. Exactly 2 scenarios (low case, high case). Each scenario's ranges MUST be tighter than and inside the main ranges. Even the HIGH branch must respect visible condition damage — a confirmed maker on a damaged piece does NOT jump to clean-example prices.
listPrice = a realistic ASK to get top dollar: at, or only slightly above, the value HIGH end — NOT far above it. The ask must be a price a real buyer would actually pay; do not inflate it into fantasy territory. For cheap or common items especially, keep the ask close to the value high end (a used common item's ask should not balloon well above its market value). walkAway must sit at/below value low end.
Give RANGES, never single points. Honesty about uncertainty beats a confident wrong number.`;

export default async (req) => {
  let jobId;
  const store = getStore("valuations");
  try {
    // The request body is now TINY: just the jobId, text fields, and how
    // many photos were uploaded. The actual photos were already uploaded
    // (one at a time) to the "valuation-photos" Blobs store by upload.js.
    // We read them back here. This keeps this background function's request
    // body far under the 256KB background-function limit.
    const body = await req.json();
    const { notes, mode, zip, photoCount } = body;
    jobId = body.jobId;

    if (!jobId) {
      return new Response("missing jobId");
    }

    // Mark as running right away so the poller sees progress
    await store.setJSON(jobId, { status: "pending" });

    // Pull the uploaded photos back out of Blobs.
    const photoStore = getStore("valuation-photos");
    const photos = [];
    const count = typeof photoCount === "number" ? photoCount : 0;
    for (let i = 0; i < count; i++) {
      const p = await photoStore.get(`${jobId}_${i}`, { type: "json" });
      if (p && p.data) {
        photos.push({ data: p.data, mediaType: p.mediaType || "image/jpeg" });
      }
    }

    if (photos.length === 0) {
      await store.setJSON(jobId, {
        status: "error",
        error: "No photos were received. Please try again.",
      });
      return new Response("no photos");
    }

    const modeLine =
      mode === "sell"
        ? "The user is the SELLER. Their goal is to get the MOST money. Lead advice toward pricing high but realistic, presentation, and cleanup."
        : "The user is the BUYER (e.g. at someone else's yard/estate sale). Their goal is to pay the LEAST. Lead advice toward the walk-away price and negotiation leverage.";
    const zipLine = zip
      ? `The transaction is in ZIP code ${zip}. For common local goods, factor in that area's pricing.`
      : "No ZIP given. Price common local goods at general US yard-sale/resale levels.";

    const system = SYSTEM_PROMPT.replace("__MODE_LINE__", modeLine).replace(
      "__ZIP_LINE__",
      zipLine
    );

    const countLine =
      photos.length > 1
        ? `The user provided ${photos.length} photos of the SAME single item (overall, underside/mark, damage). Use them together as one item.`
        : "Evaluate this item.";
    const userText = notes && notes.trim()
      ? `${countLine} Notes from the user: ${notes.trim()}`
      : countLine;

    // Full-size image blocks (used by the collectible lane, which needs detail).
    const imageBlocks = photos.map((p) => ({
      type: "image",
      source: { type: "base64", media_type: p.mediaType, data: p.data },
    }));

    // --- STEP 1: Fast classification ---
    // A quick, cheap look decides COMMON vs COLLECTIBLE. We write the verdict
    // to job status immediately so the browser shows the right wait messages,
    // AND we use it to route the valuation down the fast lane or the deep lane.
    let klass = "common";
    try {
      const classifyResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16,
          system:
            "You are a fast triage step for a resale appraisal tool. Look at the photo(s) and decide ONE thing: is this a COMMON everyday mass-market item (typical household goods, common tools, cheap electronics, ordinary clothing/toys/decor — things with little collector interest), or a potentially COLLECTIBLE item (a real maker's mark or signature, an antique, art pottery, a sought-after brand, obvious age or craftsmanship, anything that could be worth real money to a collector)? When there is genuine doubt, answer COLLECTIBLE — it is safer to look closer than to dismiss a valuable item. Respond with EXACTLY ONE WORD: either COMMON or COLLECTIBLE. No punctuation, no explanation.",
          messages: [
            {
              role: "user",
              content: [
                imageBlocks[0],
                { type: "text", text: "Classify this item: COMMON or COLLECTIBLE." },
              ],
            },
          ],
        }),
      });
      const classifyData = await classifyResp.json();
      const word = (classifyData.content || [])
        .filter((i) => i.type === "text")
        .map((i) => i.text)
        .join(" ")
        .toUpperCase();
      klass = word.includes("COLLECTIBLE") ? "collectible" : "common";
      await store.setJSON(jobId, { status: "pending", klass });
    } catch {
      // If classification fails, default to common lane; never block valuation.
    }

    const isCollectible = klass === "collectible";

    // Lane settings:
    // - COMMON lane: fast cheap model (Haiku), NO search, brief report, prices
    //   from knowledge. This is the speed pass.
    // - COLLECTIBLE lane: Sonnet, full web search, full detail. Accuracy first.
    const klassLine = isCollectible
      ? "A fast triage step flagged this as POTENTIALLY COLLECTIBLE — give it the thorough treatment: search the web (up to 3 searches) for sold comps, verify, and provide full detail. Accuracy matters most here."
      : "A fast triage step flagged this as a COMMON everyday item. Price it FROM YOUR OWN KNOWLEDGE of typical used resale values — do NOT search, be fast. Keep the report BRIEF (2 points max per array). Apply the commodity pricing rules: used sits well below current new retail, cheap goods are worth little. Give the honest number even if low.";
    const userTextFinal = `${klassLine}\n\n${userText}`;

    const model = isCollectible ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
    const maxTokens = isCollectible ? 2000 : 900;
    const tools = isCollectible
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]
      : undefined;

    const requestBody = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [
        { role: "user", content: [...imageBlocks, { type: "text", text: userTextFinal }] },
      ],
    };
    if (tools) requestBody.tools = tools;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (data.type === "error" || data.error) {
      await store.setJSON(jobId, { status: "error", error: data.error?.message || "API error" });
      return new Response("error stored");
    }

    // --- Cost tracking (owner-only, for pricing feasibility) ---
    // Pull the real usage numbers off this specific call and compute what it
    // actually cost. Rates (Sonnet 4.6, Aug 2026): $3/M input, $15/M output.
    // Web search bills separately at ~$10 per 1,000 searches = $0.01 each.
    let costInfo = null;
    try {
      const u = data.usage || {};
      const inTok = u.input_tokens || 0;
      const outTok = u.output_tokens || 0;
      const searches = u.server_tool_use?.web_search_requests || 0;
      const inCost = (inTok / 1_000_000) * 3.0;
      const outCost = (outTok / 1_000_000) * 15.0;
      const searchCost = searches * 0.01;
      const total = inCost + outCost + searchCost;
      costInfo = {
        inputTokens: inTok,
        outputTokens: outTok,
        searches,
        inCost: +inCost.toFixed(4),
        outCost: +outCost.toFixed(4),
        searchCost: +searchCost.toFixed(4),
        total: +total.toFixed(4),
      };
    } catch {}

    const textBlocks = (data.content || [])
      .filter((i) => i.type === "text")
      .map((i) => i.text);
    const lastText = textBlocks[textBlocks.length - 1] || "";
    const allText = textBlocks.join("\n");

    const tryParse = (raw) => {
      if (!raw) return null;
      const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      try { return JSON.parse(cleaned); } catch {}
      const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
      if (a !== -1 && b !== -1 && b > a) {
        try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {}
      }
      return null;
    };

    let parsed = tryParse(lastText);
    if (!parsed || !parsed.id) parsed = tryParse(allText);

    if (!parsed || !parsed.id) {
      await store.setJSON(jobId, { status: "error", error: "Couldn't read a valuation from the response." });
      return new Response("parse error stored");
    }

    // Clean up the uploaded photos now that we're done with them —
    // keeps the photo store from accumulating and burning storage credits.
    try {
      for (let i = 0; i < count; i++) {
        await photoStore.delete(`${jobId}_${i}`);
      }
    } catch {}

    // Log the cost to the function log regardless (visible in Netlify logs),
    // and attach it to the result so the owner view can show it.
    if (costInfo) {
      console.log(
        `[COST] job=${jobId} in=${costInfo.inputTokens} out=${costInfo.outputTokens} ` +
        `searches=${costInfo.searches} total=$${costInfo.total.toFixed(4)}`
      );
    }

    await store.setJSON(jobId, { status: "done", result: parsed, cost: costInfo });
    return new Response("done");
  } catch (err) {
    try {
      if (jobId) await store.setJSON(jobId, { status: "error", error: String(err && err.message || err) });
    } catch {}
    return new Response("caught error");
  }
};
