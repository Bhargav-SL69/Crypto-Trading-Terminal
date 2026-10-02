export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d'

export const TIMEFRAMES: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '1d']

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86_400,
}

/** `time` is a UTC unix timestamp in seconds (the lightweight-charts convention). */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

/** `time` is a unix timestamp in milliseconds. */
export interface Tick {
  time: number
  price: number
  size: number
  side: 'buy' | 'sell'
}

export interface BookLevel {
  price: number
  size: number
}

/** Both sides are sorted best-first: bids descending, asks ascending. */
export interface BookSnapshot {
  bids: BookLevel[]
  asks: BookLevel[]
}

export type Side = 'long' | 'short'
export type OrderType = 'market' | 'limit'
export type OrderStatus = 'pending' | 'filled' | 'cancelled'
export type CloseReason = 'manual' | 'take-profit' | 'stop-loss' | 'liquidated'

export interface OrderRequest {
  type: OrderType
  side: Side
  /** Quantity in base asset (BTC). */
  size: number
  /** Required for limit orders. */
  limitPrice: number | null
  leverage: number
  takeProfit: number | null
  stopLoss: number | null
}

export interface OrderRecord {
  id: string
  type: OrderType
  side: Side
  size: number
  /** Limit price, or the reference (market) price at submission. */
  price: number
  leverage: number
  takeProfit: number | null
  stopLoss: number | null
  status: OrderStatus
  fillPrice: number | null
  createdAt: number
  closedAt: number | null
}

export interface Position {
  id: string
  orderId: string
  side: Side
  size: number
  entryPrice: number
  leverage: number
  /** Isolated margin locked for this position, in USDT. */
  margin: number
  openFee: number
  liquidationPrice: number
  takeProfit: number | null
  stopLoss: number | null
  openedAt: number
}

export interface ClosedTrade {
  id: string
  side: Side
  size: number
  entryPrice: number
  exitPrice: number
  leverage: number
  /** Net of all fees. */
  realizedPnl: number
  fees: number
  reason: CloseReason
  openedAt: number
  closedAt: number
}

export type PlaceOrderResult = { ok: true; orderId: string } | { ok: false; error: string }
