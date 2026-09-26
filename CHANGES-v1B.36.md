# v1B.36 — what's in this build

Rebuilt Sept 25, 2026 from the "v36" zip, which was missing the backend fixes.

## Frontend (src/App.jsx) — already present, verified
- Header version: v1B.36
- FREE_LIMIT = 20 (also in netlify/functions/usage.js)
- Gallery accepts up to 5 photos at once; fills from the tapped slot forward
- Rotating feedback: fixed price check + 1 of 8 rotating questions; written question every 5th valuation
- End screen at 20 with "Text Karl" link
- REQUIRE_FEEDBACK = true

## Added in this rebuild
1. Triage model: Opus -> Haiku (claude-haiku-4-5-20251001) in start-valuation-background.js
2. Poll ceiling: 135s -> 300s (main valuation and follow-up)
3. feedback.js now saves rot_q, rot_a, valuation_num (previously dropped)
4. ?debug=cost now shows a second line: triage model, triage cost, valuation cost.
   Total now includes triage. Haiku rates used: $1/M input, $5/M output.

## Removed
Loose duplicate files at the zip's top level, App.v37.jsx.bak, and outdated deploy notes.
