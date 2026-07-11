/**
 * Money domain. Everything is integer CENTS with an explicit currency —
 * never floats, never a hardcoded 'eur'/'usd' (a real bug class in the apps
 * this kit was extracted from).
 */

/** 'base' | 'delivery' | 'container' | 'tip' | 'no_show' | any app-defined type. */
export type ComponentType = string

/** One priced part of a charge. Commission is decided PER TYPE (tips → 0%). */
export interface ChargeComponent {
  type: ComponentType
  amountCents: number
}

export interface Charge {
  /** ISO currency, lowercase ('eur'). Required — no defaults, no surprises. */
  currency: string
  components: ChargeComponent[]
}

/**
 * Platform commission rules. Resolution order per component:
 *   perComponent[type]  >  merchant.feePercentOverride  >  defaultPercent
 * Examples: { defaultPercent: 7 } flat, or { defaultPercent: 10,
 * perComponent: { tip: 0 } } with premium merchants passing feePercentOverride: 8.
 */
export interface FeePolicy {
  defaultPercent: number
  perComponent?: Record<ComponentType, number>
}

/** Per-merchant context (plan-based commission etc.). */
export interface MerchantFeeContext {
  /** Replaces defaultPercent for this merchant; perComponent rules still win. */
  feePercentOverride?: number
}

export interface ComponentFee {
  type: ComponentType
  amountCents: number
  feePercent: number
  feeCents: number
}

/** The single source of truth both money flows consume. */
export interface FeeBreakdown {
  currency: string
  totalCents: number
  components: ComponentFee[]
  /** Platform take = Σ component fees. */
  applicationFeeCents: number
  /** What the merchant receives = total − applicationFee. */
  merchantNetCents: number
}

// ── Escrow (capture → hold → release) ────────────────────────────────────────

/** Mirrors a typical app Payment row. All cents. */
export interface EscrowState {
  authorizedCents: number
  capturedCents: number
  refundedCents: number
  releasedCents: number
}

export interface ReleaseInput {
  /** Commission percent applied to the net (captured − refunded). */
  feePercent: number
  /**
   * Merchant's accrued platform fees (subscription owed) to recoup from this
   * payout — net-from-payouts model. Uncovered remainder carries forward.
   */
  accruedFeeCents?: number
}

export interface ReleaseBreakdown {
  /** captured − refunded. */
  netCents: number
  commissionCents: number
  /** Accrued fees actually recovered from this payout. */
  recoupedFeeCents: number
  /** Accrued fees still owed after this payout. */
  remainingAccruedFeeCents: number
  /** What actually transfers to the merchant. */
  transferCents: number
}

// ── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Quantity-tiered SaaS pricing: tiers[i] = total cents for
 * quantity i+1; beyond the table each extra unit costs extraPerUnitCents.
 */
export interface TierPricing {
  tiers: number[]
  extraPerUnitCents: number
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type PayKitErrorCode =
  | 'INVALID_CHARGE'
  | 'INVALID_AMOUNT'
  | 'CAPTURE_EXCEEDS_AUTHORIZED'
  | 'REFUND_EXCEEDS_CAPTURED'
  | 'NOTHING_TO_RELEASE'
  | 'ALREADY_RELEASED'

export class PayKitError extends Error {
  readonly code: PayKitErrorCode
  readonly status: number
  constructor(code: PayKitErrorCode, status: number, message: string) {
    super(message)
    this.name = 'PayKitError'
    this.code = code
    this.status = status
  }
}
