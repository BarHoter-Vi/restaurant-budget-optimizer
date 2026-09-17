import { describe, expect, it } from 'vitest'
import { detectPrices, parsePage, parsePages, preferReading } from './parse'
import { hebrewMenuPage, makeLine, makePage } from '../test/ocrFixtures'
import type { MenuItem } from '../domain/menu'

const byName = (items: MenuItem[], fragment: string): MenuItem | undefined =>
  items.find((item) => item.name.includes(fragment))

describe('detectPrices', () => {
  it('finds the price at the edge of a right-to-left row', () => {
    const hits = detectPrices(makeLine(['שניצל', 'עוף', '68']))
    expect(hits.map((h) => h.value)).toEqual([6_800])
  })

  it('finds the price at the edge of a left-to-right row', () => {
    const hits = detectPrices(makeLine(['Fresh', 'Lemonade', '18'], { dir: 'ltr' }))
    expect(hits.map((h) => h.value)).toEqual([1_800])
  })

  it('ignores a number that is a weight inside the description', () => {
    const hits = detectPrices(makeLine(['מנת', 'פוקצ׳ה', '180', 'גרם', '29']))
    expect(hits.map((h) => h.value)).toEqual([2_900])
  })

  it('ignores percentages such as alcohol content', () => {
    const hits = detectPrices(makeLine(['בירה', 'לבנה', '5', '%', 'אלכוהול'], { dir: 'rtl' }))
    expect(hits).toHaveLength(0)
  })

  it('accepts a price marked with a currency symbol wherever it sits', () => {
    const hits = detectPrices(makeLine(['יין', 'הבית', '₪', '39']))
    expect(hits.map((h) => h.value)).toEqual([3_900])
  })

  it('finds both prices on a two-size row', () => {
    const hits = detectPrices(makeLine(['בירה', 'מהחבית', 'קטן', 'גדול', '22', '32']))
    expect(hits.map((h) => h.value).sort((a, b) => a - b)).toEqual([2_200, 3_200])
  })

  it('rejects implausible numbers outside the price window', () => {
    expect(detectPrices(makeLine(['מנה', '1']))).toHaveLength(0)
    expect(detectPrices(makeLine(['מנה', '99999']))).toHaveLength(0)
  })

  it('rejects tokens that mix digits and letters', () => {
    expect(detectPrices(makeLine(['בקבוק', '330ml']))).toHaveLength(0)
  })
})

describe('parsePage', () => {
  const result = parsePage(hebrewMenuPage())

  it('groups dishes under the headings above them', () => {
    expect(result.categories.map((c) => c.name)).toEqual(
      expect.arrayContaining(['מנות ראשונות', 'עיקריות', 'שתייה']),
    )
    const schnitzel = byName(result.items, 'שניצל')
    const mains = result.categories.find((c) => c.name === 'עיקריות')
    expect(schnitzel?.categoryId).toBe(mains?.id)
  })

  it('reads prices into the item', () => {
    expect(byName(result.items, 'חומוס')?.variants[0].priceAgorot).toBe(3_200)
    expect(byName(result.items, 'שניצל')?.variants[0].priceAgorot).toBe(6_800)
  })

  it('attaches a price-less follow-up line as the description', () => {
    expect(byName(result.items, 'חומוס')?.description).toContain('גרגרים')
  })

  it('does not treat the weight inside a dish name as its price', () => {
    const focaccia = byName(result.items, 'פוקצ׳ה')
    expect(focaccia?.variants[0].priceAgorot).toBe(2_900)
    expect(focaccia?.variants).toHaveLength(1)
  })

  it('keeps two sizes as separate variants and labels them when it can', () => {
    const beer = byName(result.items, 'בירה')
    expect(beer?.variants).toHaveLength(2)
    expect(beer?.variants.map((v) => v.priceAgorot)).toEqual([2_200, 3_200])
    expect(beer?.variants.map((v) => v.label)).toEqual(['קטן', 'גדול'])
  })

  it('marks market-price and by-weight dishes as having no number', () => {
    const fish = byName(result.items, 'דג')
    expect(fish?.priceKind).toBe('market')
    expect(fish?.variants[0].priceAgorot).toBeNull()
    expect(fish?.needsReview).toBe(true)

    const steak = byName(result.items, 'אנטריקוט')
    expect(steak?.priceKind).toBe('byWeight')
    expect(steak?.variants[0].priceAgorot).toBeNull()
  })

  it('flags a dish whose price was not found instead of inventing one', () => {
    const pasta = byName(result.items, 'פסטה')
    expect(pasta?.priceKind).toBe('unknown')
    expect(pasta?.variants[0].priceAgorot).toBeNull()
    expect(pasta?.needsReview).toBe(true)
    expect(pasta?.reviewReasons.join(' ')).toContain('לא זוהה מחיר')
  })

  it('handles a mixed Hebrew/English menu', () => {
    expect(byName(result.items, 'Lemonade')?.variants[0].priceAgorot).toBe(1_800)
  })

  it('records which image each item came from', () => {
    expect(result.items.every((item) => item.sourceImageIds.includes('img_1'))).toBe(true)
  })

  it('flags a promotional row rather than folding it into the maths', () => {
    const promo = parsePage(makePage([makeLine(['ארוחה', 'עסקית', 'מבצע', '89'])]))
    expect(promo.items[0].needsReview).toBe(true)
    expect(promo.items[0].reviewReasons.join(' ')).toContain('מבצע')
  })

  it('flags low-confidence rows for review', () => {
    const shaky = parsePage(makePage([makeLine(['משהו', 'מטושטש', '45'], { confidence: 40 })]))
    expect(shaky.items[0].needsReview).toBe(true)
  })

  it('reports how much it found', () => {
    expect(result.stats.itemsFound).toBeGreaterThan(5)
    expect(result.stats.flagged).toBeGreaterThan(0)
  })
})

