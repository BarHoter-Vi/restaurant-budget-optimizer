import { useMemo, useState } from 'react'
import { resolveSelections, useAppStore } from '../../state/store'
import { hasUsablePrice, itemsByCategory } from '../../domain/menu'
import { formatILS } from '../../domain/money'
import { marginalCost } from '../../domain/budget'
import { QtyStepper } from '../components/QtyStepper'
import { normalizeName } from '../../domain/dedupe'

const PRICE_KIND_LABEL: Record<string, string> = {
  market: 'מחיר שוק',
  byWeight: 'לפי משקל',
  unknown: 'מחיר לא ידוע',
}

export function SelectScreen() {
  const menu = useAppStore((s) => s.menu)
  const selections = useAppStore((s) => s.selections)
  const tipBp = useAppStore((s) => s.budget.tipBp)
  const addOne = useAppStore((s) => s.addOne)
  const removeOne = useAppStore((s) => s.removeOne)
  const clearSelections = useAppStore((s) => s.clearSelections)
  const unconfirmMenu = useAppStore((s) => s.unconfirmMenu)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const groups = useMemo(() => itemsByCategory(menu), [menu])
  const resolved = useMemo(() => resolveSelections(menu, selections), [menu, selections])
  const qtyFor = (itemId: string, variantId: string) =>
    selections.find((s) => s.itemId === itemId && s.variantId === variantId)?.qty ?? 0

  const needle = normalizeName(query)
  const visible = groups
    .filter((group) => !category || group.category.id === category)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!needle) return true
        return (
          normalizeName(item.name).includes(needle) ||
          normalizeName(item.description ?? '').includes(needle)
        )
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <>
      <div className="toolbar">
        <label className="field" style={{ margin: 0 }}>
          <span className="visually-hidden">חיפוש מנה</span>
          <input
            className="input"
            type="search"
            value={query}
            placeholder="חיפוש מנה…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="chips" role="group" aria-label="סינון לפי קטגוריה">
          <button
            type="button"
            className="chip"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
          >
            הכול
          </button>
          {groups.map((group) => (
            <button
              key={group.category.id}
              type="button"
              className="chip"
              aria-pressed={category === group.category.id}
              onClick={() => setCategory(group.category.id)}
            >
              {group.category.name}
            </button>
          ))}
        </div>
      </div>

      {resolved.length > 0 ? (
        <div className="card">
          <div className="card__head">
            <h2>ההזמנה שלכם</h2>
            <button type="button" className="btn btn--sm btn--ghost" onClick={clearSelections}>
              נקה
            </button>
          </div>
          <div className="list">
            {resolved.map((entry) => (
              <div className="variant-row" key={`${entry.itemId}-${entry.variantId}`}>
                <span className="variant-row__label">
                  {entry.item.name}
                  {entry.variant.label ? ` · ${entry.variant.label}` : ''} × {entry.qty}
                </span>
                <span className="menu-item__price">
                  {entry.priceAgorot === null ? '—' : formatILS(entry.lineTotalAgorot)}
                </span>
              </div>
            ))}
          </div>
          {resolved.some((entry) => entry.priceAgorot === null) ? (
            <p className="faint" style={{ marginBlockStart: 8 }}>
              פריטים ללא מחיר מספרי אינם נכללים בחישוב ובהמלצות.
            </p>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">🔍</span>
          <p>לא נמצאו מנות שמתאימות לחיפוש.</p>
        </div>
      ) : null}

      {visible.map((group) => (
        <section key={group.category.id}>
          <h3 className="section-title">{group.category.name}</h3>
          <div className="list">
            {group.items.map((item) => {
              const selectedHere = item.variants.some((v) => qtyFor(item.id, v.id) > 0)
              return (
                <article
                  className={`menu-item${selectedHere ? ' menu-item--selected' : ''}`}
                  key={item.id}
                >
                  <div className="menu-item__head">
                    <div className="menu-item__text">
                      <p className="menu-item__name">{item.name || '(ללא שם)'}</p>
                      {item.description ? <p className="menu-item__desc">{item.description}</p> : null}
                      {item.priceKind !== 'fixed' ? (
                        <p style={{ marginBlockStart: 4 }}>
                          <span className="badge badge--muted">{PRICE_KIND_LABEL[item.priceKind]}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {item.variants.map((variant) => {
                    const usable = hasUsablePrice(item, variant)
                    const qty = qtyFor(item.id, variant.id)
                    const label = variant.label ? `${item.name} ${variant.label}` : item.name
                    return (
                      <div className="variant-row" key={variant.id}>
                        <span className="variant-row__label">
                          {/* A lone unlabelled variant needs no name of its own —
                              the dish title above already says what it is. */}
                          {variant.label ? <span>{variant.label}</span> : null}
                          {usable ? (
                            <span className="menu-item__impact">
                              עוד אחד: {formatILS(marginalCost(variant.priceAgorot as number, tipBp))} כולל טיפ
                            </span>
                          ) : null}
                        </span>
                        <span className="menu-item__price">
                          {variant.priceAgorot === null ? '—' : formatILS(variant.priceAgorot)}
                        </span>
                        <QtyStepper
                          qty={qty}
                          label={label || 'המנה'}
                          onAdd={() => addOne(item.id, variant.id)}
                          onRemove={() => removeOne(item.id, variant.id)}
                        />
                      </div>
                    )
                  })}
                </article>
              )
            })}
          </div>
        </section>
      ))}

      <button
        type="button"
        className="btn btn--block"
        style={{ marginBlockStart: 16 }}
        onClick={unconfirmMenu}
      >
        חזרה לעריכת התפריט
      </button>
    </>
  )
}
