/**
 * @paykit/express — the Stripe webhook endpoint, done right.
 *
 * MUST be mounted with a RAW body (signature verification needs the exact
 * bytes) BEFORE any json body-parser touches the route:
 *
 *   app.post('/payments/webhook',
 *     express.raw({ type: 'application/json' }),
 *     createStripeWebhookHandler(dispatcher))
 */
import type { WebhookDispatcher } from '@paykit/stripe'

export interface MinimalRequest {
  headers: Record<string, unknown>
  /** The RAW request body (Buffer from express.raw). */
  body?: unknown
}
export interface MinimalResponse {
  status(code: number): MinimalResponse
  json(body: unknown): unknown
  send(body?: unknown): unknown
}

export function createStripeWebhookHandler(
  dispatcher: WebhookDispatcher,
  options: { onError?: (err: unknown) => void } = {},
) {
  return async function stripeWebhookHandler(req: MinimalRequest, res: MinimalResponse): Promise<void> {
    const signature = req.headers['stripe-signature']
    if (typeof signature !== 'string') {
      res.status(400).json({ error: { code: 'MISSING_SIGNATURE', message: 'stripe-signature header required' } })
      return
    }
    const payload = req.body
    if (!(payload instanceof Buffer) && typeof payload !== 'string') {
      // A parsed-JSON body means express.raw() wasn't mounted — fail loudly.
      res.status(500).json({
        error: { code: 'BODY_NOT_RAW', message: 'Webhook route must use express.raw() before body parsers' },
      })
      return
    }
    try {
      await dispatcher.handle(payload, signature)
      res.status(200).json({ received: true })
    } catch (err) {
      options.onError?.(err)
      res.status(400).json({ error: { code: 'WEBHOOK_ERROR', message: 'Signature verification or handler failed' } })
    }
  }
}
