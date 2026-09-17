import { describe, expect, it } from 'vitest'
import {
  computeBudget,
  isWithinBudget,
  marginalCost,
  maxFoodSubtotal,
  percentUsed,
  type BudgetInput,
} from './budget'

const base: BudgetInput = { diners: 4, perPersonAgorot: 15_000, tipBp: 1_200 } // 4 × ₪150, 12%

describe('computeBudget', () => {
  it('multiplies diners by the per-person budget', () => {
    expect(computeBudget(base, []).totalBudgetAgorot).toBe(60_000)
  })

  it('sums price × quantity for the food subtotal', () => {
    const summary = computeBudget(base, [
      { priceAgorot: 6_800, qty: 2 },
      { priceAgorot: 3_200, qty: 1 },
    ])
    expect(summary.foodSubtotalAgorot).toBe(16_800)
  })

  it('adds the tip on top of the food and reports what is left', () => {
    const summary = computeBudget(base, [{ priceAgorot: 10_000, qty: 1 }])
    expect(summary.tipAgorot).toBe(1_200)
    expect(summary.estimatedTotalAgorot).toBe(11_200)
    expect(summary.remainingAgorot).toBe(48_800)
    expect(summary.status).toBe('comfortable')
  })

  it('treats a 0% tip as valid', () => {
    const summary = computeBudget({ ...base, tipBp: 0 }, [{ priceAgorot: 10_000, qty: 1 }])
    expect(summary.tipAgorot).toBe(0)
    expect(summary.estimatedTotalAgorot).toBe(10_000)
    expect(summary.maxFoodSubtotalAgorot).toBe(60_000)
  })

  it('keeps decimal prices exact through the subtotal', () => {
    const summary = computeBudget({ ...base, tipBp: 0 }, [
      { priceAgorot: 1_999, qty: 3 },
      { priceAgorot: 4_550, qty: 1 },
    ])
    expect(summary.foodSubtotalAgorot).toBe(10_547)
  })

  it('flags an order that exceeds the budget and reports the overspend', () => {
    const summary = computeBudget(base, [{ priceAgorot: 60_000, qty: 1 }])
    expect(summary.status).toBe('over')
    expect(summary.remainingAgorot).toBeLessThan(0)
    expect(summary.overspendAgorot).toBeCloseTo(7_200, 6)
  })

  it('warns when the order is close to the budget but still inside it', () => {
    const summary = computeBudget(base, [{ priceAgorot: 52_000, qty: 1 }])
    expect(summary.status).toBe('close')
    expect(summary.remainingAgorot).toBeGreaterThan(0)
  })

  it('does not round the tip internally — a fraction of an agora still counts', () => {
    // 12% of 53,571 is 6,428.52; total 59,999.52 — inside, but only just.
    const inside = computeBudget(base, [{ priceAgorot: 53_571, qty: 1 }])
    expect(inside.status).not.toBe('over')
    // One agora more crosses the line.
    const outside = computeBudget(base, [{ priceAgorot: 53_572, qty: 1 }])
    expect(outside.status).toBe('over')
  })

  it('reports no food budget left once the maximum is used up', () => {
    const summary = computeBudget(base, [{ priceAgorot: 60_000, qty: 1 }])
    expect(summary.remainingFoodBudgetAgorot).toBe(0)
  })
})

describe('maxFoodSubtotal', () => {
  it('inverts the tip so the result always fits', () => {
    expect(maxFoodSubtotal(60_000, 1_200)).toBe(53_571)
    expect(isWithinBudget(53_571, 1_200, 60_000)).toBe(true)
    expect(isWithinBudget(53_572, 1_200, 60_000)).toBe(false)
  })

  it('equals the whole budget when there is no tip', () => {
    expect(maxFoodSubtotal(60_000, 0)).toBe(60_000)
  })

  it('handles an empty budget', () => {
    expect(maxFoodSubtotal(0, 1_200)).toBe(0)
  })
})

describe('marginalCost', () => {
  it('includes the tip on the extra unit', () => {
    expect(marginalCost(5_000, 1_200)).toBe(5_600)
    expect(marginalCost(5_000, 0)).toBe(5_000)
  })
})

describe('percentUsed', () => {
  it('reports a whole percentage of the total budget', () => {
    const summary = computeBudget(base, [{ priceAgorot: 26_785, qty: 1 }])
    expect(percentUsed(summary)).toBe(50)
  })

  it('is zero when no budget is set', () => {
    expect(percentUsed(computeBudget({ diners: 0, perPersonAgorot: 0, tipBp: 0 }, []))).toBe(0)
  })
})
