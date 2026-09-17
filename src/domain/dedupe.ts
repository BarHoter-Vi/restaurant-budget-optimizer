import type { Menu, MenuItem } from './menu'
import { mergeItems } from './menu'

/**
 * Overlapping photos of the same menu produce the same dish twice. We detect
 * that conservatively: auto-merge only on an exact normalised-name match with
 * compatible prices, and surface anything merely *similar* for the user to
 * decide. Silently collapsing near-matches loses real "small / large" pairs.
 */

/** Strip niqqud, bidi marks, punctuation, and collapse whitespace. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[֑-ׇ]/g, '') // Hebrew cantillation + niqqud
    .replace(/[‎‏‪-‮⁦-⁩]/g, '') // bidi controls
    .replace(/["'`״׳.,:;!?()[\]{}<>\-–—_/\\|*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Dice coefficient over character trigrams. 0..1, 1 = identical. */
export function similarity(a: string, b: string): number {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const trigrams = (text: string): Map<string, number> => {
    const padded = `  ${text}  `
    const counts = new Map<string, number>()
    for (let i = 0; i < padded.length - 2; i += 1) {
      const gram = padded.slice(i, i + 3)
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    return counts
  }

  const first = trigrams(left)
  const second = trigrams(right)
  let intersection = 0
  let firstTotal = 0
  let secondTotal = 0
  for (const count of first.values()) firstTotal += count
  for (const count of second.values()) secondTotal += count
  for (const [gram, count] of first) {
    const other = second.get(gram)
    if (other) intersection += Math.min(count, other)
  }
  if (firstTotal + secondTotal === 0) return 0
  return (2 * intersection) / (firstTotal + secondTotal)
}

/**
 * Tuned against real slips: a single mis-read letter in a ten-character Hebrew
 * name scores about 0.75, so anything stricter misses the duplicates that
 * matter. Loose matches are only ever *suggested* — the cost of a false one is
 * a single tap, while a missed duplicate quietly doubles a dish on the menu.
 */
export const SIMILARITY_THRESHOLD = 0.74

export interface DuplicateCandidate {
  targetId: string
  sourceId: string
  score: number
  /** True when we merged automatically (exact name + compatible prices). */
  auto: boolean
  reason: string
}

function priceSet(item: MenuItem): string {
  return item.variants
    .map((v) => v.priceAgorot)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)
    .join(',')
}

function pricesCompatible(a: MenuItem, b: MenuItem): boolean {
  const left = priceSet(a)
  const right = priceSet(b)
  if (left === '' || right === '') return true // one side unpriced — safe to combine
  return left === right
}

/**
 * Find duplicate pairs across a menu. Items from the same source image are never
 * paired: a real menu legitimately repeats a name across sections, and within one
 * photo we trust the layout.
 */
export function findDuplicates(items: readonly MenuItem[]): DuplicateCandidate[] {
  const found: DuplicateCandidate[] = []
  const consumed = new Set<string>()

  for (let i = 0; i < items.length; i += 1) {
    const a = items[i]
    if (consumed.has(a.id)) continue
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j]
      if (consumed.has(b.id)) continue
      if (!a.name.trim() || !b.name.trim()) continue

      const sameImage =
        a.sourceImageIds.length > 0 &&
        b.sourceImageIds.length > 0 &&
        a.sourceImageIds.every((id) => b.sourceImageIds.includes(id))
      if (sameImage) continue

      const score = similarity(a.name, b.name)
      if (score < SIMILARITY_THRESHOLD) continue

      const compatible = pricesCompatible(a, b)
      const exact = normalizeName(a.name) === normalizeName(b.name)
      const auto = exact && compatible

      found.push({
        targetId: a.id,
        sourceId: b.id,
        score,
        auto,
        reason: auto
          ? 'שם ומחיר זהים בשתי תמונות'
          : compatible
            ? `שם דומה (${Math.round(score * 100)}%)`
            : `שם דומה (${Math.round(score * 100)}%) אך מחירים שונים — ייתכן שאלו גדלים שונים`,
      })
      consumed.add(b.id)
    }
  }

  return found
}

/**
 * Apply only the unambiguous merges. The rest come back as suggestions so the
 * review screen can ask.
 */
export function applyAutoMerges(menu: Menu): { menu: Menu; suggestions: DuplicateCandidate[] } {
  const candidates = findDuplicates(menu.items)
  let next = menu
  const suggestions: DuplicateCandidate[] = []
  for (const candidate of candidates) {
    if (candidate.auto) {
      next = mergeItems(next, candidate.targetId, candidate.sourceId)
    } else {
      suggestions.push(candidate)
    }
  }
  return { menu: next, suggestions }
}
