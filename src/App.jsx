import React, { useEffect, useRef, useState } from "react";

// App version — bump on every deploy so the running site shows which build is live.
const APP_VERSION = "v1B.26";

/* ============================================================================
   UNFAIR ADVANTAGE — v1B
   Front door rebuilt on the ChatGPT visual skin, wired to the live v37 engine.
   The valuation engine (Opus triage -> consent gate -> Sonnet valuation) is
   UNCHANGED. This file only replaces the input UX and the result display.

   Displayed fields: retail range (value), wholesale, id, confidence, reasoning.
   NOT displayed: buy/sell verdict, listPrice, walkAway, advice.
   ========================================================================== */

const MAX_PHOTOS = 5;
const FREE_LIMIT = 1000; // DEV: raised from 5 for testing — set back to 5 before real testers

// Stable per-device id for the server-side usage cap. Generated once and kept
// in localStorage; if cleared, a new id is minted (fresh device from the
// server's view) — acceptable for the free tier, replaced by real accounts later.
function getDeviceId() {
  try {
    let id = localStorage.getItem("ua_device");
    if (!id) {
      id = "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("ua_device", id);
    }
    return id;
  } catch {
    return "d_ephemeral";
  }
}

// The three core capture slots, in order. Labels/copy are the settled v1B wording.
const SLOTS = [
  { label: "Overall", instruction: "The whole item" },
  { label: "Underside", instruction: "Maker's mark, signature, or label" },
  { label: "More views", instruction: "Especially any damage or chips" },
];
// Up to 2 extra generic slots the user can reveal when 3 aren't enough (5 total).
const EXTRA_SLOTS = [
  { label: "Another view", instruction: "Any extra angle" },
  { label: "Another view", instruction: "Any extra angle" },
];

