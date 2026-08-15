# Unfair Advantage — v3 Rebuild Notes (read me next session)

## What was wrong (root cause, confirmed)
The valuation kept failing with "Couldn't start the valuation" because the app
sent photos INSIDE the request to a Netlify **background function**. Background
functions cap the request body at **256KB** — and they only exist on Netlify's
**paid (Pro) plan** at all. On the free plan, that call was rejected before the
function ever ran (instant error, no result written, $0 API spend).

The very first version "worked" (ran, then timed out) because it used a regular
function with a 6MB limit — photos got through, but it hit the free plan's
10-second timeout mid-valuation. The edit that switched to a background function
traded the timeout for an instant size-rejection.

## What this v3 rebuild changes
Photos no longer travel inside the background function's request.

New flow:
1. **upload.js** (new regular function) — browser uploads photos ONE AT A TIME
   into the `valuation-photos` Blobs store. One photo per request stays under
   the 6MB regular-function limit.
2. **start-valuation-background.js** (rewritten) — browser calls it with only
   the jobId, photo count, and text (tiny — far under 256KB). It reads the
   photos back out of Blobs, runs the Anthropic valuation WITH web search
   (up to 15 min, no timeout), writes the result, deletes the photo blobs.
3. **result.js** (unchanged) — browser polls for the answer.

## Requirements to deploy
- **Netlify Pro plan** (for background functions). Subscribe right before upload.
- Keep **auto-recharge OFF** for a hard spending ceiling.
- `ANTHROPIC_API_KEY` env var already set — no change needed.

## Deploy steps (next session)
1. Subscribe to Netlify Pro (auto-recharge off).
2. Upload this whole project fresh to GitHub (same as the very first time —
   the method that worked). Replace the repo contents with these files.
3. Netlify auto-redeploys. Wait for green.
4. Test with 3 photos of one item. A real valuation should return.
5. If it errors: check the `valuations` Blobs store for a NEW job_ entry and
   read its status/error — that names anything remaining.

## Verified before packaging
- All 3 functions pass `node --check`.
- Full `vite build` compiles clean.
- Store names + key patterns match across upload.js, background, result.js, App.jsx.
- NOT yet tested on a live Netlify Pro account — that's the deploy test.
