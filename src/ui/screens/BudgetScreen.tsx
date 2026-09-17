import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../state/store'
import { maxFoodSubtotal, totalBudget } from '../../domain/budget'
import { bpToPercent, formatILS, parseMoney, percentToBp } from '../../domain/money'
import { NumberField } from '../components/NumberField'

const TIP_PRESETS = [0, 10, 12, 15]

export function BudgetScreen() {
  const budget = useAppStore((s) => s.budget)
  const setBudget = useAppStore((s) => s.setBudget)
  const goTo = useAppStore((s) => s.goTo)

  const [diners, setDiners] = useState(String(budget.diners))
  const [perPerson, setPerPerson] = useState(
    (budget.perPersonAgorot / 100).toString().replace(/\.00$/, ''),
  )
  const [tip, setTip] = useState(String(bpToPercent(budget.tipBp)))

  const dinersValue = Number.parseInt(diners, 10)
  const dinersError =
    diners.trim() === ''
      ? 'נא להזין מספר סועדים'
      : !Number.isInteger(dinersValue) || dinersValue < 1
        ? 'מספר הסועדים חייב להיות מספר שלם, 1 ומעלה'
        : dinersValue > 100
          ? 'עד 100 סועדים'
          : null

  const perPersonAgorot = parseMoney(perPerson)
  const perPersonError =
    perPerson.trim() === ''
      ? 'נא להזין תקציב לאדם'
      : perPersonAgorot === null
        ? 'סכום לא תקין'
        : perPersonAgorot <= 0
          ? 'התקציב חייב להיות גדול מאפס'
          : null

  const tipValue = Number.parseFloat(tip.replace(',', '.'))
  const tipError =
    tip.trim() === ''
      ? 'נא להזין אחוז טיפ (אפשר 0)'
      : !Number.isFinite(tipValue) || tipValue < 0
        ? 'אחוז לא תקין'
        : tipValue > 100
          ? 'עד 100%'
          : null

  const valid = !dinersError && !perPersonError && !tipError

  // Commit valid values to the store on every keystroke so every other screen —
  // and the persisted session — is always in step with what is on screen.
  useEffect(() => {
    if (!valid || perPersonAgorot === null) return
    const tipBp = percentToBp(tipValue)
    if (
      budget.diners !== dinersValue ||
      budget.perPersonAgorot !== perPersonAgorot ||
      budget.tipBp !== tipBp
    ) {
      setBudget({ diners: dinersValue, perPersonAgorot, tipBp })
    }
  }, [valid, dinersValue, perPersonAgorot, tipValue, budget, setBudget])

  const preview = useMemo(() => {
    if (!valid || perPersonAgorot === null) return null
    const tipBp = percentToBp(tipValue)
    const total = totalBudget({ diners: dinersValue, perPersonAgorot, tipBp })
    return { total, maxFood: maxFoodSubtotal(total, tipBp) }
  }, [valid, dinersValue, perPersonAgorot, tipValue])

  return (
    <>
      <div className="card">
        <div className="card__head">
          <h2>התקציב שלכם</h2>
        </div>
        <p className="muted" style={{ marginBlockEnd: 14 }}>
          התקציב הכולל כולל את הטיפ. נחשב עבורכם כמה אפשר להוציא על האוכל עצמו.
        </p>

        <NumberField
          label="מספר סועדים"
          value={diners}
          onChange={setDiners}
          inputMode="numeric"
          error={dinersError}
          min={1}
          autoFocus
        />

        <NumberField
          label="תקציב לאדם"
          value={perPerson}
          onChange={setPerPerson}
          inputMode="decimal"
          suffix="₪"
          hint="אפשר להזין גם סכום עם אגורות, למשל 137.50"
          error={perPersonError}
        />

        <NumberField
          label="אחוז טיפ"
          value={tip}
          onChange={setTip}
          inputMode="decimal"
          suffix="%"
          hint="0% תקין לחלוטין אם הטיפ כבר כלול"
          error={tipError}
        />

        <div className="chips" role="group" aria-label="אחוזי טיפ נפוצים">
          {TIP_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip"
              aria-pressed={tipValue === preset}
              onClick={() => setTip(String(preset))}
            >
              {preset}%
            </button>
          ))}
        </div>
      </div>

      {preview ? (
        <div className="card" aria-live="polite">
          <div className="card__head">
            <h2>מה זה אומר</h2>
          </div>
          <dl className="budget-grid">
            <dt>תקציב כולל</dt>
            <dd className="is-total">{formatILS(preview.total)}</dd>
            <dt>מקסימום לאוכל (לפני טיפ)</dt>
            <dd className="is-total">{formatILS(preview.maxFood)}</dd>
          </dl>
          <p className="faint" style={{ marginBlockStart: 8 }}>
            אם תזמינו אוכל עד {formatILS(preview.maxFood)}, הטיפ עדיין ייכנס לתקציב.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!valid}
        onClick={() => goTo('upload')}
      >
        המשך לתפריט
      </button>
    </>
  )
}
