# Optional Module: Stripe Payments

Only include when the app takes money. parkhillfw implements recurring dues (annual + quarterly) per household. Code: `src/lib/stripe.ts`, `src/lib/stripe-webhooks.ts`, `src/lib/product-catalog.ts`, `src/lib/finance-report.ts`, webhook route in `src/index.ts`, tests `src/lib/stripe*.test.ts`. Planning history: `docs/stripe_plan_1.md`, `docs/stripe_payments.md`, `docs/finance-*.md`.

## Shape

```
DuesPayView ─POST /api/dues/checkout─► stripe.checkout.sessions.create({ mode: 'subscription',
                                         customer (per household, stored on households.stripe_customer_id),
                                         line_items: [{ price: env.STRIPE_PRICE_X }], metadata: { householdId, productType } })
          ◄─ redirect to Stripe-hosted Checkout ─► success_url (UX only — NOT proof of payment)
Stripe ─POST /api/webhooks/stripe─► constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET) → D1 upserts
"Manage" button ─► stripe.billingPortal.sessions.create(...) (customer self-service)
```

Workers-compatible client:

```ts
new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
// verify with: await stripe.webhooks.constructEventAsync(await c.req.text(), sig, secret)
```

Webhook events handled: `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.paid`, `payout.paid` (stamp `payout_id` for bank reconciliation), `charge.refunded`, `charge.dispute.created|closed`.

## Data model

- `subscriptions`: stripe_subscription_id (unique), household_id, product_type enum, stripe_price_id, status (`active|past_due|canceled|incomplete`), current_period_end, cancel_at_period_end.
- `payments` (the **ledger**, source of truth for "paid through"): household_id, product_type, amount_cents, fee_cents, source (`stripe|manual`), stripe_invoice_id (**unique**), stripe_subscription_id, stripe_charge_id, payout_id, status (`succeeded|refunded|partially_refunded|disputed`), payment_method (`card|us_bank_account|check|cash`), period_start/end, note, recorded_by_user_id.
- Prices live in Stripe; only Price IDs are stored, as wrangler `vars` per env (`STRIPE_PRICE_*`). Secrets via `wrangler secret put` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).

## Rules learned

- **Idempotency via unique index** on the external id (`stripe_invoice_id`). Stripe fires both `invoice.payment_succeeded` and `invoice.paid`; a race inserted duplicates until the unique index + handling only `invoice.paid` (commits `892b4bb`, `e705c04`).
- Verify signature on the **raw** body before any JSON parsing; exempt the webhook path from the same-origin middleware only.
- Manual (cash/check) payments are first-class ledger rows with actor + note, behind a separate **Finance** permission.
- Money as integer cents everywhere; record fees separately for net reporting/CSV export (QuickBooks-friendly columns).
- When a household is archived/vacated, cancel its active subscriptions via API.
- Sandbox doesn't email customers (except verified team addresses) — don't treat missing receipts as a bug. Receipts/renewal reminders are Stripe Dashboard settings.
- Dev and staging can share one Stripe sandbox; give each env its own webhook endpoint + secret, and build `just reset-dues-local|staging` recipes that delete only the customers recorded in **that** env's D1.
- Local webhooks: `stripe listen --forward-to localhost:8787/api/webhooks/stripe` and put the printed `whsec_…` in `.dev.vars`.
- Write the scope exclusions down before building (refund UI, in-app price management, custom receipts…).
