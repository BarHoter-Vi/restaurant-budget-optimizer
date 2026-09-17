interface QtyStepperProps {
  qty: number
  onAdd: () => void
  onRemove: () => void
  label: string
  max?: number
  disabled?: boolean
}

export function QtyStepper({ qty, onAdd, onRemove, label, max = 99, disabled }: QtyStepperProps) {
  return (
    <span className="qty">
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled || qty <= 0}
        aria-label={`הסרת יחידה אחת מ${label}`}
      >
        −
      </button>
      <span className="qty__value" aria-live="polite" aria-label={`כמות של ${label}`}>
        {qty}
      </span>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || qty >= max}
        aria-label={`הוספת יחידה אחת של ${label}`}
      >
        +
      </button>
    </span>
  )
}
