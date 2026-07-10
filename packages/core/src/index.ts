/**
 * @paykit/core — pure money math for marketplace payments.
 *
 * The tipping answer, in code:
 *   const policy = { defaultPercent: 10, perComponent: { tip: 0 } }
 *   computeFees({ currency: 'eur', components: [
 *     { type: 'base', amountCents: 2500 },
 *     { type: 'delivery', amountCents: 300 },
 *     { type: 'tip', amountCents: 500 },
 *   ]}, policy, { feePercentOverride: 8 /* PRO merchant *\/ })
 *   // → fees: base 200, delivery 24, tip 0 → applicationFee 224
 */
export type {
  ComponentType,
  ChargeComponent,
  Charge,
  FeePolicy,
  MerchantFeeContext,
  ComponentFee,
  FeeBreakdown,
  EscrowState,
  ReleaseInput,
  ReleaseBreakdown,
  TierPricing,
  PayKitErrorCode,
} from './types'
export { PayKitError } from './types'

export { computeFees, feePercentFor, assertValidCharge, singleComponentCharge } from './fees'
export { assertCapture, assertRefund, computeRelease } from './escrow'
export { tierPriceCents, accrueFee, recoupFromOwed } from './subscriptions'
