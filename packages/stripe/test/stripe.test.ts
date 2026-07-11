import { describe, expect, it, vi } from 'vitest'
import {
  createInstantCharge,
  createTip,
  createEscrowAuthorization,
  captureEscrow,
  refundEscrow,
  releaseEscrow,
  createWebhookDispatcher,
  type StripeLike,
} from '../src/index'

/** Fake Stripe capturing every call's params. */
function fakeStripe() {
  const calls: Record<string, unknown[]> = {
    piCreate: [], piCapture: [], piCancel: [], refund: [], transfer: [],
  }
  const stripe: StripeLike = {
    paymentIntents: {
      create: async (p) => (calls.piCreate!.push(p), { id: 'pi_1', status: 'requires_capture', amount: p.amount as number, client_secret: 'cs' }),
      capture: async (id, p) => (calls.piCapture!.push({ id, ...p }), { id, status: 'succeeded', amount: 0 }),
      cancel: async (id) => (calls.piCancel!.push(id), { id, status: 'canceled', amount: 0 }),
    },
    refunds: { create: async (p) => (calls.refund!.push(p), { id: 're_1' }) },
    transfers: { create: async (p) => (calls.transfer!.push(p), { id: 'tr_1' }) },
    customers: { create: async () => ({ id: 'cus_1' }) },
    setupIntents: { create: async () => ({ id: 'seti_1', client_secret: 'sec' }) },
    webhooks: {
      constructEvent: (payload, signature, secret) => {
        if (signature !== 'valid-sig' || secret !== 'whsec') throw new Error('bad signature')
        return JSON.parse(String(payload))
      },
    },
  }
  return { stripe, calls }
}

const CHARGE = {
  currency: 'eur',
  components: [
    { type: 'base', amountCents: 4500 },
    { type: 'tip', amountCents: 500 },
  ],
}

describe('instant charges (destination + application fee)', () => {
  it('routes to the merchant with per-component fees (tip 0%)', async () => {
    const { stripe, calls } = fakeStripe()
    const { breakdown } = await createInstantCharge(stripe, {
      charge: CHARGE,
      policy: { defaultPercent: 7, perComponent: { tip: 0 } },
      merchant: { accountId: 'acct_salon' },
      customerId: 'cus_9',
      offSession: true,
    })

    expect(breakdown.applicationFeeCents).toBe(315) // 7% of 4500 only
    const p = calls.piCreate![0] as Record<string, unknown>
    expect(p.amount).toBe(5000)
    expect(p.application_fee_amount).toBe(315)
    expect(p.transfer_data).toEqual({ destination: 'acct_salon' })
    expect(p.off_session).toBe(true)
    expect(p.confirm).toBe(true)
  })

  it('no connected account → plain platform charge, no routing fields', async () => {
    const { stripe, calls } = fakeStripe()
    await createInstantCharge(stripe, { charge: CHARGE, policy: { defaultPercent: 7 } })
    const p = calls.piCreate![0] as Record<string, unknown>
    expect(p.transfer_data).toBeUndefined()
    expect(p.application_fee_amount).toBeUndefined()
  })

  it('createTip defaults to 0% commission and omits application_fee_amount', async () => {
    const { stripe, calls } = fakeStripe()
    const { breakdown } = await createTip(stripe, {
      amountCents: 500,
      currency: 'eur',
      customerId: 'cus_9',
      merchant: { accountId: 'acct_salon' },
    })
    expect(breakdown.applicationFeeCents).toBe(0)
    const p = calls.piCreate![0] as Record<string, unknown>
    expect(p.application_fee_amount).toBeUndefined() // 0-fee → omitted
    expect(p.transfer_data).toEqual({ destination: 'acct_salon' })
    expect((p.metadata as Record<string, string>).type).toBe('tip')
  })

  it('a flat 7% tip policy still works (business decision, not code)', async () => {
    const { stripe, calls } = fakeStripe()
    await createTip(stripe, {
      amountCents: 500,
      currency: 'eur',
      customerId: 'cus_9',
      merchant: { accountId: 'acct_salon' },
      policy: { defaultPercent: 7, perComponent: { tip: 7 } },
    })
    expect((calls.piCreate![0] as Record<string, unknown>).application_fee_amount).toBe(35)
  })
})

