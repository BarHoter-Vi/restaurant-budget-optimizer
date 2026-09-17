import { beforeEach, describe, expect, it } from 'vitest'
import { clearImages, deleteImage, getAllImages, getImage, putImage } from './images'

const blob = (text: string) => new Blob([text], { type: 'image/png' })

const image = (id: string, createdAt: number) => ({
  id,
  name: `${id}.png`,
  blob: blob(id),
  thumbnail: blob(`${id}-thumb`),
  createdAt,
})

describe('local image storage', () => {
  beforeEach(async () => {
    await clearImages()
  })

  it('stores and reads back a photo', async () => {
    await putImage(image('img_1', 1))
    const stored = await getImage('img_1')
    expect(stored?.name).toBe('img_1.png')
    expect(stored?.blob).toBeDefined()
    expect(stored?.thumbnail).toBeDefined()
    expect(stored?.createdAt).toBe(1)
  })

  it('lists photos in the order they were added', async () => {
    await putImage(image('img_2', 2))
    await putImage(image('img_1', 1))
    expect((await getAllImages()).map((i) => i.id)).toEqual(['img_1', 'img_2'])
  })

  it('deletes a single photo', async () => {
    await putImage(image('img_1', 1))
    await deleteImage('img_1')
    expect(await getImage('img_1')).toBeUndefined()
  })

  it('wipes every photo when the session is reset', async () => {
    await putImage(image('img_1', 1))
    await putImage(image('img_2', 2))
    await clearImages()
    expect(await getAllImages()).toEqual([])
  })
})
