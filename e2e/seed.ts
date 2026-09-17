import type { Page } from '@playwright/test'

/**
 * Seeds a confirmed menu straight into localStorage.
 *
 * The end-to-end suite exercises the budget, selection and recommendation flow,
 * which is where the money is. Driving real OCR here would download ~15MB of
 * language data per run and make the suite depend on a CDN, so image handling is
 * covered by the unit tests over `parse.ts` and by the upload-screen test below.
 */

export const STORAGE_KEY = 'rbo.session.v1'

export const SEEDED_MENU = {
  version: 1,
  step: 'select',
  budget: { diners: 2, perPersonAgorot: 15_000, tipBp: 1_200 },
  menu: {
    categories: [
      { id: 'c_start', name: 'מנות ראשונות', order: 0 },
      { id: 'c_main', name: 'עיקריות', order: 1 },
      { id: 'c_drink', name: 'שתייה', order: 2 },
    ],
    items: [
      {
        id: 'i_hummus',
        name: 'חומוס הבית',
        description: 'עם גרגרים חמים ושמן זית',
        categoryId: 'c_start',
        variants: [{ id: 'v_hummus', priceAgorot: 3_200, needsReview: false }],
        priceKind: 'fixed',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        sourceImageIds: [],
        origin: 'ocr',
      },
      {
        id: 'i_salad',
        name: 'סלט ירקות קצוץ',
        categoryId: 'c_start',
        variants: [{ id: 'v_salad', priceAgorot: 3_800, needsReview: false }],
        priceKind: 'fixed',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        sourceImageIds: [],
        origin: 'ocr',
      },
      {
        id: 'i_schnitzel',
        name: 'שניצל עוף',
        categoryId: 'c_main',
        variants: [{ id: 'v_schnitzel', priceAgorot: 6_800, needsReview: false }],
        priceKind: 'fixed',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        sourceImageIds: [],
        origin: 'ocr',
      },
      {
        id: 'i_fish',
        name: 'דג הים הטרי',
        categoryId: 'c_main',
        variants: [{ id: 'v_fish', priceAgorot: null, needsReview: true }],
        priceKind: 'market',
        confidence: 0.6,
        needsReview: true,
        reviewReasons: ['מחיר שוק — יש לברר במסעדה'],
        sourceImageIds: [],
        origin: 'ocr',
      },
      {
        id: 'i_beer',
        name: 'בירה מהחבית',
        categoryId: 'c_drink',
        variants: [
          { id: 'v_beer_s', label: 'קטן', priceAgorot: 2_200, needsReview: false },
          { id: 'v_beer_l', label: 'גדול', priceAgorot: 3_200, needsReview: false },
        ],
        priceKind: 'fixed',
        confidence: 0.9,
        needsReview: false,
        reviewReasons: [],
        sourceImageIds: [],
        origin: 'ocr',
      },
    ],
    confirmed: true,
  },
  selections: [],
  images: [],
  updatedAt: Date.now(),
}

export async function seedSession(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
  const payload = JSON.stringify({ ...SEEDED_MENU, ...overrides })
  await page.addInitScript(
    ([key, value]) => {
      // Only seed a fresh context: this script re-runs on every navigation, and
      // overwriting here would quietly undo the "survives a refresh" test.
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, value as string)
      }
    },
    [STORAGE_KEY, payload],
  )
}
