import { useEffect } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import { mockStream } from './mockStream'

/** Pipes the worker's tick and order-book streams into the trade store. */
export function useMarketFeed(): void {
  useEffect(() => {
    const { applyTick, applyBook } = useTradeStore.getState()
    const offTick = mockStream.onTick(applyTick)
    const offBook = mockStream.onBook(applyBook)
    return () => {
      offTick()
      offBook()
    }
  }, [])
}
