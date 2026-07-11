/**
 * @aymenkits/pay-stripe — Stripe adapter for the pay-kit money flows.
 *
 *   // instant charge with a tip at 0% commission:
 *   await createInstantCharge(stripe, {
 *     charge: { currency: 'eur', components: [
 *       { type: 'base', amountCents: 4500 }, { type: 'tip', amountCents: 500 },
 *     ]},
 *     policy: { defaultPercent: 7, perComponent: { tip: 0 } },
 *     merchant: { accountId: salon.stripe_account_id },
 *     customerId, offSession: true,
 *   })
 *
 *   // escrow: authorize → capture → (window) → release
 *   await createEscrowAuthorization(stripe, { charge, customerId })
 *   await captureEscrow(stripe, state, piId, acceptedTotal)
 *   await releaseEscrow(stripe, { state, release: { feePercent: 10, accruedFeeCents }, currency, destinationAccountId })
 */
export type { StripeLike, StripeEventLike, PaymentIntentLike } from './stripe-like'

export {
  createInstantCharge,
  createTip,
  createEscrowAuthorization,
  captureEscrow,
  voidEscrow,
  refundEscrow,
  releaseEscrow,
  createCustomer,
  createSetupIntent,
} from './charges'
export type {
  MerchantAccount,
  InstantChargeParams,
  InstantChargeResult,
  EscrowAuthorizationParams,
} from './charges'

export { createWebhookDispatcher } from './webhooks'
export type { WebhookDispatcher, WebhookHandlers } from './webhooks'
