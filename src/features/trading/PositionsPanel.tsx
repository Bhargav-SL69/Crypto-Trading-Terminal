import { X } from 'lucide-react'
import { useState } from 'react'
import { Panel } from '../../components/Panel'
import { VirtualTable, type Column } from '../../components/VirtualTable'
import { formatNumber, formatSigned, formatTime, pnlClass } from '../../lib/format'
import { unrealizedPnl } from '../../lib/risk'
import { useTradeStore } from '../../store/useTradeStore'
import type { ClosedTrade, OrderRecord, Position, Side } from '../../types'

type Tab = 'positions' | 'orders' | 'history'

const targets = (tp: number | null, sl: number | null): string =>
  `${tp === null ? '—' : formatNumber(tp, 2)} / ${sl === null ? '—' : formatNumber(sl, 2)}`

function SideBadge({ side, leverage }: { side: Side; leverage: number }) {
  return (
    <span className={side === 'long' ? 'text-up' : 'text-down'}>
      {side === 'long' ? 'Long' : 'Short'} <span className="text-muted">{leverage}x</span>
    </span>
  )
}

function MarkPrice() {
  const lastPrice = useTradeStore((s) => s.lastPrice)
  return <>{formatNumber(lastPrice, 2)}</>
}

/** Subscribes to the price itself, so only visible rows re-render on each tick. */
function LivePnl({ position }: { position: Position }) {
  const pnl = useTradeStore((s) => unrealizedPnl(position, s.lastPrice))
  const roe = (pnl / position.margin) * 100
  return (
    <span className={pnlClass(pnl)}>
      {formatSigned(pnl, 2)} <span className="text-[11px]">({formatSigned(roe, 2)}%)</span>
    </span>
  )
}

function LiquidateButton({ positionId }: { positionId: string }) {
  const closePosition = useTradeStore((s) => s.closePosition)
  return (
    <button
      type="button"
      onClick={() => closePosition(positionId)}
      className="inline-flex items-center gap-1 rounded border border-down/50 px-2 py-0.5 text-[11px] text-down transition-colors hover:bg-down hover:text-white"
    >
      <X className="size-3" />
      Liquidate
    </button>
  )
}

function CancelButton({ orderId }: { orderId: string }) {
  const cancelOrder = useTradeStore((s) => s.cancelOrder)
  return (
    <button
      type="button"
      onClick={() => cancelOrder(orderId)}
      className="rounded border border-edge px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-white"
    >
      Cancel
    </button>
  )
}

const positionColumns: readonly Column<Position>[] = [
  { id: 'side', header: 'Side', width: '90px', render: (p) => <SideBadge side={p.side} leverage={p.leverage} /> },
  { id: 'size', header: 'Size (BTC)', width: '90px', align: 'right', render: (p) => formatNumber(p.size, 3) },
  { id: 'entry', header: 'Entry', width: '100px', align: 'right', render: (p) => formatNumber(p.entryPrice, 2) },
  { id: 'mark', header: 'Mark', width: '100px', align: 'right', render: () => <MarkPrice /> },
  { id: 'liq', header: 'Liq. price', width: '100px', align: 'right', render: (p) => <span className="text-down">{formatNumber(p.liquidationPrice, 2)}</span> },
  { id: 'margin', header: 'Margin', width: '90px', align: 'right', render: (p) => formatNumber(p.margin, 2) },
  { id: 'tpsl', header: 'TP / SL', width: '160px', align: 'right', render: (p) => targets(p.takeProfit, p.stopLoss) },
  { id: 'pnl', header: 'Unrealized PnL', width: '1fr', align: 'right', render: (p) => <LivePnl position={p} /> },
  { id: 'action', header: '', width: '96px', align: 'right', render: (p) => <LiquidateButton positionId={p.id} /> },
]

const orderColumns: readonly Column<OrderRecord>[] = [
  { id: 'time', header: 'Time', width: '80px', render: (o) => formatTime(o.createdAt) },
  { id: 'type', header: 'Type', width: '70px', render: (o) => (o.type === 'market' ? 'Market' : 'Limit') },
  { id: 'side', header: 'Side', width: '90px', render: (o) => <SideBadge side={o.side} leverage={o.leverage} /> },
  { id: 'size', header: 'Size (BTC)', width: '90px', align: 'right', render: (o) => formatNumber(o.size, 3) },
  { id: 'price', header: 'Price', width: '110px', align: 'right', render: (o) => formatNumber(o.fillPrice ?? o.price, 2) },
  { id: 'tpsl', header: 'TP / SL', width: '170px', align: 'right', render: (o) => targets(o.takeProfit, o.stopLoss) },
  {
    id: 'status',
    header: 'Status',
    width: '1fr',
    align: 'right',
    render: (o) => (
      <span className={o.status === 'filled' ? 'text-up' : o.status === 'cancelled' ? 'text-muted' : 'text-accent'}>
        {o.status}
      </span>
    ),
  },
  { id: 'action', header: '', width: '80px', align: 'right', render: (o) => (o.status === 'pending' ? <CancelButton orderId={o.id} /> : null) },
]

