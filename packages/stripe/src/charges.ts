/**
 * The two money flows, as Stripe operations. Fee math always comes from
 * @aymenkits/pay-core's computeFees — one arithmetic, two flows.
 *
 * INSTANT: destination charge — the PaymentIntent routes funds
 * to the merchant's connected account minus `application_fee_amount`.
 *
 * ESCROW: manual-capture PaymentIntent on the PLATFORM account
 * (no destination) → capture at accept → hold through the dispute window →
 * `releaseEscrow` transfers net-minus-commission-minus-accrued-fees.
 */
import type { Charge, EscrowState, FeeBreakdown, FeePolicy, MerchantFeeContext, ReleaseBreakdown, ReleaseInput } from '@aymenkits/pay-core'
import { computeFees, computeRelease, assertCapture, assertRefund, singleComponentCharge } from '@aymenkits/pay-core'
import type { PaymentIntentLike, StripeLike } from './stripe-like'

export interface MerchantAccount extends MerchantFeeContext {
  /** Stripe Connect account id. Omit → funds stay on the platform (no routing). */
  accountId?: string
}

export interface InstantChargeParams {
  charge: Charge
  policy: FeePolicy
  merchant?: MerchantAccount
  /** Stripe customer id (saved-card / off-session flows). */
  customerId?: string
  paymentMethodId?: string
  /** Confirm immediately with the saved card (no client action). */
  offSession?: boolean
  metadata?: Record<string, string>
  /**
   * Extra PaymentIntent params spread verbatim (payment_method_types for
   * Terminal card_present, automatic_payment_methods, …). Computed fields
   * (amount/fee/transfer_data) always win.
   */
  paymentIntentExtras?: Record<string, unknown>
}

export interface InstantChargeResult {
  paymentIntent: PaymentIntentLike
  breakdown: FeeBreakdown
}

/** Destination charge with per-component application fee (tips at their own rate). */
export async function createInstantCharge(
  stripe: StripeLike,
  params: InstantChargeParams,
): Promise<InstantChargeResult> {
  const breakdown = computeFees(params.charge, params.policy, params.merchant)

  const piParams: Record<string, unknown> = {
    ...params.paymentIntentExtras,
    amount: breakdown.totalCents,
    currency: breakdown.currency,
    metadata: params.metadata,
    ...(params.customerId ? { customer: params.customerId } : {}),
    ...(params.paymentMethodId ? { payment_method: params.paymentMethodId } : {}),
    ...(params.offSession ? { off_session: true, confirm: true } : {}),
  }

  // Route to the merchant only when they have a connected account; a 0-fee
  // charge (e.g. pure tip at 0%) omits application_fee_amount entirely.
  if (params.merchant?.accountId) {
    piParams.transfer_data = { destination: params.merchant.accountId }
    if (breakdown.applicationFeeCents > 0) {
      piParams.application_fee_amount = breakdown.applicationFeeCents
    }
  }

  const paymentIntent = await stripe.paymentIntents.create(piParams)
  return { paymentIntent, breakdown }
}

/** Standalone tip — a one-component charge with the tip fee rate (default 0%). */
export async function createTip(
  stripe: StripeLike,
  params: {
    amountCents: number
    currency: string
    customerId: string
    paymentMethodId?: string
    merchant: MerchantAccount
    policy?: FeePolicy
    metadata?: Record<string, string>
  },
): Promise<InstantChargeResult> {
  const policy = params.policy ?? { defaultPercent: 0 }
  return createInstantCharge(stripe, {
    charge: singleComponentCharge(params.currency, 'tip', params.amountCents),
    policy: { ...policy, perComponent: { tip: policy.perComponent?.tip ?? 0, ...policy.perComponent } },
    merchant: params.merchant,
    customerId: params.customerId,
    paymentMethodId: params.paymentMethodId,
    offSession: true,
    metadata: { type: 'tip', ...params.metadata },
  })
}

// ── Escrow flow ──────────────────────────────────────────────────────────────

export interface EscrowAuthorizationParams {
  charge: Charge
  customerId?: string
  paymentMethodId?: string
  offSession?: boolean
  metadata?: Record<string, string>
}

/** Manual-capture hold on the PLATFORM account (separate charges & transfers). */
export async function createEscrowAuthorization(
  stripe: StripeLike,
  params: EscrowAuthorizationParams,
): Promise<{ paymentIntent: PaymentIntentLike; totalCents: number }> {
  const totalCents = params.charge.components.reduce((s, c) => s + c.amountCents, 0)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: params.charge.currency.toLowerCase(),
    capture_method: 'manual',
    metadata: params.metadata,
    ...(params.customerId ? { customer: params.customerId } : {}),
    ...(params.paymentMethodId ? { payment_method: params.paymentMethodId } : {}),
    ...(params.offSession ? { off_session: true, confirm: true } : {}),
  })
  return { paymentIntent, totalCents }
}

/** Capture part or all of a hold (partial capture = per-item accept). */
export async function captureEscrow(
  stripe: StripeLike,
  state: EscrowState,
  paymentIntentId: string,
  amountCents: number,
): Promise<PaymentIntentLike> {
  assertCapture(state, amountCents)
  return stripe.paymentIntents.capture(paymentIntentId, { amount_to_capture: amountCents })
}

/** Void an uncaptured hold (decline / SLA timeout). */
export async function voidEscrow(stripe: StripeLike, paymentIntentId: string): Promise<PaymentIntentLike> {
  return stripe.paymentIntents.cancel(paymentIntentId)
}

/** Refund captured money (always from escrow — no merchant clawbacks). */
export async function refundEscrow(
  stripe: StripeLike,
  state: EscrowState,
  params: { paymentIntentId: string; amountCents: number; reason?: string; metadata?: Record<string, string> },
): Promise<{ id: string }> {
  assertRefund(state, params.amountCents)
  return stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    amount: params.amountCents,
    metadata: { ...(params.reason ? { reason: params.reason } : {}), ...params.metadata },
  })
}

/**
 * Release the held funds to the merchant: computeRelease (commission +
 * accrued-fee recoup) then a Connect transfer for the remainder.
 */
export async function releaseEscrow(
  stripe: StripeLike,
  params: {
    state: EscrowState
    release: ReleaseInput
    currency: string
    destinationAccountId: string
    metadata?: Record<string, string>
  },
): Promise<{ breakdown: ReleaseBreakdown; transferId: string }> {
  const breakdown = computeRelease(params.state, params.release)
  const transfer = await stripe.transfers.create({
    amount: breakdown.transferCents,
    currency: params.currency.toLowerCase(),
    destination: params.destinationAccountId,
    metadata: params.metadata,
  })
  return { breakdown, transferId: transfer.id }
}

// ── Cards / customers ────────────────────────────────────────────────────────

export async function createCustomer(
  stripe: StripeLike,
  params: { email?: string | null; name?: string | null; metadata?: Record<string, string> },
): Promise<{ id: string }> {
  return stripe.customers.create({
    ...(params.email ? { email: params.email } : {}),
    ...(params.name ? { name: params.name } : {}),
    metadata: params.metadata,
  })
}

export async function createSetupIntent(
  stripe: StripeLike,
  params: { customerId: string; metadata?: Record<string, string> },
): Promise<{ id: string; client_secret?: string | null }> {
  return stripe.setupIntents.create({ customer: params.customerId, metadata: params.metadata })
}