describe('escrow flow', () => {
  const state = { authorizedCents: 5000, capturedCents: 4000, refundedCents: 0, releasedCents: 0 }

  it('authorization is manual-capture on the platform (no destination)', async () => {
    const { stripe, calls } = fakeStripe()
    const { totalCents } = await createEscrowAuthorization(stripe, { charge: CHARGE, customerId: 'cus_9' })
    expect(totalCents).toBe(5000)
    const p = calls.piCreate![0] as Record<string, unknown>
    expect(p.capture_method).toBe('manual')
    expect(p.transfer_data).toBeUndefined()
  })

  it('capture respects the authorization guard', async () => {
    const { stripe, calls } = fakeStripe()
    await captureEscrow(stripe, state, 'pi_1', 4000)
    expect(calls.piCapture![0]).toMatchObject({ id: 'pi_1', amount_to_capture: 4000 })
    await expect(captureEscrow(stripe, state, 'pi_1', 6000)).rejects.toMatchObject({
      code: 'CAPTURE_EXCEEDS_AUTHORIZED',
    })
  })

  it('refund guard + release transfers net − commission − accrual', async () => {
    const { stripe, calls } = fakeStripe()
    await refundEscrow(stripe, state, { paymentIntentId: 'pi_1', amountCents: 500, reason: 'missing item' })
    expect(calls.refund![0]).toMatchObject({ payment_intent: 'pi_1', amount: 500 })

    const { breakdown, transferId } = await releaseEscrow(stripe, {
      state: { ...state, refundedCents: 500 },
      release: { feePercent: 10, accruedFeeCents: 200 },
      currency: 'EUR',
      destinationAccountId: 'acct_cook',
    })
    expect(breakdown.transferCents).toBe(3500 - 350 - 200)
    expect(transferId).toBe('tr_1')
    expect(calls.transfer![0]).toMatchObject({ amount: 2950, currency: 'eur', destination: 'acct_cook' })
  })
})

describe('webhook dispatcher', () => {
  it('verifies signatures and routes by type with wildcard fallback', async () => {
    const { stripe } = fakeStripe()
    const seen: string[] = []
    const dispatcher = createWebhookDispatcher(stripe, {
      secret: 'whsec',
      handlers: {
        'payment_intent.succeeded': async (obj) => void seen.push(`pi:${(obj as { id: string }).id}`),
        '*': async (_o, e) => void seen.push(`other:${e.type}`),
      },
    })

    await dispatcher.handle(
      JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_9' } } }),
      'valid-sig',
    )
    await dispatcher.handle(
      JSON.stringify({ id: 'evt_2', type: 'charge.refunded', data: { object: {} } }),
      'valid-sig',
    )
    expect(seen).toEqual(['pi:pi_9', 'other:charge.refunded'])

    expect(() => dispatcher.verify('{}', 'bad-sig')).toThrow(/bad signature/)
  })
})

describe('express webhook handler', () => {
  it('requires raw body + signature; 200 on success', async () => {
    const { stripe } = fakeStripe()
    const handled = vi.fn()
    const dispatcher = createWebhookDispatcher(stripe, { secret: 'whsec', handlers: { '*': handled } })
    const { createStripeWebhookHandler } = await import('../../express/src/index')
    const handler = createStripeWebhookHandler(dispatcher)

    const mockRes = () => {
      const r = { statusCode: 200, body: undefined as unknown, status(c: number) { r.statusCode = c; return r }, json(b: unknown) { r.body = b; return b }, send: (b: unknown) => b }
      return r
    }

    // Parsed-JSON body (missing express.raw) → loud 500.
    const notRaw = mockRes()
    await handler({ headers: { 'stripe-signature': 'valid-sig' }, body: { parsed: true } }, notRaw)
    expect(notRaw.statusCode).toBe(500)

    // Proper raw body → verified + dispatched.
    const ok = mockRes()
    await handler(
      { headers: { 'stripe-signature': 'valid-sig' }, body: Buffer.from(JSON.stringify({ id: 'e', type: 'x', data: { object: {} } })) },
      ok,
    )
    expect(ok.statusCode).toBe(200)
    expect(handled).toHaveBeenCalledOnce()

    // Bad signature → 400.
    const bad = mockRes()
    await handler({ headers: { 'stripe-signature': 'nope' }, body: Buffer.from('{}') }, bad)
    expect(bad.statusCode).toBe(400)
  })
})
