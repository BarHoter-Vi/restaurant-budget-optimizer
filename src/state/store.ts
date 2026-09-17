import { create } from 'zustand'
import {
  type Menu,
  type MenuItem,
  type Variant,
  addVariant,
  emptyMenu,
  findVariant,
  hasUsablePrice,
  makeItem,
  mergeItems,
  newId,
  removeItem as removeMenuItem,
  removeVariant,
  updateItem,
  updateVariant,
  ensureCategory,
  renameCategory,
  UNCATEGORIZED_ID,
} from '../domain/menu'
import { applyAutoMerges, type DuplicateCandidate, findDuplicates } from '../domain/dedupe'
import { computeBudget, type BudgetSummary, type PricedLine } from '../domain/budget'
import { type Candidate, recommend, type Suggestion, type RuleSet } from '../domain/recommend'
import {
  DEFAULT_BUDGET,
  clearSession,
  defaultSession,
  loadSession,
  pruneSelections,
  saveSession,
  type ImageMeta,
  type PersistedBudget,
  type Selection,
  type Step,
} from '../persistence/session'
import { clearImages, deleteImage, getAllImages, getImage, putImage } from '../persistence/images'
import { makeThumbnail } from '../ocr/preprocess'
import { parsePage } from '../ocr/parse'
import type { OcrProgress } from '../ocr/types'

/**
 * tesseract.js and its WASM wrapper are several hundred kilobytes, and most of a
 * session never touches them (a returning user goes straight to the confirmed
 * menu). Loading the engine on demand keeps the first paint small.
 */
const ocrEngine = () => import('../ocr/engine')

export interface ImageEntry extends ImageMeta {
  /** Object URL for the preview. Session-only; revoked on removal/reset. */
  previewUrl: string
}

interface AppState {
  step: Step
  budget: PersistedBudget
  menu: Menu
  selections: Selection[]
  images: ImageEntry[]
  ocrProgress: Record<string, OcrProgress>
  duplicateSuggestions: DuplicateCandidate[]
  isProcessing: boolean
  hydrated: boolean
  storageWarning: string | null

  // lifecycle
  hydrate: () => Promise<void>
  resetAll: () => Promise<void>

  // navigation
  goTo: (step: Step) => void

  // budget
  setBudget: (patch: Partial<PersistedBudget>) => void

  // images
  addImages: (files: File[]) => Promise<void>
  rotateImage: (id: string) => void
  removeImage: (id: string) => Promise<void>
  runOcr: (ids?: string[]) => Promise<void>

  // menu editing
  confirmMenu: () => void
  unconfirmMenu: () => void
  addManualItem: (categoryId?: string) => string
  patchItem: (itemId: string, patch: Partial<MenuItem>) => void
  patchVariant: (itemId: string, variantId: string, patch: Partial<Variant>) => void
  addItemVariant: (itemId: string) => void
  deleteItemVariant: (itemId: string, variantId: string) => void
  deleteItem: (itemId: string) => void
  setItemCategory: (itemId: string, categoryName: string) => void
  renameMenuCategory: (categoryId: string, name: string) => void
  mergeDuplicate: (targetId: string, sourceId: string) => void
  dismissDuplicate: (targetId: string, sourceId: string) => void
  refreshDuplicates: () => void

  // selection
  setQty: (itemId: string, variantId: string, qty: number) => void
  addOne: (itemId: string, variantId: string) => void
  removeOne: (itemId: string, variantId: string) => void
  clearSelections: () => void
}

