import type { Agorot, BasisPoints } from './money'
import { formatILS } from './money'
import { isWithinBudget } from './budget'

/**
 * "Optimal" in v1 means: leave as little of the budget unused as possible,
 * without ever crossing it once the tip is added, and without proposing
 * something nobody would actually order (six identical colas).
 *
 * The search is a depth-limited DFS over combinations with a hard node budget,
 * which keeps it well under a frame's worth of work on a phone. All the levers
 * live in RuleSet so future rules (dietary, party size, course balance) slot in
 * without touching the search.
 */

export interface Candidate {
  itemId: string
  variantId: string
  name: string
  variantLabel?: string
  categoryId: string
  categoryName: string
  /** Always a confirmed, positive number — callers must filter out the rest. */
  priceAgorot: Agorot
}

export interface RuleSet {
  /** How many different dishes one suggestion may contain. */
  maxDistinctItems: number
  /** How many copies of the same dish a suggestion may contain. */
  maxQtyPerItem: number
  /** Cap on total units drawn from a single category, counting what's already ordered. */
  maxPerCategory: number
  maxSuggestions: number
  /** Safety valve so a huge menu can never lock the UI. */
  nodeBudget: number
  /** Score bonus per distinct category used. */
  diversityBonus: number
  /** Score penalty per repeated unit of the same dish. */
  duplicatePenalty: number
  /** Ignore candidates cheaper than this; stops "add a side of pickles" noise. */
  minPriceAgorot: Agorot
}

export const DEFAULT_RULES: RuleSet = {
  maxDistinctItems: 4,
  maxQtyPerItem: 2,
  maxPerCategory: 3,
  maxSuggestions: 5,
  nodeBudget: 120_000,
  diversityBonus: 0.04,
  duplicatePenalty: 0.05,
  minPriceAgorot: 100,
}

export interface RecommendContext {
  candidates: readonly Candidate[]
  /** Food budget still available BEFORE tip — i.e. maxFoodSubtotal − current subtotal. */
  remainingFoodBudgetAgorot: Agorot
  /** Food subtotal of what is already selected. */
  currentSubtotalAgorot: Agorot
  totalBudgetAgorot: Agorot
  tipBp: BasisPoints
  /** Units already selected per category, so caps account for the current order. */
  selectedPerCategory?: Readonly<Record<string, number>>
  rules?: Partial<RuleSet>
}

export interface SuggestionLine {
  itemId: string
  variantId: string
  name: string
  variantLabel?: string
  categoryName: string
  priceAgorot: Agorot
  qty: number
}

export interface Suggestion {
  id: string
  lines: SuggestionLine[]
  addedSubtotalAgorot: Agorot
  newSubtotalAgorot: Agorot
  newTotalAgorot: number
  /** Budget left over after this suggestion, including tip. Always >= 0. */
  leftoverAgorot: number
  score: number
  reasons: string[]
}

interface Frame {
  itemId: string
  variantId: string
  qty: number
  index: number
}

