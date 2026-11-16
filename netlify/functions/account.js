// Account actions for a signed-in person.
// POST { token, action }
//   action "checkout", plan "basic"|"pro"|"pack10" -> { url }  Stripe payment page
//   action "manage"   -> { url }  Stripe page to cancel or change the card
//   action "signout"  -> { ok }
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_PRICE_PACK10 (price_...).
import { getStore } from "@netlify/blobs";
import { emailFromToken, getJSON, accountKey, subscriptionActive } from "../lib/allowance.js";
import { stripe } from "../lib/stripe.js";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { token, action, plan } = await req.json();
    const email = await emailFromToken(token);
    if (!email) return json({ error: "Please sign in again.", signedOut: true }, 401);
    const origin = new URL(req.url).origin;

    if (action === "signout") {
      await getStore({ name: "sessions", consistency: "strong" }).delete("s_" + String(token).replace(/[^a-f0-9]/g, ""));
      return json({ ok: true });
    }

    const acct = (await getJSON(getStore({ name: "accounts", consistency: "strong" }), accountKey(email))) || { email };

    if (action === "checkout") {
      const which = plan === "pro" || plan === "pack10" ? plan : "basic";
      const price = which === "pro" ? process.env.STRIPE_PRICE_PRO
        : which === "pack10" ? process.env.STRIPE_PRICE_PACK10 : process.env.STRIPE_PRICE_BASIC;
      if (!price) return json({ error: "That option isn't available yet." }, 500);
      if (which !== "pack10" && subscriptionActive(acct)) {
        return json({ error: "You already have a subscription. Use Manage subscription to change it." }, 400);
      }
      const params = {
        mode: which === "pack10" ? "payment" : "subscription",
        line_items: { 0: { price, quantity: 1 } },
        success_url: origin + "/?checkout=success&kind=" + which,
        cancel_url: origin + "/?checkout=cancel",
        client_reference_id: email,
        metadata: { email, kind: which },
      };
      if (which !== "pack10") params.subscription_data = { metadata: { email } };
      if (acct.customerId) params.customer = acct.customerId;
      else if (which === "pack10") { params.customer_email = email; params.customer_creation = "always"; }
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
