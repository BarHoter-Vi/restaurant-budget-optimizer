import { z } from 'zod'
import { MAX_AGOROT } from './money'

/**
 * How a price behaves, which decides whether an item may be used automatically.
 * Only 'fixed' items carry a number we are allowed to optimise against.
 */
export const priceKindSchema = z.enum(['fixed', 'market', 'byWeight', 'unknown'])
export type PriceKind = z.infer<typeof priceKindSchema>

export const agorotSchema = z.number().int().min(0).max(MAX_AGOROT)

export const variantSchema = z.object({
  id: z.string().min(1),
  /** e.g. "קטן" / "בקבוק". Undefined for single-price dishes. */
  label: z.string().optional(),
  /** null means "no confirmed numeric price" — market price, by weight, or unreadable. */
  priceAgorot: agorotSchema.nullable(),
  needsReview: z.boolean().default(false),
})
export type Variant = z.infer<typeof variantSchema>

export const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  categoryId: z.string().min(1),
  variants: z.array(variantSchema).min(1),
  priceKind: priceKindSchema.default('fixed'),
  /** 0..1 OCR confidence. 1 for hand-entered items. */
  confidence: z.number().min(0).max(1).default(1),
  needsReview: z.boolean().default(false),
  /** Free-text reasons shown to the user, e.g. "לא זוהה מחיר". */
  reviewReasons: z.array(z.string()).default([]),
  sourceImageIds: z.array(z.string()).default([]),
  origin: z.enum(['ocr', 'manual']).default('ocr'),
})
export type MenuItem = z.infer<typeof menuItemSchema>

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  order: z.number().int(),
})
export type Category = z.infer<typeof categorySchema>

export const menuSchema = z.object({
  categories: z.array(categorySchema),
  items: z.array(menuItemSchema),
  /** The menu only becomes selectable after the user explicitly confirms it. */
  confirmed: z.boolean().default(false),
})
export type Menu = z.infer<typeof menuSchema>

export const UNCATEGORIZED_ID = 'uncategorized'

export function emptyMenu(): Menu {
  return { categories: [], items: [], confirmed: false }
}

