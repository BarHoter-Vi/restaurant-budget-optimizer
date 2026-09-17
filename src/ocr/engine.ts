import { createWorker, type Worker } from 'tesseract.js'
import type { OcrLine, OcrPage, OcrProgress, OcrWord, PriceHint } from './types'
import { prepareImage, renderBand } from './preprocess'
import {
  BAND_PADDING,
  BAND_SCALE,
  bandOrigin,
  bandWidth,
  detectPriceSide,
  toPriceHints,
} from './priceColumn'

/**
 * Thin wrapper over tesseract.js.
 *
 * tesseract.js already runs recognition inside its own Web Worker plus a WASM
 * core, so the main thread stays responsive; this module's job is lifecycle
 * (one lazily-created worker reused across images), progress reporting, and
 * converting tesseract's nested output into the flat shape `parse.ts` expects.
 *
 * Language data (heb + eng) is fetched from tesseract.js's public CDN on first
 * use — roughly 10–15 MB — and cached by tesseract.js in IndexedDB afterwards.
 * That is the one moment the app needs a network connection.
 */

export const OCR_LANGS = 'heb+eng'
/**
 * The price pass runs English-only on purpose. With the Hebrew model loaded,
 * Tesseract kept resolving two-digit prices to a single digit (₪38 read as "8")
 * even with a digits-only whitelist; English-only reads the same strip correctly.
 */
export const PRICE_LANG = 'eng'

/** Plausible price window for the digits-only pass, in agorot. */
const MIN_PRICE_AGOROT = 300
const MAX_PRICE_AGOROT = 300_000

let workerPromise: Promise<Worker> | null = null
let digitsWorkerPromise: Promise<Worker> | null = null
let progressHandler: ((fraction: number, status: string) => void) | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGS, 1, {
      logger: (message: { status?: string; progress?: number }) => {
        if (!progressHandler) return
        progressHandler(message.progress ?? 0, message.status ?? '')
      },
    }).catch((error: unknown) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

async function getDigitsWorker(): Promise<Worker> {
  if (!digitsWorkerPromise) {
    digitsWorkerPromise = createWorker(PRICE_LANG, 1)
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789.,',
          tessedit_pageseg_mode: '6' as never,
        })
        return worker
      })
      .catch((error: unknown) => {
        digitsWorkerPromise = null
        throw error
      })
  }
  return digitsWorkerPromise
}

/** Release the OCR workers and their memory. Called when the session is cleared. */
export async function terminateEngine(): Promise<void> {
  const pending = [workerPromise, digitsWorkerPromise].filter(Boolean) as Array<Promise<Worker>>
  workerPromise = null
  digitsWorkerPromise = null
  for (const entry of pending) {
    try {
      const worker = await entry
      await worker.terminate()
    } catch {
      // Nothing useful to do — the worker is going away either way.
    }
  }
}

interface TesseractWord {
  text?: string
  confidence?: number
  bbox?: { x0: number; y0: number; x1: number; y1: number }
}
interface TesseractLine {
  text?: string
  confidence?: number
  bbox?: { x0: number; y0: number; x1: number; y1: number }
  words?: TesseractWord[]
}
interface TesseractParagraph {
  lines?: TesseractLine[]
}
interface TesseractBlock {
  paragraphs?: TesseractParagraph[]
}

function toWord(word: TesseractWord): OcrWord {
  return {
    text: word.text ?? '',
    confidence: word.confidence ?? 0,
    bbox: word.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
  }
}

function toLine(line: TesseractLine): OcrLine {
  const words = (line.words ?? []).map(toWord)
  return {
    text: line.text ?? words.map((w) => w.text).join(' '),
    confidence: line.confidence ?? 0,
    bbox: line.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
    words,
  }
}

export function flattenBlocks(blocks: TesseractBlock[] | null | undefined): OcrLine[] {
  const lines: OcrLine[] = []
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        lines.push(toLine(line))
      }
    }
  }
  return lines
}

export interface RecognizeRequest {
  imageId: string
  source: Blob
  rotationDeg?: number
}

/**
 * Recognise one image. Images are processed one at a time on purpose: running
 * several in parallel is the quickest way to run a phone browser out of memory.
 */
export async function recognizeImage(
  request: RecognizeRequest,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrPage> {
  const report = (status: OcrProgress['status'], progress: number, message: string): void => {
    onProgress?.({ imageId: request.imageId, status, progress, message })
  }

  report('preparing', 0.02, 'מכין את התמונה…')
  const prepared = await prepareImage(request.source, request.rotationDeg ?? 0)

  report('preparing', 0.08, 'טוען מנוע זיהוי טקסט…')
  const worker = await getWorker()

  progressHandler = (fraction, status) => {
    if (status === 'recognizing text') {
      report('recognizing', 0.1 + fraction * 0.88, 'מזהה טקסט…')
    } else if (status.includes('loading') || status.includes('initializing')) {
      report('preparing', 0.08, 'טוען קבצי שפה (פעם אחת בלבד)…')
    }
  }

  try {
    const result = await worker.recognize(prepared.blob, {}, { blocks: true, text: true })
    const data = result.data as unknown as { blocks?: TesseractBlock[]; confidence?: number }
    const lines = flattenBlocks(data.blocks)

    progressHandler = null
    report('recognizing', 0.95, 'מאמת מחירים…')
    const priceHints = await readPriceColumn(prepared.blob, prepared.width, lines)

    report('done', 1, 'הסתיים')
    return {
      imageId: request.imageId,
      lines,
      confidence: data.confidence ?? 0,
      priceHints,
    }
  } finally {
    progressHandler = null
  }
}

/**
 * Re-reads the price column with a digits-only whitelist. Failure here is not
 * fatal: the prices from the main pass are still used, they are simply less
 * reliable, so any problem is swallowed rather than failing the whole image.
 */
async function readPriceColumn(
  source: Blob,
  pageWidth: number,
  lines: readonly OcrLine[],
): Promise<PriceHint[]> {
  const side = detectPriceSide(lines, pageWidth)
  if (!side) return []

  try {
    const band = await renderBand(source, {
      originX: bandOrigin(pageWidth, side),
      width: bandWidth(pageWidth),
      scale: BAND_SCALE,
      padding: BAND_PADDING,
    })

    const worker = await getDigitsWorker()
    const result = await worker.recognize(band, {}, { blocks: true, text: true })
    const data = result.data as unknown as { blocks?: TesseractBlock[] }
    return toPriceHints(
      flattenBlocks(data.blocks),
      pageWidth,
      side,
      MIN_PRICE_AGOROT,
      MAX_PRICE_AGOROT,
    )
  } catch {
    return []
  }
}

/** Human-readable failure text — the UI never shows a raw exception. */
export function describeOcrError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/fetch|network|Failed to load|ERR_/i.test(raw)) {
    return 'לא ניתן להוריד את קובצי השפה. בדקו חיבור לאינטרנט ונסו שוב — הקבצים נשמרים במכשיר לאחר ההורדה הראשונה.'
  }
  if (/memory|Aborted|allocation/i.test(raw)) {
    return 'נגמר הזיכרון בזמן העיבוד. נסו תמונה אחת בכל פעם, או צלמו בנפרד חלקים מהתפריט.'
  }
  return `זיהוי הטקסט נכשל: ${raw}`
}
