import { type Agorot, type BasisPoints, roundHalfAwayFromZero } from './money'

export interface BudgetInput {
  /** Number of diners sharing the budget. Integer >= 1. */
  diners: number
  /** Budget per diner, in agorot. Assumed to INCLUDE the tip. */
  perPersonAgorot: Agorot
  /** Tip percentage in basis points (12% -> 1200). 0 is valid. */
  tipBp: BasisPoints
}

/** One selected line: a dish/variant at a confirmed price, times a quantity. */
export interface PricedLine {
  priceAgorot: Agorot
  qty: number
}

export type BudgetStatus = 'comfortable' | 'close' | 'over'

export interface BudgetSummary {
  /** diners × perPerson. Integer agorot. */
  totalBudgetAgorot: Agorot
  /** Σ price × qty. Integer agorot. */
  foodSubtotalAgorot: Agorot
  /** Unrounded — rounded only when displayed. */
  tipAgorot: number
  /** Unrounded. */
  estimatedTotalAgorot: number
  /** Unrounded; negative when over budget. */
  remainingAgorot: number
  /**
   * Largest food subtotal that still fits once the tip is added.
   * Floored, so it is always safe to spend up to this amount.
   */
  maxFoodSubtotalAgorot: Agorot
  /** How much more food can be ordered. Never negative. */
  remainingFoodBudgetAgorot: Agorot
  /** 0..n, share of the total budget consumed. 1 = exactly on budget. */
  fractionUsed: number
  status: BudgetStatus
  /** Positive amount by which the order exceeds the budget; 0 when within it. */
  overspendAgorot: number
}

/** Above this share of the budget the UI switches to the "close" state. */
export const CLOSE_THRESHOLD = 0.9

export function totalBudget(input: BudgetInput): Agorot {
  const diners = Math.max(0, Math.floor(input.diners))
  return diners * input.perPersonAgorot
}

export function foodSubtotal(lines: readonly PricedLine[]): Agorot {
  let sum = 0
  for (const line of lines) {
    const qty = Math.max(0, Math.floor(line.qty))
    sum += line.priceAgorot * qty
  }
  return sum
}

/** Unrounded tip. Kept as a float on purpose — see money.ts. */
export function tipFor(subtotalAgorot: number, tipBp: BasisPoints): number {
  return (subtotalAgorot * tipBp) / 10_000
}

/**
 * Exact over-budget test using integer cross-multiplication, so a subtotal that
 * lands a fraction of an agora over the line is still reported as over.
 */
export function isWithinBudget(
  subtotalAgorot: Agorot,
  tipBp: BasisPoints,
  totalBudgetAgorot: Agorot,
): boolean {
  return subtotalAgorot * (10_000 + tipBp) <= totalBudgetAgorot * 10_000
}

/** Largest subtotal that still fits after tip. Floored => always safe. */
export function maxFoodSubtotal(totalBudgetAgorot: Agorot, tipBp: BasisPoints): Agorot {
  if (totalBudgetAgorot <= 0) return 0
  return Math.floor((totalBudgetAgorot * 10_000) / (10_000 + tipBp))
}

export function computeBudget(input: BudgetInput, lines: readonly PricedLine[]): BudgetSummary {
  const totalBudgetAgorot = totalBudget(input)
  const foodSubtotalAgorot = foodSubtotal(lines)
  const tipAgorot = tipFor(foodSubtotalAgorot, input.tipBp)
  const estimatedTotalAgorot = foodSubtotalAgorot + tipAgorot
  const remainingAgorot = totalBudgetAgorot - estimatedTotalAgorot
  const maxFood = maxFoodSubtotal(totalBudgetAgorot, input.tipBp)
  const within = isWithinBudget(foodSubtotalAgorot, input.tipBp, totalBudgetAgorot)

  const fractionUsed = totalBudgetAgorot > 0 ? estimatedTotalAgorot / totalBudgetAgorot : 0

  let status: BudgetStatus
  if (!within) status = 'over'
  else if (fractionUsed >= CLOSE_THRESHOLD) status = 'close'
  else status = 'comfortable'

  return {
    totalBudgetAgorot,
    foodSubtotalAgorot,
    tipAgorot,
    estimatedTotalAgorot,
    remainingAgorot,
    maxFoodSubtotalAgorot: maxFood,
    remainingFoodBudgetAgorot: Math.max(0, maxFood - foodSubtotalAgorot),
    fractionUsed,
    status,
    overspendAgorot: within ? 0 : -remainingAgorot,
  }
}

/**
 * What adding one more unit of an item would do — used by the menu list to show
 * the marginal cost of a tap before the user makes it.
 */
export function marginalCost(priceAgorot: Agorot, tipBp: BasisPoints): number {
  return priceAgorot + tipFor(priceAgorot, tipBp)
}

/** Percentage of the budget consumed, for display. Rounded to a whole percent. */
export function percentUsed(summary: BudgetSummary): number {
  return roundHalfAwayFromZero(summary.fractionUsed * 100)
}
