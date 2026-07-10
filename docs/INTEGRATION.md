# Integration guide

`git submodule add git@github.com:aymenmokhtarikouki/pay-kit.git vendor/pay-kit`
→ `npm --prefix vendor/pay-kit run setup` → `file:` deps for `@paykit/core` +
`@paykit/stripe` (+ `@paykit/express`). Deploys: init submodule + setup BEFORE
the consumer `npm install` (same as every kit).

The kit takes YOUR `new Stripe(key)` instance everywhere — it never owns keys.

## yuma_backend adoption (the two production gaps first)

**1. Tips that actually charge** (today `Order.tipCents` is a DB field, no
money moves). In `addTipToOrder`:

```ts
import { createTip } from '@paykit/stripe'
const { paymentIntent, breakdown } = await createTip(getStripe(), {
  amountCents: dto.tipCents,
  currency: 'eur',
  customerId: await getOrCreateStripeCustomer(userId),
  merchant: { accountId: cook.stripeAccountId },   // policy default: tip = 0% commission
  metadata: { orderId },
})
// persist paymentIntent.id + breakdown next to tipCents
```

**2. Weekly-bundle billing** (today generated orders bypass payments
entirely). In order-generation, per generated week:

```ts
const { paymentIntent } = await createEscrowAuthorization(getStripe(), {
  charge: { currency: 'eur', components: [{ type: 'base', amountCents: weeklyPriceCents }] },
  customerId, paymentMethodId: savedCard, offSession: true,
  metadata: { subscriptionId, weekStartDate },
})
```
then the normal capture-at-accept / release flow applies per order.

**3. Existing escrow path** — `payments.service.ts` keeps its orchestration
but delegates the arithmetic + Stripe params:
- `releaseOrderPayment` → `releaseEscrow(stripe, { state: paymentRow, release: { feePercent: await getCookCommissionPercent(cookId), accruedFeeCents: sub.owedFeeCents }, ... })` — the returned `ReleaseBreakdown` maps 1:1 onto `commissionCents`/`releasedCents` + `CookSubscription.owedFeeCents`.
- capture/refund guards replace the hand-rolled checks (`assertCapture`/`assertRefund`).
- webhook: replace the switch with `createWebhookDispatcher` + `createStripeWebhookHandler`.

Policy: `{ defaultPercent: commissionPercent (10), perComponent: { tip: 0 } }`,
merchant `feePercentOverride` = PRO 8 via existing entitlements.

## lineo-backend adoption

- `connect.service.calculateApplicationFee` + `payments.service.createPaymentIntent`
  → `createInstantCharge` with `policy: { defaultPercent: getConfigNum('commission_percent') }`.
- `processTip` → `createTip(..., { policy: { perComponent: { tip: 7 } } })` to
  keep today's 7%-on-tips behavior — or drop the override for 0% pass-through
  (a business decision; the kit makes it a config line either way).
- Premium subscription: keep Stripe Billing wiring; price quantities with
  `tierPriceCents(qty, { tiers: [tier_1..tier_4], extraPerUnitCents: extra_salon })`
  from platform_config.
- The `usd`-vs-`eur` no-show inconsistency disappears by construction —
  every Charge names its currency.

## Customer subscriptions (yuma bundles pattern)

Store the schedule app-side (`SubscriptionWeek` already exists); each period
= one `Charge` through `createEscrowAuthorization` (or `createInstantCharge`
for instant apps) with `metadata.subscriptionId`. Pause/resume/cancel stay
app logic — the kit only prices and moves money.

## Live verification at adoption

Run against Stripe **test mode** with the app's test keys: one instant charge
with a tip component, one escrow authorize→capture→release cycle, one webhook
delivery via `stripe listen`. The kit's unit tests already pin the params and
math; test mode confirms the account wiring (Connect accounts, capabilities).
