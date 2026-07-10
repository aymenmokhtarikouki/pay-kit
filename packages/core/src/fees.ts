/**
 * Fee computation — THE single place commission is calculated, shared by the
 * instant (destination charge) and escrow (release transfer) flows.
 * Per-component rounding matches both production apps (Math.round).
 */
import type {
  Charge,
  ChargeComponent,
  ComponentFee,
  FeeBreakdown,
  FeePolicy,
  MerchantFeeContext,
} from './types'
import { PayKitError } from './types'

function assertValidComponent(c: ChargeComponent): void {
  if (!Number.isInteger(c.amountCents) || c.amountCents < 0) {
    throw new PayKitError(
      'INVALID_AMOUNT',
      400,
      `Component "${c.type}" must have a non-negative integer amountCents`,
    )
  }
}

export function assertValidCharge(charge: Charge): void {
  if (!charge.currency || typeof charge.currency !== 'string') {
    throw new PayKitError('INVALID_CHARGE', 400, 'Charge requires an explicit currency')
  }
  if (!Array.isArray(charge.components) || charge.components.length === 0) {
    throw new PayKitError('INVALID_CHARGE', 400, 'Charge requires at least one component')
  }
  for (const c of charge.components) assertValidComponent(c)
}

/** perComponent[type] > merchant.feePercentOverride > policy.defaultPercent */
export function feePercentFor(
  type: string,
  policy: FeePolicy,
  merchant?: MerchantFeeContext,
): number {
  const perComponent = policy.perComponent?.[type]
  if (perComponent !== undefined) return perComponent
  if (merchant?.feePercentOverride !== undefined) return merchant.feePercentOverride
  return policy.defaultPercent
}

export function computeFees(
  charge: Charge,
  policy: FeePolicy,
  merchant?: MerchantFeeContext,
): FeeBreakdown {
  assertValidCharge(charge)

  const components: ComponentFee[] = charge.components.map((c) => {
    const feePercent = feePercentFor(c.type, policy, merchant)
    return {
      type: c.type,
      amountCents: c.amountCents,
      feePercent,
      feeCents: Math.round((c.amountCents * feePercent) / 100),
    }
  })

  const totalCents = components.reduce((s, c) => s + c.amountCents, 0)
  const applicationFeeCents = components.reduce((s, c) => s + c.feeCents, 0)

  return {
    currency: charge.currency.toLowerCase(),
    totalCents,
    components,
    applicationFeeCents,
    merchantNetCents: totalCents - applicationFeeCents,
  }
}

/** Convenience: a single-component charge (used by standalone tips). */
export function singleComponentCharge(
  currency: string,
  type: string,
  amountCents: number,
): Charge {
  return { currency, components: [{ type, amountCents }] }
}
