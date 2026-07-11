# @paykit/express

Stripe webhook route factory with the raw-body handling everyone gets wrong, plus optional endpoint factories (setup-intent, payment methods).

## Install

```bash
npm install @paykit/express
```

Installs with it: `@paykit/stripe` (automatic dependency; `@paykit/core` transitively).

## You provide

- Your Express app (the webhook route must be mounted BEFORE any json body parser)
- Your webhook signing secret

The package never owns tables, never imports an ORM, HTTP framework, or
provider SDK it can take as a parameter — storage and delivery are seams your
app implements on its own stack.

## Quick example

```ts
import { createWebhookRoute } from '@paykit/express'

app.post('/stripe/webhook', createWebhookRoute({ gateway, secret, onEvent }))
```

## Pairs with

- `@paykit/stripe` gateway + event router

Kits pair **by shape, never by import** — pass the sibling kit, your own
service, or a stub in tests.

## Docs

Full contracts and integration guides live in the repo:
https://github.com/aymenmokhtarikouki/pay-kit (`contracts/`, `docs/`).

## License

UNLICENSED — published for use by the author's applications.
