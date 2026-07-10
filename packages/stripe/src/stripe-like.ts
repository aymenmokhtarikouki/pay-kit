/**
 * Structural subset of the Stripe SDK — only the members the kit calls.
 * The app passes its own configured `new Stripe(key)` instance; the kit never
 * owns keys or pins an SDK version (works with stripe v10+).
 */

export interface PaymentIntentLike {
  id: string
  client_secret?: string | null
  status: string
  amount: number
}

export interface StripeLike {
  paymentIntents: {
    create(params: any): Promise<PaymentIntentLike>
    capture(id: string, params?: any): Promise<PaymentIntentLike>
    cancel(id: string): Promise<PaymentIntentLike>
  }
  refunds: {
    create(params: any): Promise<{ id: string }>
  }
  transfers: {
    create(params: any): Promise<{ id: string }>
  }
  customers: {
    create(params: any): Promise<{ id: string }>
  }
  setupIntents: {
    create(params: any): Promise<{ id: string; client_secret?: string | null }>
  }
  webhooks: {
    constructEvent(payload: string | Buffer, signature: string, secret: string): StripeEventLike
  }
}

export interface StripeEventLike {
  id: string
  type: string
  data: { object: unknown }
}
