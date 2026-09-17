import { describe, expect, it } from 'vitest'
import {
  bpToPercent,
  formatAmount,
  formatILS,
  isValidAgorot,
  parseMoney,
  percentToBp,
  roundHalfAwayFromZero,
} from './money'

describe('parseMoney', () => {
  it('parses plain integers and decimals', () => {
    expect(parseMoney('12')).toBe(1200)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('12.50')).toBe(1250)
    expect(parseMoney('0.99')).toBe(99)
  })

  it('accepts a comma as the decimal separator', () => {
    expect(parseMoney('12,50')).toBe(1250)
  })

  it('strips Hebrew and symbol currency markers', () => {
    expect(parseMoney('₪45')).toBe(4500)
    expect(parseMoney('45 ₪')).toBe(4500)
    expect(parseMoney('45 ש"ח')).toBe(4500)
    expect(parseMoney('45 שח')).toBe(4500)
    expect(parseMoney('45 NIS')).toBe(4500)
  })

  it('handles thousands separators', () => {
    expect(parseMoney('1,234.50')).toBe(123_450)
    expect(parseMoney('1.234,50')).toBe(123_450)
  })

  it('rejects text that is not a single amount', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('12-14')).toBeNull()
    expect(parseMoney('12 14')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(parseMoney(null)).toBeNull()
  })

  it('rounds sub-agora input rather than carrying float noise', () => {
    expect(parseMoney('12.005')).toBe(1201)
    expect(parseMoney(0.1 + 0.2)).toBe(30)
  })
})

describe('formatting', () => {
  it('always shows two decimal places', () => {
    expect(formatAmount(1200)).toBe('12.00')
    expect(formatAmount(1250)).toBe('12.50')
    expect(formatAmount(5)).toBe('0.05')
  })

  it('rounds only at display time, half away from zero', () => {
    expect(formatAmount(1200.5)).toBe('12.01')
    expect(formatAmount(1200.4)).toBe('12.00')
  })

  it('prefixes the shekel sign and keeps the minus outside it', () => {
    expect(formatILS(1250)).toBe('₪12.50')
    expect(formatILS(-1250)).toBe('-₪12.50')
    expect(formatILS(123_450)).toBe('₪1,234.50')
  })
})

describe('helpers', () => {
  it('converts percent to basis points, decimals included', () => {
    expect(percentToBp(12)).toBe(1200)
    expect(percentToBp(12.5)).toBe(1250)
    expect(percentToBp(0)).toBe(0)
    expect(bpToPercent(1250)).toBe(12.5)
  })

  it('rounds half away from zero in both directions', () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1)
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1)
    expect(roundHalfAwayFromZero(2.4)).toBe(2)
  })

  it('validates agorot as non-negative integers', () => {
    expect(isValidAgorot(100)).toBe(true)
    expect(isValidAgorot(100.5)).toBe(false)
    expect(isValidAgorot(-1)).toBe(false)
    expect(isValidAgorot(Number.NaN)).toBe(false)
  })
})
