import type { OcrLine, OcrPage, OcrWord } from '../ocr/types'

/**
 * Builds OCR-shaped fixtures without needing a real image.
 *
 * Tokens are given in *logical* reading order — the order tesseract reports —
 * while the bounding boxes are laid out visually. For Hebrew that means the
 * first token sits on the right of the row and x decreases as you go, which is
 * exactly the geometry the price detector has to cope with.
 */

export const PAGE_WIDTH = 1000
const CHAR_WIDTH = 13
const GAP = 10

export interface LineOptions {
  y?: number
  height?: number
  confidence?: number
  dir?: 'rtl' | 'ltr'
  /** Force the row to span the full page width (headers usually do not). */
  startX?: number
}

export function makeLine(tokens: string[], options: LineOptions = {}): OcrLine {
  const { y = 100, height = 24, confidence = 92, dir = 'rtl' } = options
  const widths = tokens.map((token) => Math.max(18, token.length * CHAR_WIDTH))
  const words: OcrWord[] = []

  if (dir === 'rtl') {
    let cursor = options.startX ?? PAGE_WIDTH
    for (let i = 0; i < tokens.length; i += 1) {
      const x1 = cursor
      const x0 = x1 - widths[i]
      words.push({ text: tokens[i], confidence, bbox: { x0, y0: y, x1, y1: y + height } })
      cursor = x0 - GAP
    }
  } else {
    let cursor = options.startX ?? 0
    for (let i = 0; i < tokens.length; i += 1) {
      const x0 = cursor
      const x1 = x0 + widths[i]
      words.push({ text: tokens[i], confidence, bbox: { x0, y0: y, x1, y1: y + height } })
      cursor = x1 + GAP
    }
  }

  return {
    text: tokens.join(' '),
    confidence,
    bbox: {
      x0: Math.min(...words.map((w) => w.bbox.x0)),
      y0: y,
      x1: Math.max(...words.map((w) => w.bbox.x1)),
      y1: y + height,
    },
    words,
  }
}

export function makePage(lines: OcrLine[], imageId = 'img_1', confidence = 90): OcrPage {
  return { imageId, lines, confidence }
}

/**
 * A realistic Hebrew menu page: section headers, a description with a weight in
 * it, a two-price row, a market-price dish, an English row, and a dish whose
 * price the OCR failed to pick up.
 */
export function hebrewMenuPage(imageId = 'img_1'): OcrPage {
  let y = 0
  const next = (height = 24): number => {
    y += height + 14
    return y
  }

  return makePage(
    [
      makeLine(['מנות', 'ראשונות'], { y: next(34), height: 34 }),
      makeLine(['חומוס', 'הבית', '32'], { y: next() }),
      makeLine(['עם', 'גרגרים', 'חמים', 'ושמן', 'זית'], { y: next() }),
      makeLine(['סלט', 'ירקות', 'קצוץ', '38'], { y: next() }),
      makeLine(['מנת', 'פוקצ׳ה', '180', 'גרם', '29'], { y: next() }),
      makeLine(['עיקריות'], { y: next(34), height: 34 }),
      makeLine(['שניצל', 'עוף', 'עם', 'צ׳יפס', '68'], { y: next() }),
      makeLine(['דג', 'הים', 'הטרי', 'מחיר', 'שוק'], { y: next() }),
      makeLine(['אנטריקוט', 'לפי', 'משקל'], { y: next() }),
      makeLine(['פסטה', 'ברוטב', 'עגבניות'], { y: next() }),
      makeLine(['שתייה'], { y: next(34), height: 34 }),
      makeLine(['בירה', 'מהחבית', 'קטן', 'גדול', '22', '32'], { y: next() }),
      makeLine(['Fresh', 'Lemonade', '18'], { y: next(), dir: 'ltr' }),
      makeLine(['יין', 'הבית', '₪', '39'], { y: next() }),
    ],
    imageId,
  )
}