/* ---- design tokens (from the approved ChatGPT skin) --------------------- */
const CSS = `
:root{
  --page:#f7f8f7; --surface:#ffffff; --ink:#18201d; --muted:#4d5a55;
  --line:#ccd3ce; --deep:#173d34; --accent:#e59b2f; --accent-soft:#fff0cf;
  --blue:#245f83; --blue-soft:#eaf4f8; --ok:#166b4d;
  --shadow:0 24px 60px rgba(27,42,37,.16);
  --radius-xl:30px; --radius-lg:20px; --radius-md:14px;
  --font-display:"Avenir Next","Trebuchet MS","Gill Sans",sans-serif;
  --font-body:"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif;
}
*{box-sizing:border-box;}
html,body,#root{height:100%;}
body{
  margin:0; color:var(--ink); font-family:var(--font-body);
  background:#f7f8f7;
}
.ua-app{ max-width:520px; margin:0 auto; min-height:100%; display:flex; flex-direction:column; }
.appbar{
  background:#ffffff; color:var(--deep); padding:16px 18px 13px;
  font-family:var(--font-display); border-bottom:4px solid var(--accent);
  position:sticky; top:0; z-index:10;
}
.brand{ display:flex; align-items:center; justify-content:center; gap:10px; }
.brand-mark{
  width:30px; height:30px; border-radius:9px; display:inline-grid; place-items:center;
  background:var(--accent); color:#142b25; font-size:.92rem; font-weight:900;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.32); font-family:var(--font-display);
}
.brand-name{ font-size:1.5rem; font-weight:900; letter-spacing:-.02em; color:var(--deep); }
.brand-version{ font-size:.7rem; font-weight:600; opacity:.5; letter-spacing:0; margin-left:3px; }
.screen{ padding:20px 16px 28px; flex:1; }
.followup{ margin-top:22px; border-top:1px solid #e4dcc9; padding-top:18px; }
.followup-title{ font-family:var(--font-display); font-weight:800; font-size:1rem; color:var(--deep); margin-bottom:10px; }
.followup-thread{ display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
.fu-msg{ padding:10px 13px; border-radius:14px; font-size:.92rem; line-height:1.4; max-width:90%; }
.fu-user{ align-self:flex-end; background:var(--deep); color:#fff; border-bottom-right-radius:4px; }
.fu-tool{ align-self:flex-start; background:#eef1ee; color:var(--ink); border-bottom-left-radius:4px; }
.fu-typing{ opacity:.6; font-style:italic; }
.fu-photo-chip{ position:relative; display:inline-block; margin-bottom:10px; }
.fu-photo-chip img{ height:56px; border-radius:8px; border:1px solid #d9d2ea; }
.fu-photo-chip button{ position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%; border:none; background:#333; color:#fff; font-size:13px; line-height:1; cursor:pointer; }
.followup-input{ display:flex; gap:7px; align-items:center; }
.fu-text{ flex:1; border:1.5px solid #d9d2ea; border-radius:12px; padding:11px 12px; font-family:var(--font-body); font-size:.92rem; }
.fu-text:focus{ outline:2px solid #b7a6e6; outline-offset:1px; }
.fu-photo-btn{ border:1.5px solid #d9d2ea; background:#fff; border-radius:12px; padding:9px 11px; font-size:1.05rem; cursor:pointer; }
.fu-send{ border:none; background:var(--accent); color:#142b25; font-weight:800; border-radius:12px; padding:11px 16px; font-family:var(--font-display); cursor:pointer; }
.fu-send:disabled{ background:#e7e3d8; color:#a49f92; cursor:default; }
.sticky-dual{ display:flex; gap:10px; }
.dual-btn{ flex:1; border-radius:12px; padding:14px 10px; font-family:var(--font-display); font-weight:800; font-size:.98rem; cursor:pointer; border:none; }
.dual-ask{ background:#fff; color:var(--deep); border:1.5px solid var(--deep); }
.dual-ask.active{ background:var(--deep); color:#fff; }
.dual-next{ background:var(--accent); color:#142b25; }
.sticky-price-bar{  position:fixed; left:50%; transform:translateX(-50%); bottom:0;
  width:100%; max-width:520px; box-sizing:border-box;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background:rgba(247,244,239,0.94); backdrop-filter:blur(8px);
  border-top:1px solid #e4dcc9; z-index:50;
}
.tagline{ text-align:center; margin:0 0 16px; display:flex; flex-direction:column; gap:2px; }
.tagline-lead{ font-family:var(--font-display); font-weight:800; font-size:.9rem; color:var(--deep); letter-spacing:.01em; }
.tagline-sub{ font-size:.8rem; color:var(--muted); line-height:1.35; }
.screen h2{
  font-family:var(--font-display); font-size:1.6rem; line-height:1.08;
  letter-spacing:-.035em; color:var(--deep); margin:0 0 7px;
}
.lead{ margin:0 0 17px; font-size:.98rem; line-height:1.4; color:var(--muted); font-weight:700; }

/* capture slots */
.photo-row{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
.photo-delete{
  position:absolute; top:5px; right:5px; z-index:3;
  width:26px; height:26px; border-radius:50%;
  background:rgba(20,20,18,.82); color:#fff; font-size:18px; line-height:26px;
  text-align:center; cursor:pointer; font-family:sans-serif; font-weight:400;
}
.add-photo-btn{
  display:block; width:100%; margin:0 0 16px; padding:11px 12px;
  background:transparent; border:1.5px dashed var(--line); border-radius:12px;
  color:var(--deep); font-family:var(--font-display); font-weight:700; font-size:.9rem;
  cursor:pointer;
}
.add-photo-btn:hover{ border-color:var(--accent); }
.photo-add{
  position:absolute; top:0; left:0; right:0; bottom:44px;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:1px; z-index:1; pointer-events:none; color:var(--muted);
}
.photo-add-plus{ font-size:2rem; line-height:1; font-weight:300; color:var(--deep); }
.photo-add-text{ font-family:var(--font-display); font-weight:700; font-size:.9rem; color:var(--deep); }
.photo-add-sub{ font-size:.72rem; color:var(--muted); }
.chooser-backdrop{
  position:fixed; inset:0; z-index:50; background:rgba(10,18,15,.45);
  display:flex; align-items:flex-end; justify-content:center;
}
.chooser-sheet{
  width:100%; max-width:520px; background:#fff; border-radius:18px 18px 0 0;
  padding:12px; display:flex; flex-direction:column; gap:8px;
  box-shadow:0 -8px 30px rgba(0,0,0,.2);
}
.chooser-opt{
  width:100%; padding:16px; border:none; border-radius:12px;
  background:var(--deep); color:#fff; font-family:var(--font-display);
  font-weight:800; font-size:1rem; cursor:pointer;
}
.chooser-opt:last-of-type{ background:var(--accent); color:#142b25; }
.chooser-cancel{
  width:100%; padding:14px; border:none; border-radius:12px; background:#eee;
  color:var(--ink); font-family:var(--font-display); font-weight:700; font-size:.95rem; cursor:pointer;
}
.photo-card{
  position:relative; min-width:0; height:184px; border:2px solid #9ca9a3;
  border-radius:14px; background:#f0f3ef; overflow:hidden; display:flex;
  flex-direction:column; justify-content:flex-end;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.75); cursor:pointer;
  -webkit-tap-highlight-color:transparent; text-align:left; padding:0;
  font-family:var(--font-body); color:inherit;
}
.photo-card.filled{ border-color:var(--deep); }
.photo-card.dragging{ border-color:var(--accent); border-style:solid; background:var(--accent-soft); }
.photo-card .thumb{
  position:absolute; inset:0; background-size:cover; background-position:center;
}
.photo-card .thumb::after{
  content:""; position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(8,20,16,.02), rgba(8,20,16,.42));
}
.photo-number{
  position:absolute; top:8px; left:8px; z-index:2; width:24px; height:24px;
  border-radius:8px; background:rgba(23,61,52,.92); color:#fff;
  font-family:var(--font-display); font-weight:900; font-size:.85rem;
  display:grid; place-items:center;
}
.photo-check{
  position:absolute; top:8px; right:8px; z-index:2; width:22px; height:22px;
  border-radius:50%; background:var(--ok); color:#fff; font-size:.8rem;
  display:none; place-items:center;
}
.photo-card.filled .photo-check{ display:grid; }
.empty-icon{
  position:absolute; top:50%; left:50%; transform:translate(-50%,-58%); z-index:1;
  width:34px; height:28px; border:2px solid #9ca9a3; border-radius:6px;
}
.empty-icon::before{
  content:""; position:absolute; top:-7px; left:50%; transform:translateX(-50%);
  width:12px; height:7px; border:2px solid #9ca9a3; border-bottom:none;
  border-radius:4px 4px 0 0;
}
.empty-icon::after{
  content:""; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  width:9px; height:9px; border-radius:50%; border:2px solid #9ca9a3;
}
.photo-copy{ position:relative; z-index:2; padding:8px 8px 9px; display:flex; flex-direction:column; gap:2px; }
.photo-card.filled .photo-copy{ color:#fff; }
.photo-label{ font-family:var(--font-display); font-weight:900; font-size:.82rem; line-height:1.05; }
.photo-instruction{ font-size:.68rem; line-height:1.15; font-weight:700; color:var(--muted); }
.photo-card.filled .photo-instruction{ color:rgba(255,255,255,.86); }
.scale-hint{ font-size:.8rem; color:var(--muted); margin:-6px 0 16px; font-style:italic; }

/* primary + secondary buttons */
.primary-button{
  width:100%; border:none; border-radius:var(--radius-md); cursor:pointer;
  background:var(--accent); color:#3a2708; font-family:var(--font-display);
  font-weight:900; font-size:1.05rem; letter-spacing:-.01em; padding:16px 18px;
  box-shadow:0 12px 26px rgba(229,155,47,.32); -webkit-tap-highlight-color:transparent;
}
.primary-button:disabled{ background:#e7e3d8; color:#a49f92; box-shadow:none; cursor:default; }
.ghost-button{
  width:100%; border:2px solid var(--line); border-radius:var(--radius-md);
  background:transparent; color:var(--deep); font-family:var(--font-display);
  font-weight:800; font-size:.98rem; padding:13px 18px; cursor:pointer; margin-top:10px;
}

/* optional context card (violet-zoned, one bound unit) */
.optional-panel{
  margin-top:18px; border:1.5px solid #d9d2ea; background:#faf8ff;
  border-radius:var(--radius-lg); padding:15px 15px 17px;
}
.optional-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
.optional-head h3{ margin:0; font-family:var(--font-display); font-size:1.05rem; color:#3d2f66; }
.tag{
  font-family:var(--font-display); font-size:.68rem; font-weight:800; text-transform:uppercase;
  letter-spacing:.08em; color:#6b5aa0; background:#efeaff; border-radius:20px; padding:3px 9px;
}
.optional-copy{ margin:0 0 11px; font-size:.86rem; line-height:1.35; color:#4d5a55; font-weight:700; }
.field-label{ display:block; font-family:var(--font-display); font-weight:800; font-size:.78rem; color:var(--deep); margin:0 0 5px; }
textarea#notes{
  width:100%; min-height:78px; resize:vertical; border:1.5px solid #d9d2ea; border-radius:12px;
  padding:10px 11px; font-family:var(--font-body); font-size:.92rem; color:var(--ink);
  background:#fff; line-height:1.4;
}
.zip-row{ margin-top:12px; }
input#zip{
  width:130px; border:1.5px solid #d9d2ea; border-radius:12px; padding:9px 11px;
  font-family:var(--font-body); font-size:.95rem; background:#fff;
}
.helper{ font-size:.75rem; color:var(--muted); margin-top:5px; }
textarea#notes:focus, input#zip:focus{ outline:2px solid #b7a6e6; outline-offset:1px; }

/* structured intake */
.intake-field{ margin-bottom:14px; }
.intake-hint{ font-size:.75rem; color:var(--muted); margin:0 0 7px; font-weight:600; }
.intake-text{
  width:100%; border:1.5px solid #d9d2ea; border-radius:12px; padding:10px 11px;
  font-family:var(--font-body); font-size:.92rem; color:var(--ink); background:#fff;
}
.intake-text:focus{ outline:2px solid #b7a6e6; outline-offset:1px; }
.opt-row{ display:flex; flex-wrap:wrap; gap:7px; }
.opt{
  border:1.5px solid #d9d2ea; background:#fff; color:var(--ink);
  border-radius:20px; padding:7px 13px; font-family:var(--font-body); font-size:.86rem;
  font-weight:600; cursor:pointer; user-select:none; transition:all .12s;
}
.opt:hover{ border-color:#b7a6e6; }
.opt.sel{ background:var(--deep); border-color:var(--deep); color:#fff; }
.intake-lead{ margin:2px 0 12px; font-size:.86rem; line-height:1.4; color:#4d5a55; font-weight:700; }

/* loading */
.loading-wrap{ padding:40px 20px; text-align:center; }
.clarify-card{
  background:#fff; border:1.5px solid #e4dcc9; border-radius:var(--radius-lg);
  padding:22px 20px 24px; margin-top:8px;
}
.clarify-badge{
  display:inline-block; font-family:var(--font-display); font-size:.68rem; font-weight:800;
  text-transform:uppercase; letter-spacing:.09em; color:#8a6d1f; background:#fbf1d6;
  border-radius:20px; padding:4px 11px; margin-bottom:13px;
}
.clarify-q{
  margin:0 0 8px; font-family:var(--font-display); font-size:1.28rem; line-height:1.3;
  color:var(--deep); font-weight:800;
}
.clarify-why{ margin:0 0 18px; font-size:.9rem; line-height:1.4; color:#4d5a55; font-weight:600; }
.clarify-opts{ display:flex; flex-direction:column; gap:9px; }
.clarify-opt{
  width:100%; text-align:left; border:1.5px solid #d9d2ea; background:#fff; color:var(--ink);
  border-radius:14px; padding:14px 16px; font-family:var(--font-body); font-size:1rem;
  font-weight:600; cursor:pointer; transition:all .12s;
}
.clarify-opt:hover{ border-color:var(--deep); background:#f6f4ef; }
.clarify-opt.ghost{ border-style:dashed; color:var(--muted); font-weight:600; }
.spinner{
  width:44px; height:44px; margin:0 auto 20px; border-radius:50%;
  border:4px solid var(--accent-soft); border-top-color:var(--accent);
  animation:spin 0.9s linear infinite;
}
@keyframes spin{ to{ transform:rotate(360deg); } }
.loading-msg{ font-family:var(--font-display); font-weight:800; font-size:1.05rem; color:var(--deep); }

/* consent gate */
.consent-card{
  border:2px solid var(--accent); background:var(--accent-soft);
  border-radius:var(--radius-lg); padding:18px; margin-top:6px;
}
.consent-card h2{ color:#7a4d0c; margin-top:0; }
.consent-copy{ font-size:.95rem; line-height:1.45; color:#5c4415; font-weight:700; margin:0 0 16px; }

/* result — price first */
.price-hero{
  background:var(--deep); color:#fff; border-radius:var(--radius-xl);
  padding:22px 20px 20px; box-shadow:var(--shadow); margin-bottom:16px;
}
.price-kicker{
  font-family:var(--font-display); text-transform:uppercase; letter-spacing:.13em;
  font-size:.72rem; font-weight:800; color:var(--accent); margin-bottom:10px;
}
.retail-label{ font-family:var(--font-display); font-size:.8rem; font-weight:700; color:rgba(255,255,255,.72); }
.retail-price{ font-family:var(--font-display); font-weight:900; font-size:3.1rem; line-height:1; letter-spacing:-.03em; margin:2px 0 12px; }
.wholesale-line{
  display:flex; align-items:baseline; gap:8px; padding-top:12px;
  border-top:1px solid rgba(255,255,255,.18);
}
.wholesale-label{ font-family:var(--font-display); font-size:.8rem; font-weight:700; color:rgba(255,255,255,.72); }
.wholesale-value{ font-family:var(--font-display); font-weight:900; font-size:1.35rem; }

.scenarios{ margin:0 0 18px; border-top:1px solid var(--line); padding-top:14px; }
.scenarios h3{ font-family:var(--font-display); font-size:.95rem; color:var(--deep); margin:0 0 8px; }
.scenario-row{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:6px 0; border-bottom:1px dotted var(--line); }
.scenario-cond{ font-size:.9rem; color:var(--muted); line-height:1.35; }
.scenario-val{ font-family:var(--font-display); font-weight:800; font-size:1rem; color:var(--deep); white-space:nowrap; }
.scenarios-note{ font-size:.78rem; color:var(--muted); font-style:italic; margin:8px 0 0; }

.market-strip{
  display:flex; align-items:center; gap:12px; background:var(--blue-soft);
  border-radius:var(--radius-md); padding:13px 15px; margin-bottom:16px;
}
.market-dot{ font-size:1.2rem; color:var(--blue); }
.market-text b{ font-family:var(--font-display); }

.result-section{ margin-bottom:18px; }
.result-section h3{ font-family:var(--font-display); font-size:1.05rem; color:var(--deep); margin:0 0 6px; }
.result-section p{ margin:0; font-size:.96rem; line-height:1.45; }
.confidence{ display:flex; align-items:center; gap:9px; margin-top:12px; }
.confidence-label{ font-family:var(--font-display); font-weight:800; font-size:.78rem; color:var(--muted); }
.confidence-pill{
  font-family:var(--font-display); font-weight:800; font-size:.8rem; border-radius:20px; padding:4px 12px;
}
.pill-high{ background:#dff2e8; color:var(--ok); }
.pill-mod{ background:var(--accent-soft); color:#8a5a12; }
.pill-low{ background:#f4e2e2; color:#9a3b3b; }

details.why{ margin-bottom:18px; border-top:1px solid var(--line); padding-top:12px; }
details.why summary{
  font-family:var(--font-display); font-weight:800; color:var(--deep); cursor:pointer;
  list-style:none; font-size:.95rem;
}
details.why summary::-webkit-details-marker{ display:none; }
details.why summary::after{ content:" \\203A"; }
details.why[open] summary::after{ content:" \\2304"; }
.why-item{ margin-top:12px; }
.why-item b{ font-family:var(--font-display); display:block; font-size:.9rem; color:var(--deep); margin-bottom:2px; }
.why-item span{ font-size:.9rem; line-height:1.4; color:var(--muted); }
.cant-verify{ margin-top:14px; font-size:.85rem; color:#9a3b3b; line-height:1.4; }
.cant-verify-item{ margin-top:6px; }
.cant-verify-item b{ display:block; font-size:.85rem; margin-bottom:1px; }
.cant-verify-item span{ display:block; font-size:.85rem; line-height:1.4; }

.value-only{
  margin-top:6px; padding:12px 14px; background:#f0f3ef; border-radius:var(--radius-md);
  font-size:.82rem; line-height:1.4; color:var(--muted); font-style:italic;
}

/* feedback gate */
.feedback-card{
  margin-top:18px; border:1.5px solid var(--line); background:var(--surface);
  border-radius:var(--radius-lg); padding:16px 16px 18px;
}
.feedback-card h3{ font-family:var(--font-display); font-size:1.05rem; color:var(--deep); margin:0 0 4px; }
.feedback-sub{ font-size:.82rem; color:var(--muted); margin:0 0 14px; }
.fq{ margin-bottom:14px; }
.fq .q{ font-family:var(--font-display); font-weight:800; font-size:.9rem; color:var(--ink); margin-bottom:7px; }
.chip-row{ display:flex; gap:8px; flex-wrap:wrap; }
.chip{
  border:1.5px solid var(--line); background:#fff; border-radius:20px; padding:7px 14px;
  font-family:var(--font-display); font-weight:700; font-size:.85rem; cursor:pointer; color:var(--ink);
}
.chip.sel{ background:var(--deep); color:#fff; border-color:var(--deep); }
textarea.fb-note{
  width:100%; min-height:50px; resize:vertical; border:1.5px solid var(--line);
  border-radius:12px; padding:9px 11px; font-family:var(--font-body); font-size:.9rem; margin-top:2px;
}

.error-box{
  background:#f7e6e6; border:1.5px solid #e0b4b4; border-radius:var(--radius-md);
  padding:14px 15px; color:#8a2f2f; font-size:.92rem; line-height:1.4; margin-bottom:14px; font-weight:700;
}
.limit-box{
  margin-top:20px; text-align:center; padding:22px 18px; background:var(--accent-soft);
  border-radius:var(--radius-lg); border:1.5px solid var(--accent);
}
.limit-box h3{ font-family:var(--font-display); color:#7a4d0c; margin:0 0 6px; }
.limit-box p{ font-size:.9rem; color:#5c4415; margin:0; font-weight:700; }
.count-note{ text-align:center; font-size:.78rem; color:var(--muted); margin-top:14px; }
`;

