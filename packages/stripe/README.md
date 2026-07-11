# @paykit/stripe

The only package that talks to Stripe — via a client YOU construct and pass in (structural typing, no stripe dependency of its own): PaymentIntents (manual/auto/off-session), destination charges, transfers, refunds, SetupIntents + ephemeral keys, Billing, Terminal tokens, and a webhook verifier + typed event router.

## Install

```bash
npm install @paykit/stripe
```

Installs with it: `@paykit/core` (automatic dependency).

## You provide

- **Your `stripe` SDK instance** (`new Stripe(key)`) — install `stripe` yourself; any recent major works
- Connect account ids on your merchants

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import Stripe from 'stripe'
import { createStripeGateway } from '@paykit/stripe'

const gateway = createStripeGateway({ stripe: new Stripe(process.env.STRIPE_KEY) })
await gateway.createInstantCharge({ charge, merchant, policy, customer })
```

## Pairs with

- `@paykit/express` for the webhook route

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/pay-kit (`contracts/`, `docs/`).

## License

MIT
