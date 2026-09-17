/** Minimal OCR shapes the parser needs — deliberately independent of tesseract.js
 *  so `parse.ts` can be unit-tested with plain fixtures and no browser. */

export interface Bbox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrWord {
  text: string
  /** 0..100, as tesseract reports it. */
  confidence: number
  bbox: Bbox
}

export interface OcrLine {
  text: string
  confidence: number
  bbox: Bbox
  words: OcrWord[]
}

/**
 * A number read by the dedicated price-column pass, in page coordinates.
 *
 * Tesseract is markedly more accurate on a narrow strip with a digits-only
 * whitelist than it is on a full page of mixed Hebrew and numerals, where it
 * routinely drops the leading digit of a price. These hints correct the prices
 * found in the main pass.
 */
export interface PriceHint {
  values: number[]
  bbox: Bbox
}

export interface OcrPage {
  imageId: string
  lines: OcrLine[]
  /** 0..100 mean confidence for the page. */
  confidence: number
  priceHints?: PriceHint[]
}

export type OcrJobStatus = 'queued' | 'preparing' | 'recognizing' | 'done' | 'error'

export interface OcrProgress {
  imageId: string
  status: OcrJobStatus
  /** 0..1 */
  progress: number
  message: string
  error?: string
}
