import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, describeSuggestion, recommend, type Candidate } from './recommend'
import { isWithinBudget, maxFoodSubtotal } from './budget'

const candidate = (
  name: string,
  priceAgorot: number,
  categoryId = 'cat_food',
  categoryName = 'אוכל',
): Candidate => ({
  itemId: `item_${name}`,
  variantId: `var_${name}`,
  name,
  categoryId,
  categoryName,
  priceAgorot,
})

const MENU: Candidate[] = [
  candidate('סלט', 3_800, 'cat_starter', 'ראשונות'),
  candidate('חומוס', 3_200, 'cat_starter', 'ראשונות'),
  candidate('שניצל', 6_800, 'cat_main', 'עיקריות'),
  candidate('פסטה', 5_900, 'cat_main', 'עיקריות'),
  candidate('לימונדה', 1_800, 'cat_drink', 'שתייה'),
  candidate('בירה', 2_200, 'cat_drink', 'שתייה'),
  candidate('קינוח', 2_900, 'cat_dessert', 'קינוחים'),
]

function contextFor(totalBudgetAgorot: number, tipBp: number, currentSubtotalAgorot = 0) {
  return {
    candidates: MENU,
    totalBudgetAgorot,
    tipBp,
    currentSubtotalAgorot,
    remainingFoodBudgetAgorot: Math.max(
      0,
      maxFoodSubtotal(totalBudgetAgorot, tipBp) - currentSubtotalAgorot,
    ),
  }
}

describe('recommend', () => {
  it('suggests combinations that fit the remaining budget', () => {
    const suggestions = recommend(contextFor(20_000, 1_200))
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it('never proposes anything that would exceed the budget after tip', () => {
    for (const total of [5_000, 12_000, 20_000, 33_333, 60_000]) {
      for (const tipBp of [0, 1_000, 1_250, 1_800]) {
        const context = contextFor(total, tipBp)
        for (const suggestion of recommend(context)) {
          expect(isWithinBudget(suggestion.newSubtotalAgorot, tipBp, total)).toBe(true)
          expect(suggestion.leftoverAgorot).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('holds the constraint under randomised menus and budgets', () => {
    let seed = 1337
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }

    for (let round = 0; round < 120; round += 1) {
      const size = 3 + Math.floor(random() * 10)
      const candidates = Array.from({ length: size }, (_, index) =>
        candidate(`מנה${index}`, 500 + Math.floor(random() * 9_000), `cat_${index % 4}`, `ק${index % 4}`),
      )
      const totalBudgetAgorot = 3_000 + Math.floor(random() * 40_000)
      const tipBp = Math.floor(random() * 2_000)
      const currentSubtotalAgorot = Math.floor(random() * 5_000)
      const remaining = Math.max(
        0,
        maxFoodSubtotal(totalBudgetAgorot, tipBp) - currentSubtotalAgorot,
      )

      const suggestions = recommend({
        candidates,
        totalBudgetAgorot,
        tipBp,
        currentSubtotalAgorot,
        remainingFoodBudgetAgorot: remaining,
      })

      for (const suggestion of suggestions) {
        expect(isWithinBudget(suggestion.newSubtotalAgorot, tipBp, totalBudgetAgorot)).toBe(true)
      }
    }
  })

  it('accounts for what is already in the order', () => {
    const suggestions = recommend(contextFor(20_000, 1_200, 15_000))
    for (const suggestion of suggestions) {
      expect(suggestion.newSubtotalAgorot).toBeGreaterThanOrEqual(15_000)
      expect(isWithinBudget(suggestion.newSubtotalAgorot, 1_200, 20_000)).toBe(true)
    }
  })

  it('returns nothing when the budget is already spent', () => {
    expect(recommend(contextFor(20_000, 1_200, 20_000))).toEqual([])
  })

  it('returns nothing when the budget is already exceeded', () => {
    expect(recommend(contextFor(20_000, 1_200, 40_000))).toEqual([])
  })

  it('never suggests more than the configured copies of one dish', () => {
    const suggestions = recommend({ ...contextFor(60_000, 0), candidates: [candidate('בירה', 2_200, 'cat_drink', 'שתייה')] })
    for (const suggestion of suggestions) {
      for (const line of suggestion.lines) {
        expect(line.qty).toBeLessThanOrEqual(DEFAULT_RULES.maxQtyPerItem)
      }
    }
  })

  it('does not fill the budget with one category', () => {
    const drinksOnly = [
      candidate('בירה', 2_200, 'cat_drink', 'שתייה'),
      candidate('לימונדה', 1_800, 'cat_drink', 'שתייה'),
      candidate('קולה', 1_500, 'cat_drink', 'שתייה'),
    ]
    const suggestions = recommend({ ...contextFor(60_000, 0), candidates: drinksOnly })
    for (const suggestion of suggestions) {
      const units = suggestion.lines.reduce((sum, line) => sum + line.qty, 0)
      expect(units).toBeLessThanOrEqual(DEFAULT_RULES.maxPerCategory)
    }
  })

  it('respects category units already selected', () => {
    const suggestions = recommend({
      ...contextFor(60_000, 0),
      selectedPerCategory: { cat_drink: DEFAULT_RULES.maxPerCategory },
    })
    for (const suggestion of suggestions) {
      expect(suggestion.lines.every((line) => line.categoryName !== 'שתייה')).toBe(true)
    }
  })

  it('prefers leaving as little of the budget unused as possible', () => {
    const suggestions = recommend(contextFor(11_200, 1_200))
    // ₪100 of food fits exactly at 12%; the top suggestion should get close.
    expect(suggestions[0].addedSubtotalAgorot).toBeGreaterThan(9_000)
  })

  it('explains each suggestion', () => {
    for (const suggestion of recommend(contextFor(20_000, 1_200))) {
      expect(suggestion.reasons.length).toBeGreaterThan(0)
      expect(describeSuggestion(suggestion)).not.toBe('')
    }
  })

  it('ignores items that are too cheap to be worth suggesting', () => {
    const suggestions = recommend({
      ...contextFor(20_000, 0),
      candidates: [candidate('חמוצים', 50), candidate('שניצל', 6_800)],
    })
    expect(suggestions.every((s) => s.lines.every((l) => l.name !== 'חמוצים'))).toBe(true)
  })

  it('has no suggestions to give from an empty menu', () => {
    expect(recommend({ ...contextFor(20_000, 1_200), candidates: [] })).toEqual([])
  })
})