function persist(state: AppState): void {
  saveSession({
    step: state.step,
    budget: state.budget,
    menu: state.menu,
    selections: state.selections,
    images: state.images.map(({ previewUrl: _previewUrl, ...meta }) => meta),
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  step: 'budget',
  budget: { ...DEFAULT_BUDGET },
  menu: emptyMenu(),
  selections: [],
  images: [],
  ocrProgress: {},
  duplicateSuggestions: [],
  isProcessing: false,
  hydrated: false,
  storageWarning: null,

  hydrate: async () => {
    const saved = loadSession() ?? defaultSession()
    let images: ImageEntry[] = []
    try {
      const stored = await getAllImages()
      const known = new Set(saved.images.map((i) => i.id))
      images = stored
        .filter((image) => known.has(image.id))
        .map((image) => {
          const meta = saved.images.find((i) => i.id === image.id)!
          // A refresh mid-extraction would otherwise restore a frozen progress
          // bar with no way out; back to pending, ready to be run again.
          const status = meta.status === 'processing' ? 'pending' : meta.status
          return { ...meta, status, previewUrl: URL.createObjectURL(image.thumbnail) }
        })
    } catch {
      images = []
    }

    set({
      step: saved.step,
      budget: saved.budget,
      menu: saved.menu,
      selections: pruneSelections(saved.menu, saved.selections),
      images,
      hydrated: true,
    })
  },

  resetAll: async () => {
    for (const image of get().images) URL.revokeObjectURL(image.previewUrl)
    clearSession()
    await clearImages().catch(() => undefined)
    await (await ocrEngine()).terminateEngine()
    set({
      ...defaultSession(),
      images: [],
      ocrProgress: {},
      duplicateSuggestions: [],
      isProcessing: false,
      hydrated: true,
      storageWarning: null,
    })
  },

  goTo: (step) => {
    set({ step })
    persist(get())
  },

  setBudget: (patch) => {
    set({ budget: { ...get().budget, ...patch } })
    persist(get())
  },

  addImages: async (files) => {
    const entries: ImageEntry[] = []
    for (const file of files) {
      const id = newId('img')
      try {
        const thumbnail = await makeThumbnail(file)
        await putImage({ id, name: file.name || 'תמונה', blob: file, thumbnail, createdAt: Date.now() })
        entries.push({
          id,
          name: file.name || 'תמונה',
          rotationDeg: 0,
          status: 'pending',
          itemCount: 0,
          previewUrl: URL.createObjectURL(thumbnail),
        })
      } catch (error) {
        set({
          storageWarning:
            error instanceof Error ? error.message : 'לא ניתן לשמור את התמונה במכשיר',
        })
      }
    }
    if (entries.length) {
      set({ images: [...get().images, ...entries] })
      persist(get())
    }
  },

  rotateImage: (id) => {
    set({
      images: get().images.map((image) =>
        image.id === id ? { ...image, rotationDeg: (image.rotationDeg + 90) % 360 } : image,
      ),
    })
    persist(get())
  },

  removeImage: async (id) => {
    const image = get().images.find((i) => i.id === id)
    if (image) URL.revokeObjectURL(image.previewUrl)
    await deleteImage(id).catch(() => undefined)
    set({
      images: get().images.filter((i) => i.id !== id),
      // Items extracted from this photo go with it.
      menu: {
        ...get().menu,
        items: get()
          .menu.items.filter((item) => !(item.sourceImageIds.length === 1 && item.sourceImageIds[0] === id))
          .map((item) => ({
            ...item,
            sourceImageIds: item.sourceImageIds.filter((sourceId) => sourceId !== id),
          })),
      },
    })
    get().refreshDuplicates()
    persist(get())
  },

  runOcr: async (ids) => {
    const targets = get().images.filter((image) => (ids ? ids.includes(image.id) : image.status !== 'done'))
    if (targets.length === 0) return

    set({ isProcessing: true })
    const { describeOcrError, recognizeImage } = await ocrEngine()

    for (const target of targets) {
      set({
        images: get().images.map((image) =>
          image.id === target.id ? { ...image, status: 'processing', error: undefined } : image,
        ),
        ocrProgress: {
          ...get().ocrProgress,
          [target.id]: { imageId: target.id, status: 'queued', progress: 0, message: 'ממתין…' },
        },
      })

      try {
        const stored = await getImage(target.id)
        if (!stored) throw new Error('התמונה לא נמצאה באחסון המקומי')

        const page = await recognizeImage(
          { imageId: target.id, source: stored.blob, rotationDeg: target.rotationDeg },
          (progress) => set({ ocrProgress: { ...get().ocrProgress, [target.id]: progress } }),
        )

        const parsed = parsePage(page)

        // Merge freshly-parsed categories/items into the working menu.
        let menu: Menu = get().menu
        const categoryMap = new Map<string, string>()
        for (const category of parsed.categories) {
          const result = ensureCategory(menu, category.name)
          menu = result.menu
          categoryMap.set(category.id, result.categoryId)
        }
        const items = parsed.items.map((item) => ({
          ...item,
          categoryId: categoryMap.get(item.categoryId) ?? UNCATEGORIZED_ID,
        }))
        menu = { ...menu, items: [...menu.items, ...items], confirmed: false }

        const merged = applyAutoMerges(menu)

        set({
          menu: merged.menu,
          duplicateSuggestions: merged.suggestions,
          images: get().images.map((image) =>
            image.id === target.id
              ? { ...image, status: 'done', error: undefined, itemCount: items.length }
              : image,
          ),
        })
      } catch (error) {
        const message = describeOcrError(error)
        set({
          images: get().images.map((image) =>
            image.id === target.id ? { ...image, status: 'error', error: message } : image,
          ),
          ocrProgress: {
            ...get().ocrProgress,
            [target.id]: {
              imageId: target.id,
              status: 'error',
              progress: 0,
              message: 'שגיאה',
              error: message,
            },
          },
        })
      }
    }

    set({ isProcessing: false })
    persist(get())
  },

  confirmMenu: () => {
    set({ menu: { ...get().menu, confirmed: true }, step: 'select' })
    persist(get())
  },

  unconfirmMenu: () => {
    set({ menu: { ...get().menu, confirmed: false }, step: 'review' })
    persist(get())
  },

  addManualItem: (categoryId) => {
    const item = makeItem({
      name: '',
      categoryId: categoryId ?? get().menu.categories[0]?.id ?? UNCATEGORIZED_ID,
      origin: 'manual',
      needsReview: true,
      reviewReasons: ['פריט שנוסף ידנית — השלימו שם ומחיר'],
    })
    set({ menu: { ...get().menu, items: [...get().menu.items, item] } })
    persist(get())
    return item.id
  },

  patchItem: (itemId, patch) => {
    set({ menu: updateItem(get().menu, itemId, patch) })
    persist(get())
  },

  patchVariant: (itemId, variantId, patch) => {
    set({ menu: updateVariant(get().menu, itemId, variantId, patch) })
    persist(get())
  },

  addItemVariant: (itemId) => {
    set({ menu: addVariant(get().menu, itemId) })
    persist(get())
  },

  deleteItemVariant: (itemId, variantId) => {
    set({
      menu: removeVariant(get().menu, itemId, variantId),
      selections: get().selections.filter((s) => !(s.itemId === itemId && s.variantId === variantId)),
    })
    persist(get())
  },

  deleteItem: (itemId) => {
    set({
      menu: removeMenuItem(get().menu, itemId),
      selections: get().selections.filter((s) => s.itemId !== itemId),
    })
    get().refreshDuplicates()
    persist(get())
  },

  setItemCategory: (itemId, categoryName) => {
    const { menu, categoryId } = ensureCategory(get().menu, categoryName)
    set({ menu: updateItem(menu, itemId, { categoryId }) })
    persist(get())
  },

  renameMenuCategory: (categoryId, name) => {
    set({ menu: renameCategory(get().menu, categoryId, name) })
    persist(get())
  },

  mergeDuplicate: (targetId, sourceId) => {
    set({
      menu: mergeItems(get().menu, targetId, sourceId),
      selections: get().selections.filter((s) => s.itemId !== sourceId),
      duplicateSuggestions: get().duplicateSuggestions.filter(
        (d) => !(d.targetId === targetId && d.sourceId === sourceId),
      ),
    })
    persist(get())
  },

  dismissDuplicate: (targetId, sourceId) => {
    set({
      duplicateSuggestions: get().duplicateSuggestions.filter(
        (d) => !(d.targetId === targetId && d.sourceId === sourceId),
      ),
    })
  },

  refreshDuplicates: () => {
    set({ duplicateSuggestions: findDuplicates(get().menu.items).filter((d) => !d.auto) })
  },

  setQty: (itemId, variantId, qty) => {
    const next = Math.max(0, Math.floor(qty))
    const without = get().selections.filter((s) => !(s.itemId === itemId && s.variantId === variantId))
    set({ selections: next === 0 ? without : [...without, { itemId, variantId, qty: next }] })
    persist(get())
  },

  addOne: (itemId, variantId) => {
    const current = get().selections.find((s) => s.itemId === itemId && s.variantId === variantId)
    get().setQty(itemId, variantId, (current?.qty ?? 0) + 1)
  },

  removeOne: (itemId, variantId) => {
    const current = get().selections.find((s) => s.itemId === itemId && s.variantId === variantId)
    get().setQty(itemId, variantId, (current?.qty ?? 0) - 1)
  },

  clearSelections: () => {
    set({ selections: [] })
    persist(get())
  },
}))

