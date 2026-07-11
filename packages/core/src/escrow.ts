/**
 * Escrow math — a production marketplace money flow, extracted as pure functions:
 * authorize (hold) → capture at accept → hold through the dispute window →
 * release = (captured − refunded) − commission − recouped accrued fees.
 * The app persists EscrowState (its Payment row) and performs the Stripe
 * calls (via @paykit/stripe); these functions are the arithmetic contract.
 */
import type { EscrowState, ReleaseBreakdown, ReleaseInput } from './types'
import { PayKitError } from './types'
import { recoupFromOwed } from './subscriptions'

/** Guard: capture can never exceed the authorization. */
export function assertCapture(state: EscrowState, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PayKitError('INVALID_AMOUNT', 400, 'Capture amount must be a positive integer')
  }
  if (amountCents > state.authorizedCents) {
    throw new PayKitError(
      'CAPTURE_EXCEEDS_AUTHORIZED',
      409,
      `Cannot capture ${amountCents} — only ${state.authorizedCents} authorized`,
    )
  }
}

/** Guard: refunds come out of captured (still-held) money only. */
export function assertRefund(state: EscrowState, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PayKitError('INVALID_AMOUNT', 400, 'Refund amount must be a positive integer')
  }
  if (amountCents > state.capturedCents - state.refundedCents) {
    throw new PayKitError(
      'REFUND_EXCEEDS_CAPTURED',
      409,
      `Cannot refund ${amountCents} — only ${state.capturedCents - state.refundedCents} remains captured`,
    )
  }
}

/**
 * The release arithmetic (matches the production release flow it was extracted from):
 *   net        = captured − refunded
 *   commission = round(net × feePercent / 100)
 *   recouped   = min(accruedFee, net − commission)   // net-from-payouts
 *   transfer   = net − commission − recouped
 * Throws when there is nothing (or a second attempt) to release.
 */
export function computeRelease(state: EscrowState, input: ReleaseInput): ReleaseBreakdown {
  if (state.releasedCents > 0) {
    throw new PayKitError('ALREADY_RELEASED', 409, 'This payment was already released')
  }

  const netCents = state.capturedCents - state.refundedCents
  const commissionCents = Math.round((netCents * input.feePercent) / 100)
  const afterCommission = netCents - commissionCents
  if (afterCommission <= 0) {
    throw new PayKitError('NOTHING_TO_RELEASE', 409, 'Nothing to release after refunds and commission')
  }

  const { recoupedCents, remainingOwedCents } = recoupFromOwed(
    input.accruedFeeCents ?? 0,
    afterCommission,
  )

  return {
    netCents,
    commissionCents,
    recoupedFeeCents: recoupedCents,
    remainingAccruedFeeCents: remainingOwedCents,
    transferCents: afterCommission - recoupedCents,
  }
}