describe('parsePages', () => {
  it('reuses one category across pages instead of duplicating it', () => {
    const combined = parsePages([hebrewMenuPage('img_1'), hebrewMenuPage('img_2')])
    const names = combined.categories.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('price column reconciliation', () => {
  const hintAt = (y0: number, y1: number, values: number[]) => ({
    values,
    bbox: { x0: 10, x1: 60, y0, y1 },
  })

  it('prefers the digits-only pass when the two disagree', () => {
    const line = makeLine(['שניצל', 'עוף', '8'], { y: 100, height: 24 })
    const page = { ...makePage([line]), priceHints: [hintAt(100, 124, [6_800])] }
    expect(parsePage(page).items[0].variants[0].priceAgorot).toBe(6_800)
  })

  it('leaves an agreed price alone', () => {
    const line = makeLine(['שניצל', 'עוף', '68'], { y: 100, height: 24 })
    const page = { ...makePage([line]), priceHints: [hintAt(100, 124, [6_800])] }
    const item = parsePage(page).items[0]
    expect(item.variants[0].priceAgorot).toBe(6_800)
    expect(item.needsReview).toBe(false)
  })

  it('adopts a price the main pass missed, and flags it for a glance', () => {
    const line = makeLine(['קרפצ׳יו', 'סלק'], { y: 100, height: 24 })
    const page = { ...makePage([line]), priceHints: [hintAt(100, 124, [4_200])] }
    const item = parsePage(page).items[0]
    expect(item.variants[0].priceAgorot).toBe(4_200)
    expect(item.needsReview).toBe(true)
    expect(item.reviewReasons.join(' ')).toContain('לפי מיקום')
  })

  it('ignores a hint from a different row', () => {
    const line = makeLine(['שניצל', 'עוף', '68'], { y: 100, height: 24 })
    const page = { ...makePage([line]), priceHints: [hintAt(500, 524, [9_900])] }
    expect(parsePage(page).items[0].variants[0].priceAgorot).toBe(6_800)
  })

  it('does not touch a row whose price count differs from the hint', () => {
    const line = makeLine(['בירה', 'מהחבית', 'קטן', 'גדול', '22', '32'], { y: 100, height: 24 })
    const page = { ...makePage([line]), priceHints: [hintAt(100, 124, [9_900])] }
    expect(parsePage(page).items[0].variants.map((v) => v.priceAgorot)).toEqual([2_200, 3_200])
  })

  it('corrects both prices on a two-size row', () => {
    const line = makeLine(['בירה', 'מהחבית', 'קטן', 'גדול', '2', '3'], { y: 100, height: 24 })
    const page = { ...makePage([line]), priceHints: [hintAt(100, 124, [2_200, 3_200])] }
    const variants = parsePage(page).items[0].variants
    expect(variants.map((v) => v.priceAgorot).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([2_200, 3_200])
  })
})

describe('preferReading', () => {
  it('keeps the longer number, because OCR drops digits rather than adding them', () => {
    expect(preferReading(800, 6_800)).toBe(6_800)
    expect(preferReading(4_400, 400)).toBe(4_400)
  })

  it('prefers the price column on a tie', () => {
    expect(preferReading(2_200, 3_200)).toBe(3_200)
  })
})
