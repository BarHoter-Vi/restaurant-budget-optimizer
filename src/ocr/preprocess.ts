/**
 * Image preparation before OCR.
 *
 * Phone photos are 8–12 megapixels; feeding those straight to Tesseract wastes
 * memory (a real problem on older phones) without improving accuracy. We
 * downscale to a long edge that still leaves menu text comfortably legible,
 * honour EXIF orientation, and apply a light grayscale + contrast stretch, which
 * measurably helps Tesseract on printed menus.
 */

export const MAX_EDGE_PX = 2400

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
}

function supportsOffscreen(): boolean {
  return typeof OffscreenCanvas !== 'undefined'
}

async function decode(source: Blob): Promise<ImageBitmap> {
  // `from-image` applies the EXIF rotation, so photos taken sideways come out upright.
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(source)
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (supportsOffscreen()) return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('לא ניתן לעבד את התמונה'))), 'image/png')
  })
}

/** Grayscale + mild contrast stretch. Kept gentle: aggressive binarisation hurts
 *  Hebrew glyphs with thin strokes more than it helps. */
function enhance(data: ImageData): ImageData {
  const pixels = data.data
  let min = 255
  let max = 0

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0
    pixels[i] = gray
    pixels[i + 1] = gray
    pixels[i + 2] = gray
    if (gray < min) min = gray
    if (gray > max) max = gray
  }

  const range = max - min
  if (range > 20 && range < 255) {
    const scale = 255 / range
    for (let i = 0; i < pixels.length; i += 4) {
      const stretched = Math.max(0, Math.min(255, (pixels[i] - min) * scale))
      pixels[i] = stretched
      pixels[i + 1] = stretched
      pixels[i + 2] = stretched
    }
  }

  return data
}

/**
 * @param rotationDeg user-applied rotation in 90° steps, on top of EXIF.
 */
export async function prepareImage(source: Blob, rotationDeg = 0): Promise<PreparedImage> {
  const bitmap = await decode(source)

  try {
    const rotation = ((rotationDeg % 360) + 360) % 360
    const swap = rotation === 90 || rotation === 270

    const sourceWidth = swap ? bitmap.height : bitmap.width
    const sourceHeight = swap ? bitmap.width : bitmap.height

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = makeCanvas(width, height)
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!context) throw new Error('לא ניתן לעבד את התמונה בדפדפן הזה')

    context.save()
    context.translate(width / 2, height / 2)
    context.rotate((rotation * Math.PI) / 180)
    const drawWidth = swap ? height : width
    const drawHeight = swap ? width : height
    context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    context.restore()

    const imageData = context.getImageData(0, 0, width, height)
    context.putImageData(enhance(imageData), 0, 0)

    const blob = await toBlob(canvas)
    return { blob, width, height }
  } finally {
    bitmap.close?.()
  }
}

/**
 * Renders a vertical strip of an image, upscaled and padded with white, for the
 * digits-only price pass. See ocr/priceColumn.ts for why this exists.
 */
export async function renderBand(
  source: Blob,
  options: { originX: number; width: number; scale: number; padding: number },
): Promise<Blob> {
  const bitmap = await decode(source)
  try {
    const { originX, width, scale, padding } = options
    const cropWidth = Math.max(1, Math.min(width, bitmap.width - originX))
    const canvasWidth = Math.round(cropWidth * scale) + padding * 2
    const canvasHeight = Math.round(bitmap.height * scale) + padding * 2

    const canvas = makeCanvas(canvasWidth, canvasHeight)
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!context) throw new Error('לא ניתן לעבד את התמונה בדפדפן הזה')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvasWidth, canvasHeight)
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      originX,
      0,
      cropWidth,
      bitmap.height,
      padding,
      padding,
      Math.round(cropWidth * scale),
      Math.round(bitmap.height * scale),
    )

    return await toBlob(canvas)
  } finally {
    bitmap.close?.()
  }
}

/** Small preview used in the upload grid and alongside the review screen. */
export async function makeThumbnail(source: Blob, maxEdge = 480): Promise<Blob> {
  const bitmap = await decode(source)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = makeCanvas(width, height)
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!context) throw new Error('לא ניתן ליצור תצוגה מקדימה')
    context.drawImage(bitmap, 0, 0, width, height)
    return await toBlob(canvas)
  } finally {
    bitmap.close?.()
  }
}
