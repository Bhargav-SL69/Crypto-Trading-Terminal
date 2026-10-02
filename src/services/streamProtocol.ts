import type { BookSnapshot, Candle, Tick, Timeframe } from '../types'

/** Messages the main thread sends to the mock-stream worker. */
export type WorkerIn = { type: 'history'; requestId: number; timeframe: Timeframe }

/** Messages the mock-stream worker sends back. */
export type WorkerOut =
  | { type: 'tick'; tick: Tick }
  | { type: 'book'; book: BookSnapshot }
  | { type: 'history'; requestId: number; timeframe: Timeframe; candles: Candle[] }
