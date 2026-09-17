import { describe, expect, it } from 'vitest'
import {
  addVariant,
  emptyMenu,
  ensureCategory,
  hasUsablePrice,
  itemsByCategory,
  itemsNeedingReview,
  makeItem,
  makeVariant,
  menuSchema,
  mergeItems,
  removeItem,
  removeVariant,
  updateItem,
  updateVariant,
  upsertItem,
  type Menu,
} from './menu'

function seed(): Menu {
  const base = ensureCategory(emptyMenu(), 'ראשונות')
  const menu = base.menu
  return upsertItem(menu, makeItem({ id: 'i1', name: 'חומוס', categoryId: base.categoryId, variants: [makeVariant({ id: 'v1', priceAgorot: 3_200 })] }))
}

describe('menu editing', () => {
  it('adds and updates items', () => {
    let menu = seed()
    menu = updateItem(menu, 'i1', { name: 'חומוס הבית' })
    expect(menu.items[0].name).toBe('חומוס הבית')
  })

  it('never lets an edit change an item id', () => {
    const menu = updateItem(seed(), 'i1', { id: 'hacked' } as never)
    expect(menu.items[0].id).toBe('i1')
  })

  it('updates a variant price', () => {
    const menu = updateVariant(seed(), 'i1', 'v1', { priceAgorot: 3_500 })
    expect(menu.items[0].variants[0].priceAgorot).toBe(3_500)
  })

  it('adds and removes variants but keeps at least one', () => {
    let menu = addVariant(seed(), 'i1', { id: 'v2', priceAgorot: 4_000 })
    expect(menu.items[0].variants).toHaveLength(2)
    menu = removeVariant(menu, 'i1', 'v2')
    expect(menu.items[0].variants).toHaveLength(1)
    menu = removeVariant(menu, 'i1', 'v1')
    expect(menu.items[0].variants).toHaveLength(1)
  })

  it('deletes items', () => {
    expect(removeItem(seed(), 'i1').items).toHaveLength(0)
  })

  it('reuses an existing category instead of duplicating it', () => {
    const first = ensureCategory(seed(), 'ראשונות')
    expect(first.menu.categories).toHaveLength(1)
    const second = ensureCategory(first.menu, 'קינוחים')
    expect(second.menu.categories).toHaveLength(2)
  })
})

describe('mergeItems', () => {
  it('keeps distinct sizes as separate variants', () => {
    let menu = seed()
    menu = upsertItem(
      menu,
      makeItem({
        id: 'i2',
        name: 'חומוס',
        categoryId: menu.categories[0].id,
        variants: [makeVariant({ id: 'v2', label: 'גדול', priceAgorot: 4_200 })],
        sourceImageIds: ['img_2'],
      }),
    )
    const merged = mergeItems(menu, 'i1', 'i2')
    expect(merged.items).toHaveLength(1)
    expect(merged.items[0].variants).toHaveLength(2)
  })

  it('does not duplicate an identical variant', () => {
    let menu = seed()
    menu = upsertItem(
      menu,
      makeItem({ id: 'i2', name: 'חומוס', categoryId: menu.categories[0].id, variants: [makeVariant({ priceAgorot: 3_200 })] }),
    )
    expect(mergeItems(menu, 'i1', 'i2').items[0].variants).toHaveLength(1)
  })

  it('is a no-op for unknown or identical ids', () => {
    const menu = seed()
    expect(mergeItems(menu, 'i1', 'i1')).toBe(menu)
    expect(mergeItems(menu, 'i1', 'nope')).toBe(menu)
  })
})

describe('price usability', () => {
  it('only counts a fixed, positive price as usable', () => {
    const item = makeItem({ variants: [makeVariant({ priceAgorot: 3_200 })] })
    expect(hasUsablePrice(item, item.variants[0])).toBe(true)

    const market = makeItem({ priceKind: 'market', variants: [makeVariant({ priceAgorot: 9_000 })] })
    expect(hasUsablePrice(market, market.variants[0])).toBe(false)

    const missing = makeItem({ variants: [makeVariant({ priceAgorot: null })] })
    expect(hasUsablePrice(missing, missing.variants[0])).toBe(false)
  })
})

describe('grouping', () => {
  it('lists items under their category and collects orphans', () => {
    let menu = seed()
    menu = upsertItem(menu, makeItem({ id: 'i9', name: 'יתום', categoryId: 'ghost' }))
    const groups = itemsByCategory(menu)
    expect(groups.at(-1)?.category.name).toBe('ללא קטגוריה')
  })

  it('collects items flagged on the item or on a variant', () => {
    let menu = seed()
    menu = upsertItem(menu, makeItem({ id: 'i3', name: 'ספק', needsReview: true }))
    expect(itemsNeedingReview(menu)).toHaveLength(1)
  })
})

describe('schema', () => {
  it('rejects a menu whose item has no variants', () => {
    const bad = { categories: [], items: [{ id: 'x', name: 'x', categoryId: 'c', variants: [] }], confirmed: false }
    expect(menuSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a negative price', () => {
    const bad = {
      categories: [],
      items: [{ id: 'x', name: 'x', categoryId: 'c', variants: [{ id: 'v', priceAgorot: -1 }] }],
      confirmed: false,
    }
    expect(menuSchema.safeParse(bad).success).toBe(false)
  })
})
