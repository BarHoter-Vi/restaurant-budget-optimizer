import { beforeEach, describe, expect, it } from 'vitest'
import {
  pricedLines,
  resolveSelections,
  selectBudgetSummary,
  selectCandidates,
  selectSuggestions,
  useAppStore,
} from './store'
import { ensureCategory, emptyMenu, makeItem, makeVariant, upsertItem, type Menu } from '../domain/menu'
import { loadSession } from '../persistence/session'
import { isWithinBudget } from '../domain/budget'

function buildMenu(): Menu {
  const seeded = ensureCategory(emptyMenu(), 'עיקריות')
  let menu = seeded.menu
  menu = upsertItem(
    menu,
    makeItem({
      id: 'i1',
      name: 'שניצל',
      categoryId: seeded.categoryId,
      variants: [makeVariant({ id: 'v1', priceAgorot: 6_800 })],
    }),
  )
  menu = upsertItem(
    menu,
    makeItem({
      id: 'i2',
      name: 'דג הים',
      categoryId: seeded.categoryId,
      priceKind: 'market',
      variants: [makeVariant({ id: 'v2', priceAgorot: null })],
    }),
  )
  return { ...menu, confirmed: true }
}

describe('store selection flow', () => {
  beforeEach(async () => {
    localStorage.clear()
    await useAppStore.getState().resetAll()
    useAppStore.setState({ menu: buildMenu(), budget: { diners: 2, perPersonAgorot: 10_000, tipBp: 1_000 } })
  })

  it('counts a shared dish once — it is not multiplied by the party size', () => {
    useAppStore.getState().addOne('i1', 'v1')
    const state = useAppStore.getState()
    expect(selectBudgetSummary(state).foodSubtotalAgorot).toBe(6_800)
  })

  it('updates totals immediately when a quantity changes', () => {
    const { addOne, removeOne } = useAppStore.getState()
    addOne('i1', 'v1')
    addOne('i1', 'v1')
    expect(selectBudgetSummary(useAppStore.getState()).foodSubtotalAgorot).toBe(13_600)
    removeOne('i1', 'v1')
    expect(selectBudgetSummary(useAppStore.getState()).foodSubtotalAgorot).toBe(6_800)
  })

  it('drops a selection when its quantity reaches zero', () => {
    useAppStore.getState().addOne('i1', 'v1')
    useAppStore.getState().removeOne('i1', 'v1')
    expect(useAppStore.getState().selections).toEqual([])
  })

  it('recomputes totals when a price is corrected after the dish was chosen', () => {
    useAppStore.getState().addOne('i1', 'v1')
    useAppStore.getState().patchVariant('i1', 'v1', { priceAgorot: 7_500 })
    expect(selectBudgetSummary(useAppStore.getState()).foodSubtotalAgorot).toBe(7_500)
  })

  it('keeps an item without a numeric price out of the maths', () => {
    useAppStore.getState().addOne('i2', 'v2')
    const state = useAppStore.getState()
    expect(selectBudgetSummary(state).foodSubtotalAgorot).toBe(0)
    expect(resolveSelections(state.menu, state.selections)[0].priceAgorot).toBeNull()
    expect(pricedLines(resolveSelections(state.menu, state.selections))).toEqual([])
  })

  it('offers only confirmed numeric prices as recommendation candidates', () => {
    expect(selectCandidates(useAppStore.getState().menu).map((c) => c.itemId)).toEqual(['i1'])
  })

  it('removes selections when the dish is deleted', () => {
    useAppStore.getState().addOne('i1', 'v1')
    useAppStore.getState().deleteItem('i1')
    expect(useAppStore.getState().selections).toEqual([])
  })

  it('warns once the order goes over budget', () => {
    const { addOne } = useAppStore.getState()
    addOne('i1', 'v1')
    addOne('i1', 'v1')
    addOne('i1', 'v1')
    const summary = selectBudgetSummary(useAppStore.getState())
    expect(summary.status).toBe('over')
    expect(summary.overspendAgorot).toBeGreaterThan(0)
  })

  it('never suggests something that would break the budget', () => {
    useAppStore.getState().addOne('i1', 'v1')
    const state = useAppStore.getState()
    for (const suggestion of selectSuggestions(state)) {
      expect(
        isWithinBudget(suggestion.newSubtotalAgorot, state.budget.tipBp, 20_000),
      ).toBe(true)
    }
  })

  it('offers no suggestions until the menu is confirmed', () => {
    useAppStore.setState({ menu: { ...useAppStore.getState().menu, confirmed: false } })
    expect(selectSuggestions(useAppStore.getState())).toEqual([])
  })

  it('persists after every change and restores on hydrate', async () => {
    useAppStore.getState().addOne('i1', 'v1')
    expect(loadSession()?.selections).toEqual([{ itemId: 'i1', variantId: 'v1', qty: 1 }])

    useAppStore.setState({ selections: [], menu: emptyMenu(), hydrated: false })
    await useAppStore.getState().hydrate()
    expect(useAppStore.getState().selections).toEqual([{ itemId: 'i1', variantId: 'v1', qty: 1 }])
    expect(useAppStore.getState().menu.items).toHaveLength(2)
  })

  it('wipes everything on reset', async () => {
    useAppStore.getState().addOne('i1', 'v1')
    await useAppStore.getState().resetAll()
    const state = useAppStore.getState()
    expect(state.selections).toEqual([])
    expect(state.menu.items).toEqual([])
    expect(state.images).toEqual([])
    expect(loadSession()).toBeNull()
  })
})

