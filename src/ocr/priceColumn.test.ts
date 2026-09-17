import { describe, expect, it } from 'vitest'
import {
  BAND_FRACTION,
  bandOrigin,
  bandWidth,
  detectPriceSide,
  hintForLine,
  toPageBox,
  toPriceHints,
  verticalOverlap,
} from './priceColumn'
import { makeLine, PAGE_WIDTH } from '../test/ocrFixtures'
import type { OcrLine } from './types'

const band = (y0: number, y1: number, text: string): OcrLine => ({
  text,
  confidence: 90,
  bbox: { x0: 40, y0, x1: 120, y1 },
  words: [],
})

describe('detectPriceSide', () => {
  it('sees prices on the left of a Hebrew page', () => {
    const lines = [makeLine(['שניצל', 'עוף', '68']), makeLine(['חומוס', 'הבית', '32'])]
    // Real menu rows span the page, with the price against the far edge.
    for (const line of lines) {
      const last = line.words[line.words.length - 1]
      last.bbox = { ...last.bbox, x0: 20, x1: 70 }
    }
    expect(detectPriceSide(lines, PAGE_WIDTH)).toBe('left')
  })

  it('sees prices on the right of a Latin page', () => {
    const lines = [
      makeLine(['Fresh', 'Lemonade', '18'], { dir: 'ltr', startX: 0 }),
      makeLine(['Chocolate', 'Cake', '42'], { dir: 'ltr', startX: 0 }),
    ]
    // Lay the rows out so the numbers sit against the right edge.
    for (const line of lines) {
      const last = line.words[line.words.length - 1]
      last.bbox = { ...last.bbox, x0: PAGE_WIDTH - 60, x1: PAGE_WIDTH - 10 }
    }
    expect(detectPriceSide(lines, PAGE_WIDTH)).toBe('right')
  })

  it('gives up when there are no numerals to go on', () => {
    expect(detectPriceSide([makeLine(['מנות', 'ראשונות'])], PAGE_WIDTH)).toBeNull()
    expect(detectPriceSide([], PAGE_WIDTH)).toBeNull()
  })
})

describe('band geometry', () => {
  it('starts at the correct edge', () => {
    expect(bandOrigin(1000, 'left')).toBe(0)
    expect(bandOrigin(1000, 'right')).toBe(Math.round(1000 * (1 - BAND_FRACTION)))
    expect(bandWidth(1000)).toBe(180)
  })

  it('maps strip coordinates back onto the page', () => {
    const box = toPageBox({ x0: 40, y0: 140, x1: 140, y1: 190 }, 1000, 'left')
    expect(box.x0).toBe(0)
    expect(box.y0).toBe(50)
    expect(box.x1).toBe(50)
    expect(box.y1).toBe(75)
  })
})

describe('toPriceHints', () => {
  it('keeps plausible numbers and drops the rest', () => {
    const hints = toPriceHints(
      [band(140, 190, '32'), band(240, 290, '1'), band(340, 390, '22 32')],
      1000,
      'left',
      300,
      300_000,
    )
    expect(hints.map((h) => h.values)).toEqual([[3_200], [2_200, 3_200]])
  })
})

describe('hintForLine', () => {
  it('matches the hint sharing the row', () => {
    const line = makeLine(['שניצל', 'עוף', '8'], { y: 100, height: 24 })
    // Strip coordinates are halved and unpadded: 240..288 lands exactly on the
    // line's own 100..124 row.
    const hints = toPriceHints([band(240, 288, '68'), band(640, 688, '32')], 1000, 'left', 300, 300_000)
    expect(hintForLine(line, hints)?.values).toEqual([6_800])
  })

  it('returns nothing when no hint lines up', () => {
    const line = makeLine(['שניצל', 'עוף', '8'], { y: 900, height: 24 })
    const hints = toPriceHints([band(240, 288, '68')], 1000, 'left', 300, 300_000)
    expect(hintForLine(line, hints)).toBeNull()
  })
})

describe('verticalOverlap', () => {
  it('is 1 for identical rows and 0 for disjoint ones', () => {
    expect(verticalOverlap({ x0: 0, x1: 1, y0: 0, y1: 10 }, { x0: 0, x1: 1, y0: 0, y1: 10 })).toBe(1)
    expect(verticalOverlap({ x0: 0, x1: 1, y0: 0, y1: 10 }, { x0: 0, x1: 1, y0: 20, y1: 30 })).toBe(0)
  })
})
