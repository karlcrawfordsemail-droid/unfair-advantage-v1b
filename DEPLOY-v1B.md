# Unfair Advantage v1B — Deploy Notes

## What changed
- **Front door only.** New `src/App.jsx` is the ChatGPT skin wired to the real
  engine. The old v37 App is preserved at `src/App.v37.jsx.bak`.
- **Engine unchanged**, except added **per-stage timing instrumentation** in
  `netlify/functions/start-valuation-background.js`. It now attaches a `timing`
  object `{ triageMs, valuationMs, totalMs, lane }` to the result alongside the
  existing `cost`, and logs a `[TIME]` line to the Netlify function log. No
  valuation logic was touched.

## What the new front door does
- Photo-first: three identical numbered slots (Overall / Underside / More views),
  fill in any order, camera by default, "add from library" fallback.
- Optional "Add what you know" card + optional ZIP.
- Consent gate kept (built in matching style) — triage still decides collectible
  vs common and pauses for the user's lane choice.
- Result is price-first: retail range big, wholesale below, best market, what it
  is, confidence, collapsed "why this price". **No buy/sell verdict.** Shows only
  `value`, `wholesale`, `id`, `confidence`, `reasoning` (+ `cantVerify`).
- Per-valuation feedback gate (2 taps + optional note) unlocks the next item;
  capped at 5 free valuations. Feedback saved to localStorage for now — swap
  `submitFeedback()` to POST to a collector endpoint when you have one.

## Deploy to a FRESH Netlify site (keep v37 live as fallback)
1. Push this folder to a new branch or new repo.
2. New Netlify site → connect it → build settings come from `netlify.toml`
   (build `npm run build`, publish `dist`, functions `netlify/functions`).
3. Set env var **`ANTHROPIC_API_KEY`** (same key as v37).
4. Deploy. Confirm the three functions show up under Functions.

## Measure before optimizing
Open any valuation with `?debug=cost` in the URL. The result screen now shows a
line like:
```
time: 41.2s total · triage 3.1s · valuation 37.9s · lane collectible
cost: $0.0842 · in 5120 / out 1180 · 3 searches
```
Run a handful of common + collectible items. That real per-stage split is what
decides the consent-gate and Opus-all-the-way questions.
