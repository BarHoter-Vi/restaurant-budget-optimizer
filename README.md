# תקציב במסעדה · Restaurant Budget Optimizer

A mobile-first web app for spending a fixed restaurant budget well: set the budget, photograph the
menu, correct what the OCR read, pick dishes, and watch the tip-inclusive total update as you go.

Everything runs in the browser. There is no backend, no database, no account, no API key, and
nothing to pay for — the app is a static site, and menu photos never leave the device.

**Hebrew-first and fully right-to-left**, with English and mixed-language menus supported.

---

## What it does

1. **תקציב** — number of diners, budget per diner (₪), tip percentage. Shows the total budget and
   the maximum that can be spent on food before the tip pushes you over.
2. **תמונות תפריט** — take photos or pick existing ones, rotate, remove, retry a failed image.
3. **בדיקת תפריט** — the extracted menu, grouped by category, with everything editable. Uncertain
   rows are flagged rather than silently guessed, likely duplicates from overlapping photos are
   offered for merging, and the menu only becomes selectable once you confirm it.
4. **בחירת מנות** — searchable, filterable list with quantity steppers. Each row shows what one more
   unit costs including tip. A shared dish counts once; nothing is multiplied by the party size.
5. **סיכום תקציב** — a sticky summary of food, tip, total, remaining and percentage used, with three
   states (נוח · קרוב · חריגה) signalled by icon and wording, not colour alone.
6. **ניצול מיטבי** — optional suggestions for using what is left, each explained and addable in one
   tap. No suggestion can ever exceed the budget once the tip is added.

## Quick start

```bash
npm install
npm run dev
```

Then open the printed URL. The app works immediately; the OCR language files download the first
time you extract a menu.

## Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | type check + production build into `dist/` |
| `npm run preview` | serve the production build locally |
| `npm test` | unit and component tests (Vitest) |
| `npm run e2e` | end-to-end tests at phone viewports (Playwright) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, app and test configs |
| `npm run verify` | lint + typecheck + tests + build, the same gate CI runs |
| `npm run fixtures` | regenerate the synthetic Hebrew menu images in `fixtures/` |

`npm run e2e` uses the Chrome already installed on your machine, so there is nothing extra to
download locally. CI installs Playwright's own Chromium instead.

## Architecture

```
src/
  domain/       pure logic, no DOM: money, budget, menu schema + edits, dedupe, recommendations
  ocr/          tesseract wrapper, image preprocessing, the price-column pass, and the parser
  persistence/  localStorage session (zod-validated) and IndexedDB image storage
  state/        one Zustand store; orchestration only, no business rules
  ui/           screens and components
```

The split is deliberate: **every rule that decides a number lives in `domain/` or `ocr/parse.ts`,
and both are pure functions.** The store wires them to the UI, and the UI renders. That is what
makes the awkward cases — two prices on one row, a weight inside a description, a market-price
dish — testable without a browser or a photograph.

### Money

All amounts are stored as **integer agorot** (₪1 = 100). Derived values — tip, total, remaining —
are kept unrounded, and rounding happens only in the display formatter. The tip percentage is held
in basis points so the over-budget test is exact integer arithmetic:

```
over budget  ⟺  foodSubtotal × (10000 + tipBp) > totalBudget × 10000
```

This matters at the boundary: a subtotal whose tip lands a fraction of an agora over the budget is
reported as over, and the recommendation engine uses the same test before emitting anything.

```
totalBudget     = diners × budgetPerPerson
foodSubtotal    = Σ price × quantity
tip             = foodSubtotal × tipPercent / 100
estimatedTotal  = foodSubtotal + tip
remaining       = totalBudget − estimatedTotal
maxFoodSubtotal = ⌊totalBudget ÷ (1 + tipPercent/100)⌋
```

### Menu extraction

OCR is [tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) running on WebAssembly
inside the browser, in its own worker, with the Hebrew and English models fetched once from a public
CDN and cached in IndexedDB. Images are downscaled, EXIF-rotated and contrast-stretched first.

Extraction then works in two passes:

