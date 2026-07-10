/**
 * Webhook verification + typed dispatch — the part both apps hand-rolled.
 * Signature is verified with the SDK's constructEvent; events route to the
 * app's handlers by type with a wildcard fallback. Unknown events are OK.
 */
import type { StripeEventLike, StripeLike } from './stripe-like'

export type WebhookHandlers = Record<
  string,
  (object: unknown, event: StripeEventLike) => void | Promise<void>
>

export interface WebhookDispatcher {
  /** Verify the signature and return the event. Throws on bad signatures. */
  verify(payload: string | Buffer, signature: string): StripeEventLike
  /** Route to the handler for event.type, else the '*' handler, else no-op. */
  dispatch(event: StripeEventLike): Promise<void>
  /** verify + dispatch in one call. */
  handle(payload: string | Buffer, signature: string): Promise<StripeEventLike>
}

export function createWebhookDispatcher(
  stripe: StripeLike,
  options: { secret: string; handlers: WebhookHandlers },
): WebhookDispatcher {
  const { secret, handlers } = options

  async function dispatch(event: StripeEventLike): Promise<void> {
    const handler = handlers[event.type] ?? handlers['*']
    if (handler) await handler(event.data.object, event)
  }

  return {
    verify: (payload, signature) => stripe.webhooks.constructEvent(payload, signature, secret),
    dispatch,
    async handle(payload, signature) {
      const event = stripe.webhooks.constructEvent(payload, signature, secret)
      await dispatch(event)
      return event
    },
  }
}
