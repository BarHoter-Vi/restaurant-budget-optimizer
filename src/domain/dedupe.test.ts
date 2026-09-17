import { describe, expect, it } from 'vitest'
import { applyAutoMerges, findDuplicates, normalizeName, similarity, SIMILARITY_THRESHOLD } from './dedupe'
import { makeItem, makeVariant, type Menu } from './menu'

const item = (name: string, price: number | null, imageId: string, description?: string) =>
  makeItem({
    name,
    description,
    categoryId: 'cat_1',
    variants: [makeVariant({ priceAgorot: price })],
    sourceImageIds: [imageId],
    origin: 'ocr',
  })

describe('normalizeName', () => {
  it('ignores niqqud, punctuation and case', () => {
    expect(normalizeName('שְׁנִיצֶל, עוף!')).toBe(normalizeName('שניצל עוף'))
    expect(normalizeName('Fresh  Lemonade')).toBe('fresh lemonade')
  })
})

describe('similarity', () => {
  it('scores identical names at 1', () => {
    expect(similarity('חומוס הבית', 'חומוס הבית')).toBe(1)
  })

  it('scores a one-letter OCR slip highly', () => {
    expect(similarity('חומוס הבית', 'חומוס הביח')).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD)
  })

  it('scores unrelated dishes low', () => {
    expect(similarity('חומוס הבית', 'שניצל עוף')).toBeLessThan(0.3)
  })
})

describe('findDuplicates', () => {
  it('pairs the same dish photographed twice', () => {
    const duplicates = findDuplicates([item('חומוס הבית', 3_200, 'img_1'), item('חומוס הבית', 3_200, 'img_2')])
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].auto).toBe(true)
  })

  it('does not pair two rows from the same photo', () => {
    expect(findDuplicates([item('חומוס הבית', 3_200, 'img_1'), item('חומוס הבית', 3_200, 'img_1')])).toHaveLength(0)
  })

  it('asks rather than auto-merging when prices differ', () => {
    const duplicates = findDuplicates([item('בירה מהחבית', 2_200, 'img_1'), item('בירה מהחבית', 3_200, 'img_2')])
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].auto).toBe(false)
    expect(duplicates[0].reason).toContain('גדלים')
  })

  it('leaves genuinely different dishes alone', () => {
    expect(findDuplicates([item('חומוס הבית', 3_200, 'img_1'), item('שניצל עוף', 6_800, 'img_2')])).toHaveLength(0)
  })

  it('ignores unnamed items', () => {
    expect(findDuplicates([item('', 3_200, 'img_1'), item('', 3_200, 'img_2')])).toHaveLength(0)
  })
})

describe('applyAutoMerges', () => {
  it('merges the certain pairs and reports the rest as suggestions', () => {
    const menu: Menu = {
      categories: [{ id: 'cat_1', name: 'ראשונות', order: 0 }],
      items: [
        item('חומוס הבית', 3_200, 'img_1', 'עם שמן זית'),
        item('חומוס הבית', 3_200, 'img_2'),
        item('בירה מהחבית', 2_200, 'img_1'),
        item('בירה מהחבית', 3_200, 'img_2'),
      ],
      confirmed: false,
    }

    const result = applyAutoMerges(menu)
    expect(result.menu.items).toHaveLength(3)
    expect(result.suggestions).toHaveLength(1)
    // the surviving hummus keeps the description found on the other photo
    const hummus = result.menu.items.find((i) => i.name === 'חומוס הבית')
    expect(hummus?.description).toBe('עם שמן זית')
    expect(hummus?.sourceImageIds).toEqual(['img_1', 'img_2'])
  })
})
