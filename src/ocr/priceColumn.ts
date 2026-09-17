import { parseMoney } from '../domain/money'
import type { Bbox, OcrLine, PriceHint } from './types'

/**
 * Second OCR pass over the price column.
 *
 * On a full menu page Tesseract has to juggle Hebrew, Latin and numerals at
 * once, and in practice it drops the leading digit of a price often enough to
 * matter (₪68 read as "8"). Recognising just the narrow strip the prices live
 * in, upscaled and with a digits-only whitelist, is far more reliable — in
 * testing it recovered every price on a page where the main pass got half.
 *
 * The geometry helpers live here, apart from the tesseract plumbing, so they can
 * be tested directly.
 */

/** Fraction of the page width treated as the price column. */
export const BAND_FRACTION = 0.18
/** The strip is drawn at this scale; small digits recognise much better. */
export const BAND_SCALE = 2
/** White margin around the strip — Tesseract dislikes glyphs on the edge. */
export const BAND_PADDING = 40

export type PriceSide = 'left' | 'right'

/**
 * Which edge the prices hug. Hebrew menus put them on the left, Latin ones on
 * the right; this decides from where the numerals actually are rather than from
 * the language.
 */
export function detectPriceSide(lines: readonly OcrLine[], pageWidth: number): PriceSide | null {
  if (pageWidth <= 0) return null
  let left = 0
  let right = 0

  for (const line of lines) {
    for (const word of line.words) {
      if (!/^\d{1,4}(?:[.,]\d{1,2})?$/.test(word.text.trim())) continue
      const centre = (word.bbox.x0 + word.bbox.x1) / 2
      if (centre <= pageWidth * BAND_FRACTION) left += 1
      else if (centre >= pageWidth * (1 - BAND_FRACTION)) right += 1
    }
  }

  if (left === 0 && right === 0) return null
  return left >= right ? 'left' : 'right'
}

/** Where the strip starts in page coordinates. */
export function bandOrigin(pageWidth: number, side: PriceSide): number {
  return side === 'left' ? 0 : Math.round(pageWidth * (1 - BAND_FRACTION))
}

export function bandWidth(pageWidth: number): number {
  return Math.max(1, Math.round(pageWidth * BAND_FRACTION))
}

/** Strip coordinates back to page coordinates. */
export function toPageBox(box: Bbox, pageWidth: number, side: PriceSide): Bbox {
  const originX = bandOrigin(pageWidth, side)
  return {
    x0: originX + (box.x0 - BAND_PADDING) / BAND_SCALE,
    x1: originX + (box.x1 - BAND_PADDING) / BAND_SCALE,
    y0: (box.y0 - BAND_PADDING) / BAND_SCALE,
    y1: (box.y1 - BAND_PADDING) / BAND_SCALE,
  }
}

/** Turn the digits-only recognition into hints, dropping anything unusable. */
export function toPriceHints(
  lines: readonly OcrLine[],
  pageWidth: number,
  side: PriceSide,
  minAgorot: number,
  maxAgorot: number,
): PriceHint[] {
  const hints: PriceHint[] = []
  for (const line of lines) {
    const values: number[] = []
    for (const token of line.text.split(/\s+/)) {
      const cleaned = token.replace(/[^\d.,]/g, '')
      if (!cleaned) continue
      const value = parseMoney(cleaned)
      if (value === null) continue
      if (value < minAgorot || value > maxAgorot) continue
      values.push(value)
    }
    if (values.length === 0) continue
    hints.push({ values, bbox: toPageBox(line.bbox, pageWidth, side) })
  }
  return hints
}

/** Vertical overlap of two boxes as a fraction of the smaller one. */
export function verticalOverlap(a: Bbox, b: Bbox): number {
  const top = Math.max(a.y0, b.y0)
  const bottom = Math.min(a.y1, b.y1)
  const overlap = bottom - top
  if (overlap <= 0) return 0
  const smaller = Math.min(a.y1 - a.y0, b.y1 - b.y0)
  return smaller > 0 ? overlap / smaller : 0
}

/**
 * Every hint sitting on the same row as this line, merged into one.
 *
 * A row can contribute more than one hint — a two-size drink has its prices in
 * two columns, which Tesseract may report as separate fragments — so they are
 * unioned rather than picking a winner. Equal values are collapsed, since the
 * same number arriving from two sources is one price, not two.
 */
export function hintForLine(
  line: OcrLine,
  hints: readonly PriceHint[],
  minOverlap = 0.5,
): PriceHint | null {
  const matching = hints.filter((hint) => verticalOverlap(line.bbox, hint.bbox) >= minOverlap)
  if (matching.length === 0) return null

  const values: number[] = []
  for (const hint of matching) {
    for (const value of hint.values) {
      if (!values.includes(value)) values.push(value)
    }
  }

  return {
    values,
    bbox: {
      x0: Math.min(...matching.map((h) => h.bbox.x0)),
      x1: Math.max(...matching.map((h) => h.bbox.x1)),
      y0: Math.min(...matching.map((h) => h.bbox.y0)),
      y1: Math.max(...matching.map((h) => h.bbox.y1)),
    },
  }
}
