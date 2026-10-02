import { create } from 'zustand'
import {
  FEE_RATE,
  INITIAL_BALANCE,
  MAX_LEVERAGE,
  liquidationPrice,
  unrealizedPnl,
  validateBrackets,
} from '../lib/risk'
import type {
  BookSnapshot,
  ClosedTrade,
  CloseReason,
  OrderRecord,
  OrderRequest,
  PlaceOrderResult,
  Position,
  Side,
  Tick,
} from '../types'

const RECORD_LIMIT = 500
const INITIAL_PRICE = 65_000

interface Ledger {
  balance: number
  positions: Position[]
  orders: OrderRecord[]
  history: ClosedTrade[]
}

export interface TradeState extends Ledger {
  symbol: string
  lastPrice: number
  /** Direction of the most recent price change, for colouring. */
  priceDirection: 1 | -1 | 0
  book: BookSnapshot
  applyTick: (tick: Tick) => void
  applyBook: (book: BookSnapshot) => void
  placeOrder: (request: OrderRequest) => PlaceOrderResult
  cancelOrder: (orderId: string) => void
  closePosition: (positionId: string, reason?: CloseReason) => void
  closeAllPositions: () => void
}

let sequence = 0
const nextId = (prefix: string): string => `${prefix}-${++sequence}`

const ledgerOf = (s: TradeState): Ledger => ({
  balance: s.balance,
  positions: s.positions,
  orders: s.orders,
  history: s.history,
})

interface OpenParams {
  orderId: string
  side: Side
  size: number
  price: number
  leverage: number
  takeProfit: number | null
  stopLoss: number | null
}

/** Opens an isolated-margin position, or returns null when the balance can't cover it. */
function openPosition(ledger: Ledger, p: OpenParams, now: number): Ledger | null {
  const notional = p.size * p.price
  const margin = notional / p.leverage
  const fee = notional * FEE_RATE
  if (margin + fee > ledger.balance + 1e-9) return null

  const position: Position = {
    id: nextId('pos'),
    orderId: p.orderId,
    side: p.side,
    size: p.size,
    entryPrice: p.price,
    leverage: p.leverage,
    margin,
    openFee: fee,
    liquidationPrice: liquidationPrice(p.side, p.price, p.leverage),
    takeProfit: p.takeProfit,
    stopLoss: p.stopLoss,
    openedAt: now,
  }
  return {
    ...ledger,
    balance: ledger.balance - margin - fee,
    positions: [...ledger.positions, position],
  }
}

function closePositionAt(
  ledger: Ledger,
  positionId: string,
  exitPrice: number,
  reason: CloseReason,
  now: number,
): Ledger {
  const position = ledger.positions.find((p) => p.id === positionId)
  if (!position) return ledger

  const gross = unrealizedPnl(position, exitPrice)
  const closeFee = position.size * exitPrice * FEE_RATE
  // Isolated margin: a position can lose at most what was posted for it.
  const returned = Math.max(0, position.margin + gross - closeFee)
  const trade: ClosedTrade = {
    id: nextId('trd'),
    side: position.side,
    size: position.size,
    entryPrice: position.entryPrice,
    exitPrice,
    leverage: position.leverage,
    realizedPnl: returned - position.margin - position.openFee,
    fees: position.openFee + closeFee,
    reason,
    openedAt: position.openedAt,
    closedAt: now,
  }
  return {
    ...ledger,
    balance: ledger.balance + returned,
    positions: ledger.positions.filter((p) => p.id !== positionId),
    history: [trade, ...ledger.history].slice(0, RECORD_LIMIT),
  }
}

function updateOrder(
  ledger: Ledger,
  orderId: string,
  patch: Partial<OrderRecord>,
): Ledger {
  return {
    ...ledger,
    orders: ledger.orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
  }
}

/** Fills triggered limit orders, then closes positions that hit TP, SL or liquidation. */
function processPrice(ledger: Ledger, price: number, now: number): Ledger {
  let next = ledger

  for (const order of ledger.orders) {
    if (order.status !== 'pending') continue
    const triggered = order.side === 'long' ? price <= order.price : price >= order.price
    if (!triggered) continue
    const opened = openPosition(
      next,
      {
        orderId: order.id,
        side: order.side,
        size: order.size,
        price: order.price,
        leverage: order.leverage,
        takeProfit: order.takeProfit,
        stopLoss: order.stopLoss,
      },
      now,
    )
    next = opened
      ? updateOrder(opened, order.id, { status: 'filled', fillPrice: order.price, closedAt: now })
      : updateOrder(next, order.id, { status: 'cancelled', closedAt: now })
  }

  for (const p of next.positions) {
    let exit: { price: number; reason: CloseReason } | null = null
    if (p.side === 'long') {
      if (price <= p.liquidationPrice) exit = { price: p.liquidationPrice, reason: 'liquidated' }
      else if (p.stopLoss !== null && price <= p.stopLoss) exit = { price: p.stopLoss, reason: 'stop-loss' }
      else if (p.takeProfit !== null && price >= p.takeProfit) exit = { price: p.takeProfit, reason: 'take-profit' }
    } else {
      if (price >= p.liquidationPrice) exit = { price: p.liquidationPrice, reason: 'liquidated' }
      else if (p.stopLoss !== null && price >= p.stopLoss) exit = { price: p.stopLoss, reason: 'stop-loss' }
      else if (p.takeProfit !== null && price <= p.takeProfit) exit = { price: p.takeProfit, reason: 'take-profit' }
    }
    if (exit) next = closePositionAt(next, p.id, exit.price, exit.reason, now)
  }

  return next
}

