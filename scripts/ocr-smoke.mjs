/**
 * Manual OCR smoke test: drives a real browser through the upload + extraction
 * flow using the synthetic Hebrew menu in `fixtures/`, and prints what came out.
 *
 * Not part of `npm test`: it downloads the Tesseract language data (~15MB) on
 * first run and takes a minute or two, which does not belong in a unit suite.
 * Run it when you change anything in `src/ocr/`:
 *
 *   BASE_PATH=/ npm run build && npx vite preview --port 4173 &
 *   node scripts/ocr-smoke.mjs
 */
import { chromium } from 'playwright-core'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const base = process.env.SMOKE_URL ?? 'http://localhost:4173/'

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[browser error]', message.text())
})

await page.goto(base)
await page.getByRole('button', { name: 'המשך לתפריט' }).click()

await page.setInputFiles('input[type=file][accept="image/*"]:not([capture])', [
  resolve(here, '..', 'fixtures', 'menu-page-1.png'),
  resolve(here, '..', 'fixtures', 'menu-page-2.png'),
])

await page.getByRole('button', { name: 'חלץ מנות מהתמונות' }).click()
console.log('running OCR — first run downloads the Hebrew language data…')

// Wait until every image has been processed, reading the session rather than
// the UI so the wait cannot pass before extraction has even started.
await page.waitForFunction(
  () => {
    const raw = localStorage.getItem('rbo.session.v1')
    if (!raw) return false
    const images = JSON.parse(raw).images ?? []
    return images.length > 0 && images.every((image) => image.status === 'done' || image.status === 'error')
  },
  null,
  { timeout: 15 * 60 * 1000, polling: 1000 },
)

const session = await page.evaluate(() => JSON.parse(localStorage.getItem('rbo.session.v1') ?? '{}'))
const items = session?.menu?.items ?? []
const categories = new Map((session?.menu?.categories ?? []).map((c) => [c.id, c.name]))

console.log(`\n${items.length} items extracted\n`)
for (const item of items) {
  const prices = item.variants
    .map((v) => (v.priceAgorot === null ? '—' : (v.priceAgorot / 100).toFixed(2)))
    .join(' / ')
  const flag = item.needsReview ? '  ⚑' : ''
  console.log(`[${categories.get(item.categoryId) ?? '?'}] ${item.name} — ${prices}${flag}`)
}

await page.getByRole('button', { name: /מעבר לבדיקה/ }).click()
await page.screenshot({ path: resolve(here, '..', 'ocr-smoke-review.png'), fullPage: true })
console.log('\nwrote ocr-smoke-review.png')

await browser.close()
