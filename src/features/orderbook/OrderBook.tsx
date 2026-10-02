import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Crosshair } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from '../../components/Panel'
import { formatNumber } from '../../lib/format'
import { useTradeStore } from '../../store/useTradeStore'
import type { BookLevel, BookSnapshot } from '../../types'

const ROW_HEIGHT = 22
const GROUPS = [0.5, 1, 5, 10, 50] as const

interface LevelRow {
  kind: 'ask' | 'bid'
  price: number
  size: number
  /** Cumulative size from the best price outward. */
  total: number
  /** 0..1 share of the deepest cumulative total. */
  depth: number
}
type BookRow = LevelRow | { kind: 'spread' }

/** Merges levels into buckets. Input is sorted best-first, so buckets are contiguous. */
function groupLevels(levels: readonly BookLevel[], group: number, side: 'bid' | 'ask'): BookLevel[] {
  const out: BookLevel[] = []
  let current: BookLevel | null = null
  for (const level of levels) {
    const ratio = level.price / group
    const price = (side === 'bid' ? Math.floor(ratio + 1e-9) : Math.ceil(ratio - 1e-9)) * group
    if (current && current.price === price) {
      current.size += level.size
    } else {
      current = { price, size: level.size }
      out.push(current)
    }
  }
  return out
}

function withTotals(levels: readonly BookLevel[]): { price: number; size: number; total: number }[] {
  let total = 0
  return levels.map((l) => ({ price: l.price, size: l.size, total: (total += l.size) }))
}

function buildRows(book: BookSnapshot, group: number) {
  const asks = withTotals(groupLevels(book.asks, group, 'ask'))
  const bids = withTotals(groupLevels(book.bids, group, 'bid'))
  const maxTotal = Math.max(asks.at(-1)?.total ?? 0, bids.at(-1)?.total ?? 0, 1)

  const askRows: LevelRow[] = asks
    .map((l) => ({ kind: 'ask' as const, ...l, depth: l.total / maxTotal }))
    .reverse() // best ask sits next to the spread row
  const bidRows: LevelRow[] = bids.map((l) => ({ kind: 'bid' as const, ...l, depth: l.total / maxTotal }))

  const bestBid = book.bids[0]?.price
  const bestAsk = book.asks[0]?.price
  const spread = bestBid !== undefined && bestAsk !== undefined ? bestAsk - bestBid : null

  const rows: BookRow[] = [...askRows, { kind: 'spread' }, ...bidRows]
  return { rows, askCount: askRows.length, spread, spreadPct: spread !== null && bestAsk ? (spread / bestAsk) * 100 : null }
}

export function OrderBook() {
  const book = useTradeStore((s) => s.book)
  const [group, setGroup] = useState<number>(1)
  const { rows, askCount, spread, spreadPct } = useMemo(() => buildRows(book, group), [book, group])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  // Centre the spread row on first data and whenever grouping changes the row layout.
  const centeredFor = useRef<number | null>(null)
  useEffect(() => {
    if (rows.length > 1 && centeredFor.current !== group) {
      centeredFor.current = group
      virtualizer.scrollToIndex(askCount, { align: 'center' })
    }
  })

  return (
    <Panel
      title="Order Book"
      className="border-x border-edge"
      actions={
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5" role="group" aria-label="Price grouping">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                aria-pressed={group === g}
                className={`rounded px-1.5 py-0.5 text-[11px] tabular transition-colors ${
                  group === g ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Re-centre on spread"
            aria-label="Re-centre on spread"
            onClick={() => virtualizer.scrollToIndex(askCount, { align: 'center' })}
            className="rounded p-1 text-muted hover:text-white"
          >
            <Crosshair className="size-3.5" />
          </button>
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <div className="grid shrink-0 grid-cols-3 px-3 py-1 text-[11px] text-muted">
          <span>Price (USDT)</span>
          <span className="text-right">Size (BTC)</span>
          <span className="text-right">Total</span>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {rows.length <= 1 ? (
            <div className="grid h-24 place-items-center text-xs text-muted">Waiting for order book…</div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index]
                if (!row) return null
                return (
                  <div
                    key={row.kind === 'spread' ? 'spread' : `${row.kind}-${row.price}`}
                    className="absolute left-0 top-0 w-full"
                    style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                    {row.kind === 'spread' ? <SpreadRow spread={spread} spreadPct={spreadPct} /> : <LevelRowView row={row} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

const LevelRowView = memo(function LevelRowView({ row }: { row: LevelRow }) {
  const isAsk = row.kind === 'ask'
  return (
    <div className="tabular relative grid h-full grid-cols-3 items-center px-3 text-xs">
      <div
        className={`absolute inset-y-0 right-0 ${isAsk ? 'bg-down/15' : 'bg-up/15'}`}
        style={{ width: `${row.depth * 100}%` }}
      />
      <span className={`relative ${isAsk ? 'text-down' : 'text-up'}`}>{formatNumber(row.price, 2)}</span>
      <span className="relative text-right">{formatNumber(row.size, 3)}</span>
      <span className="relative text-right text-muted">{formatNumber(row.total, 3)}</span>
    </div>
  )
})

function SpreadRow({ spread, spreadPct }: { spread: number | null; spreadPct: number | null }) {
  const lastPrice = useTradeStore((s) => s.lastPrice)
  const direction = useTradeStore((s) => s.priceDirection)
  const color = direction > 0 ? 'text-up' : direction < 0 ? 'text-down' : 'text-white'
  return (
    <div className="tabular flex h-full items-center justify-between border-y border-edge bg-white/5 px-3">
      <span className={`flex items-center gap-1 text-sm font-semibold ${color}`}>
        {formatNumber(lastPrice, 2)}
        {direction > 0 && <ArrowUp className="size-3.5" />}
        {direction < 0 && <ArrowDown className="size-3.5" />}
      </span>
      <span className="text-[11px] text-muted">
        Spread {spread === null ? '—' : formatNumber(spread, 2)}
        {spreadPct !== null && ` (${spreadPct.toFixed(4)}%)`}
      </span>
    </div>
  )
}
