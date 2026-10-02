import type { BookSnapshot, Candle, Tick, Timeframe } from '../types'
import type { WorkerIn, WorkerOut } from './streamProtocol'

type Listener<T> = (value: T) => void

/**
 * Main-thread facade over the mock order-stream worker. The worker is created lazily on
 * first use, so all price generation stays off the UI thread.
 */
class MockStream {
  private worker: Worker | null = null
  private tickListeners = new Set<Listener<Tick>>()
  private bookListeners = new Set<Listener<BookSnapshot>>()
  private pendingHistory = new Map<number, Listener<Candle[]>>()
  private requestSeq = 0

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./mockStream.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data
      switch (msg.type) {
        case 'tick':
          this.tickListeners.forEach((l) => l(msg.tick))
          break
        case 'book':
          this.bookListeners.forEach((l) => l(msg.book))
          break
        case 'history': {
          const resolve = this.pendingHistory.get(msg.requestId)
          this.pendingHistory.delete(msg.requestId)
          resolve?.(msg.candles)
          break
        }
      }
    }
    this.worker = worker
    return worker
  }

  onTick(listener: Listener<Tick>): () => void {
    this.ensureWorker()
    this.tickListeners.add(listener)
    return () => {
      this.tickListeners.delete(listener)
    }
  }

  onBook(listener: Listener<BookSnapshot>): () => void {
    this.ensureWorker()
    this.bookListeners.add(listener)
    return () => {
      this.bookListeners.delete(listener)
    }
  }

  fetchHistory(timeframe: Timeframe): Promise<Candle[]> {
    const worker = this.ensureWorker()
    return new Promise((resolve) => {
      const requestId = ++this.requestSeq
      this.pendingHistory.set(requestId, resolve)
      const message: WorkerIn = { type: 'history', requestId, timeframe }
      worker.postMessage(message)
    })
  }

  stop(): void {
    this.worker?.terminate()
    this.worker = null
    this.pendingHistory.clear()
  }
}

export const mockStream = new MockStream()

import.meta.hot?.dispose(() => mockStream.stop())
