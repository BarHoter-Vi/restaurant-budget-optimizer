import type { Step } from '../../persistence/session'

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'budget', label: 'תקציב' },
  { id: 'upload', label: 'תפריט' },
  { id: 'review', label: 'בדיקה' },
  { id: 'select', label: 'בחירה' },
]

interface StepNavProps {
  current: Step
  onNavigate: (step: Step) => void
  /** Steps the user may jump to; the rest are shown disabled. */
  enabled: Step[]
}

export function StepNav({ current, onNavigate, enabled }: StepNavProps) {
  return (
    <nav className="steps" aria-label="שלבים">
      {STEPS.map((step, index) => {
        const isEnabled = enabled.includes(step.id)
        return (
          <button
            key={step.id}
            type="button"
            className="step-chip"
            aria-current={current === step.id ? 'step' : undefined}
            disabled={!isEnabled}
            onClick={() => onNavigate(step.id)}
          >
            <span className="step-chip__index" aria-hidden="true">
              {index + 1}
            </span>
            {step.label}
          </button>
        )
      })}
    </nav>
  )
}
