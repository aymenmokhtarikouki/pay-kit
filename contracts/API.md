# pay-kit — contracts

pay-kit is backend-internal (functions, not HTTP routes — apps keep their own
payment endpoints). This doc fixes the SHAPES apps persist and clients see.

## Charge (input to both flows)

```jsonc
{
  "currency": "eur",                    // explicit, always
  "components": [
    { "type": "base",     "amountCents": 4500 },
    { "type": "delivery", "amountCents": 300 },
    { "type": "tip",      "amountCents": 500 }
  ]
}
```

Component types are app-defined strings; `base`, `delivery`, `container`,
`tip`, `no_show` are the conventional ones.

## FeeBreakdown (persist this per payment — the audit trail)

```jsonc
{
  "currency": "eur",
  "totalCents": 5300,
  "components": [
    { "type": "base", "amountCents": 4500, "feePercent": 10, "feeCents": 450 },
    { "type": "delivery", "amountCents": 300, "feePercent": 10, "feeCents": 30 },
    { "type": "tip", "amountCents": 500, "feePercent": 0, "feeCents": 0 }
  ],
  "applicationFeeCents": 480,
  "merchantNetCents": 4820
}
```

Fee resolution order per component: `policy.perComponent[type]` →
`merchant.feePercentOverride` → `policy.defaultPercent`.

## EscrowState (the app's Payment row fields the kit reads)

```jsonc
{ "authorizedCents": 5000, "capturedCents": 4000, "refundedCents": 500, "releasedCents": 0 }
```

## ReleaseBreakdown (persist at release)

```jsonc
{
  "netCents": 3500,             // captured − refunded
  "commissionCents": 350,       // round(net × feePercent / 100)
  "recoupedFeeCents": 200,      // accrued merchant fees taken from this payout
  "remainingAccruedFeeCents": 0, // carries forward, card never charged
  "transferCents": 2950          // what the Connect transfer sends
}
```

## Errors

`PayKitError { code, status }`: `INVALID_CHARGE`/`INVALID_AMOUNT` (400),
`CAPTURE_EXCEEDS_AUTHORIZED`/`REFUND_EXCEEDS_CAPTURED`/`NOTHING_TO_RELEASE`/
`ALREADY_RELEASED` (409).

## Webhook endpoint (via @aymenkits/pay-express)

`POST /payments/webhook` — mounted with `express.raw({ type: 'application/json' })`.
Responses: `200 { received: true }` · `400` bad signature/handler error ·
`500 BODY_NOT_RAW` (misconfigured body parser — fails loudly on purpose).
