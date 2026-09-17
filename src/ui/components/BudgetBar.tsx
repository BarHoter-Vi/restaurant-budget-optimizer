import type { BudgetSummary } from '../../domain/budget'
import { percentUsed } from '../../domain/budget'
import { formatILS } from '../../domain/money'

const STATUS_TEXT = {
  comfortable: { icon: '✓', label: 'בתוך התקציב', tone: 'comfortable' },
  close: { icon: '!', label: 'מתקרבים לתקציב', tone: 'close' },
  over: { icon: '✕', label: 'חריגה מהתקציב', tone: 'over' },
} as const

interface BudgetBarProps {
  summary: BudgetSummary
  /** Rendered below the figures — e.g. the "suggest dishes" button. */
  children?: React.ReactNode
}

/**
 * Always-visible order summary. Status is carried by an icon and by words as
 * well as colour, so it still reads correctly without colour perception.
 */
export function BudgetBar({ summary, children }: BudgetBarProps) {
  const status = STATUS_TEXT[summary.status]
  const used = percentUsed(summary)
  const meterWidth = Math.max(0, Math.min(100, used))

  return (
    <section className="budget-bar" aria-label="סיכום תקציב">
      <p className={`budget-bar__status budget-bar__status--${status.tone}`}>
        <span className="budget-bar__icon" aria-hidden="true">
          {status.icon}
        </span>
        <span>{status.label}</span>
        {summary.status === 'over' ? (
          <span>· חריגה של {formatILS(summary.overspendAgorot)}</span>
        ) : null}
      </p>

      <div
        className="meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meterWidth}
        aria-label="אחוז מהתקציב שנוצל"
      >
        <div
          className={`meter__fill${summary.status === 'over' ? ' meter__fill--over' : summary.status === 'close' ? ' meter__fill--close' : ''}`}
          style={{ inlineSize: `${meterWidth}%` }}
        />
      </div>

      <dl className="budget-grid">
        <dt>אוכל</dt>
        <dd>{formatILS(summary.foodSubtotalAgorot)}</dd>
        <dt>טיפ משוער</dt>
        <dd>{formatILS(summary.tipAgorot)}</dd>
        <dt className="is-total">סה״כ משוער</dt>
        <dd className="is-total">{formatILS(summary.estimatedTotalAgorot)}</dd>
        <dt className="is-total">נותר</dt>
        <dd
          className={`is-total${summary.remainingAgorot < 0 ? ' is-over' : ''}`}
          aria-live="polite"
        >
          {formatILS(summary.remainingAgorot)}
        </dd>
      </dl>
      <p className="faint">
        נוצלו {used}% מתוך {formatILS(summary.totalBudgetAgorot)}
      </p>
      {children}
    </section>
  )
}