const fail = (error: string): PlaceOrderResult => ({ ok: false, error })
const isValidTarget = (n: number | null): boolean => n === null || (Number.isFinite(n) && n > 0)

export const useTradeStore = create<TradeState>()((set, get) => ({
  symbol: 'BTC/USDT',
  lastPrice: INITIAL_PRICE,
  priceDirection: 0,
  book: { bids: [], asks: [] },
  balance: INITIAL_BALANCE,
  positions: [],
  orders: [],
  history: [],

  applyTick: (tick) =>
    set((s) => {
      const ledger = ledgerOf(s)
      const next = processPrice(ledger, tick.price, tick.time)
      const priceDirection = tick.price > s.lastPrice ? 1 : tick.price < s.lastPrice ? -1 : s.priceDirection
      return next === ledger
        ? { lastPrice: tick.price, priceDirection }
        : { ...next, lastPrice: tick.price, priceDirection }
    }),

  applyBook: (book) => set({ book }),

  placeOrder: (req) => {
    const s = get()
    if (!(req.size > 0)) return fail('Enter a valid size')
    if (!(req.leverage >= 1 && req.leverage <= MAX_LEVERAGE)) return fail('Leverage must be between 1x and 100x')
    if (!isValidTarget(req.takeProfit)) return fail('Invalid take-profit price')
    if (!isValidTarget(req.stopLoss)) return fail('Invalid stop-loss price')

    const reference = req.type === 'limit' ? req.limitPrice : s.lastPrice
    if (reference === null || !(reference > 0)) return fail('Enter a valid limit price')

    const bracketError = validateBrackets(req.side, reference, req.takeProfit, req.stopLoss, req.leverage)
    if (bracketError) return fail(bracketError)

    const now = Date.now()
    const orderId = nextId('ord')
    const record: OrderRecord = {
      id: orderId,
      type: req.type,
      side: req.side,
      size: req.size,
      price: reference,
      leverage: req.leverage,
      takeProfit: req.takeProfit,
      stopLoss: req.stopLoss,
      status: 'pending',
      fillPrice: null,
      createdAt: now,
      closedAt: null,
    }

    // Market orders, and limit orders that already cross the market, fill immediately.
    const marketable =
      req.type === 'market' || (req.side === 'long' ? reference >= s.lastPrice : reference <= s.lastPrice)

    if (marketable) {
      const fillPrice = s.lastPrice
      const opened = openPosition(
        ledgerOf(s),
        { ...req, orderId, price: fillPrice },
        now,
      )
      if (!opened) return fail('Insufficient margin')
      const filled: OrderRecord = { ...record, status: 'filled', fillPrice, closedAt: now }
      set({ ...opened, orders: [filled, ...opened.orders].slice(0, RECORD_LIMIT) })
      return { ok: true, orderId }
    }

    const needed = (reference * req.size) / req.leverage + reference * req.size * FEE_RATE
    if (needed > s.balance + 1e-9) return fail('Insufficient margin')
    set({ orders: [record, ...s.orders].slice(0, RECORD_LIMIT) })
    return { ok: true, orderId }
  },

  cancelOrder: (orderId) =>
    set((s) => {
      const target = s.orders.find((o) => o.id === orderId)
      if (!target || target.status !== 'pending') return {}
      return updateOrder(ledgerOf(s), orderId, { status: 'cancelled', closedAt: Date.now() })
    }),

  closePosition: (positionId, reason = 'manual') =>
    set((s) => closePositionAt(ledgerOf(s), positionId, s.lastPrice, reason, Date.now())),

  closeAllPositions: () =>
    set((s) => {
      const now = Date.now()
      let ledger = ledgerOf(s)
      for (const p of s.positions) ledger = closePositionAt(ledger, p.id, s.lastPrice, 'manual', now)
      return ledger
    }),
}))
