import type { Agorot } from '../domain/money'
import { parseMoney } from '../domain/money'
import {
  type Category,
  type MenuItem,
  type Variant,
  makeItem,
  makeVariant,
  newId,
  UNCATEGORIZED_ID,
} from '../domain/menu'
import type { OcrLine, OcrPage, PriceHint } from './types'
import { hintForLine } from './priceColumn'
import {
  isCategoryWord,
  MARKET_PRICE_PATTERNS,
  PROMO_PATTERNS,
  UNIT_WORDS,
  VARIANT_WORDS,
} from './lexicon'

/**
 * Turns OCR output into structured menu items.
 *
 * Everything here is pure: OCR lines in, menu items out. That is what makes the
 * awkward cases (numbers inside descriptions, two prices on one row, "לפי משקל")
 * testable without a browser or a real photo.
 *
 * The parser is deliberately cautious. Where the layout is ambiguous it emits an
 * item flagged `needsReview` with a human-readable reason rather than guessing —
 * the review screen is where accuracy is actually won.
 */

export interface ParseOptions {
  /** Plausible price window, in agorot. Anything outside is not a price. */
  minPriceAgorot?: Agorot
  maxPriceAgorot?: Agorot
  /** Below this mean word confidence an item is flagged for review. */
  confidenceThreshold?: number
}

export interface ParseResult {
  categories: Category[]
  items: MenuItem[]
  stats: { lines: number; itemsFound: number; flagged: number }
}

const DEFAULTS = {
  minPriceAgorot: 300, // ₪3 — below this it is almost never a dish price
  maxPriceAgorot: 300_000, // ₪3,000
  confidenceThreshold: 0.72,
}