// ---------------------------------------------------------------------------
// Derived views. Kept as plain functions of state so they are trivially testable
// and always consistent with whatever the user last typed.
// ---------------------------------------------------------------------------

export interface ResolvedSelection extends Selection {
  item: MenuItem
  variant: Variant
  priceAgorot: number | null
  lineTotalAgorot: number
}

export function resolveSelections(menu: Menu, selections: readonly Selection[]): ResolvedSelection[] {
  const resolved: ResolvedSelection[] = []
  for (const selection of selections) {
    const item = menu.items.find((i) => i.id === selection.itemId)
    if (!item) continue
    const variant = findVariant(item, selection.variantId)
    if (!variant) continue
    const price = hasUsablePrice(item, variant) ? variant.priceAgorot : null
    resolved.push({
      ...selection,
      item,
      variant,
      priceAgorot: price,
      lineTotalAgorot: (price ?? 0) * selection.qty,
    })
  }
  return resolved
}

export function pricedLines(resolved: readonly ResolvedSelection[]): PricedLine[] {
  return resolved
    .filter((r) => r.priceAgorot !== null)
    .map((r) => ({ priceAgorot: r.priceAgorot as number, qty: r.qty }))
}

export function selectBudgetSummary(state: {
  budget: PersistedBudget
  menu: Menu
  selections: Selection[]
}): BudgetSummary {
  const resolved = resolveSelections(state.menu, state.selections)
  return computeBudget(state.budget, pricedLines(resolved))
}

