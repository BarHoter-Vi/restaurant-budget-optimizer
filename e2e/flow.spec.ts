import { expect, test } from '@playwright/test'
import { SEEDED_MENU, seedSession, STORAGE_KEY } from './seed'

test.describe('budget setup', () => {
  test('computes the total budget and the ceiling for food', async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('מספר סועדים').fill('4')
    await page.getByLabel('תקציב לאדם').fill('150')
    await page.getByLabel('אחוז טיפ').fill('12')

    await expect(page.getByText('₪600.00').first()).toBeVisible()
    // ₪600 ÷ 1.12, floored — appears both as a figure and in the explanation.
    await expect(page.getByText('₪535.71').first()).toBeVisible()
  })

  test('refuses to continue on invalid input and says why', async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('מספר סועדים').fill('0')
    await expect(page.getByRole('alert')).toContainText('מספר שלם')
    await expect(page.getByRole('button', { name: 'המשך לתפריט' })).toBeDisabled()
  })

  test('accepts a 0% tip', async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('תקציב לאדם').fill('100')
    await page.getByLabel('מספר סועדים').fill('2')
    await page.getByLabel('אחוז טיפ').fill('0')
    await expect(page.getByText('מקסימום לאוכל (לפני טיפ)')).toBeVisible()
    // With no tip the whole budget is available for food.
    await expect(page.getByText('₪200.00').first()).toBeVisible()
  })
})

test.describe('choosing dishes', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page)
    await page.goto('./')
  })

  test('updates every total the moment a dish is added', async ({ page }) => {
    const summary = page.getByRole('region', { name: 'סיכום תקציב' })
    await expect(summary).toContainText('₪0.00')

    await page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' }).click()

    await expect(summary).toContainText('₪68.00') // food
    await expect(summary).toContainText('₪8.16') // tip
    await expect(summary).toContainText('₪76.16') // total
    await expect(summary).toContainText('₪223.84') // remaining
    await expect(summary).toContainText('בתוך התקציב')
  })

  test('counts a shared dish once rather than per diner', async ({ page }) => {
    await page.getByRole('button', { name: 'הוספת יחידה אחת של חומוס הבית' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪32.00')
  })

  test('warns clearly once the order exceeds the budget', async ({ page }) => {
    const add = page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' })
    for (let i = 0; i < 5; i += 1) await add.click()

    const summary = page.getByRole('region', { name: 'סיכום תקציב' })
    await expect(summary).toContainText('חריגה מהתקציב')
    await expect(summary).toContainText('חריגה של')
  })

  test('keeps separate sizes selectable independently', async ({ page }) => {
    await page.getByRole('button', { name: 'הוספת יחידה אחת של בירה מהחבית קטן' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪22.00')
    await page.getByRole('button', { name: 'הוספת יחידה אחת של בירה מהחבית גדול' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪54.00')
  })

  test('marks a market-price dish and leaves it out of the maths', async ({ page }) => {
    await expect(page.getByText('מחיר שוק')).toBeVisible()
    await page.getByRole('button', { name: 'הוספת יחידה אחת של דג הים הטרי' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪0.00')
    await expect(page.getByText('אינם נכללים בחישוב')).toBeVisible()
  })

  test('filters by search and by category', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'חיפוש מנה' }).fill('שניצל')
    await expect(page.getByText('חומוס הבית')).toHaveCount(0)
    await page.getByRole('searchbox', { name: 'חיפוש מנה' }).fill('')
    await page.getByRole('button', { name: 'שתייה' }).click()
    await expect(page.getByText('בירה מהחבית')).toBeVisible()
    await expect(page.getByText('שניצל עוף')).toHaveCount(0)
  })
})

test.describe('recommendations', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page)
    await page.goto('./')
  })

  test('suggests a combination that stays inside the budget and adds it in one tap', async ({ page }) => {
    await page.getByRole('button', { name: 'הצע ניצול מיטבי לתקציב' }).click()
    const dialog = page.getByRole('dialog', { name: 'ניצול מיטבי של התקציב' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('לא תחרוג')

    await dialog.getByRole('button', { name: 'הוסף להזמנה' }).first().click()

    const summary = page.getByRole('region', { name: 'סיכום תקציב' })
    await expect(summary).not.toContainText('חריגה מהתקציב')
  })

  test('has nothing to offer once the budget is spent', async ({ page }) => {
    const add = page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' })
    for (let i = 0; i < 4; i += 1) await add.click()
    await page.getByRole('button', { name: 'הצע ניצול מיטבי לתקציב' }).click()
    await expect(page.getByRole('dialog')).toContainText('אין כרגע הצעה')
  })
})

test.describe('session handling', () => {
  test('survives an accidental refresh', async ({ page }) => {
    await seedSession(page)
    await page.goto('./')
    await page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪68.00')

    await page.reload()

    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪68.00')
    await expect(page.getByText('שניצל עוף').first()).toBeVisible()
  })

  test('start over asks first, then clears everything', async ({ page }) => {
    await seedSession(page)
    await page.goto('./')
    await page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' }).click()

    await page.getByRole('button', { name: 'התחל מחדש' }).click()
    await expect(page.getByRole('dialog', { name: 'להתחיל מחדש?' })).toBeVisible()
    await page.getByRole('button', { name: 'ביטול' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪68.00')

    await page.getByRole('button', { name: 'התחל מחדש' }).click()
    await page.getByRole('button', { name: 'מחק הכול' }).click()

    await expect(page.getByRole('heading', { name: 'התקציב שלכם' })).toBeVisible()
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test('keeps working with no network once loaded', async ({ page, context }) => {
    await seedSession(page)
    await page.goto('./')
    await context.setOffline(true)

    await expect(page.getByText('אין חיבור לאינטרנט')).toBeVisible()
    await page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪68.00')

    await context.setOffline(false)
  })
})

test.describe('menu review', () => {
  test('edits an extracted item and recalculates a price already chosen', async ({ page }) => {
    await seedSession(page, { step: 'review', menu: { ...SEEDED_MENU.menu, confirmed: false } })
    await page.goto('./')

    await expect(page.getByRole('heading', { name: 'בדיקת התפריט' })).toBeVisible()
    await expect(page.getByText('צריך בדיקה').first()).toBeVisible()

    const price = page.getByLabel('מחיר של שניצל עוף')
    await price.fill('75')
    await price.blur()

    await page.getByRole('button', { name: 'אישור התפריט ומעבר לבחירת מנות' }).click()
    await page.getByRole('button', { name: 'הוספת יחידה אחת של שניצל עוף' }).click()
    await expect(page.getByRole('region', { name: 'סיכום תקציב' })).toContainText('₪75.00')
  })
})

test.describe('mobile layout and accessibility', () => {
  test('does not scroll horizontally', async ({ page }) => {
    await seedSession(page)
    await page.goto('./')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('every control on the budget screen has an accessible name', async ({ page }) => {
    await page.goto('./')
    for (const name of ['מספר סועדים', 'תקציב לאדם', 'אחוז טיפ']) {
      await expect(page.getByLabel(name)).toBeVisible()
    }
  })

  test('the upload screen explains that photos stay on the device', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'המשך לתפריט' }).click()
    await expect(page.getByText(/התמונות נשארות במכשיר שלכם/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'צילום תפריט' })).toBeVisible()
  })
})
