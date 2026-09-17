import { useMemo, useState } from 'react'
import { useAppStore } from '../../state/store'
import { itemsByCategory, itemsNeedingReview, type MenuItem } from '../../domain/menu'
import { formatAmount, parseMoney } from '../../domain/money'

function PriceInput({
  value,
  onCommit,
  label,
}: {
  value: number | null
  onCommit: (agorot: number | null) => void
  label: string
}) {
  const [text, setText] = useState(value === null ? '' : formatAmount(value).replace(/,/g, ''))
  const parsed = text.trim() === '' ? null : parseMoney(text)
  const invalid = text.trim() !== '' && parsed === null

  return (
    <span className="input-row" style={{ inlineSize: 130 }}>
      <input
        className={`input${invalid ? ' input--invalid' : ''}`}
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder="—"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (invalid) return
          onCommit(parsed)
        }}
      />
      <span className="input-suffix" aria-hidden="true">₪</span>
    </span>
  )
}

function ItemEditor({ item }: { item: MenuItem }) {
  const patchItem = useAppStore((s) => s.patchItem)
  const patchVariant = useAppStore((s) => s.patchVariant)
  const addItemVariant = useAppStore((s) => s.addItemVariant)
  const deleteItemVariant = useAppStore((s) => s.deleteItemVariant)
  const deleteItem = useAppStore((s) => s.deleteItem)
  const setItemCategory = useAppStore((s) => s.setItemCategory)
  const categories = useAppStore((s) => s.menu.categories)

  const flagged = item.needsReview || item.variants.some((v) => v.needsReview)

  return (
    <article className="menu-item">
      <div className="menu-item__head">
        <div className="menu-item__text">
          <label className="field" style={{ marginBlockEnd: 8 }}>
            <span className="visually-hidden">שם המנה</span>
            <input
              className="input"
              type="text"
              value={item.name}
              placeholder="שם המנה"
              onChange={(event) => patchItem(item.id, { name: event.target.value })}
            />
          </label>
          <label className="field" style={{ marginBlockEnd: 8 }}>
            <span className="visually-hidden">תיאור המנה</span>
            <input
              className="input"
              type="text"
              value={item.description ?? ''}
              placeholder="תיאור (רשות)"
              onChange={(event) => patchItem(item.id, { description: event.target.value })}
            />
          </label>
        </div>
      </div>

      {flagged ? (
        <p style={{ marginBlockEnd: 8 }}>
          <span className="badge badge--review">צריך בדיקה</span>{' '}
          <span className="faint">{item.reviewReasons.join(' · ')}</span>
        </p>
      ) : null}

      {item.variants.map((variant) => (
        <div className="variant-row" key={variant.id}>
          <input
            className="input variant-row__label"
            type="text"
            value={variant.label ?? ''}
            placeholder={item.variants.length > 1 ? 'גודל / סוג' : 'ללא וריאציה'}
            aria-label={`תיאור וריאציה של ${item.name || 'המנה'}`}
            onChange={(event) =>
              patchVariant(item.id, variant.id, { label: event.target.value || undefined })
            }
          />
          <PriceInput
            value={variant.priceAgorot}
            label={`מחיר של ${item.name || 'המנה'}`}
            onCommit={(agorot) =>
              patchVariant(item.id, variant.id, { priceAgorot: agorot, needsReview: agorot === null })
            }
          />
          {item.variants.length > 1 ? (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => deleteItemVariant(item.id, variant.id)}
              aria-label={`מחיקת הווריאציה ${variant.label ?? ''}`}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}

      <div className="btn-row" style={{ marginBlockStart: 10 }}>
        <label className="field" style={{ margin: 0, flex: '2 1 160px' }}>
          <span className="visually-hidden">קטגוריה</span>
          <select
            className="input"
            value={categories.find((c) => c.id === item.categoryId)?.name ?? ''}
            onChange={(event) => setItemCategory(item.id, event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
            {categories.some((c) => c.id === item.categoryId) ? null : (
              <option value="">ללא קטגוריה</option>
            )}
          </select>
        </label>
        <label className="field" style={{ margin: 0, flex: '2 1 160px' }}>
          <span className="visually-hidden">סוג תמחור</span>
          <select
            className="input"
            value={item.priceKind}
            onChange={(event) =>
              patchItem(item.id, { priceKind: event.target.value as MenuItem['priceKind'] })
            }
          >
            <option value="fixed">מחיר קבוע</option>
            <option value="market">מחיר שוק</option>
            <option value="byWeight">לפי משקל</option>
            <option value="unknown">מחיר לא ידוע</option>
          </select>
        </label>
        <button type="button" className="btn btn--sm" onClick={() => addItemVariant(item.id)}>
          + גודל
        </button>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => deleteItem(item.id)}
          aria-label={`מחיקת ${item.name || 'הפריט'}`}
        >
          מחק
        </button>
      </div>
    </article>
  )
}

export function ReviewScreen() {
  const menu = useAppStore((s) => s.menu)
  const images = useAppStore((s) => s.images)
  const duplicates = useAppStore((s) => s.duplicateSuggestions)
  const mergeDuplicate = useAppStore((s) => s.mergeDuplicate)
  const dismissDuplicate = useAppStore((s) => s.dismissDuplicate)
  const addManualItem = useAppStore((s) => s.addManualItem)
  const confirmMenu = useAppStore((s) => s.confirmMenu)
  const goTo = useAppStore((s) => s.goTo)

  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [showImages, setShowImages] = useState(false)

  const flagged = useMemo(() => itemsNeedingReview(menu), [menu])
  const groups = useMemo(() => itemsByCategory(menu), [menu])
  const visibleGroups = onlyFlagged
    ? groups
        .map((group) => ({ ...group, items: group.items.filter((i) => flagged.includes(i)) }))
        .filter((group) => group.items.length > 0)
    : groups

  const priced = menu.items.filter((item) =>
    item.variants.some((v) => v.priceAgorot !== null && v.priceAgorot > 0),
  ).length

  if (menu.items.length === 0) {
    return (
      <div className="empty">
        <span className="empty__icon" aria-hidden="true">📋</span>
        <h2>אין עדיין פריטים</h2>
        <p className="muted" style={{ marginBlock: 8 }}>
          אפשר לחזור ולהוסיף תמונות תפריט, או להזין מנות ידנית.
        </p>
        <div className="btn-row" style={{ marginBlockStart: 12 }}>
          <button type="button" className="btn" onClick={() => goTo('upload')}>
            חזרה לתמונות
          </button>
          <button type="button" className="btn btn--primary" onClick={() => addManualItem()}>
            הוספת מנה ידנית
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="card__head">
          <h2>בדיקת התפריט</h2>
        </div>
        <p className="muted">
          {menu.items.length} פריטים, מהם {priced} עם מחיר מזוהה ו‑{flagged.length} מסומנים לבדיקה.
          זיהוי טקסט בדפדפן אינו מושלם — כדאי להשוות מול התמונה ולתקן.
        </p>
        <div className="btn-row" style={{ marginBlockStart: 12 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={onlyFlagged}
            onClick={() => setOnlyFlagged((value) => !value)}
          >
            רק פריטים לבדיקה ({flagged.length})
          </button>
          {images.length > 0 ? (
            <button
              type="button"
              className="chip"
              aria-pressed={showImages}
              onClick={() => setShowImages((value) => !value)}
            >
              {showImages ? 'הסתר תמונות' : 'הצג תמונות'}
            </button>
          ) : null}
        </div>
      </div>

      {showImages ? (
        <div className="thumbs" style={{ marginBlockEnd: 12 }}>
          {images.map((image) => (
            <img
              key={image.id}
              className="thumb__img"
              src={image.previewUrl}
              alt={`תמונת תפריט: ${image.name}`}
              style={{ transform: `rotate(${image.rotationDeg}deg)`, borderRadius: 12 }}
            />
          ))}
        </div>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="card">
          <div className="card__head">
            <h2>כפילויות אפשריות</h2>
          </div>
          {duplicates.map((duplicate) => {
            const target = menu.items.find((i) => i.id === duplicate.targetId)
            const source = menu.items.find((i) => i.id === duplicate.sourceId)
            if (!target || !source) return null
            return (
              <div className="notice notice--warn" key={`${duplicate.targetId}-${duplicate.sourceId}`}>
                <span aria-hidden="true">⧉</span>
                <span style={{ flex: 1 }}>
                  <strong>{target.name}</strong> ו‑<strong>{source.name}</strong>
                  <br />
                  <span className="faint">{duplicate.reason}</span>
                  <span className="btn-row" style={{ marginBlockStart: 8 }}>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      onClick={() => mergeDuplicate(duplicate.targetId, duplicate.sourceId)}
                    >
                      מזג
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => dismissDuplicate(duplicate.targetId, duplicate.sourceId)}
                    >
                      הם שונים
                    </button>
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {visibleGroups.map((group) => (
        <section key={group.category.id}>
          <h3 className="section-title">{group.category.name}</h3>
          <div className="list">
            {group.items.map((item) => (
              <ItemEditor item={item} key={item.id} />
            ))}
          </div>
        </section>
      ))}

      {visibleGroups.length === 0 ? (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">✓</span>
          <p>אין פריטים שדורשים בדיקה.</p>
        </div>
      ) : null}

      <div className="btn-row" style={{ marginBlockStart: 16 }}>
        <button type="button" className="btn" onClick={() => addManualItem()}>
          + הוספת מנה
        </button>
        <button type="button" className="btn" onClick={() => goTo('upload')}>
          הוספת תמונות
        </button>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block"
        style={{ marginBlockStart: 10 }}
        onClick={confirmMenu}
        disabled={priced === 0}
      >
        אישור התפריט ומעבר לבחירת מנות
      </button>
      {priced === 0 ? (
        <p className="faint" style={{ marginBlockStart: 8, textAlign: 'center' }}>
          צריך לפחות מנה אחת עם מחיר מספרי כדי להמשיך.
        </p>
      ) : null}
    </>
  )
}