/* ---- wait-message tracks (kept lightweight; engine unchanged) ---------- */
const COMMON_MSGS = ["Reading the photos\u2026", "Checking the current market\u2026", "Pricing it out\u2026"];
const COLLECTIBLE_MSGS = [
  "Reading the photos\u2026",
  "This looks collectible \u2014 taking a closer look\u2026",
  "Searching sold comps\u2026",
  "Cross-checking the market\u2026",
  "Finalizing the estimate\u2026",
];

export default function App() {
  // photos[i] = { src, data, mediaType } or null, indexed by slot (0..4)
  const [photos, setPhotos] = useState([null, null, null, null, null]);
  const [extraVisible, setExtraVisible] = useState(0); // 0..2 extra slots revealed
  const [chooserSlot, setChooserSlot] = useState(null); // slot awaiting camera/gallery choice (mobile)
  const [notes, setNotes] = useState("");
  const [zip, setZip] = useState("");
  // Structured intake (shown after photos). All optional; assembled into notes on submit.
  const [whatIsIt, setWhatIsIt] = useState("");
  const [material, setMaterial] = useState("");   // single-select
  const [sizeText, setSizeText] = useState("");
  const [markings, setMarkings] = useState("");    // single-select
  const [condition, setCondition] = useState("");   // single-select grade
  const [damage, setDamage] = useState([]);         // multi-select defects
  const [origin, setOrigin] = useState("");

  const [phase, setPhase] = useState("capture"); // capture | loading | clarify | result | limit
  const [clarify, setClarify] = useState(null); // { jobId, klass, question, options, whyItMatters }
  // Feature B: post-result follow-up conversation
  const [followMsg, setFollowMsg] = useState("");
  const [followPhoto, setFollowPhoto] = useState(null); // {data, mediaType}
  const [followThread, setFollowThread] = useState([]); // [{role:'user'|'tool', text}]
  const [followBusy, setFollowBusy] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const currentJobRef = useRef({ jobId: null, klass: null });
  const [loadingMsg, setLoadingMsg] = useState(COMMON_MSGS[0]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [costInfo, setCostInfo] = useState(null);
  const [timing, setTiming] = useState(null);
  const [consent, setConsent] = useState(null); // { jobId, photoCount }

  const [count, setCount] = useState(0); // completed valuations this session
  const [needsFeedback, setNeedsFeedback] = useState(false);
  const [fb, setFb] = useState({ reliable: null, note: "" });

  const captureIndexRef = useRef(0);
  const cameraInputRef = useRef(null);
  const followPhotoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const msgTimer = useRef(null);
  const [dragSlot, setDragSlot] = useState(null); // slot index being dragged over (desktop)
  // Desktop = has a fine pointer + hover (mouse). Phones/tablets fail this, so DnD stays off there.
  const isDesktop = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const showCost = (() => {
    try { return new URLSearchParams(window.location.search).get("debug") === "cost"; }
    catch { return false; }
  })();

  useEffect(() => () => clearInterval(msgTimer.current), []);

  /* ---- wait-message cycling ---- */
  const startTrack = (klass) => {
    clearInterval(msgTimer.current);
    const msgs = klass === "collectible" ? COLLECTIBLE_MSGS : COMMON_MSGS;
    let i = 0;
    setLoadingMsg(msgs[0]);
    msgTimer.current = setInterval(() => {
      i = Math.min(i + 1, msgs.length - 1);
      setLoadingMsg(msgs[i]);
    }, 3500);
  };
  const stopTrack = () => clearInterval(msgTimer.current);

  /* ---- photo capture (reuses v37 client-side compression) ---- */
  const openPicker = (slotIndex, useCamera) => {
    captureIndexRef.current = slotIndex;
    const ref = useCamera ? cameraInputRef : fileInputRef;
    if (ref.current) ref.current.click();
  };

  // On mobile, tapping a slot offers camera OR gallery via a small sheet.
  // Desktop taps browse files directly (drag-drop also works).
  const onSlotTap = (slotIndex) => {
    if (isDesktop) { openPicker(slotIndex, false); return; }
    setChooserSlot(slotIndex);
  };
  const chooseSource = (useCamera) => {
    const slot = chooserSlot;
    setChooserSlot(null);
    if (slot === null) return;
    openPicker(slot, useCamera);
  };

  /* ---- desktop drag-and-drop onto a specific photo slot ---- */
  const onSlotDragOver = (slotIndex) => (e) => {
    if (!isDesktop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (dragSlot !== slotIndex) setDragSlot(slotIndex);
  };
  const onSlotDragLeave = (slotIndex) => (e) => {
    if (!isDesktop) return;
    e.preventDefault();
    setDragSlot((cur) => (cur === slotIndex ? null : cur));
  };
  const onSlotDrop = (slotIndex) => (e) => {
    if (!isDesktop) return;
    e.preventDefault();
    setDragSlot(null);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const imageFile = Array.from(files).find((f) => f.type && f.type.indexOf("image/") === 0);
    if (!imageFile) { setError("That's not an image file. Drop a JPG or PNG."); return; }
    captureIndexRef.current = slotIndex;
    handleFile([imageFile]);
  };

  const handleFile = (fileList) => {
    if (!fileList || !fileList.length) return;
    const file = fileList[0];
    const slot = captureIndexRef.current;
    const MAX_EDGE = 1024, QUALITY = 0.8;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      if (typeof dataUrl !== "string" || dataUrl.indexOf(",") === -1) {
        setError("That photo couldn't be read. Try a different image.");
        return;
      }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_EDGE || height > MAX_EDGE) {
          if (width >= height) { height = Math.round((height * MAX_EDGE) / width); width = MAX_EDGE; }
          else { width = Math.round((width * MAX_EDGE) / height); height = MAX_EDGE; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const outUrl = canvas.toDataURL("image/jpeg", QUALITY);
        const base64 = outUrl.split(",")[1];
        setPhotos((prev) => {
          const next = prev.slice();
          next[slot] = { src: outUrl, data: base64, mediaType: "image/jpeg" };
          return next;
        });
        setError(null);
      };
      img.onerror = () => setError("That photo couldn't be read. Try a different image.");
      img.src = dataUrl;
    };
    reader.onerror = () => setError("That photo couldn't be read. Try a different image.");
    reader.readAsDataURL(file);
  };

  // Read + downsize a photo for the follow-up (stores {data, mediaType}).
  const handleFollowPhoto = (fileList) => {
    if (!fileList || !fileList.length) return;
    const file = fileList[0];
    const MAX_EDGE = 1024, QUALITY = 0.8;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      if (typeof dataUrl !== "string" || dataUrl.indexOf(",") === -1) return;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_EDGE || height > MAX_EDGE) {
          if (width >= height) { height = Math.round((height * MAX_EDGE) / width); width = MAX_EDGE; }
          else { width = Math.round((width * MAX_EDGE) / height); height = MAX_EDGE; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const outUrl = canvas.toDataURL("image/jpeg", QUALITY);
        setFollowPhoto({ data: outUrl.split(",")[1], mediaType: "image/jpeg", src: outUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Clear a photo so the user can retake before evaluating.
  const deletePhoto = (slotIndex, e) => {
    if (e) e.stopPropagation();
    setPhotos((prev) => {
      const next = prev.slice();
      next[slotIndex] = null;
      return next;
    });
    setError(null);
  };

  const filledPhotos = () => photos.filter(Boolean);
  const canPrice = filledPhotos().length > 0;

  /* ---- the pipeline: upload -> start -> poll (mirrors v37 contract) ---- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const runPipeline = async ({ jobId, forceLane, clarification, priorKlass } = {}) => {
    const active = filledPhotos();
    const id = jobId || "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);

    setPhase("loading");
    setError(null);
    if (!jobId) startTrack("common"); // neutral opener until triage lands
    else startTrack(priorKlass === "collectible" ? "collectible" : "common");

    try {
      // Upload photos one at a time (only on first pass; resume reuses blobs).
      if (!jobId) {
        for (let i = 0; i < active.length; i++) {
          const up = await fetch("/.netlify/functions/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: id, index: i, data: active[i].data, mediaType: active[i].mediaType,
            }),
          });
          if (!up.ok) { fail("Couldn't upload the photos. Try again."); return; }
        }
      }

      // Assemble the structured intake + freeform notes into one clean string.
      // The user's stated identity/material/markings are the highest-value
      // signals — the backend treats a stated identity as authoritative.
      const parts = [];
      if (whatIsIt.trim()) parts.push(`What it is (user-stated): ${whatIsIt.trim()}`);
      if (material) parts.push(`Material: ${material}`);
      if (sizeText.trim()) parts.push(`Approximate size: ${sizeText.trim()}`);
      if (markings) parts.push(`Markings: ${markings}`);
      if (condition) parts.push(`Condition: ${condition}`);
      if (damage.length) parts.push(`Damage: ${damage.join(", ")}`);
      if (origin.trim()) parts.push(`Age / where acquired: ${origin.trim()}`);
      if (notes.trim()) parts.push(`Other notes: ${notes.trim()}`);
      const assembledNotes = parts.join("\n");

      const startBody = {
        jobId: id,
        photoCount: active.length,
        notes: assembledNotes,
        zip: zip.trim(),
      };
      if (forceLane) startBody.forceLane = forceLane;
      if (clarification) { startBody.clarification = clarification; startBody.priorKlass = priorKlass || null; }

      const start = await fetch("/.netlify/functions/start-valuation-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startBody),
      });
      if (start.status !== 202 && !start.ok) { fail("Couldn't start the valuation. Try again."); return; }

      // Poll
      const maxTries = 90;
      for (let i = 0; i < maxTries; i++) {
        await sleep(1500);
        let poll;
        try { poll = await fetch(`/.netlify/functions/result?jobId=${encodeURIComponent(id)}`); }
        catch { continue; }
        if (!poll.ok) continue;
        const pd = await poll.json();

        if (pd.klass) startTrack(pd.klass);
        if (pd.status === "needs_input" && pd.question) {
          stopTrack();
          setClarify({
            jobId: id,
            klass: pd.klass || "collectible",
            question: pd.question,
            options: Array.isArray(pd.options) ? pd.options : ["Just price your best guess"],
            whyItMatters: pd.whyItMatters || "",
          });
          setPhase("clarify");
          return;
        }
        if (pd.status === "done" && pd.result) {
          currentJobRef.current = { jobId: id, klass: pd.timing?.lane || "collectible" };
          setFollowThread([]);
          setFollowMsg("");
          setFollowPhoto(null);
          finish(pd);
          return;
        }
        if (pd.status === "error") {
          fail((pd.error || "The valuation couldn't be completed.") + " Try again.");
          return;
        }
      }
      fail("This is taking longer than expected. Please try again.");
    } catch (err) {
      fail(`Something went wrong: ${err.message}. Try again.`);
    }
  };

  const finish = (pd) => {
    stopTrack();
    setResult(pd.result);
    setCostInfo(pd.cost || null);
    setTiming(pd.timing || null);
    setConsent(null);
    setCount((c) => c + 1);
    // Feedback gate: required before the next valuation unlocks, and cap at FREE_LIMIT.
    setFb({ reliable: null, note: "" });
    setNeedsFeedback(true);
    setPhase("result");
  };

  const fail = (msg) => {
    stopTrack();
    setError(msg);
    setPhase("capture");
  };

  // Feature B: send a post-result follow-up (question, correction, and/or new photo).
  const sendFollowup = async () => {
    const msg = followMsg.trim();
    if (!msg && !followPhoto) return;
    if (followBusy) return;
    const job = currentJobRef.current;
    if (!job.jobId) return;

    setFollowThread((t) => [...t, { role: "user", text: msg || "(added a photo)" }]);
    setFollowBusy(true);
    setFollowMsg("");
    const photoToSend = followPhoto;
    setFollowPhoto(null);

    try {
      await fetch("/.netlify/functions/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.jobId,
          message: msg,
          newPhoto: photoToSend,
          priorResult: result,
          priorKlass: job.klass,
        }),
      });
      // Poll the same job record for the follow-up outcome.
      for (let i = 0; i < 90; i++) {
        await sleep(1500);
        let poll;
        try { poll = await fetch(`/.netlify/functions/result?jobId=${encodeURIComponent(job.jobId)}`); }
        catch { continue; }
        if (!poll.ok) continue;
        const pd = await poll.json();
        if (pd.status === "followup_done" && pd.followup) {
          const f = pd.followup;
          setFollowThread((t) => [...t, { role: "tool", text: f.reply || (f.mode === "revalue" ? "Updated the valuation." : "") }]);
          if (f.mode === "revalue" && f.result) {
            setResult(f.result); // swap in the revalued result
          }
          setFollowBusy(false);
          return;
        }
        if (pd.status === "error") {
          setFollowThread((t) => [...t, { role: "tool", text: "Sorry — something went wrong. Try again." }]);
          setFollowBusy(false);
          return;
        }
      }
      setFollowThread((t) => [...t, { role: "tool", text: "That took too long — try again." }]);
      setFollowBusy(false);
    } catch (e) {
      setFollowThread((t) => [...t, { role: "tool", text: "Couldn't send that — check your connection." }]);
      setFollowBusy(false);
    }
  };

  const startValuation = async () => {
    if (!canPrice) return;
    // Server-side cap: consume one credit before running. Count lives in
    // Blobs keyed to a device id, so clearing browser storage can't reset it.
    try {
      const r = await fetch("/.netlify/functions/usage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), action: "consume" }),
      });
      const u = await r.json();
      if (u && u.allowed === false) { setPhase("limit"); return; }
    } catch (e) {
      // If the usage service is unreachable, fail OPEN (let them value) —
      // better a rare free extra than blocking a paying tester on a hiccup.
    }
    runPipeline({});
  };

  // User answered the clarifying question → resume the SAME job with the answer.
  const answerClarify = (answer) => {
    if (!clarify) return;
    const c = clarify;
    setClarify(null);
    // "reshoot" bails back to capture without spending another call.
    if (/reshoot/i.test(answer)) { setPhase("capture"); return; }
    runPipeline({
      jobId: c.jobId,
      clarification: answer,
      priorKlass: c.klass,
    });
  };

  /* ---- reset for the next item ---- */
  const nextItem = () => {
    setPhotos([null, null, null, null, null]);
    setExtraVisible(0);
    setNotes("");
    setWhatIsIt("");
    setMaterial("");
    setSizeText("");
    setMarkings("");
    setCondition("");
    setDamage([]);
    setOrigin("");
    setResult(null);
    setError(null);
    setConsent(null);
    setClarify(null);
    setCostInfo(null);
    setTiming(null);
    setNeedsFeedback(false);
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) { /* non-fatal */ }
    if (count >= FREE_LIMIT) setPhase("limit");
    else setPhase("capture");
  };

  const submitFeedback = () => {
    // Feedback is the price of admission. POST to the server; keep a local
    // copy as a fallback so nothing is lost if the network hiccups.
    const payload = {
      reliable: fb.reliable,
      change: fb.note || "",
      item: result && result.id ? result.id : "unknown",
      version: APP_VERSION,
    };
    fetch("/.netlify/functions/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      try {
        const prev = JSON.parse(localStorage.getItem("ua_feedback") || "[]");
        prev.push({ ...payload, ts: Date.now() });
        localStorage.setItem("ua_feedback", JSON.stringify(prev));
      } catch (e) { /* non-fatal */ }
    });
    setNeedsFeedback(false);
  };

  /* ====================================================================== */

  const Header = (
    <header className="appbar">
      <div className="brand">
        <div className="brand-mark">UA</div>
        <div className="brand-name">Unfair Advantage <span className="brand-version">{APP_VERSION}</span></div>
      </div>
    </header>
  );

  const HiddenInputs = (
    <>
      <input
        ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={fileInputRef} type="file" accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files); e.target.value = ""; }}
      />
    </>
  );

  return (
    <div className="ua-app">
      <style>{CSS}</style>
      {Header}
      {HiddenInputs}

      {/* -------------------- CAPTURE -------------------- */}
      {phase === "capture" && (
        <div className="screen" style={{ paddingBottom: canPrice ? 88 : undefined }}>
          {chooserSlot !== null && (
            <div className="chooser-backdrop" onClick={() => setChooserSlot(null)}>
              <div className="chooser-sheet" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="chooser-opt" onClick={() => chooseSource(true)}>
                  Take a photo
                </button>
                <button type="button" className="chooser-opt" onClick={() => chooseSource(false)}>
                  Choose from gallery
                </button>
                <button type="button" className="chooser-cancel" onClick={() => setChooserSlot(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="tagline">
            <span className="tagline-lead">AI-Powered · Real-Time Market Research</span>
            <span className="tagline-sub">Price range estimates from real sales data. Knowledge is power.</span>
          </div>
          <h2>Photograph the item.</h2>
          <p className="lead">Three quick views give the strongest price estimate. Add up to 5 photos.</p>

          {error && <div className="error-box">{error}</div>}

          <section className="photo-row">
            {SLOTS.concat(EXTRA_SLOTS.slice(0, extraVisible)).map((slot, i) => {
              const filled = !!photos[i];
              return (
                <div
                  key={i}
                  className={"photo-card" + (filled ? " filled" : "") + (dragSlot === i ? " dragging" : "")}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!filled) onSlotTap(i); }}
                  onDragOver={onSlotDragOver(i)}
                  onDragLeave={onSlotDragLeave(i)}
                  onDrop={onSlotDrop(i)}
                >
                  {filled && (
                    <div className="thumb" style={{ backgroundImage: `url(${photos[i].src})` }} />
                  )}
                  {filled && (
                    <span
                      className="photo-delete"
                      role="button"
                      aria-label="Remove photo"
                      onClick={(e) => deletePhoto(i, e)}
                    >{"\u00d7"}</span>
                  )}
                  <div className="photo-number">{i + 1}</div>
                  <div className="photo-check">{"\u2713"}</div>

                  {!filled && (
                    <div className="photo-add">
                      <span className="photo-add-plus">+</span>
                      <span className="photo-add-text">Add photo</span>
                      <span className="photo-add-sub">camera or gallery</span>
                    </div>
                  )}

                  <div className="photo-copy">
                    <span className="photo-label">{slot.label}</span>
                    <span className="photo-instruction">{slot.instruction}</span>
                  </div>
                </div>
              );
            })}
          </section>
          {extraVisible < EXTRA_SLOTS.length && (
            <button
              type="button"
              className="add-photo-btn"
              onClick={() => setExtraVisible((n) => Math.min(n + 1, EXTRA_SLOTS.length))}
            >
              + Add another photo
            </button>
          )}
          <div className="scale-hint">
            {isDesktop
              ? "Click a box to add a photo, or drag an image onto it. Add something for scale if the size isn't obvious."
              : "Tap a box to add a photo (camera or gallery). Add something for scale if the size isn't obvious."}
          </div>

          <section className="optional-panel">
            <div className="optional-head">
              <h3>Add what you know, skip the rest.</h3>
              <span className="tag">Optional</span>
            </div>
            <p className="intake-lead">
              More detail means sharper results.
            </p>

            <div className="intake-field">
              <label className="field-label">What is it?</label>
              <input
                className="intake-text" type="text" value={whatIsIt}
                onChange={(e) => setWhatIsIt(e.target.value)}
                placeholder="e.g. vase, lamp, chair, figurine"
              />
            </div>

            <div className="intake-field">
              <label className="field-label">Material</label>
              <div className="opt-row">
                {["Glass", "Crystal", "Ceramic/Pottery", "Metal", "Wood", "Plastic", "Not sure"].map((m) => (
                  <span key={m} className={"opt" + (material === m ? " sel" : "")}
                    onClick={() => setMaterial(material === m ? "" : m)}>{m}</span>
                ))}
              </div>
            </div>

            <div className="intake-field">
              <label className="field-label">Approximate size</label>
              <p className="intake-hint">Even a rough answer helps.</p>
              <input
                className="intake-text" type="text" value={sizeText}
                onChange={(e) => setSizeText(e.target.value)}
                placeholder="Rough measurements, or compare to a known item like a soda can, softball, or quarter"
              />
            </div>

            <div className="intake-field">
              <label className="field-label">Any maker's mark, signature, or label?</label>
              <div className="opt-row">
                {["Yes", "No", "I don't know"].map((m) => (
                  <span key={m} className={"opt" + (markings === m ? " sel" : "")}
                    onClick={() => setMarkings(markings === m ? "" : m)}>{m}</span>
                ))}
              </div>
            </div>

            <div className="intake-field">
              <label className="field-label">Condition</label>
              <div className="opt-row">
                {["New", "Like New", "Good", "Fair", "Poor"].map((c) => (
                  <span key={c} className={"opt" + (condition === c ? " sel" : "")}
                    onClick={() => setCondition(condition === c ? "" : c)}>{c}</span>
                ))}
              </div>
            </div>

            <div className="intake-field">
              <label className="field-label">Damage, if any <span style={{ fontWeight: 600, opacity: .6 }}>(skip if none)</span></label>
              <div className="opt-row">
                {["Chip", "Crack", "Scratches/wear", "Crazing", "Repair", "Other"].map((d) => {
                  const on = damage.includes(d);
                  return (
                    <span key={d} className={"opt" + (on ? " sel" : "")}
                      onClick={() => setDamage((prev) => on ? prev.filter((x) => x !== d) : [...prev, d])}>{d}</span>
                  );
                })}
              </div>
            </div>

            <div className="intake-field">
              <label className="field-label">Age and/or where you got it</label>
              <input
                className="intake-text" type="text" value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. inherited, thrift store, had it since the 70s"
              />
            </div>

            <label className="field-label" htmlFor="notes">Anything else</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={"e.g. set of 6, has a chip inside, came with original box"}
            />
            <div className="zip-row">
              <label className="field-label" htmlFor="zip">ZIP code</label>
              <input
                id="zip" type="text" inputMode="numeric" value={zip}
                onChange={(e) => setZip(e.target.value)} placeholder="e.g. 12345"
              />
              <div className="helper">Optional &mdash; helps price local items.</div>
            </div>
          </section>

          {count > 0 && (
            <div className="count-note">
              {FREE_LIMIT - count > 0
                ? `${FREE_LIMIT - count} free valuation${FREE_LIMIT - count === 1 ? "" : "s"} left`
                : "Free valuations used"}
            </div>
          )}

          {canPrice && (
            <div className="sticky-price-bar">
              <button className="primary-button" onClick={startValuation} style={{ margin: 0 }}>
                Price this item
              </button>
            </div>
          )}
        </div>
      )}

      {/* -------------------- LOADING -------------------- */}
      {phase === "loading" && (
        <div className="screen">
          <div className="loading-wrap">
            <div className="spinner" />
            <div className="loading-msg">{loadingMsg}</div>
          </div>
        </div>
      )}

      {/* -------------------- CLARIFY (tool has one question) -------------------- */}
      {phase === "clarify" && clarify && (
        <div className="screen">
          <section className="clarify-card">
            <div className="clarify-badge">One quick question</div>
            <h2 className="clarify-q">{clarify.question}</h2>
            {clarify.whyItMatters && (
              <p className="clarify-why">{clarify.whyItMatters}</p>
            )}
            <div className="clarify-opts">
              {clarify.options.map((opt, i) => (
                <button
                  key={i}
                  className={"clarify-opt" + (/best guess/i.test(opt) ? " ghost" : "")}
                  onClick={() => answerClarify(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}


      {/* -------------------- RESULT -------------------- */}
      {phase === "result" && result && (
        <div className="screen" style={{ paddingBottom: 84 }}>
          <ResultView result={result} />

          {showCost && (costInfo || timing) && (
            <div className="value-only" style={{ background: "#eef4f0" }}>
              {costInfo && <div>cost: ${Number(costInfo.total).toFixed(4)} &middot; in {costInfo.inputTokens} / out {costInfo.outputTokens} &middot; {costInfo.searches} search{costInfo.searches === 1 ? "" : "es"}</div>}
              {timing && <div>time: {(timing.totalMs / 1000).toFixed(1)}s total &middot; triage {(timing.triageMs / 1000).toFixed(1)}s &middot; valuation {(timing.valuationMs / 1000).toFixed(1)}s &middot; lane {timing.lane}</div>}
            </div>
          )}

          {followOpen && (
            <div className="followup">
              <div className="followup-title">Ask a question or add info</div>
              {followThread.length > 0 && (
                <div className="followup-thread">
                  {followThread.map((m, i) => (
                    <div key={i} className={"fu-msg " + (m.role === "user" ? "fu-user" : "fu-tool")}>
                      {m.text}
                    </div>
                  ))}
                  {followBusy && <div className="fu-msg fu-tool fu-typing">Thinking…</div>}
                </div>
              )}
              {followPhoto && (
                <div className="fu-photo-chip">
                  <img src={followPhoto.src} alt="added" />
                  <button onClick={() => setFollowPhoto(null)}>×</button>
                </div>
              )}
              <div className="followup-input">
                <input
                  type="text"
                  className="fu-text"
                  value={followMsg}
                  onChange={(e) => setFollowMsg(e.target.value)}
                  placeholder={"e.g. it's signed Engstrom '67 — or, why so low?"}
                  onKeyDown={(e) => { if (e.key === "Enter") sendFollowup(); }}
                  disabled={followBusy}
                  autoFocus
                />
                <button className="fu-photo-btn" onClick={() => followPhotoInputRef.current?.click()} disabled={followBusy} title="Add a photo">📷</button>
                <button className="fu-send" onClick={sendFollowup} disabled={followBusy || (!followMsg.trim() && !followPhoto)}>Send</button>
              </div>
              <input
                ref={followPhotoInputRef} type="file" accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFollowPhoto(e.target.files)}
              />
            </div>
          )}

          {needsFeedback ? (
            <FeedbackGate fb={fb} setFb={setFb} onSubmit={submitFeedback} />
          ) : (
            <div className="sticky-price-bar sticky-dual">
              <button
                className={"dual-btn dual-ask" + (followOpen ? " active" : "")}
                onClick={() => setFollowOpen((v) => !v)}
              >
                {followOpen ? "Close" : "Ask or add info"}
              </button>
              <button className="dual-btn dual-next" onClick={nextItem}>
                {count >= FREE_LIMIT ? "Done" : "Value another"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* -------------------- LIMIT -------------------- */}
      {phase === "limit" && (
        <div className="screen">
          <div className="limit-box">
            <h3>You've used your free valuations.</h3>
            <p>Thanks for testing Unfair Advantage. Your feedback on each one has been saved.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Result subcomponent ------------------------- */
function ResultView({ result }) {
  const conf = (result.confidence || "").toLowerCase();
  const pillClass = conf.indexOf("high") === 0 ? "pill-high" : conf.indexOf("low") === 0 ? "pill-low" : "pill-mod";
  const confText =
    conf.indexOf("high") === 0 ? "High confidence" :
    conf.indexOf("low") === 0 ? "Low confidence" : "Moderate confidence";

  const retail = result.value || "\u2014";
  const wholesale = result.walkAway || result.wholesale || "\u2014";
  const reasoning = Array.isArray(result.reasoning) ? result.reasoning : [];
  const cantVerify = Array.isArray(result.cantVerify) ? result.cantVerify : [];
  const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];

  // "Best market" is derived from itemType when present (Local / Collectible / SpecificBuyer).
  const marketMap = {
    Local: "Local buyers \u2014 Facebook Marketplace, yard sale, local pickup",
    Collectible: "Collector market \u2014 eBay, specialist buyers, auction",
    SpecificBuyer: "A specific buyer \u2014 this sells best to the right person",
  };
  const market = marketMap[result.itemType];

  return (
    <>
      <section className="price-hero">
        <div className="price-kicker">Estimated value</div>
        <div className="retail-label">Retail range</div>
        <div className="retail-price">{retail}</div>
        <div className="wholesale-line">
          <span className="wholesale-label">Wholesale (what to pay)</span>
          <span className="wholesale-value">{wholesale}</span>
        </div>
      </section>

      {market && (
        <section className="market-strip">
          <div className="market-dot">{"\u25CE"}</div>
          <div className="market-text"><b>Best market:</b> {market}</div>
        </section>
      )}

      <section className="result-section">
        <h3>What it is</h3>
        <p>{result.id || "Item"}</p>
        <div className="confidence">
          <span className="confidence-label">Confidence</span>
          <span className={"confidence-pill " + pillClass}>{confText}</span>
        </div>
      </section>

      {scenarios.length > 0 && (
        <section className="scenarios">
          <h3>What changes the price</h3>
          {scenarios.map((sc, i) => {
            const raw = (sc.condition || "").trim();
            // Present each as a conditional ("If ...") so it never reads as a
            // finding the tool actually made. Don't double-prefix if the model
            // already phrased it with "if".
            const cond = /^if\b/i.test(raw) ? raw : "If " + raw.charAt(0).toLowerCase() + raw.slice(1);
            return (
              <div className="scenario-row" key={i}>
                <div className="scenario-cond">{cond}</div>
                <div className="scenario-val">{sc.value || "\u2014"}</div>
              </div>
            );
          })}
          <p className="scenarios-note">Confirm the condition above to narrow the range.</p>
        </section>
      )}

      {reasoning.length > 0 && (
        <details className="why" open>
          <summary>Why this price</summary>
          {reasoning.map((r, i) => (
            <div className="why-item" key={i}>
              {r.point && <b>{r.point}</b>}
              {r.detail && <span>{r.detail}</span>}
            </div>
          ))}
          {cantVerify.length > 0 && (
            <div className="cant-verify">
              <b>Couldn't verify:</b>
              {cantVerify.map((c, i) => (
                <div className="cant-verify-item" key={i}>
                  {typeof c === "string" ? (
                    <span>{c}</span>
                  ) : (
                    <>
                      {c.point && <b>{c.point}</b>}
                      {c.detail && <span>{c.detail}</span>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      )}

      <div className="value-only">
        This screen reports market value only. The purchase, sale, or keep decision
        stays entirely with you.
      </div>
    </>
  );
}

/* ------------------------- Feedback gate ------------------------- */
function FeedbackGate({ fb, setFb, onSubmit }) {
  const ready = fb.reliable !== null;
  const pick = (k, v) => setFb((p) => ({ ...p, [k]: v }));

  return (
    <div className="feedback-card">
      <h3>How's the tool working?</h3>
      <p className="feedback-sub">Answering unlocks your next valuation.</p>

      <div className="fq">
        <div className="q">Does the price look about right?</div>
        <div className="chip-row">
          {["Yes", "Not sure", "No"].map((v) => (
            <button key={v} className={"chip" + (fb.reliable === v ? " sel" : "")} onClick={() => pick("reliable", v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="fq">
        <div className="q">What would you change about the tool? <span style={{ fontWeight: 400, color: "#8a938f" }}>(optional)</span></div>
        <textarea className="fb-note" value={fb.note} onChange={(e) => setFb((p) => ({ ...p, note: e.target.value }))} placeholder={"Leave blank if nothing"} />
      </div>

      <button className="primary-button" disabled={!ready} onClick={onSubmit}>
        Submit &amp; continue
      </button>
    </div>
  );
}
