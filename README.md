# pay-kit

Shared marketplace payments toolkit. One idea powers it:
**a charge is a list of typed components, and commission is decided per
component** — so a tip can carry 0% while the base pays 10%, per app, per
merchant, without code changes. Both production money flows are first-class:

- **instant**: destination charge → merchant's Connect account minus
  the application fee, immediately.
- **escrow**: manual-capture hold on the platform → capture at accept →
  hold through the dispute window → release = net − commission − recouped
  merchant fees.

Consume as a **git submodule** at `vendor/pay-kit` with `file:` deps. The kit
owns money math and Stripe mechanics; the app owns persistence (its Payment
rows), orchestration (WHEN to capture/release) and keys.

## Packages

| Package | What | Deps |
| --- | --- | --- |
| `@aymenkits/pay-core` | Pure math, no I/O: `computeFees` (per-component commission, per-merchant overrides, explicit currency), escrow guards + `computeRelease` (commission + accrued-fee recoup, carry-forward), `tierPriceCents` (quantity-tiered SaaS pricing), `accrueFee`/`recoupFromOwed` (net-from-payouts model). | — |
| `@aymenkits/pay-stripe` | The flows as Stripe calls, structurally typed over YOUR stripe client (v10+, no SDK pin): `createInstantCharge`, `createTip`, `createEscrowAuthorization`/`captureEscrow`/`voidEscrow`/`refundEscrow`/`releaseEscrow`, customers + setup intents, `createWebhookDispatcher` (verify + typed routing). | core |
| `@aymenkits/pay-express` | The webhook endpoint done right (raw-body enforcement — fails loudly if `express.raw()` is missing). | stripe |

## The tipping answer, in code

```ts
const policy = { defaultPercent: 10, perComponent: { tip: 0 } }  // escrow marketplace
// const policy = { defaultPercent: 7 }                          // flat — tips taxed too (business choice)

await createInstantCharge(stripe, {
  charge: { currency: 'eur', components: [
    { type: 'base', amountCents: 4500 },
    { type: 'delivery', amountCents: 300 },
    { type: 'tip', amountCents: 500 },        // ← 0% commission, routed to the merchant
  ]},
  policy,
  merchant: { accountId: cook.stripeAccountId, feePercentOverride: proPlan ? 8 : undefined },
  customerId, offSession: true,
})

// Post-completion tip = the same engine, one component:
await createTip(stripe, { amountCents: 500, currency: 'eur', customerId, merchant })
```

## The escrow flow

```ts
const { paymentIntent } = await createEscrowAuthorization(stripe, { charge, customerId })
// …cook accepts:
await captureEscrow(stripe, state, paymentIntent.id, acceptedTotalCents)
// …dispute window closes:
const { breakdown, transferId } = await releaseEscrow(stripe, {
  state,                                    // your Payment row
  release: { feePercent: 10, accruedFeeCents: sub.owedFeeCents },
  currency: 'eur',
  destinationAccountId: cook.stripeAccountId,
})
// persist breakdown.commissionCents / recoupedFeeCents / transferCents
```

## Subscriptions — two kinds, both supported

- **Merchant → platform** (SaaS): `stripe-billing` mode (
  `tierPriceCents(quantity, pricing)` prices the Stripe subscription) or
  `accrual` mode (`accrueFee` monthly, `recoupFromOwed`
  inside `releaseEscrow`; the merchant's card is never charged).
- **Customer → merchant** (recurring, e.g. weekly meal plans — often
  unbilled!): the app schedules each period and charges it as a normal
  `Charge` through either flow. No special math required; see INTEGRATION.md.

## Webhooks

```ts
const dispatcher = createWebhookDispatcher(stripe, {
  secret: env.STRIPE_WEBHOOK_SECRET,
  handlers: {
    'payment_intent.succeeded': (pi) => reconcile(pi),
    'charge.refunded': (ch) => recordRefund(ch),
    '*': (obj, event) => log(event.type),
  },
})
app.post('/payments/webhook', express.raw({ type: 'application/json' }),
  createStripeWebhookHandler(dispatcher))
```

## Docs

[`contracts/API.md`](contracts/API.md) · [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
(adoption recipes — including the production gaps this kit
closes for typical marketplaces: tips that actually charge, and recurring-plan billing).

## Development

```bash
npm install && npm test    # 20 unit tests (fee math, escrow math, Stripe params, webhooks)
npm run build && npm run setup
```

Verification against live Stripe **test mode** happens at adoption time with
the app's own test keys — the kit never holds credentials.
