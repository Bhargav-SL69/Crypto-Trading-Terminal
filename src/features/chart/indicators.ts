import type { Candle } from '../../types'

/** SMA of the `period` candles ending at index `i`, or undefined while warming up. */
export function smaAt(candles: readonly Candle[], i: number, period: number): number | undefined {
  if (i + 1 < period) return undefined
  let sum = 0
  for (let k = i - period + 1; k <= i; k++) sum += candles[k]?.close ?? 0
  return sum / period
}

export function computeSMA(candles: readonly Candle[], period: number): (number | undefined)[] {
  return candles.map((_, i) => smaAt(candles, i, period))
}

/** One EMA step; `prev` is the EMA of the previous candle. */
export function emaNext(prev: number, close: number, period: number): number {
  const k = 2 / (period + 1)
  return close * k + prev * (1 - k)
}

/** EMA seeded with the SMA of the first `period` closes. */
export function computeEMA(candles: readonly Candle[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = []
  let prev: number | undefined
  candles.forEach((c, i) => {
    if (i + 1 < period) {
      out.push(undefined)
    } else if (prev === undefined) {
      prev = smaAt(candles, i, period)
      out.push(prev)
    } else {
      prev = emaNext(prev, c.close, period)
      out.push(prev)
    }
  })
  return out
}