const CURRENCY_NEIGHBOUR = /^(?:₪|ש"ח|ש״ח|שח|NIS|ILS)$/i
const RTL_CHARS = /[\u0590-\u06FF]/g
const LTR_CHARS = /[A-Za-z]/g
/** Lines that continue the dish above them rather than naming a new one. */
const CONTINUATION_START = /^(?:עם|מוגש(?:ת|ים)?|כולל(?:ת)?|בתוספת|בליווי|על|served|with|includes)(?=\s|$)/i
const LEADER_DOTS = /[.․‥…·•\-_]{2,}/g

interface PriceHit {
  value: Agorot
  index: number
  x0: number
  x1: number
  explicit: boolean
}

function cleanWord(text: string): string {
  return text.replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
}

export function cleanLineText(text: string): string {
  return cleanWord(text).replace(LEADER_DOTS, ' ').replace(/\s+/g, ' ').trim()
}

/** Hebrew rows read right-to-left, so "first" price means rightmost there. */
export function lineDirection(line: OcrLine): 'rtl' | 'ltr' {
  const text = line.words.map((w) => w.text).join('')
  const rtl = (text.match(RTL_CHARS) ?? []).length
  const ltr = (text.match(LTR_CHARS) ?? []).length
  return rtl >= ltr ? 'rtl' : 'ltr'
}

function isUnitWord(text: string): boolean {
  const normalized = cleanWord(text).toLowerCase().replace(/[.,:;]+$/, '')
  return UNIT_WORDS.includes(normalized)
}

/**
 * Find the numbers on a line that genuinely act as prices.
 *
 * Two signals decide it: an explicit currency marker, or sitting in the outer
 * band of the line (menus put prices at the edge of the row, on either side
 * depending on the script). Numbers that sit mid-line next to a unit word —
 * "200 גרם", "12% abv" — are rejected, which is what keeps description numbers
 * out of the price column.
 */
export function detectPrices(line: OcrLine, options: ParseOptions = {}): PriceHit[] {
  const minPrice = options.minPriceAgorot ?? DEFAULTS.minPriceAgorot
  const maxPrice = options.maxPriceAgorot ?? DEFAULTS.maxPriceAgorot
  const words = line.words

  const candidates: PriceHit[] = []

  for (let index = 0; index < words.length; index += 1) {
    const raw = cleanWord(words[index].text)
    if (!raw) continue

    // Reject tokens that mix digits with letters ("45ml", "A4") outright.
    const stripped = raw.replace(/[₪]/g, '')
    if (!/^\d{1,5}(?:[.,]\d{1,2})?$/.test(stripped)) {
      if (!/^₪\s*\d/.test(raw)) continue
    }

    const value = parseMoney(raw)
    if (value === null) continue
    if (value < minPrice || value > maxPrice) continue

    const prev = index > 0 ? cleanWord(words[index - 1].text) : ''
    const next = index < words.length - 1 ? cleanWord(words[index + 1].text) : ''

    // A unit right after the number means it is a quantity ("180 גרם", "5 %"),
    // not a price. A unit *before* it only disqualifies numbers sitting inside
    // the row — a number at the very edge is still the price column.
    if (isUnitWord(next)) continue
    if (/^%/.test(next) || raw.endsWith('%')) continue
    if (isUnitWord(prev) && index !== 0 && index !== words.length - 1) continue

    const explicit =
      /₪/.test(raw) || CURRENCY_NEIGHBOUR.test(prev) || CURRENCY_NEIGHBOUR.test(next)

    candidates.push({
      value,
      index,
      x0: words[index].bbox.x0,
      x1: words[index].bbox.x1,
      explicit,
    })
  }

  if (candidates.length === 0) return []

  const direction = lineDirection(line)
  const explicitHits = candidates.filter((c) => c.explicit)
  if (explicitHits.length > 0) return sortByX(explicitHits, direction)

  // No currency marker: fall back to position. Prices hug one edge of the row.
  const lineX0 = Math.min(...words.map((w) => w.bbox.x0))
  const lineX1 = Math.max(...words.map((w) => w.bbox.x1))
  const width = Math.max(1, lineX1 - lineX0)
  const band = width * 0.35

  const leftBand = candidates.filter((c) => c.x1 <= lineX0 + band)
  const rightBand = candidates.filter((c) => c.x0 >= lineX1 - band)

  if (leftBand.length === 0 && rightBand.length === 0) {
    // Single number that is also the first or last token: still a price.
    if (candidates.length === 1) {
      const only = candidates[0]
      if (only.index === 0 || only.index === words.length - 1) return [only]
    }
    return []
  }

  if (leftBand.length >= rightBand.length) return sortByX(leftBand, direction)
  return sortByX(rightBand, direction)
}

/** Ordered in reading order, so variant labels found in the text line up with
 *  the prices they belong to. */
function sortByX(hits: PriceHit[], direction: 'rtl' | 'ltr'): PriceHit[] {
  return [...hits].sort((a, b) => (direction === 'rtl' ? b.x0 - a.x0 : a.x0 - b.x0))
}

/**
 * Reconcile the main pass with the digits-only price column pass.
 *
 * The column pass reads numerals far more accurately, so where the two disagree
 * about the same row it wins. Where the main pass found no price at all but the
 * column pass did, the price is adopted and the item flagged — the row it
 * belongs to is inferred from vertical position, which is worth a human glance.
 */
export function reconcileWithHints(
  line: OcrLine,
  hits: PriceHit[],
  hints: readonly PriceHint[] | undefined,
): { hits: PriceHit[]; corrected: boolean; inferred: boolean } {
  if (!hints || hints.length === 0) return { hits, corrected: false, inferred: false }

  const hint = hintForLine(line, hints)
  if (!hint) return { hits, corrected: false, inferred: false }

  // The main pass saw more prices on this row than the column pass did. That
  // usually means the column pass merged or missed one, so leave the row alone.
  if (hint.values.length < hits.length) return { hits, corrected: false, inferred: false }

  const values = [...hint.values].sort((a, b) => a - b)
  const ordered = [...hits].sort((a, b) => a.value - b.value)

  const rebuilt: PriceHit[] = values.map((value, index) => {
    const existing = ordered[index]
    if (!existing) {
      return { value, index: -1, x0: hint.bbox.x0, x1: hint.bbox.x1, explicit: false }
    }
    return { ...existing, value: preferReading(existing.value, value) }
  })

  const corrected = ordered.some((hit, index) => hit.value !== rebuilt[index]?.value)

  return {
    hits: rebuilt,
    corrected,
    // A row where nothing was read as a price gets its price purely from where
    // the number sits, which is worth a human glance.
    inferred: hits.length === 0 || values.length > hits.length,
  }
}

/**
 * Pick between the main pass and the price-column pass for the same price.
 *
 * OCR loses digits far more often than it invents them, so the longer number
 * wins: "8" against "68" is a dropped digit, while "44" against "4" is the
 * column pass having clipped one. On a tie the column pass wins, since it reads
 * numerals more reliably.
 */
export function preferReading(fromPage: number, fromColumn: number): number {
  const pageDigits = String(fromPage).length
  const columnDigits = String(fromColumn).length
  if (pageDigits > columnDigits) return fromPage
  return fromColumn
}

function stripPrices(line: OcrLine, hits: PriceHit[]): string {
  const drop = new Set(hits.map((h) => h.index))
  // Also drop a bare currency marker adjacent to a removed price.
  for (const hit of hits) {
    for (const neighbour of [hit.index - 1, hit.index + 1]) {
      const word = line.words[neighbour]
      if (word && CURRENCY_NEIGHBOUR.test(cleanWord(word.text))) drop.add(neighbour)
    }
  }
  const kept = line.words.filter((_, index) => !drop.has(index)).map((w) => cleanWord(w.text))
  return cleanLineText(kept.join(' '))
}

function lineHeight(line: OcrLine): number {
  return Math.max(0, line.bbox.y1 - line.bbox.y0)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function detectVariantLabels(text: string): string[] {
  const found: Array<{ label: string; at: number }> = []
  for (const { match, label } of VARIANT_WORDS) {
    const result = match.exec(text)
    if (result) found.push({ label, at: result.index })
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.label)
}

function buildVariants(
  hits: PriceHit[],
  text: string,
): { variants: Variant[]; ambiguous: boolean } {
  if (hits.length === 1) {
    return { variants: [makeVariant({ priceAgorot: hits[0].value })], ambiguous: false }
  }

  const labels = detectVariantLabels(text)
  const confident = labels.length === hits.length

  const variants = hits.map((hit, index) =>
    makeVariant({
      label: confident ? labels[index] : `אפשרות ${index + 1}`,
      priceAgorot: hit.value,
      needsReview: !confident,
    }),
  )
  return { variants, ambiguous: !confident }
}

function isLikelyHeader(line: OcrLine, text: string, medianHeight: number): boolean {
  if (!text) return false
  if (text.length > 34) return false
  if (isCategoryWord(text)) return true
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length > 4) return false
  // Visually larger than the body text, and short: that is a section title.
  return medianHeight > 0 && lineHeight(line) >= medianHeight * 1.25
}

export function parsePage(page: OcrPage, options: ParseOptions = {}): ParseResult {
  const confidenceThreshold = options.confidenceThreshold ?? DEFAULTS.confidenceThreshold
  const categories: Category[] = []
  const items: MenuItem[] = []

  const allLines = page.lines.filter((line) => cleanLineText(line.text).length > 0)

  // Some pages make Tesseract treat the price column as its own block, which
  // arrives as rows holding nothing but a number. Those are not dishes — they
  // are prices belonging to the row beside them, so they join the hint pool
  // instead of becoming nameless items.
  const priceOnlyHints: PriceHint[] = []
  const usableLines: OcrLine[] = []
  for (const line of allLines) {
    const hits = detectPrices(line, options)
    if (hits.length > 0 && stripPrices(line, hits).length === 0) {
      priceOnlyHints.push({ values: hits.map((hit) => hit.value), bbox: line.bbox })
    } else {
      usableLines.push(line)
    }
  }
  const hints = [...(page.priceHints ?? []), ...priceOnlyHints]

  const medianHeight = median(usableLines.map(lineHeight))

  let currentCategoryId = UNCATEGORIZED_ID
  let lastItem: MenuItem | null = null

  const pushCategory = (name: string): string => {
    const existing = categories.find((c) => c.name === name)
    if (existing) return existing.id
    const category: Category = { id: newId('cat'), name, order: categories.length }
    categories.push(category)
    return category.id
  }

  for (const line of usableLines) {
    const text = cleanLineText(line.text)
    const detected = detectPrices(line, options)
    const reconciled = reconcileWithHints(line, detected, hints)
    const hits = reconciled.hits
    const confidence = Math.max(0, Math.min(1, line.confidence / 100))

    if (hits.length === 0 && isLikelyHeader(line, text, medianHeight)) {
      currentCategoryId = pushCategory(text.replace(/[:：]+$/, '').trim())
      lastItem = null
      continue
    }

    const marketHit = MARKET_PRICE_PATTERNS.find((pattern) => pattern.match.test(text))
    const isPromo = PROMO_PATTERNS.some((pattern) => pattern.test(text))

    if (hits.length > 0) {
      const name = stripPrices(line, hits.filter((hit) => hit.index >= 0))
      const { variants, ambiguous } = buildVariants(hits, text)

      const reasons: string[] = []
      if (!name) reasons.push('לא זוהה שם למנה')
      if (ambiguous) reasons.push('יותר ממחיר אחד בשורה — ודאו איזה גודל מתאים לכל מחיר')
      if (confidence < confidenceThreshold) reasons.push('זיהוי טקסט לא ודאי')
      if (isPromo) reasons.push('נראה כמו מבצע או ארוחה עסקית — בדקו את התנאים')
      if (reconciled.inferred) reasons.push('המחיר שויך לפי מיקום בעמודה — כדאי לוודא')

      const item = makeItem({
        name: name || '(ללא שם)',
        categoryId: currentCategoryId,
        variants,
        priceKind: 'fixed',
        confidence,
        needsReview: reasons.length > 0,
        reviewReasons: reasons,
        sourceImageIds: [page.imageId],
        origin: 'ocr',
      })
      items.push(item)
      lastItem = item
      continue
    }

    if (marketHit) {
      const name = cleanLineText(text.replace(marketHit.match, ' '))
      const item = makeItem({
        name: name || text,
        categoryId: currentCategoryId,
        variants: [makeVariant({ priceAgorot: null, needsReview: true })],
        priceKind: marketHit.kind,
        confidence,
        needsReview: true,
        reviewReasons: [marketHit.note],
        sourceImageIds: [page.imageId],
        origin: 'ocr',
      })
      items.push(item)
      lastItem = item
      continue
    }

    // No price on this line. A wordy line, or one that starts with a connective,
    // continues the dish above it; anything shorter is more likely a dish whose
    // price we failed to read, and we say so rather than silently dropping it.
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const isContinuation = wordCount >= 4 || CONTINUATION_START.test(text)
    if (lastItem && isContinuation) {
      lastItem.description = lastItem.description ? `${lastItem.description} ${text}` : text
      continue
    }

    if (text.length >= 2 && text.length <= 40) {
      const item = makeItem({
        name: text,
        categoryId: currentCategoryId,
        variants: [makeVariant({ priceAgorot: null, needsReview: true })],
        priceKind: 'unknown',
        confidence,
        needsReview: true,
        reviewReasons: ['לא זוהה מחיר — הזינו אותו ידנית'],
        sourceImageIds: [page.imageId],
        origin: 'ocr',
      })
      items.push(item)
      lastItem = item
    }
  }

  return {
    categories,
    items,
    stats: {
      lines: usableLines.length,
      itemsFound: items.length,
      flagged: items.filter((i) => i.needsReview).length,
    },
  }
}

/** Parse several pages and return one combined, still-unmerged result. */
export function parsePages(pages: readonly OcrPage[], options: ParseOptions = {}): ParseResult {
  const categories: Category[] = []
  const items: MenuItem[] = []
  let lines = 0

  for (const page of pages) {
    const result = parsePage(page, options)
    for (const category of result.categories) {
      const existing = categories.find((c) => c.name === category.name)
      if (existing) {
        for (const item of result.items) {
          if (item.categoryId === category.id) item.categoryId = existing.id
        }
      } else {
        categories.push({ ...category, order: categories.length })
      }
    }
    items.push(...result.items)
    lines += result.stats.lines
  }

  return {
    categories,
    items,
    stats: { lines, itemsFound: items.length, flagged: items.filter((i) => i.needsReview).length },
  }
}
