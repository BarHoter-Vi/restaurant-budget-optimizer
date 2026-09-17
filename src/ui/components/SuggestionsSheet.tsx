import { useEffect, useMemo, useRef } from 'react'
import { selectSuggestions, useAppStore } from '../../state/store'
import { describeSuggestion } from '../../domain/recommend'
import { formatILS } from '../../domain/money'

interface SuggestionsSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * Suggestions for using what is left of the budget. The engine already refuses
 * to emit anything that would cross the budget after tip, so everything shown
 * here is safe to add with one tap.
 */
export function SuggestionsSheet({ open, onClose }: SuggestionsSheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const budget = useAppStore((s) => s.budget)
  const menu = useAppStore((s) => s.menu)
  const selections = useAppStore((s) => s.selections)
  const setQty = useAppStore((s) => s.setQty)

  const suggestions = useMemo(
    () => (open ? selectSuggestions({ budget, menu, selections }) : []),
    [open, budget, menu, selections],
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const applySuggestion = (index: number): void => {
    const suggestion = suggestions[index]
    if (!suggestion) return
    for (const line of suggestion.lines) {
      const current = selections.find(
        (s) => s.itemId === line.itemId && s.variantId === line.variantId,
      )
      setQty(line.itemId, line.variantId, (current?.qty ?? 0) + line.qty)
    }
    onClose()
  }

  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-labelledby="suggestions-title"
    >
      <div className="modal__body">
        <h2 id="suggestions-title">ניצול מיטבי של התקציב</h2>

        {suggestions.length === 0 ? (
          <p className="muted">
            אין כרגע הצעה שנכנסת לתקציב שנותר. אפשר להסיר פריט, להעלות את התקציב, או להמשיך כמו
            שזה.
          </p>
        ) : (
          <>
            <p className="muted">
              כל ההצעות נבדקו מול התקציב כולל הטיפ — אף אחת מהן לא תחרוג ממנו.
            </p>
            {suggestions.map((suggestion, index) => (
              <div className="suggestion" key={suggestion.id}>
                <p className="suggestion__title">{describeSuggestion(suggestion)}</p>
                <p className="faint">
                  תוספת של {formatILS(suggestion.addedSubtotalAgorot)} לאוכל
                </p>
                <ul className="suggestion__reasons">
                  {suggestion.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={() => applySuggestion(index)}
                >
                  הוסף להזמנה
                </button>
              </div>
            ))}
          </>
        )}

        <button type="button" className="btn btn--block" onClick={onClose}>
          סגירה
        </button>
      </div>
    </dialog>
  )
}
