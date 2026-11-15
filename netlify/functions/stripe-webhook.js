// Stripe calls this when someone pays, renews, or cancels.
// Env: STRIPE_WEBHOOK_SECRET (whsec_...), STRIPE_SECRET_KEY.
// Events to send: checkout.session.completed, invoice.paid,
//   customer.subscription.updated, customer.subscription.deleted
import { getStore } from "@netlify/blobs";
import { getJSON, accountKey, customerKey, cleanEmail } from "../lib/allowance.js";
import { stripe, verifySignature, periodEnd } from "../lib/stripe.js";

async function findEmail(customerId, fallbackEmail) {
  if (customerId) {
    const m = await getJSON(getStore({ name: "accounts", consistency: "strong" }), customerKey(customerId));
    if (m && m.email) return m.email;
  }
  return cleanEmail(fallbackEmail);
}

async function update(email, fields, customerId) {
  if (!email) return;
  const accounts = getStore({ name: "accounts", consistency: "strong" });
  const key = accountKey(email);
  const acct = (await getJSON(accounts, key)) || { email, created: new Date().toISOString(), freeUsed: 0 };
  await accounts.setJSON(key, { ...acct, ...fields, updated: new Date().toISOString() });
  if (customerId) await accounts.setJSON(customerKey(customerId), { email });
}

export default async (req) => {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(raw);
  const events = getStore({ name: "stripe-events", consistency: "strong" });
  if (await getJSON(events, event.id)) return new Response("already handled");

  try {
    const o = event.data.object;
    if (event.type === "checkout.session.completed" && o.mode === "subscription") {
      const email = cleanEmail(o.client_reference_id) || await findEmail(o.customer, o.customer_details && o.customer_details.email);
      const sub = o.subscription ? await stripe("GET", "/subscriptions/" + o.subscription) : null;
      await update(email, {
        customerId: o.customer, subscriptionId: o.subscription, plan: "basic",
        status: sub ? sub.status : "active", periodEnd: periodEnd(sub),
        cancelAtPeriodEnd: !!(sub && sub.cancel_at_period_end),
      }, o.customer);
    } else if (event.type === "invoice.paid") {
      const email = await findEmail(o.customer, o.customer_email);
      const acct = email ? await getJSON(getStore({ name: "accounts", consistency: "strong" }), accountKey(email)) : null;
      const line = o.lines && o.lines.data && o.lines.data[0];
      const subId = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription) || (acct && acct.subscriptionId);
      // A new paid month resets the count. The same invoice never resets twice.
      if (!acct || acct.lastInvoiceId !== o.id) {
        await update(email, {
          customerId: o.customer, subscriptionId: subId, plan: "basic", status: "active",
          periodUsed: 0, lastInvoiceId: o.id,
          periodEnd: line && line.period && line.period.end ? new Date(line.period.end * 1000).toISOString() : (acct && acct.periodEnd) || null,
        }, o.customer);
      }
    } else if (event.type === "customer.subscription.updated") {
      const email = await findEmail(o.customer, o.metadata && o.metadata.email);
      await update(email, {
        subscriptionId: o.id, status: o.status, periodEnd: periodEnd(o),
        cancelAtPeriodEnd: !!o.cancel_at_period_end,
      }, o.customer);
    } else if (event.type === "customer.subscription.deleted") {
      const email = await findEmail(o.customer, o.metadata && o.metadata.email);
      await update(email, { status: "canceled", plan: "none", cancelAtPeriodEnd: false }, o.customer);
    }
    await events.setJSON(event.id, { type: event.type, at: new Date().toISOString() });
    return new Response("ok");
  } catch (e) {
    console.log("webhook error", event.type, String(e));
    return new Response("error", { status: 500 }); // Stripe will retry
  }
};
