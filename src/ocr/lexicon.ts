/** Hebrew/English word lists used by the menu parser. Kept in one place so they
 *  can be extended without touching the parsing logic. */

export const CATEGORY_WORDS = [
  // Hebrew
  'ראשונות', 'ראשונים', 'מנות ראשונות', 'עיקריות', 'מנות עיקריות', 'עיקריים',
  'קינוחים', 'קינוח', 'שתייה', 'שתיה', 'משקאות', 'בר', 'יינות', 'יין', 'בירות', 'בירה',
  'סלטים', 'סלט', 'מרקים', 'מרק', 'פסטות', 'פסטה', 'פיצות', 'פיצה', 'המבורגר', 'המבורגרים',
  'דגים', 'בשרים', 'מהגריל', 'מהטאבון', 'צמחוני', 'טבעוני', 'תוספות', 'כריכים', 'לחמים',
  'ארוחת בוקר', 'בוקר', 'צהריים', 'ילדים', 'מנות ילדים', 'טפאס', 'מאכלי ים', 'קפה', 'תפריט',
  // English
  'starters', 'appetizers', 'mains', 'main courses', 'desserts', 'drinks', 'beverages',
  'salads', 'soups', 'pasta', 'pizza', 'burgers', 'fish', 'meat', 'grill', 'sides',
  'sandwiches', 'breakfast', 'kids', 'wine', 'beer', 'cocktails', 'coffee', 'menu',
]

/** Units that follow a number inside a description — those numbers are not prices. */
export const UNIT_WORDS = [
  'גרם', 'גר', "ג'", 'ג', 'ק"ג', 'קג', 'מ"ל', 'מל', 'ליטר', 'ל', 'יח', "יח'", 'יחידות',
  'דקות', 'שעות', 'אנשים', 'סועדים', 'קלוריות', 'אחוז', 'שנה', 'שנים', 'מעלות',
  'g', 'gr', 'gram', 'grams', 'kg', 'ml', 'l', 'ltr', 'cl', 'oz', 'cm', 'mm', 'pcs',
  'kcal', 'cal', 'min', 'mins', '%', 'abv',
]

/** Variant labels we can recognise directly on the line. */
/**
 * Note: JavaScript's \b does not create a boundary around Hebrew letters (they
 * are not \w), so Hebrew terms use explicit lookarounds instead.
 */
export const VARIANT_WORDS: Array<{ match: RegExp; label: string }> = [
  { match: /(?<![\u0590-\u05FF])(?:קטן|קטנה)(?![\u0590-\u05FF])/, label: 'קטן' },
  { match: /(?<![\u0590-\u05FF])גדול(?:ה)?(?![\u0590-\u05FF])/, label: 'גדול' },
  { match: /(?<![\u0590-\u05FF])בינוני(?:ת)?(?![\u0590-\u05FF])/, label: 'בינוני' },
  { match: /(?<![\u0590-\u05FF])חצי(?![\u0590-\u05FF])/, label: 'חצי' },
  { match: /(?<![\u0590-\u05FF])(?:שלם|שלמה)(?![\u0590-\u05FF])/, label: 'שלם' },
  { match: /(?<![\u0590-\u05FF])חצי ליטר(?![\u0590-\u05FF])/, label: 'חצי ליטר' },
  { match: /(?<![\u0590-\u05FF])כוס(?![\u0590-\u05FF])/, label: 'כוס' },
  { match: /(?<![\u0590-\u05FF])בקבוק(?![\u0590-\u05FF])/, label: 'בקבוק' },
  { match: /(?<![\u0590-\u05FF])שליש(?![\u0590-\u05FF])/, label: 'שליש' },
  { match: /\bsmall\b/i, label: 'קטן' },
  { match: /\bmedium\b/i, label: 'בינוני' },
  { match: /\blarge\b/i, label: 'גדול' },
  { match: /\bglass\b/i, label: 'כוס' },
  { match: /\bbottle\b/i, label: 'בקבוק' },
]

/** Prices that are not numbers. */
export const MARKET_PRICE_PATTERNS: Array<{ match: RegExp; kind: 'market' | 'byWeight'; note: string }> = [
  { match: /מחיר\s*שוק/, kind: 'market', note: 'מחיר שוק — יש לברר במסעדה' },
  { match: /מחיר\s*יום/, kind: 'market', note: 'מחיר יום — יש לברר במסעדה' },
  { match: /לפי\s*מחיר\s*שוק/, kind: 'market', note: 'מחיר שוק — יש לברר במסעדה' },
  { match: /market\s*price/i, kind: 'market', note: 'Market price — ask the restaurant' },
  { match: /\bS\.?Q\.?\b/, kind: 'market', note: 'מחיר משתנה — יש לברר במסעדה' },
  { match: /לפי\s*משקל/, kind: 'byWeight', note: 'מתומחר לפי משקל' },
  { match: /ל\s*100\s*גרם/, kind: 'byWeight', note: 'מתומחר לפי משקל' },
  { match: /לק"ג|לקילו/, kind: 'byWeight', note: 'מתומחר לפי משקל' },
  { match: /per\s*(?:kg|100\s*g)/i, kind: 'byWeight', note: 'מתומחר לפי משקל' },
]

/** Offers and combos: kept, but never folded into the maths automatically. */
export const PROMO_PATTERNS: RegExp[] = [
  /(?<![\u0590-\u05FF])מבצע(?![\u0590-\u05FF])/,
  /\b1\s*\+\s*1\b/,
  /\b2\s*\+\s*1\b/,
  /ארוחה\s*עסקית/,
  /עסקית/,
  /(?<![\u0590-\u05FF])הנחה(?![\u0590-\u05FF])/,
  /(?<![\u0590-\u05FF])חינם(?![\u0590-\u05FF])/,
  /\bbuy\s*one\b/i,
  /\bcombo\b/i,
  /\bdeal\b/i,
  /\d+\s*%\s*(?:הנחה|off)/i,
]

/**
 * Exact match only. Matching on a prefix looked tempting but turned a dish named
 * "פסטה ברוטב עגבניות" into a section heading — multi-word headings belong in
 * the list above instead.
 */
export function isCategoryWord(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[:：]+$/, '')
  if (!normalized) return false
  return CATEGORY_WORDS.includes(normalized)
}