export function selectCandidates(menu: Menu): Candidate[] {
  const candidates: Candidate[] = []
  for (const item of menu.items) {
    for (const variant of item.variants) {
      if (!hasUsablePrice(item, variant)) continue
      candidates.push({
        itemId: item.id,
        variantId: variant.id,
        name: item.name || '(ללא שם)',
        variantLabel: variant.label,
        categoryId: item.categoryId,
        categoryName: menu.categories.find((c) => c.id === item.categoryId)?.name ?? 'ללא קטגוריה',
        priceAgorot: variant.priceAgorot as number,
      })
    }
  }
  return candidates
}

export function selectSuggestions(
  state: { budget: PersistedBudget; menu: Menu; selections: Selection[] },
  rules?: Partial<RuleSet>,
): Suggestion[] {
  if (!state.menu.confirmed) return []
  const summary = selectBudgetSummary(state)
  const resolved = resolveSelections(state.menu, state.selections)

  const selectedPerCategory: Record<string, number> = {}
  for (const entry of resolved) {
    selectedPerCategory[entry.item.categoryId] =
      (selectedPerCategory[entry.item.categoryId] ?? 0) + entry.qty
  }

  return recommend({
    candidates: selectCandidates(state.menu),
    remainingFoodBudgetAgorot: summary.remainingFoodBudgetAgorot,
    currentSubtotalAgorot: summary.foodSubtotalAgorot,
    totalBudgetAgorot: summary.totalBudgetAgorot,
    tipBp: state.budget.tipBp,
    selectedPerCategory,
    rules,
  })
}
