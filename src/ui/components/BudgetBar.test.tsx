import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetBar } from './BudgetBar'
import { computeBudget, type BudgetInput } from '../../domain/budget'

const budget: BudgetInput = { diners: 4, perPersonAgorot: 15_000, tipBp: 1_200 }

const renderBar = (subtotal: number) =>
  render(<BudgetBar summary={computeBudget(budget, [{ priceAgorot: subtotal, qty: 1 }])} />)

describe('BudgetBar', () => {
  it('shows food, tip, total and remaining', () => {
    renderBar(10_000)
    expect(screen.getByText('₪100.00')).toBeInTheDocument() // food
    expect(screen.getByText('₪12.00')).toBeInTheDocument() // tip
    expect(screen.getByText('₪112.00')).toBeInTheDocument() // total
    expect(screen.getByText('₪488.00')).toBeInTheDocument() // remaining
  })

  it('states the status in words, not only in colour', () => {
    renderBar(10_000)
    expect(screen.getByText('בתוך התקציב')).toBeInTheDocument()
  })

  it('warns when approaching the budget', () => {
    renderBar(52_000)
    expect(screen.getByText('מתקרבים לתקציב')).toBeInTheDocument()
  })

  it('warns prominently and names the overspend when over budget', () => {
    renderBar(60_000)
    expect(screen.getByText('חריגה מהתקציב')).toBeInTheDocument()
    expect(screen.getByText(/חריגה של ₪72\.00/)).toBeInTheDocument()
  })

  it('exposes the usage meter to assistive technology', () => {
    renderBar(30_000)
    const meter = screen.getByRole('progressbar', { name: 'אחוז מהתקציב שנוצל' })
    expect(meter).toHaveAttribute('aria-valuenow', '56')
  })
})
