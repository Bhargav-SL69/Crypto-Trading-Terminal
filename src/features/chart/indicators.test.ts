import { describe, expect, it } from 'vitest'
import type { Candle } from '../../types'
import { computeEMA, computeSMA, emaNext } from './indicators'

const candles: Candle[] = [10, 11, 12, 13, 14, 15].map((close, i) => ({
  time: i * 60,
  open: close,
  high: close,
  low: close,
  close,
}))

describe('indicators', () => {
  it('computes an SMA with a warm-up gap', () => {
    expect(computeSMA(candles, 3)).toEqual([undefined, undefined, 11, 12, 13, 14])
  })

  it('seeds the EMA with the SMA and then recurses', () => {
    const ema = computeEMA(candles, 3)
    expect(ema.slice(0, 2)).toEqual([undefined, undefined])
    expect(ema[2]).toBe(11)
    expect(ema[3]).toBeCloseTo(emaNext(11, 13, 3))
    expect(ema[3]).toBeCloseTo(12)
  })

  it('matches incremental EMA updates to a full recompute', () => {
    const full = computeEMA(candles, 3)
    const prev = full[4]
    expect(prev).toBeDefined()
    expect(emaNext(prev ?? 0, 15, 3)).toBeCloseTo(full[5] ?? Number.NaN)
  })
})