1. **The page pass** reads the whole image and produces lines with word bounding boxes. A number
   becomes a price only if it carries a currency marker or sits in the outer band of its row, is
   inside a plausible range, and is not followed by a unit — which is what keeps "180 גרם" and
   "5% אלכוהול" out of the price column.
2. **The price-column pass** re-reads just the strip the prices live in, upscaled, English-only and
   with a digits-only whitelist. This exists because the full-page pass reliably drops the leading
   digit of Hebrew-page prices (₪68 read as "8"); on the test fixtures the second pass takes price
   accuracy from roughly half to all of them. Where the two disagree the longer number wins — OCR
   loses digits far more often than it invents them.

Section headings, dish descriptions, size variants (קטן/גדול, כוס/בקבוק), market-price and
by-weight dishes, and promotional rows are all detected, and anything ambiguous is flagged
`needsReview` with a reason in Hebrew instead of being guessed at. Duplicates across overlapping
photos are merged automatically only on an exact name and price match; anything merely similar is
offered as a suggestion.

### Recommendations

`recommend()` searches combinations of confirmed, numerically-priced dishes with a depth-limited
DFS and a hard node budget, so it stays fast on a phone. It maximises budget utilisation while
penalising repeats and rewarding category variety, which is what stops it proposing six identical
drinks to hit the number exactly. Limits (distinct dishes, copies per dish, units per category) live
in a typed `RuleSet`, so dietary filters, course balance or party-size rules can be added without
touching the search. Items without a confirmed numeric price are never used.

### Storage and privacy

- The session — budget, menu, selections — is in `localStorage`, validated with zod on read, so a
  corrupt or outdated blob is discarded rather than half-restored. A refresh never loses the order.
- Menu photos are blobs in **IndexedDB**, for this session only. They are never uploaded.
- "התחל מחדש" asks for confirmation, then deletes both.
- The app is a PWA: the shell is precached, so budget and menu selection work offline. Only the
  first OCR run needs a connection, and the UI says so.

## Testing

```bash
npm test     # 134 unit/component tests
npm run e2e  # 36 end-to-end tests across two phone viewports
```

Unit coverage spans currency parsing and rounding, budget and tip arithmetic including 0% tip,
decimals and the exact over-budget boundary, menu parsing against recorded Hebrew/English OCR
fixtures, price-column reconciliation, duplicate detection, item editing, persistence round-trips
and corrupt-data rejection, and the recommendation constraints — including a randomised property
test asserting that no suggestion, over 120 generated menus and budgets, ever exceeds the budget
after tip.

End-to-end coverage runs the real flow at iPhone and small-Android sizes: totals updating live,
the over-budget warning, size variants, market-price dishes, search and filters, one-tap
suggestions, surviving a refresh, reset, working offline, no horizontal scrolling and accessible
control names.

`fixtures/` holds two **synthetic** Hebrew menu images, generated locally by `npm run fixtures` —
no photograph of a real menu is ever committed. `scripts/ocr-smoke.mjs` drives a real browser
through upload and extraction against them and prints what came out; it is kept out of `npm test`
because it downloads the language data and takes a couple of minutes.

```bash
BASE_PATH=/ npm run build && npx vite preview --port 4173 &
node scripts/ocr-smoke.mjs
```

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`. The
build reads `BASE_PATH` so assets resolve under `/<repository>/`; set `BASE_PATH=/` for any host
that serves from the root.

To host it somewhere else at no cost, `npm run build` produces a plain static `dist/` that any
static host will serve — Cloudflare Pages, Netlify and Vercel all have free tiers, and none of this
app needs a server.

## Known limitations

- **Browser OCR is weaker than paid vision models.** On stylised, low-contrast, handwritten or
  photographed-at-an-angle menus it will misread names and occasionally prices. The review screen is
  built to make fixing that quick, and nothing is ever confirmed automatically.
- The first extraction downloads roughly 10–15 MB of language data and needs a connection once.
  After that it is cached and works offline.
- Very large menus stay responsive (rows use `content-visibility`), but extraction time grows with
  the number of photos; images are processed one at a time to keep memory use low on older phones.
- Market-price and by-weight dishes can be ordered but are deliberately excluded from the budget
  maths and from recommendations, since they have no number to work with.

## Licence

MIT — see [LICENSE](LICENSE).
