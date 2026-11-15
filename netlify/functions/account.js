// Account actions for a signed-in person.
// POST { token, action }
//   action "checkout" -> { url }  Stripe payment page for the Basic plan
//   action "manage"   -> { url }  Stripe page to cancel or change the card
//   action "signout"  -> { ok }
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_BASIC (price_...).
import { getStore } from "@netlify/blobs";
import { emailFromToken, getJSON, accountKey, subscriptionActive } from "../lib/allowance.js";
import { stripe } from "../lib/stripe.js";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { token, action } = await req.json();
    const email = await emailFromToken(token);
    if (!email) return json({ error: "Please sign in again.", signedOut: true }, 401);
    const origin = new URL(req.url).origin;

    if (action === "signout") {
      await getStore({ name: "sessions", consistency: "strong" }).delete("s_" + String(token).replace(/[^a-f0-9]/g, ""));
      return json({ ok: true });
    }

    const acct = (await getJSON(getStore({ name: "accounts", consistency: "strong" }), accountKey(email))) || { email };

    if (action === "checkout") {
      if (subscriptionActive(acct)) return json({ error: "You already have a subscription." }, 400);
      if (!process.env.STRIPE_PRICE_BASIC) return json({ error: "Payments aren't set up yet." }, 500);
      const params = {
        mode: "subscription",
        line_items: { 0: { price: process.env.STRIPE_PRICE_BASIC, quantity: 1 } },
        success_url: origin + "/?checkout=success",
        cancel_url: origin + "/?checkout=cancel",
        client_reference_id: email,
        metadata: { email },
        subscription_data: { metadata: { email } },
      };
      if (acct.customerId) params.customer = acct.customerId;
      else params.customer_email = email;
      const session = await stripe("POST", "/checkout/sessions", params);
      return json({ url: session.url });
    }

    if (action === "manage") {
      if (!acct.customerId) return json({ error: "No subscription found for this email." }, 400);
      const portal = await stripe("POST", "/billing_portal/sessions", { customer: acct.customerId, return_url: origin + "/" });
      return json({ url: portal.url });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.log("account error", String(e));
    return json({ error: "Something went wrong. Try again." }, 500);
  }
};
