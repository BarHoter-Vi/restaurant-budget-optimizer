import { useId } from 'react'

interface NumberFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string | null
  suffix?: string
  inputMode?: 'numeric' | 'decimal'
  min?: number
  max?: number
  step?: number
  autoFocus?: boolean
  disabled?: boolean
}

/** Text-based numeric input: on mobile a real `type=number` fights the user on
 *  decimals and leading zeros, so we keep the value as a string and validate. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  suffix,
  inputMode = 'decimal',
  min,
  max,
  step,
  autoFocus,
  disabled,
}: NumberFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <span className="input-row">
        <input
          id={id}
          className={`input${error ? ' input--invalid' : ''}`}
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          min={min}
          max={max}
          step={step}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
        />
        {suffix ? <span className="input-suffix" aria-hidden="true">{suffix}</span> : null}
      </span>
      {hint ? <span className="field__hint" id={hintId}>{hint}</span> : null}
      {error ? <span className="field__error" id={errorId} role="alert">{error}</span> : null}
    </label>
  )
}
