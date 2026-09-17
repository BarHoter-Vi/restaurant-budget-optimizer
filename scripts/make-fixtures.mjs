/**
 * Generates the synthetic Hebrew menu images used for development and manual
 * OCR testing.
 *
 * They are drawn from the HTML below and screenshotted locally, so the repo
 * never contains a photo of a real menu, and anyone can regenerate them with
 * `npm run fixtures` — no external service, no licensing question.
 *
 * Page 2 deliberately repeats one dish from page 1, which is how the duplicate
 * detection gets something realistic to chew on.
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'fixtures')

const PAGE_STYLE = `
  @page { margin: 0 }
  body {
    margin: 0;
    padding: 46px 40px;
    background: #fdfaf4;
    color: #1d1a16;
    font-family: 'Arial Hebrew', 'Arial', sans-serif;
    direction: rtl;
    width: 900px;
  }
  h1 { font-size: 40px; margin: 0 0 6px; letter-spacing: 1px; }
  .sub { color: #7a7266; font-size: 17px; margin-bottom: 26px; }
  h2 { font-size: 30px; margin: 30px 0 12px; border-bottom: 2px solid #c9bda6; padding-bottom: 6px; }
  .row { display: flex; align-items: baseline; gap: 12px; margin: 11px 0; font-size: 23px; }
  .row .name { white-space: nowrap; }
  .row .dots { flex: 1; border-bottom: 2px dotted #cfc5b2; transform: translateY(-6px); }
  .row .price { font-weight: bold; white-space: nowrap; }
  .desc { color: #6f675c; font-size: 18px; margin: -4px 0 10px; }
  .two-prices { display: flex; gap: 26px; font-weight: bold; }
  .heads { color: #7a7266; font-size: 17px; display: flex; gap: 22px; justify-content: flex-start; }
`

const row = (name, price, desc) => `
  <div class="row"><span class="name">${name}</span><span class="dots"></span><span class="price">${price}</span></div>
  ${desc ? `<div class="desc">${desc}</div>` : ''}
`

const PAGE_ONE = `
  <h1>מסעדת הגפן</h1>
  <div class="sub">תפריט ערב · כל המחירים בשקלים</div>

  <h2>מנות ראשונות</h2>
  ${row('חומוס הבית', '32', 'עם גרגרים חמים, שמן זית ולימון')}
  ${row('סלט ירקות קצוץ', '38', 'עגבניה, מלפפון, בצל סגול ונענע')}
  ${row('מנת פוקצ׳ה 180 גרם', '29')}
  ${row('כרובית בתנור', '44', 'טחינה גולמית וצנוברים')}

  <h2>עיקריות</h2>
  ${row('שניצל עוף עם צ׳יפס', '68')}
  ${row('פסטה ברוטב עגבניות', '59', 'ריחן טרי ופרמז׳ן')}
  ${row('המבורגר 220 גרם', '74', 'בלחמניית בריוש, מוגש עם צ׳יפס')}
  ${row('דג הים הטרי', 'מחיר שוק')}
  ${row('אנטריקוט לפי משקל', '')}
`

const PAGE_TWO = `
  <h1>מסעדת הגפן</h1>
  <div class="sub">המשך התפריט</div>

  <h2>עיקריות</h2>
  ${row('שניצל עוף עם צ׳יפס', '68')}
  ${row('כבש בטאבון', '98', 'עם פירה ורוטב יין אדום')}

  <h2>שתייה</h2>
  <div class="heads"><span>קטן</span><span>גדול</span></div>
  <div class="row"><span class="name">בירה מהחבית</span><span class="dots"></span><span class="two-prices"><span>22</span><span>32</span></span></div>
  ${row('לימונדה ביתית', '18')}
  ${row('יין הבית', '₪39', 'כוס')}
  ${row('קפה הפוך', '14')}

  <h2>קינוחים</h2>
  ${row('מלבי', '28')}
  ${row('עוגת שוקולד חמה', '42', 'מוגשת עם גלידת וניל')}
  ${row('Fresh Fruit Plate', '36')}
`

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' })
  const page = await browser.newPage({ viewport: { width: 900, height: 400 }, deviceScaleFactor: 2 })

  for (const [index, body] of [PAGE_ONE, PAGE_TWO].entries()) {
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`)
    const buffer = await page.screenshot({ fullPage: true, type: 'png' })
    const file = resolve(outDir, `menu-page-${index + 1}.png`)
    await writeFile(file, buffer)
    console.log(`wrote ${file}`)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