export function recommend(ctx: RecommendContext): Suggestion[] {
  const rules: RuleSet = { ...DEFAULT_RULES, ...ctx.rules }
  const budget = ctx.remainingFoodBudgetAgorot

  if (budget <= 0) return []

  // Only affordable, sensible candidates; most expensive first so the search
  // finds high-utilisation combinations early and prunes hard.
  const pool = ctx.candidates
    .filter((c) => c.priceAgorot > 0 && c.priceAgorot >= rules.minPriceAgorot)
    .filter((c) => c.priceAgorot <= budget)
    .sort((a, b) => b.priceAgorot - a.priceAgorot)

  if (pool.length === 0) return []

  const baseCategoryCounts: Record<string, number> = { ...(ctx.selectedPerCategory ?? {}) }
  const collected = new Map<string, Suggestion>()
  let nodes = 0

  const stack: Frame[] = []
  const categoryCounts: Record<string, number> = { ...baseCategoryCounts }

  const record = (spent: Agorot): void => {
    if (spent <= 0 || stack.length === 0) return

    const newSubtotal = ctx.currentSubtotalAgorot + spent
    // Hard constraint, checked with exact integer arithmetic. Nothing is emitted
    // without passing this, regardless of what the search thought it was doing.
    if (!isWithinBudget(newSubtotal, ctx.tipBp, ctx.totalBudgetAgorot)) return

    const key = stack
      .map((frame) => `${frame.variantId}x${frame.qty}`)
      .sort()
      .join('|')
    if (collected.has(key)) return

    const lines: SuggestionLine[] = stack.map((frame) => {
      const candidate = pool[frame.index]
      return {
        itemId: candidate.itemId,
        variantId: candidate.variantId,
        name: candidate.name,
        variantLabel: candidate.variantLabel,
        categoryName: candidate.categoryName,
        priceAgorot: candidate.priceAgorot,
        qty: frame.qty,
      }
    })

    const distinctCategories = new Set(lines.map((l) => l.categoryName)).size
    const repeats = lines.reduce((sum, l) => sum + (l.qty - 1), 0)
    const utilisation = spent / budget
    const score =
      utilisation + distinctCategories * rules.diversityBonus - repeats * rules.duplicatePenalty

    const newTotal = newSubtotal * (1 + ctx.tipBp / 10_000)
    const leftover = ctx.totalBudgetAgorot - newTotal

    collected.set(key, {
      id: key,
      lines,
      addedSubtotalAgorot: spent,
      newSubtotalAgorot: newSubtotal,
      newTotalAgorot: newTotal,
      leftoverAgorot: Math.max(0, leftover),
      score,
      reasons: buildReasons(lines, leftover, distinctCategories, budget - spent),
    })
  }

  const dfs = (start: number, spent: Agorot): void => {
    if (nodes >= rules.nodeBudget) return
    nodes += 1

    record(spent)

    if (stack.length >= rules.maxDistinctItems) return

    for (let index = start; index < pool.length; index += 1) {
      const candidate = pool[index]
      if (candidate.priceAgorot > budget - spent) continue // sorted desc, but qty varies

      const used = categoryCounts[candidate.categoryId] ?? 0
      const maxByCategory = rules.maxPerCategory - used
      if (maxByCategory <= 0) continue

      const maxQty = Math.min(
        rules.maxQtyPerItem,
        maxByCategory,
        Math.floor((budget - spent) / candidate.priceAgorot),
      )

      for (let qty = 1; qty <= maxQty; qty += 1) {
        const cost = candidate.priceAgorot * qty
        stack.push({ itemId: candidate.itemId, variantId: candidate.variantId, qty, index })
        categoryCounts[candidate.categoryId] = used + qty
        dfs(index + 1, spent + cost)
        stack.pop()
        categoryCounts[candidate.categoryId] = used
        if (nodes >= rules.nodeBudget) return
      }
    }
  }

  dfs(0, 0)

  return Array.from(collected.values())
    .sort((a, b) => b.score - a.score || a.lines.length - b.lines.length)
    .slice(0, rules.maxSuggestions)
}

function buildReasons(
  lines: SuggestionLine[],
  leftover: number,
  distinctCategories: number,
  unusedFoodBudget: number,
): string[] {
  const reasons: string[] = []
  reasons.push(`נשאר ${formatILS(Math.max(0, leftover))} מהתקציב הכולל, כולל טיפ`)
  if (unusedFoodBudget <= 500) {
    reasons.push('מנצל כמעט את כל התקציב שנותר לאוכל')
  }
  if (distinctCategories > 1) {
    reasons.push(`משלב ${distinctCategories} קטגוריות שונות`)
  }
  if (lines.length === 1 && lines[0].qty === 1) {
    reasons.push('תוספת בודדת ופשוטה להזמנה')
  }
  return reasons
}

/** Convenience wrapper used by the UI to describe a suggestion in one line. */
export function describeSuggestion(suggestion: Suggestion): string {
  return suggestion.lines
    .map((line) => {
      const label = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name
      return line.qty > 1 ? `${label} ×${line.qty}` : label
    })
    .join(' + ')
}
