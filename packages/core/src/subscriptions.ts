/**
 * Subscription money helpers. Two REAL production models, both supported:
 *
 * MerchantSubscription (business → platform SaaS):
 *  - 'stripe-billing' mode: one Stripe subscription, quantity
 *    = premium units, TIERED total pricing → tierPriceCents().
 *  - 'accrual' mode: the fee accrues app-side (owedFeeCents)
 *    and is recouped from payouts → recoupFromOwed() (also used by escrow).
 *
 * CustomerSubscription (customer → merchant recurring, e.g. weekly bundles):
 *  the app schedules the period charges; each one is a normal Charge through
 *  computeFees + the instant/escrow flow — no special math needed here.
 */
import type { TierPricing } from './types'
import { PayKitError } from './types'

/**
 * Total price for a quantity under tiered pricing.
 * Example: { tiers: [2000, 3600, 5200, 6400], extraPerUnitCents: 1200 }
 * → qty 1 = €20, 2 = €36, 3 = €52, 4 = €64, 5 = €76, 6 = €88 …
 */
export function tierPriceCents(quantity: number, pricing: TierPricing): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new PayKitError('INVALID_AMOUNT', 400, 'Quantity must be a non-negative integer')
  }
  if (quantity === 0) return 0
  const { tiers, extraPerUnitCents } = pricing
  if (quantity <= tiers.length) return tiers[quantity - 1]!
  return tiers[tiers.length - 1]! + (quantity - tiers.length) * extraPerUnitCents
}

/** Add a period's fee to the merchant's accrued balance (accrual mode). */
export function accrueFee(owedCents: number, feeCents: number): number {
  if (feeCents < 0 || owedCents < 0) {
    throw new PayKitError('INVALID_AMOUNT', 400, 'Amounts must be non-negative')
  }
  return owedCents + feeCents
}

/**
 * Recoup as much accrued fee as an available payout allows; the remainder
 * carries forward (the merchant's card is never charged).
 */
export function recoupFromOwed(
  owedCents: number,
  availableCents: number,
): { recoupedCents: number; remainingOwedCents: number } {
  const recoupedCents = Math.max(0, Math.min(owedCents, availableCents))
  return { recoupedCents, remainingOwedCents: owedCents - recoupedCents }
}
