import { describe, expect, it } from 'vitest'
import {
  computeFees,
  computeRelease,
  assertCapture,
  assertRefund,
  tierPriceCents,
  accrueFee,
  recoupFromOwed,
  PayKitError,
  type Charge,
} from '../src/index'

const YUMA_POLICY = { defaultPercent: 10, perComponent: { tip: 0 } }
const LINEO_POLICY = { defaultPercent: 7 }

describe('computeFees — per-component commission', () => {
  const charge: Charge = {
    currency: 'EUR',
    components: [
      { type: 'base', amountCents: 2500 },
      { type: 'delivery', amountCents: 300 },
      { type: 'tip', amountCents: 500 },
    ],
  }

  it('tips carry their own rate (0%) while base/delivery pay commission', () => {
    const fees = computeFees(charge, YUMA_POLICY)
    expect(fees.totalCents).toBe(3300)
    expect(fees.components).toEqual([
      { type: 'base', amountCents: 2500, feePercent: 10, feeCents: 250 },
      { type: 'delivery', amountCents: 300, feePercent: 10, feeCents: 30 },
      { type: 'tip', amountCents: 500, feePercent: 0, feeCents: 0 },
    ])
    expect(fees.applicationFeeCents).toBe(280)
    expect(fees.merchantNetCents).toBe(3020)
    expect(fees.currency).toBe('eur') // normalized
  })

  it('merchant override (PRO 8%) applies but perComponent still wins', () => {
    const fees = computeFees(charge, YUMA_POLICY, { feePercentOverride: 8 })
    expect(fees.components[0]!.feeCents).toBe(200) // 8% of 2500
    expect(fees.components[2]!.feeCents).toBe(0) // tip stays 0
  })

  it('lineo flat policy taxes everything at 7% (their current tip behavior)', () => {
    const fees = computeFees(charge, LINEO_POLICY)
    expect(fees.applicationFeeCents).toBe(175 + 21 + 35)
  })

  it('rounds per component (banker-free Math.round, matching production)', () => {
    const fees = computeFees(
      { currency: 'eur', components: [{ type: 'base', amountCents: 105 }] },
      { defaultPercent: 7 },
    )
    expect(fees.components[0]!.feeCents).toBe(7) // 7.35 → 7
  })

  it('rejects invalid charges', () => {
    expect(() => computeFees({ currency: '', components: [{ type: 'base', amountCents: 1 }] }, LINEO_POLICY)).toThrow(PayKitError)
    expect(() => computeFees({ currency: 'eur', components: [] }, LINEO_POLICY)).toThrow(PayKitError)
    expect(() =>
      computeFees({ currency: 'eur', components: [{ type: 'base', amountCents: 10.5 }] }, LINEO_POLICY),
    ).toThrow(PayKitError)
  })
})

describe('escrow math (yuma release model)', () => {
  const state = { authorizedCents: 5000, capturedCents: 4000, refundedCents: 500, releasedCents: 0 }

  it('release = net − commission − recouped accrual', () => {
    const r = computeRelease(state, { feePercent: 10, accruedFeeCents: 200 })
    expect(r.netCents).toBe(3500)
    expect(r.commissionCents).toBe(350)
    expect(r.recoupedFeeCents).toBe(200)
    expect(r.remainingAccruedFeeCents).toBe(0)
    expect(r.transferCents).toBe(2950)
  })

  it('accrual bigger than the payout carries forward, never negative transfer', () => {
    const r = computeRelease(state, { feePercent: 10, accruedFeeCents: 999999 })
    expect(r.transferCents).toBe(0)
    expect(r.recoupedFeeCents).toBe(3150) // everything after commission
    expect(r.remainingAccruedFeeCents).toBe(999999 - 3150)
  })

  it('fully refunded or already released → conflict errors', () => {
    expect(() =>
      computeRelease({ ...state, refundedCents: 4000 }, { feePercent: 10 }),
    ).toThrow(PayKitError)
    expect(() =>
      computeRelease({ ...state, releasedCents: 1 }, { feePercent: 10 }),
    ).toThrowError(/already released/i)
  })

  it('capture/refund guards', () => {
    expect(() => assertCapture(state, 5001)).toThrow(PayKitError)
    expect(() => assertCapture(state, 5000)).not.toThrow()
    expect(() => assertRefund(state, 3501)).toThrow(PayKitError) // only 3500 still captured
    expect(() => assertRefund(state, 3500)).not.toThrow()
  })
})

describe('subscription pricing (lineo tiers) + accrual (yuma)', () => {
  const PRICING = { tiers: [2000, 3600, 5200, 6400], extraPerUnitCents: 1200 }

  it('tier table then linear extras', () => {
    expect(tierPriceCents(0, PRICING)).toBe(0)
    expect(tierPriceCents(1, PRICING)).toBe(2000)
    expect(tierPriceCents(4, PRICING)).toBe(6400)
    expect(tierPriceCents(6, PRICING)).toBe(6400 + 2 * 1200)
  })

  it('accrue + recoup round trip', () => {
    let owed = accrueFee(0, 2900) // one PRO month
    owed = accrueFee(owed, 2900) // second month unpaid
    const first = recoupFromOwed(owed, 4000)
    expect(first).toEqual({ recoupedCents: 4000, remainingOwedCents: 1800 })
    const second = recoupFromOwed(first.remainingOwedCents, 4000)
    expect(second).toEqual({ recoupedCents: 1800, remainingOwedCents: 0 })
  })
})
