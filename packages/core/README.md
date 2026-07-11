# @aymenkits/pay-core

Marketplace money math, no Stripe import: a Charge is typed components (base/delivery/tip/…), FeePolicy resolves commission per component type with per-merchant overrides, instant vs escrow flow strategies, and computeRelease nets accrued platform fees out of payouts.

## Install

```bash
npm install @aymenkits/pay-core
```

Installs with it: nothing else — zero dependencies (pure, fully unit-testable).

## You provide

- Your fee policy numbers (e.g. `{ defaultPercent: 10, perComponent: { tip: 0 } }`)
- Stores for customers/merchant accounts/payment records when using the flows

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { computeFees, computeRelease } from '@aymenkits/pay-core'

const fees = computeFees(charge, merchant, policy)
// → { total, applicationFee, merchantNet, feeByComponent }
```

## Pairs with

- `@aymenkits/pay-stripe` executes what this computes

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/pay-kit (`contracts/`, `docs/`).

## License

MIT
