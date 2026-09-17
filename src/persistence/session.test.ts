import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSession,
  defaultSession,
  loadSession,
  pruneSelections,
  saveSession,
  STORAGE_KEY,
} from './session'
import { emptyMenu, makeItem, makeVariant, type Menu } from '../domain/menu'

function sampleMenu(): Menu {
  return {
    ...emptyMenu(),
    categories: [{ id: 'c1', name: 'ראשונות', order: 0 }],
    items: [
      makeItem({ id: 'i1', name: 'חומוס', categoryId: 'c1', variants: [makeVariant({ id: 'v1', priceAgorot: 3_200 })] }),
    ],
    confirmed: true,
  }
}

describe('session persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing has been saved', () => {
    expect(loadSession()).toBeNull()
  })

  it('round-trips a session, which is what survives an accidental refresh', () => {
    const menu = sampleMenu()
    saveSession({
      step: 'select',
      budget: { diners: 3, perPersonAgorot: 13_500, tipBp: 1_250 },
      menu,
      selections: [{ itemId: 'i1', variantId: 'v1', qty: 2 }],
      images: [{ id: 'img_1', name: 'menu.jpg', rotationDeg: 90, status: 'done', itemCount: 4 }],
    })

    const loaded = loadSession()
    expect(loaded?.step).toBe('select')
    expect(loaded?.budget).toEqual({ diners: 3, perPersonAgorot: 13_500, tipBp: 1_250 })
    expect(loaded?.selections).toEqual([{ itemId: 'i1', variantId: 'v1', qty: 2 }])
    expect(loaded?.menu.items[0].variants[0].priceAgorot).toBe(3_200)
    expect(loaded?.images[0].rotationDeg).toBe(90)
  })

  it('discards a corrupt blob instead of half-restoring it', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadSession()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('discards a session written by an older, incompatible version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 0, step: 'budget' }))
    expect(loadSession()).toBeNull()
  })

  it('discards a session whose values are out of range', () => {
    const session = { ...defaultSession(), budget: { diners: -3, perPersonAgorot: 100, tipBp: 0 } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    expect(loadSession()).toBeNull()
  })

  it('clears everything on request', () => {
    saveSession({ ...defaultSession() })
    clearSession()
    expect(loadSession()).toBeNull()
  })
})

describe('pruneSelections', () => {
  it('drops selections whose dish or variant is gone', () => {
    const menu = sampleMenu()
    const pruned = pruneSelections(menu, [
      { itemId: 'i1', variantId: 'v1', qty: 1 },
      { itemId: 'i1', variantId: 'gone', qty: 1 },
      { itemId: 'gone', variantId: 'v1', qty: 1 },
    ])
    expect(pruned).toEqual([{ itemId: 'i1', variantId: 'v1', qty: 1 }])
  })
})
