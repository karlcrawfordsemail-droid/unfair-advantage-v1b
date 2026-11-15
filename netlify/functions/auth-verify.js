// Step 2 of sign-in: checks the 6-digit code and returns a session token.
// POST { email, code }  ->  { token, email }  or  { error }
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { cleanEmail, getJSON, accountKey, hashCode } from "../lib/allowance.js";

const MAX_ATTEMPTS = 5;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { email: raw, code: rawCode } = await req.json();
    const email = cleanEmail(raw);
    const code = String(rawCode || "").replace(/\D/g, "");
    if (!email || code.length !== 6) return json({ error: "Enter the 6-digit code from the email." }, 400);

    const store = getStore({ name: "auth-codes", consistency: "strong" });
    const key = "e_" + email.replace(/[^a-z0-9@._+-]/g, "");
    const rec = await getJSON(store, key);
    if (!rec || !rec.codeHash || Date.now() > rec.expires) {
      return json({ error: "That code has expired. Tap \"Send a new code\"." }, 400);
    }
    if (rec.attempts >= MAX_ATTEMPTS) {
      return json({ error: "Too many wrong tries. Tap \"Send a new code\"." }, 400);
    }
    const ok = crypto.timingSafeEqual(Buffer.from(rec.codeHash), Buffer.from(hashCode(email, code)));
    if (!ok) {
      await store.setJSON(key, { ...rec, attempts: rec.attempts + 1 });
      return json({ error: "That code doesn't match. Check the email and try again." }, 400);
    }
    // Code used: clear it (keep the send history for the hourly limit).
    await store.setJSON(key, { sends: rec.sends || [] });

    const accounts = getStore({ name: "accounts", consistency: "strong" });
    const aKey = accountKey(email);
    const acct = await getJSON(accounts, aKey);
    if (!acct) await accounts.setJSON(aKey, { email, created: new Date().toISOString(), freeUsed: 0 });

    const token = crypto.randomBytes(24).toString("hex");
    await getStore({ name: "sessions", consistency: "strong" }).setJSON("s_" + token, { email, created: new Date().toISOString() });
    return json({ token, email });
  } catch (e) {
    return json({ error: "Couldn't check the code. Try again." }, 500);
  }
};
