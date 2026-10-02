import { beforeEach, describe, expect, it } from 'vitest'
import { FEE_RATE, INITIAL_BALANCE } from '../lib/risk'
import type { OrderRequest, Tick } from '../types'
import { useTradeStore } from './useTradeStore'

const tick = (price: number): Tick => ({ time: Date.now(), price, size: 0.01, side: 'buy' })

const order = (overrides: Partial<OrderRequest> = {}): OrderRequest => ({
  type: 'market',
  side: 'long',
  size: 1,
  limitPrice: null,
  leverage: 10,
  takeProfit: null,
  stopLoss: null,
  ...overrides,
})

const state = () => useTradeStore.getState()

beforeEach(() => {
  useTradeStore.setState({
    lastPrice: 60_000,
    balance: INITIAL_BALANCE,
    positions: [],
    orders: [],
    history: [],
  })
})

describe('placeOrder', () => {
  it('opens a long at the last price and locks margin plus fee', () => {
    expect(state().placeOrder(order()).ok).toBe(true)

    const [position] = state().positions
    expect(position?.entryPrice).toBe(60_000)
    expect(position?.margin).toBeCloseTo(6_000)
    expect(position?.liquidationPrice).toBeCloseTo(60_000 * (1 - 0.1 + 0.005))
    expect(state().balance).toBeCloseTo(INITIAL_BALANCE - 6_000 - 60_000 * FEE_RATE)
  })

  it('rejects orders the balance cannot margin', () => {
    const result = state().placeOrder(order({ size: 100 }))
    expect(result).toEqual({ ok: false, error: 'Insufficient margin' })
    expect(state().positions).toHaveLength(0)
  })

  it('rejects incoherent take-profit and stop-loss targets', () => {
    expect(state().placeOrder(order({ takeProfit: 59_000 })).ok).toBe(false)
    expect(state().placeOrder(order({ stopLoss: 61_000 })).ok).toBe(false)
    expect(state().placeOrder(order({ side: 'short', takeProfit: 61_000 })).ok).toBe(false)
    expect(state().placeOrder(order({ stopLoss: 1 })).ok).toBe(false) // below liquidation
  })

  it('rejects non-numeric input', () => {
    expect(state().placeOrder(order({ size: Number.NaN })).ok).toBe(false)
    expect(state().placeOrder(order({ takeProfit: Number.NaN })).ok).toBe(false)
  })
})

describe('limit orders', () => {
  it('rests until price crosses, then fills at the limit price', () => {
    state().placeOrder(order({ type: 'limit', limitPrice: 59_000 }))
    expect(state().orders[0]?.status).toBe('pending')
    expect(state().positions).toHaveLength(0)

    state().applyTick(tick(59_500))
    expect(state().positions).toHaveLength(0)

    state().applyTick(tick(58_900))
    expect(state().orders[0]?.status).toBe('filled')
    expect(state().positions[0]?.entryPrice).toBe(59_000)
  })

  it('fills a marketable limit immediately at the market price', () => {
    state().placeOrder(order({ type: 'limit', limitPrice: 61_000 }))
    expect(state().positions[0]?.entryPrice).toBe(60_000)
  })

  it('can be cancelled while pending', () => {
    state().placeOrder(order({ type: 'limit', limitPrice: 59_000 }))
    const id = state().orders[0]?.id ?? ''
    state().cancelOrder(id)
    expect(state().orders[0]?.status).toBe('cancelled')
  })
})

describe('position lifecycle', () => {
  it('closes at take-profit with net PnL after fees', () => {
    state().placeOrder(order({ leverage: 10, takeProfit: 61_000 }))
    state().applyTick(tick(61_500))

    expect(state().positions).toHaveLength(0)
    const [trade] = state().history
    expect(trade?.reason).toBe('take-profit')
    expect(trade?.exitPrice).toBe(61_000)
    const fees = 60_000 * FEE_RATE + 61_000 * FEE_RATE
    expect(trade?.realizedPnl).toBeCloseTo(1_000 - fees)
    expect(state().balance).toBeCloseTo(INITIAL_BALANCE + 1_000 - fees)
  })

  it('closes shorts at stop-loss', () => {
    state().placeOrder(order({ side: 'short', stopLoss: 61_000 }))
    state().applyTick(tick(61_200))
    expect(state().history[0]?.reason).toBe('stop-loss')
    expect(state().history[0]?.realizedPnl ?? 0).toBeLessThan(0)
  })

  it('liquidates and never loses more than the posted margin', () => {
    state().placeOrder(order({ leverage: 100 }))
    state().applyTick(tick(59_000))

    const [trade] = state().history
    expect(trade?.reason).toBe('liquidated')
    const marginAndFee = 600 + 60_000 * FEE_RATE
    expect(trade?.realizedPnl ?? 0).toBeGreaterThanOrEqual(-marginAndFee - 1e-6)
    expect(state().balance).toBeLessThan(INITIAL_BALANCE)
    expect(state().balance).toBeGreaterThan(INITIAL_BALANCE - marginAndFee - 1e-6)
  })

  it('closes manually at the last price', () => {
    state().placeOrder(order())
    const id = state().positions[0]?.id ?? ''
    state().applyTick(tick(60_500))
    state().closePosition(id)
    expect(state().positions).toHaveLength(0)
    expect(state().history[0]?.reason).toBe('manual')
    expect(state().history[0]?.realizedPnl ?? 0).toBeGreaterThan(0)
  })

  it('liquidates every position at once', () => {
    state().placeOrder(order())
    state().placeOrder(order({ side: 'short' }))
    state().closeAllPositions()
    expect(state().positions).toHaveLength(0)
    expect(state().history).toHaveLength(2)
  })
})
