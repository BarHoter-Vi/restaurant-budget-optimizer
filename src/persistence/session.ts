import { z } from 'zod'
import { menuSchema, type Menu, emptyMenu } from '../domain/menu'
import { agorotSchema } from '../domain/menu'

/**
 * The session lives in localStorage so an accidental refresh — or the phone
 * killing the tab while you look at the actual menu — never loses the order.
 * Everything read back is validated: a corrupt or outdated blob is discarded
 * rather than crashing the app with a half-shaped object.
 *
 * Menu *images* are deliberately not here; they live in IndexedDB (see images.ts)
 * because blobs do not belong in localStorage.
 */

export const STORAGE_KEY = 'rbo.session.v1'
export const SESSION_VERSION = 1

export const stepSchema = z.enum(['budget', 'upload', 'review', 'select'])
export type Step = z.infer<typeof stepSchema>

export const budgetInputSchema = z.object({
  diners: z.number().int().min(1).max(100),
  perPersonAgorot: agorotSchema,
  tipBp: z.number().int().min(0).max(10_000),
})
export type PersistedBudget = z.infer<typeof budgetInputSchema>

export const selectionSchema = z.object({
  itemId: z.string().min(1),
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(99),
})
export type Selection = z.infer<typeof selectionSchema>

export const imageMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  rotationDeg: z.number().int(),
  status: z.enum(['pending', 'processing', 'done', 'error']),
  error: z.string().optional(),
  itemCount: z.number().int().min(0).default(0),
})
export type ImageMeta = z.infer<typeof imageMetaSchema>

export const sessionSchema = z.object({
  version: z.literal(SESSION_VERSION),
  step: stepSchema,
  budget: budgetInputSchema,
  menu: menuSchema,
  selections: z.array(selectionSchema),
  images: z.array(imageMetaSchema),
  updatedAt: z.number(),
})
export type PersistedSession = z.infer<typeof sessionSchema>

export const DEFAULT_BUDGET: PersistedBudget = {
  diners: 2,
  perPersonAgorot: 12_000, // ₪120
  tipBp: 1_200, // 12%
}

export function defaultSession(): PersistedSession {
  return {
    version: SESSION_VERSION,
    step: 'budget',
    budget: { ...DEFAULT_BUDGET },
    menu: emptyMenu(),
    selections: [],
    images: [],
    updatedAt: Date.now(),
  }
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    // Private-mode browsers expose localStorage but throw on write.
    const probe = '__rbo_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

export function loadSession(): PersistedSession | null {
  const store = storage()
  if (!store) return null
  const raw = store.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = sessionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      // Unreadable or from an older shape: drop it rather than half-restore.
      store.removeItem(STORAGE_KEY)
      return null
    }
    return parsed.data
  } catch {
    store.removeItem(STORAGE_KEY)
    return null
  }
}

export function saveSession(session: Omit<PersistedSession, 'version' | 'updatedAt'>): boolean {
  const store = storage()
  if (!store) return false
  const payload: PersistedSession = {
    ...session,
    version: SESSION_VERSION,
    updatedAt: Date.now(),
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    // Quota exceeded on a very large menu — the app keeps working in memory.
    return false
  }
}

export function clearSession(): void {
  const store = storage()
  store?.removeItem(STORAGE_KEY)
}

/** Selections pointing at items that no longer exist are dropped on load. */
export function pruneSelections(menu: Menu, selections: readonly Selection[]): Selection[] {
  return selections.filter((selection) => {
    const item = menu.items.find((i) => i.id === selection.itemId)
    if (!item) return false
    return item.variants.some((v) => v.id === selection.variantId)
  })
}
