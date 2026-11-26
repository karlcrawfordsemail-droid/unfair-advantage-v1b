// Account actions for a signed-in person.
// POST { token, action }
//   action "checkout", plan "basic"|"pro"|"pack10" -> { url }  Stripe payment page
//   action "switch",   plan "basic"|"pro"           -> { ok }  change the active sub, prorated
//   action "cancel"                                 -> { ok }  cancel at period end
//   action "resume"                                 -> { ok }  undo a pending cancellation
//   action "manage"   -> { url }  Stripe portal (card updates only now)
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

    // Change the active subscription to the other tier, in-app and prorated.
    if (action === "switch") {
      const target = plan === "pro" ? "pro" : "basic";
      if (!subscriptionActive(acct) || !acct.subscriptionId) return json({ error: "No active subscription to change." }, 400);
      if (acct.plan === target) return json({ error: `You're already on ${target === "pro" ? "Pro" : "Basic"}.` }, 400);
      const newPrice = target === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_BASIC;
      if (!newPrice) return json({ error: "That plan isn't available yet." }, 500);
      const sub = await stripe("GET", "/subscriptions/" + acct.subscriptionId);
      const itemId = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].id;
      if (!itemId) return json({ error: "Couldn't read your subscription. Try again." }, 500);
      await stripe("POST", "/subscriptions/" + acct.subscriptionId, {
        items: [{ id: itemId, price: newPrice }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
        metadata: { email },
      });
      // Reflect right away; the customer.subscription.updated webhook also records it.
      await getStore({ name: "accounts", consistency: "strong" }).setJSON(accountKey(email),
        { ...acct, plan: target, cancelAtPeriodEnd: false, updated: new Date().toISOString() });
      return json({ ok: true, plan: target });
    }

    // Cancel at period end — the person keeps their valuations until then.
    if (action === "cancel") {
      if (!subscriptionActive(acct) || !acct.subscriptionId) return json({ error: "No active subscription to cancel." }, 400);
      await stripe("POST", "/subscriptions/" + acct.subscriptionId, { cancel_at_period_end: true });
      await getStore({ name: "accounts", consistency: "strong" }).setJSON(accountKey(email),
        { ...acct, cancelAtPeriodEnd: true, updated: new Date().toISOString() });
      return json({ ok: true, canceled: true });
    }

    // Undo a pending cancellation.
    if (action === "resume") {
      if (!acct.subscriptionId) return json({ error: "No subscription to resume." }, 400);
      await stripe("POST", "/subscriptions/" + acct.subscriptionId, { cancel_at_period_end: false });
      await getStore({ name: "accounts", consistency: "strong" }).setJSON(accountKey(email),
        { ...acct, cancelAtPeriodEnd: false, updated: new Date().toISOString() });
      return json({ ok: true, resumed: true });
    }

    // Opens the Stripe customer portal (used only for updating the card now that
    // switching and canceling are in-app). Requires the live portal to be on.
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