let idCounter = 0
/** Stable-enough unique id without pulling in a uuid dependency. */
export function newId(prefix = 'id'): string {
  idCounter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`
}

export function makeVariant(partial: Partial<Variant> = {}): Variant {
  return {
    id: partial.id ?? newId('var'),
    label: partial.label,
    priceAgorot: partial.priceAgorot ?? null,
    needsReview: partial.needsReview ?? false,
  }
}

export function makeItem(partial: Partial<MenuItem> = {}): MenuItem {
  return {
    id: partial.id ?? newId('item'),
    name: partial.name ?? '',
    description: partial.description,
    categoryId: partial.categoryId ?? UNCATEGORIZED_ID,
    variants: partial.variants?.length ? partial.variants : [makeVariant()],
    priceKind: partial.priceKind ?? 'fixed',
    confidence: partial.confidence ?? 1,
    needsReview: partial.needsReview ?? false,
    reviewReasons: partial.reviewReasons ?? [],
    sourceImageIds: partial.sourceImageIds ?? [],
    origin: partial.origin ?? 'manual',
  }
}

/** True when this variant carries a confirmed number we may optimise against. */
export function hasUsablePrice(item: MenuItem, variant: Variant): boolean {
  return item.priceKind === 'fixed' && variant.priceAgorot !== null && variant.priceAgorot > 0
}

export function itemHasAnyUsablePrice(item: MenuItem): boolean {
  return item.variants.some((v) => hasUsablePrice(item, v))
}

export function findVariant(item: MenuItem, variantId: string): Variant | undefined {
  return item.variants.find((v) => v.id === variantId)
}

export function categoryName(menu: Menu, categoryId: string): string {
  return menu.categories.find((c) => c.id === categoryId)?.name ?? 'ללא קטגוריה'
}

// ---------------------------------------------------------------------------
// Editing operations — pure, so the store stays a thin orchestration layer.
// ---------------------------------------------------------------------------

export function upsertItem(menu: Menu, item: MenuItem): Menu {
  const exists = menu.items.some((i) => i.id === item.id)
  return {
    ...menu,
    items: exists ? menu.items.map((i) => (i.id === item.id ? item : i)) : [...menu.items, item],
  }
}

export function removeItem(menu: Menu, itemId: string): Menu {
  return { ...menu, items: menu.items.filter((i) => i.id !== itemId) }
}

export function updateItem(menu: Menu, itemId: string, patch: Partial<MenuItem>): Menu {
  return {
    ...menu,
    items: menu.items.map((i) => (i.id === itemId ? { ...i, ...patch, id: i.id } : i)),
  }
}

export function updateVariant(
  menu: Menu,
  itemId: string,
  variantId: string,
  patch: Partial<Variant>,
): Menu {
  return {
    ...menu,
    items: menu.items.map((item) => {
      if (item.id !== itemId) return item
      return {
        ...item,
        variants: item.variants.map((v) => (v.id === variantId ? { ...v, ...patch, id: v.id } : v)),
      }
    }),
  }
}

export function addVariant(menu: Menu, itemId: string, variant?: Partial<Variant>): Menu {
  return {
    ...menu,
    items: menu.items.map((item) =>
      item.id === itemId ? { ...item, variants: [...item.variants, makeVariant(variant)] } : item,
    ),
  }
}

/** Removing the last variant is refused — an item always has at least one. */
export function removeVariant(menu: Menu, itemId: string, variantId: string): Menu {
  return {
    ...menu,
    items: menu.items.map((item) => {
      if (item.id !== itemId) return item
      if (item.variants.length <= 1) return item
      return { ...item, variants: item.variants.filter((v) => v.id !== variantId) }
    }),
  }
}

export function ensureCategory(menu: Menu, name: string): { menu: Menu; categoryId: string } {
  const trimmed = name.trim()
  const existing = menu.categories.find((c) => c.name === trimmed)
  if (existing) return { menu, categoryId: existing.id }
  const category: Category = {
    id: newId('cat'),
    name: trimmed || 'ללא קטגוריה',
    order: menu.categories.length,
  }
  return { menu: { ...menu, categories: [...menu.categories, category] }, categoryId: category.id }
}

export function renameCategory(menu: Menu, categoryId: string, name: string): Menu {
  return {
    ...menu,
    categories: menu.categories.map((c) => (c.id === categoryId ? { ...c, name } : c)),
  }
}

/**
 * Merge `sourceId` into `targetId`: keeps the target's identity, unions the
 * variants (by label + price, so a real second size survives) and the source
 * images, keeps the longer description, and clears the review flag only if
 * neither side needed review.
 */
export function mergeItems(menu: Menu, targetId: string, sourceId: string): Menu {
  if (targetId === sourceId) return menu
  const target = menu.items.find((i) => i.id === targetId)
  const source = menu.items.find((i) => i.id === sourceId)
  if (!target || !source) return menu

  const variants = [...target.variants]
  for (const candidate of source.variants) {
    const duplicate = variants.some(
      (v) => (v.label ?? '') === (candidate.label ?? '') && v.priceAgorot === candidate.priceAgorot,
    )
    if (!duplicate) variants.push(candidate)
  }

  const merged: MenuItem = {
    ...target,
    description:
      (source.description ?? '').length > (target.description ?? '').length
        ? source.description
        : target.description,
    variants,
    confidence: Math.max(target.confidence, source.confidence),
    needsReview: target.needsReview && source.needsReview,
    reviewReasons: Array.from(new Set([...target.reviewReasons, ...source.reviewReasons])),
    sourceImageIds: Array.from(new Set([...target.sourceImageIds, ...source.sourceImageIds])),
  }

  return removeItem(upsertItem(menu, merged), sourceId)
}

export function itemsByCategory(menu: Menu): Array<{ category: Category; items: MenuItem[] }> {
  const categories = [...menu.categories].sort((a, b) => a.order - b.order)
  const known = categories.map((category) => ({
    category,
    items: menu.items.filter((i) => i.categoryId === category.id),
  }))
  const orphanItems = menu.items.filter((i) => !menu.categories.some((c) => c.id === i.categoryId))
  if (orphanItems.length) {
    known.push({
      category: { id: UNCATEGORIZED_ID, name: 'ללא קטגוריה', order: categories.length },
      items: orphanItems,
    })
  }
  return known.filter((group) => group.items.length > 0)
}

export function itemsNeedingReview(menu: Menu): MenuItem[] {
  return menu.items.filter((i) => i.needsReview || i.variants.some((v) => v.needsReview))
}