describe('menu editing through the store', () => {
  beforeEach(async () => {
    localStorage.clear()
    await useAppStore.getState().resetAll()
    useAppStore.setState({ menu: buildMenu() })
  })

  it('adds a manual item flagged for completion', () => {
    const id = useAppStore.getState().addManualItem()
    const item = useAppStore.getState().menu.items.find((i) => i.id === id)
    expect(item?.origin).toBe('manual')
    expect(item?.needsReview).toBe(true)
  })

  it('moves an item to a new category, creating it if needed', () => {
    useAppStore.getState().setItemCategory('i1', 'קינוחים')
    const state = useAppStore.getState()
    const dessert = state.menu.categories.find((c) => c.name === 'קינוחים')
    expect(state.menu.items.find((i) => i.id === 'i1')?.categoryId).toBe(dessert?.id)
  })

  it('confirms the menu and moves to selection', () => {
    useAppStore.setState({ menu: { ...useAppStore.getState().menu, confirmed: false } })
    useAppStore.getState().confirmMenu()
    expect(useAppStore.getState().menu.confirmed).toBe(true)
    expect(useAppStore.getState().step).toBe('select')
  })

  it('sends the user back to review when the menu is unconfirmed', () => {
    useAppStore.getState().unconfirmMenu()
    expect(useAppStore.getState().step).toBe('review')
  })
})

describe('recovering from an interrupted extraction', () => {
  it('does not restore an image as stuck mid-processing', async () => {
    localStorage.clear()
    await useAppStore.getState().resetAll()
    useAppStore.setState({
      images: [
        {
          id: 'img_1',
          name: 'menu.jpg',
          rotationDeg: 0,
          status: 'processing',
          itemCount: 0,
          previewUrl: 'blob:preview',
        },
      ],
    })
    // Persisting happens through the normal path, then we reload from storage.
    useAppStore.getState().goTo('upload')
    await useAppStore.getState().hydrate()

    const restored = useAppStore.getState().images.find((i) => i.id === 'img_1')
    // The blob itself is gone in this test, so the image drops out entirely —
    // what matters is that nothing comes back claiming to still be processing.
    expect(restored?.status).not.toBe('processing')
  })
})
