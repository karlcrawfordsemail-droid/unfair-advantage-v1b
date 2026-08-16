import React, { useEffect, useRef, useState } from "react";

// App version — bump on every deploy so the running site shows which build is live.
const APP_VERSION = "v1B.2";

/* ============================================================================
   UNFAIR ADVANTAGE — v1B
   Front door rebuilt on the ChatGPT visual skin, wired to the live v37 engine.
   The valuation engine (Opus triage -> consent gate -> Sonnet valuation) is
   UNCHANGED. This file only replaces the input UX and the result display.

   Displayed fields: retail range (value), wholesale, id, confidence, reasoning.
   NOT displayed: buy/sell verdict, listPrice, walkAway, advice.
   ========================================================================== */

const MAX_PHOTOS = 3;
const FREE_LIMIT = 5; // free valuations before feedback is required to continue

// The three capture slots, in order. Labels/copy are the settled v1B wording.
const SLOTS = [
  { label: "Overall", instruction: "The whole item" },
  { label: "Underside", instruction: "Maker's mark, signature, or label" },
  { label: "More views", instruction: "Especially any damage or chips" },
];

/* ---- design tokens (from the approved ChatGPT skin) --------------------- */
const CSS = `
:root{
  --page:#f2f3ef; --surface:#fffdf8; --ink:#18201d; --muted:#4d5a55;
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
  background:
    radial-gradient(circle at top left, rgba(229,155,47,.09), transparent 26rem),
    linear-gradient(180deg,#f6f7f3 0%, var(--page) 100%);
}
.ua-app{ max-width:520px; margin:0 auto; min-height:100%; display:flex; flex-direction:column; }
.appbar{
  background:var(--deep); color:#fff; padding:18px 18px 15px;
  font-family:var(--font-display); border-bottom:4px solid var(--accent);
  position:sticky; top:0; z-index:10;
}
.brand{ display:flex; align-items:center; gap:10px; }
.brand-mark{
  width:28px; height:28px; border-radius:9px; display:inline-grid; place-items:center;
  background:var(--accent); color:#142b25; font-size:.88rem; font-weight:900;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.32); font-family:var(--font-display);
}
.brand-name{ font-size:1.08rem; font-weight:900; letter-spacing:-.02em; }
.brand-version{ font-size:.7rem; font-weight:600; opacity:.55; letter-spacing:0; margin-left:2px; }
.screen{ padding:20px 16px 28px; flex:1; }
.screen h2{
  font-family:var(--font-display); font-size:1.6rem; line-height:1.08;
  letter-spacing:-.035em; color:var(--deep); margin:0 0 7px;
}
.lead{ margin:0 0 17px; font-size:.98rem; line-height:1.4; color:var(--muted); font-weight:700; }

/* capture slots */
.photo-row{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:16px; }
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

/* loading */
.loading-wrap{ padding:40px 20px; text-align:center; }
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
  // photos[i] = { src, data, mediaType } or null, indexed by slot (0..2)
  const [photos, setPhotos] = useState([null, null, null]);
  const [notes, setNotes] = useState("");
  const [zip, setZip] = useState("");

  const [phase, setPhase] = useState("capture"); // capture | loading | consent | result | limit
  const [loadingMsg, setLoadingMsg] = useState(COMMON_MSGS[0]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [costInfo, setCostInfo] = useState(null);
  const [timing, setTiming] = useState(null);
  const [consent, setConsent] = useState(null); // { jobId, photoCount }

  const [count, setCount] = useState(0); // completed valuations this session
  const [needsFeedback, setNeedsFeedback] = useState(false);
  const [fb, setFb] = useState({ reliable: null, fast: null, note: "" });

  const captureIndexRef = useRef(0);
  const cameraInputRef = useRef(null);
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

  const filledPhotos = () => photos.filter(Boolean);
  const canPrice = filledPhotos().length > 0;

  /* ---- the pipeline: upload -> start -> poll (mirrors v37 contract) ---- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const runPipeline = async ({ jobId, forceLane } = {}) => {
    const active = filledPhotos();
    const id = jobId || "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);

    setPhase("loading");
    setError(null);
    if (!jobId) startTrack("common"); // neutral opener until triage lands

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

      const startBody = {
        jobId: id,
        photoCount: active.length,
        notes: notes.trim(),
        zip: zip.trim(),
      };
      if (forceLane) startBody.forceLane = forceLane;

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

        // Consent gate: triage thinks collectible and no lane forced yet.
        if (pd.status === "awaiting_consent") {
          stopTrack();
          setConsent({ jobId: id, photoCount: active.length });
          setPhase("consent");
          return;
        }
        if (pd.klass) startTrack(pd.klass);
        if (pd.status === "done" && pd.result) {
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
    setFb({ reliable: null, fast: null, note: "" });
    setNeedsFeedback(true);
    setPhase("result");
  };

  const fail = (msg) => {
    stopTrack();
    setError(msg);
    setPhase("capture");
  };

  const startValuation = () => { if (canPrice) runPipeline({}); };
  const resumeWithLane = (lane) => {
    if (!consent) return;
    runPipeline({ jobId: consent.jobId, forceLane: lane });
  };

  /* ---- reset for the next item ---- */
  const nextItem = () => {
    setPhotos([null, null, null]);
    setNotes("");
    setResult(null);
    setError(null);
    setConsent(null);
    setCostInfo(null);
    setTiming(null);
    setNeedsFeedback(false);
    if (count >= FREE_LIMIT) setPhase("limit");
    else setPhase("capture");
  };

  const submitFeedback = () => {
    // Feedback is the price of admission. Recorded client-side for now; the
    // payload shape is ready to POST to a collector endpoint when one exists.
    const payload = { ...fb, item: result && result.id ? result.id : "unknown", ts: Date.now() };
    try {
      const prev = JSON.parse(localStorage.getItem("ua_feedback") || "[]");
      prev.push(payload);
      localStorage.setItem("ua_feedback", JSON.stringify(prev));
    } catch (e) { /* storage may be unavailable; non-fatal */ }
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
        <div className="screen">
          <h2>Photograph the item.</h2>
          <p className="lead">Three quick views give the strongest price estimate. Fill any you can.</p>

          {error && <div className="error-box">{error}</div>}

          <section className="photo-row">
            {SLOTS.map((slot, i) => {
              const filled = !!photos[i];
              return (
                <button
                  key={i}
                  type="button"
                  className={"photo-card" + (filled ? " filled" : "") + (dragSlot === i ? " dragging" : "")}
                  onClick={() => openPicker(i, !isDesktop)}
                  onDragOver={onSlotDragOver(i)}
                  onDragLeave={onSlotDragLeave(i)}
                  onDrop={onSlotDrop(i)}
                >
                  {filled && (
                    <div className="thumb" style={{ backgroundImage: `url(${photos[i].src})` }} />
                  )}
                  <div className="photo-number">{i + 1}</div>
                  <div className="photo-check">{"\u2713"}</div>
                  {!filled && <div className="empty-icon" aria-hidden="true" />}
                  <div className="photo-copy">
                    <span className="photo-label">{slot.label}</span>
                    <span className="photo-instruction">{slot.instruction}</span>
                  </div>
                </button>
              );
            })}
          </section>
          <div className="scale-hint">
            {isDesktop
              ? "Click a box to browse, or drag an image onto it. Add something for scale if the size isn't obvious."
              : "Tap a box to use the camera. Add something for scale if the size isn't obvious."}
          </div>

          <button className="primary-button" disabled={!canPrice} onClick={startValuation}>
            Price this item
          </button>
          <button
            className="ghost-button"
            onClick={() => openPicker(captureIndexRef.current, false)}
            style={{ display: canPrice ? "block" : "none" }}
          >
            Add from photo library instead
          </button>

          <section className="optional-panel">
            <div className="optional-head">
              <h3>Add what you know</h3>
              <span className="tag">Optional</span>
            </div>
            <p className="optional-copy">
              Anything the photos can't show &mdash; where it came from, a mark you couldn't
              capture, or how it works.
            </p>
            <label className="field-label" htmlFor="notes">Extra details</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={"Came from a 1940s estate\nPlays music when wound\nStamped mark I couldn't get a clear photo of"}
            />
            <div className="zip-row">
              <label className="field-label" htmlFor="zip">ZIP code</label>
              <input
                id="zip" type="text" inputMode="numeric" value={zip}
                onChange={(e) => setZip(e.target.value)} placeholder="37412"
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

      {/* -------------------- CONSENT GATE -------------------- */}
      {phase === "consent" && (
        <div className="screen">
          <div className="consent-card">
            <h2>This might be collectible.</h2>
            <p className="consent-copy">
              A quick look suggests this could be worth more than an everyday item.
              A deeper search of sold listings takes a little longer but gives a
              far more reliable number on pieces like this.
            </p>
            <button className="primary-button" onClick={() => resumeWithLane("collectible")}>
              Do the deeper search
            </button>
            <button className="ghost-button" onClick={() => resumeWithLane("common")}>
              Just give me a quick estimate
            </button>
          </div>
        </div>
      )}

      {/* -------------------- RESULT -------------------- */}
      {phase === "result" && result && (
        <div className="screen">
          <ResultView result={result} />

          {showCost && (costInfo || timing) && (
            <div className="value-only" style={{ background: "#eef4f0" }}>
              {costInfo && <div>cost: ${Number(costInfo.total).toFixed(4)} &middot; in {costInfo.inputTokens} / out {costInfo.outputTokens} &middot; {costInfo.searches} search{costInfo.searches === 1 ? "" : "es"}</div>}
              {timing && <div>time: {(timing.totalMs / 1000).toFixed(1)}s total &middot; triage {(timing.triageMs / 1000).toFixed(1)}s &middot; valuation {(timing.valuationMs / 1000).toFixed(1)}s &middot; lane {timing.lane}</div>}
            </div>
          )}

          {needsFeedback ? (
            <FeedbackGate fb={fb} setFb={setFb} onSubmit={submitFeedback} />
          ) : (
            <button className="primary-button" style={{ marginTop: 18 }} onClick={nextItem}>
              {count >= FREE_LIMIT ? "That's all your free valuations" : "Value another item"}
            </button>
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
  const wholesale = result.wholesale || "\u2014";
  const reasoning = Array.isArray(result.reasoning) ? result.reasoning : [];
  const cantVerify = Array.isArray(result.cantVerify) ? result.cantVerify : [];

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
  const ready = fb.reliable !== null && fb.fast !== null;
  const pick = (k, v) => setFb((p) => ({ ...p, [k]: v }));

  return (
    <div className="feedback-card">
      <h3>Two quick questions</h3>
      <p className="feedback-sub">Answering unlocks your next valuation.</p>

      <div className="fq">
        <div className="q">Was this price reliable enough to act on?</div>
        <div className="chip-row">
          {["Yes", "Not sure", "No"].map((v) => (
            <button key={v} className={"chip" + (fb.reliable === v ? " sel" : "")} onClick={() => pick("reliable", v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="fq">
        <div className="q">Fast enough to use at a sale?</div>
        <div className="chip-row">
          {["Yes", "No"].map((v) => (
            <button key={v} className={"chip" + (fb.fast === v ? " sel" : "")} onClick={() => pick("fast", v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="fq">
        <div className="q">Anything to add? <span style={{ fontWeight: 400, color: "#8a938f" }}>(optional)</span></div>
        <textarea className="fb-note" value={fb.note} onChange={(e) => setFb((p) => ({ ...p, note: e.target.value }))} placeholder={"What was right or wrong\u2026"} />
      </div>

      <button className="primary-button" disabled={!ready} onClick={onSubmit}>
        Submit &amp; continue
      </button>
    </div>
  );
}
