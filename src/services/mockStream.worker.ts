import { TIMEFRAME_SECONDS } from '../types'
import type { BookLevel, Candle, Tick, Timeframe } from '../types'
import type { WorkerIn, WorkerOut } from './streamProtocol'

interface WorkerScope {
  postMessage(message: WorkerOut): void
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null
}
const ctx = self as unknown as WorkerScope

const BASE_PRICE = 65_000
const PRICE_STEP = 0.5
const LEVELS = 300
const TICK_MS = 50
const BOOK_MS = 100
/** Per-tick log-return volatility (~0.18% per minute at 20 ticks/s). */
const TICK_VOL = 0.00005
/** Per-candle volatility for a 1m candle; scaled by sqrt(time) for larger timeframes. */
const HIST_VOL = 0.0018
const HIST_CANDLES = 400

let price = BASE_PRICE

const round2 = (n: number): number => Math.round(n * 100) / 100
const round3 = (n: number): number => Math.round(n * 1000) / 1000

function gauss(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function emitTick(): void {
  const previous = price
  // Weak mean reversion keeps the random walk from wandering off over long sessions.
  price *= Math.exp(gauss() * TICK_VOL + Math.log(BASE_PRICE / price) * 0.0002)
  const tick: Tick = {
    time: Date.now(),
    price: round2(price),
    size: round3(0.001 + Math.abs(gauss()) * 0.05),
    side: price >= previous ? 'buy' : 'sell',
  }
  ctx.postMessage({ type: 'tick', tick })
}

/** Deeper levels carry more liquidity. */
const baseAt = (i: number): number => 0.4 + i * 0.012
const randomSizes = (): number[] =>
  Array.from({ length: LEVELS }, (_, i) => baseAt(i) * (0.3 + Math.random() * 1.4))
const evolve = (sizes: number[]): number[] =>
  sizes.map((size, i) => {
    const target = baseAt(i) * (0.3 + Math.random() * 1.4)
    const next = size * 0.9 + target * 0.1
    return Math.random() < 0.003 ? next * 3 : next // occasional liquidity wall
  })

let bidSizes = randomSizes()
let askSizes = randomSizes()
let spreadTicks = 1

function emitBook(): void {
  bidSizes = evolve(bidSizes)
  askSizes = evolve(askSizes)
  if (Math.random() < 0.15) spreadTicks = 1 + Math.floor(Math.random() * 3)

  const bestBid = Math.floor(price / PRICE_STEP) * PRICE_STEP
  const bestAsk = bestBid + spreadTicks * PRICE_STEP
  const bids: BookLevel[] = bidSizes.map((size, i) => ({
    price: bestBid - i * PRICE_STEP,
    size: round3(size),
  }))
  const asks: BookLevel[] = askSizes.map((size, i) => ({
    price: bestAsk + i * PRICE_STEP,
    size: round3(size),
  }))
  ctx.postMessage({ type: 'book', book: { bids, asks } })
}

/**
 * Walks backwards from the current price with an Ornstein-Uhlenbeck process, so history
 * always ends exactly at the live price and stays within a believable range.
 */
function buildHistory(timeframe: Timeframe): Candle[] {
  const tfSeconds = TIMEFRAME_SECONDS[timeframe]
  const vol = HIST_VOL * Math.sqrt(tfSeconds / 60)
  const current = round2(price)
  const lastTime = Math.floor(Date.now() / 1000 / tfSeconds) * tfSeconds

  const closes = new Array<number>(HIST_CANDLES).fill(current)
  let x = 0
  for (let i = HIST_CANDLES - 1; i >= 0; i--) {
    closes[i] = current * Math.exp(x)
    x = x * 0.95 + gauss() * vol
  }

  const candles: Candle[] = []
  for (let i = 0; i < HIST_CANDLES; i++) {
    const close = closes[i] ?? current
    const open = i > 0 ? (closes[i - 1] ?? close) : close * Math.exp(gauss() * vol)
    const wick = vol * 0.5
    candles.push({
      time: lastTime - (HIST_CANDLES - 1 - i) * tfSeconds,
      open: round2(open),
      high: round2(Math.max(open, close) * (1 + Math.abs(gauss()) * wick)),
      low: round2(Math.min(open, close) * (1 - Math.abs(gauss()) * wick)),
      close: round2(close),
    })
  }
  return candles
}

ctx.onmessage = (event) => {
  const msg = event.data
  if (msg.type === 'history') {
    ctx.postMessage({
      type: 'history',
      requestId: msg.requestId,
      timeframe: msg.timeframe,
      candles: buildHistory(msg.timeframe),
    })
  }
}

setInterval(emitTick, TICK_MS)
setInterval(emitBook, BOOK_MS)
