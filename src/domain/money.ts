/**
 * Money is represented as an integer number of agorot (1 ILS = 100 agorot).
 *
 * Rationale: floating-point shekels accumulate error across many additions and
 * make "is the order over budget?" ambiguous at the boundary. Every *input*
 * (dish price, budget per person) is therefore stored exactly as an integer.
 * Derived values (tip, total, remaining) are kept unrounded and rounded only by
 * the formatters in this file, which is the only place currency is rounded.
 */

/** An exact amount of money, in agorot. Always an integer. */
export type Agorot = number

/** Tip percentage held in basis points (1% = 100bp) so comparisons stay exact. */
export type BasisPoints = number

export const AGOROT_PER_ILS = 100
export const BP_PER_PERCENT = 100

/** Largest amount we accept anywhere, guarding against OCR garbage and overflow. */
export const MAX_AGOROT = 100_000_000 // ₪1,000,000

export function isValidAgorot(value: unknown): value is Agorot {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_AGOROT
  )
}

/** Round half away from zero — what people expect from money, unlike Math.round for negatives. */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * Parse user/OCR text into agorot. Accepts "12", "12.5", "12.50", "12,50",
 * "₪12.50", "12.50 ₪", '12.5 ש"ח', with optional thousands separators.
 * Returns null when the text does not contain a single unambiguous amount.
 */
export function parseMoney(input: string | number | null | undefined): Agorot | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null
    return clampAgorot(roundHalfAwayFromZero(input * AGOROT_PER_ILS))
  }

  let text = input.trim()
  if (!text) return null

  // Strip currency markers (Hebrew, symbol and latin forms) and bidi control chars.
  text = text
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/₪|ש"ח|ש״ח|שקלים|שקל|שח|NIS|ILS/gi, '')
    .trim()

  // Any leftover internal whitespace means this is not a single amount
  // ("12 14" is two numbers, not twelve-fourteen).
  if (/\s/.test(text)) return null

  // Thousands separators: "1,234.50" and "1.234,50" are both seen on menus.
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, '')
  } else if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text) || /^\d{1,3}(?:\.\d{3}){2,}$/.test(text)) {
    // "1.234,50" or "1.234.567" — a single "12.005" is read as a decimal instead,
    // because a five-figure dish price is far less likely than a stray digit.
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (/^\d+,\d+$/.test(text)) {
    text = text.replace(',', '.')
  }

  const match = text.match(/^-?\d+(?:\.\d+)?$/)
  if (!match) return null

  const value = Number.parseFloat(match[0])
  if (!Number.isFinite(value) || value < 0) return null

  return clampAgorot(roundHalfAwayFromZero(value * AGOROT_PER_ILS))
}

function clampAgorot(value: number): Agorot | null {
  if (value < 0 || value > MAX_AGOROT) return null
  return value
}

/** "1234.50" — two decimal places, no currency symbol. Display only. */
export function formatAmount(agorot: number): string {
  const rounded = roundHalfAwayFromZero(agorot) / AGOROT_PER_ILS
  return rounded.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "₪1,234.50" — the canonical display form used across the UI. */
export function formatILS(agorot: number): string {
  const negative = agorot < 0
  const body = formatAmount(Math.abs(agorot))
  return `${negative ? '-' : ''}₪${body}`
}

/** Percent -> basis points, tolerating decimals like 12.5%. */
export function percentToBp(percent: number): BasisPoints {
  return roundHalfAwayFromZero(percent * BP_PER_PERCENT)
}

export function bpToPercent(bp: BasisPoints): number {
  return bp / BP_PER_PERCENT
}
