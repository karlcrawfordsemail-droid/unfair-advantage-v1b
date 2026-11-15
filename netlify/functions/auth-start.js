// Step 1 of sign-in: emails a 6-digit code.
// POST { email }  ->  { ok: true }  or  { error }
// Env: RESEND_API_KEY (required), RESEND_FROM (optional; until the domain is
// verified in Resend, leave it unset to send from Resend's test address).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { cleanEmail, getJSON, hashCode } from "../lib/allowance.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { email: raw } = await req.json();
    const email = cleanEmail(raw);
    if (!email) return json({ error: "Enter a valid email address." }, 400);
    if (!process.env.RESEND_API_KEY) return json({ error: "Sign-in isn't set up yet." }, 500);

    const store = getStore({ name: "auth-codes", consistency: "strong" });
    const key = "e_" + email.replace(/[^a-z0-9@._+-]/g, "");
    const prev = (await getJSON(store, key)) || {};
    const recent = (prev.sends || []).filter((t) => Date.now() - t < 60 * 60 * 1000);
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      return json({ error: "Too many codes requested. Wait an hour and try again." }, 429);
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const from = process.env.RESEND_FROM || "Unfair Advantage <onboarding@resend.dev>";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Your sign-in code: ${code}`,
        text: `Your Unfair Advantage sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for this, ignore this email.`,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.log("Resend error", r.status, detail.slice(0, 500));
      return json({ error: "Couldn't send the code. Check the email address and try again." }, 502);
    }

    await store.setJSON(key, {
      codeHash: hashCode(email, code),
      expires: Date.now() + CODE_TTL_MS,
      attempts: 0,
      sends: [...recent, Date.now()],
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: "Couldn't send the code. Try again." }, 500);
  }
};
