# Integrating pay-kit

## Install

```bash
npm install @paykit/core                # pure money math + policies
npm install @paykit/stripe stripe       # gateway (bring your own stripe client)
npm install @paykit/express             # optional webhook route factory
```

## Model your money

- Every charge is **typed components** (`base`, `delivery`, `tip`, your own).
- `FeePolicy` resolves commission per component with per-merchant overrides:
  `perComponent[type] > merchant.feePercentOverride > defaultPercent`.
  Tips at 0% is one config line, not a code path.
- Pick a flow per charge: `instant` (destination charge, funds route to the
  merchant immediately) or `escrow` (manual-capture on the platform,
  `releaseEscrow` later transfers net of commission and any accrued fees).

## Webhooks

Mount the webhook route BEFORE any JSON body parser — signature verification
needs the raw body. `@paykit/express` handles that footgun for you.

## What stays in your app

WHEN to authorize/capture/release is order-lifecycle logic — yours. The kit
owns HOW: the math is pure and unit-tested, so your orchestration code stops
carrying arithmetic.

## Migrating from an existing implementation

The kits were extracted from production systems, and these rules kept those
migrations safe:

1. **Never rewrite a working flow in one step.** Keep your endpoint URLs,
   response envelopes and (for realtime) socket event names byte-identical;
   swap the implementation underneath, one endpoint at a time.
2. **Data stays put.** The store seams map onto your existing tables — new
   capabilities need at most additive columns, never a data migration.
3. **Delete the superseded code in the same change.** Two implementations of
   the same behavior is how drift starts.
4. Where the kit enforces domain rules through policy hooks, your hooks may
   THROW your app's own error types — the kit re-throws them untouched, so
   your API's error contract survives the swap.
