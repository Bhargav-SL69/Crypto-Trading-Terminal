import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { CandlestickChart } from './features/chart/CandlestickChart'
import { OrderBook } from './features/orderbook/OrderBook'
import { OrderEntry } from './features/trading/OrderEntry'
import { PositionsPanel } from './features/trading/PositionsPanel'
import { formatNumber } from './lib/format'
import { useMarketFeed } from './services/useMarketFeed'
import { useTradeStore } from './store/useTradeStore'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
})

function TickerBar() {
  const symbol = useTradeStore((s) => s.symbol)
  const lastPrice = useTradeStore((s) => s.lastPrice)
  const direction = useTradeStore((s) => s.priceDirection)
  const color = direction > 0 ? 'text-up' : direction < 0 ? 'text-down' : 'text-white'
  return (
    <header className="flex h-11 shrink-0 items-center gap-6 border-b border-edge bg-panel px-4">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-accent" />
        <h1 className="text-sm font-semibold text-white">Trading Terminal</h1>
      </div>
      <span className="text-xs text-muted">{symbol}</span>
      <span className={`tabular text-base font-semibold ${color}`}>{formatNumber(lastPrice, 2)}</span>
      <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
        <span className="size-1.5 animate-pulse rounded-full bg-up" />
        Simulated feed
      </span>
    </header>
  )
}

function Terminal() {
  useMarketFeed()
  return (
    <div className="flex h-full flex-col">
      <TickerBar />
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px_320px] gap-px bg-edge">
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_280px] gap-px bg-edge">
          <CandlestickChart />
          <PositionsPanel />
        </div>
        <OrderBook />
        <OrderEntry />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Terminal />
    </QueryClientProvider>
  )
}