const historyColumns: readonly Column<ClosedTrade>[] = [
  { id: 'time', header: 'Closed', width: '80px', render: (t) => formatTime(t.closedAt) },
  { id: 'side', header: 'Side', width: '90px', render: (t) => <SideBadge side={t.side} leverage={t.leverage} /> },
  { id: 'size', header: 'Size (BTC)', width: '90px', align: 'right', render: (t) => formatNumber(t.size, 3) },
  { id: 'entry', header: 'Entry', width: '100px', align: 'right', render: (t) => formatNumber(t.entryPrice, 2) },
  { id: 'exit', header: 'Exit', width: '100px', align: 'right', render: (t) => formatNumber(t.exitPrice, 2) },
  { id: 'fees', header: 'Fees', width: '80px', align: 'right', render: (t) => formatNumber(t.fees, 2) },
  { id: 'reason', header: 'Reason', width: '110px', align: 'right', render: (t) => <span className={t.reason === 'liquidated' ? 'text-down' : ''}>{t.reason}</span> },
  { id: 'pnl', header: 'Realized PnL', width: '1fr', align: 'right', render: (t) => <span className={pnlClass(t.realizedPnl)}>{formatSigned(t.realizedPnl, 2)}</span> },
]

function AccountSummary() {
  const balance = useTradeStore((s) => s.balance)
  const margin = useTradeStore((s) => s.positions.reduce((sum, p) => sum + p.margin, 0))
  const unrealized = useTradeStore((s) => s.positions.reduce((sum, p) => sum + unrealizedPnl(p, s.lastPrice), 0))
  return (
    <dl className="tabular flex items-center gap-4 text-[11px]">
      <Stat label="Balance" value={formatNumber(balance, 2)} />
      <Stat label="Equity" value={formatNumber(balance + margin + unrealized, 2)} />
      <Stat label="Unrealized" value={formatSigned(unrealized, 2)} className={pnlClass(unrealized)} />
    </dl>
  )
}

function Stat({ label, value, className = 'text-white' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={className}>{value}</dd>
    </div>
  )
}

export function PositionsPanel() {
  const [tab, setTab] = useState<Tab>('positions')
  const positions = useTradeStore((s) => s.positions)
  const orders = useTradeStore((s) => s.orders)
  const history = useTradeStore((s) => s.history)
  const closeAll = useTradeStore((s) => s.closeAllPositions)

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'positions', label: 'Positions', count: positions.length },
    { id: 'orders', label: 'Order History', count: orders.length },
    { id: 'history', label: 'Trade History', count: history.length },
  ]

  return (
    <Panel
      title="Portfolio"
      className="border-t border-edge"
      actions={
        <div className="flex items-center gap-4">
          <AccountSummary />
          {positions.length > 0 && (
            <button
              type="button"
              onClick={closeAll}
              className="rounded border border-down/50 px-2 py-0.5 text-[11px] text-down transition-colors hover:bg-down hover:text-white"
            >
              Liquidate all
            </button>
          )}
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <div role="tablist" className="flex shrink-0 gap-4 border-b border-edge px-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 py-1.5 text-xs transition-colors ${
                tab === t.id ? 'border-accent text-white' : 'border-transparent text-muted hover:text-white'
              }`}
            >
              {t.label} <span className="text-muted">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {tab === 'positions' && (
            <VirtualTable rows={positions} columns={positionColumns} getKey={(p) => p.id} emptyMessage="No open positions" />
          )}
          {tab === 'orders' && (
            <VirtualTable rows={orders} columns={orderColumns} getKey={(o) => o.id} emptyMessage="No orders yet" />
          )}
          {tab === 'history' && (
            <VirtualTable rows={history} columns={historyColumns} getKey={(t) => t.id} emptyMessage="No closed trades yet" />
          )}
        </div>
      </div>
    </Panel>
  )
}
