import { TrendingDown, TrendingUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Panel } from '../../components/Panel'
import { formatNumber } from '../../lib/format'
import { FEE_RATE, MAX_LEVERAGE, SIZE_STEP, liquidationPrice } from '../../lib/risk'
import { useTradeStore } from '../../store/useTradeStore'
import type { OrderType, Side } from '../../types'

const LEVERAGE_MARKS = [1, 5, 10, 25, 50, 100] as const
const SIZE_PERCENTS = [25, 50, 75, 100] as const

/** Empty string -> null; anything non-numeric -> NaN (rejected by the store). */
function parseInput(text: string): number | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : Number(trimmed)
}

type Notice = { kind: 'error' | 'success'; text: string }

export function OrderEntry() {
  const lastPrice = useTradeStore((s) => s.lastPrice)
  const balance = useTradeStore((s) => s.balance)
  const placeOrder = useTradeStore((s) => s.placeOrder)

  const [type, setType] = useState<OrderType>('market')
  const [side, setSide] = useState<Side>('long')
  const [leverage, setLeverage] = useState(10)
  const [limitPrice, setLimitPrice] = useState('')
  const [size, setSize] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)

  const limit = parseInput(limitPrice)
  const reference = type === 'limit' ? (limit !== null && limit > 0 ? limit : null) : lastPrice
  const qty = parseInput(size)
  const validQty = qty !== null && qty > 0 ? qty : 0

  const notional = reference !== null ? validQty * reference : 0
  const margin = notional / leverage
  const fee = notional * FEE_RATE
  const liq = reference !== null ? liquidationPrice(side, reference, leverage) : null

  function applyPercent(percent: number) {
    const price = reference ?? lastPrice
    const maxQty = balance / (price / leverage + price * FEE_RATE)
    const stepped = Math.floor((maxQty * percent) / 100 / SIZE_STEP) * SIZE_STEP
    setSize(stepped > 0 ? stepped.toFixed(3) : '')
  }

  function submit() {
    const result = placeOrder({
      type,
      side,
      size: validQty,
      limitPrice: type === 'limit' ? limit : null,
      leverage,
      takeProfit: parseInput(takeProfit),
      stopLoss: parseInput(stopLoss),
    })
    if (result.ok) {
      setNotice({ kind: 'success', text: type === 'market' ? 'Market order filled' : 'Order placed' })
      setSize('')
    } else {
      setNotice({ kind: 'error', text: result.error })
    }
  }

  const isLong = side === 'long'

  return (
    <Panel title="Order Entry" className="overflow-y-auto">
      <form
        className="flex flex-col gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Segmented
          label="Order type"
          value={type}
          onChange={setType}
          options={[
            { value: 'market', label: 'Market' },
            { value: 'limit', label: 'Limit' },
          ]}
        />

        <div className="grid grid-cols-2 gap-2">
          <SideButton active={isLong} tone="up" onClick={() => setSide('long')} icon={<TrendingUp className="size-4" />}>
            Buy / Long
          </SideButton>
          <SideButton active={!isLong} tone="down" onClick={() => setSide('short')} icon={<TrendingDown className="size-4" />}>
            Sell / Short
          </SideButton>
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>Available</span>
          <span className="tabular text-white">{formatNumber(balance, 2)} USDT</span>
        </div>

        {type === 'limit' ? (
          <Field label="Limit price" unit="USDT" value={limitPrice} onChange={setLimitPrice} placeholder={formatNumber(lastPrice, 2)} />
        ) : (
          <Field label="Price" unit="USDT" value="Market" disabled />
        )}

        <div className="flex flex-col gap-1.5">
          <Field label="Size" unit="BTC" value={size} onChange={setSize} placeholder="0.000" />
          <div className="grid grid-cols-4 gap-1">
            {SIZE_PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPercent(p)}
                className="rounded bg-white/5 py-1 text-[11px] text-muted transition-colors hover:bg-white/10 hover:text-white"
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="leverage" className="text-muted">
              Leverage
            </label>
            <span className="tabular rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">{leverage}x</span>
          </div>
          <input
            id="leverage"
            type="range"
            min={1}
            max={MAX_LEVERAGE}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-[#f0b90b]"
          />
          <div className="flex justify-between">
            {LEVERAGE_MARKS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLeverage(m)}
                className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                  leverage === m ? 'text-accent' : 'text-muted hover:text-white'
                }`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Take profit" unit="USDT" value={takeProfit} onChange={setTakeProfit} placeholder="Optional" />
          <Field label="Stop loss" unit="USDT" value={stopLoss} onChange={setStopLoss} placeholder="Optional" />
        </div>

        <dl className="tabular flex flex-col gap-1 rounded border border-edge bg-surface/60 p-2 text-xs">
          <Summary label="Notional" value={`${formatNumber(notional, 2)} USDT`} />
          <Summary label="Required margin" value={`${formatNumber(margin, 2)} USDT`} />
          <Summary label={`Fee (${(FEE_RATE * 100).toFixed(2)}%)`} value={`${formatNumber(fee, 2)} USDT`} />
          <Summary label="Est. liquidation" value={liq !== null && validQty > 0 ? formatNumber(liq, 2) : '—'} tone="down" />
        </dl>

        {notice && (
          <p role="status" className={`text-xs ${notice.kind === 'error' ? 'text-down' : 'text-up'}`}>
            {notice.text}
          </p>
        )}

        <button
          type="submit"
          className={`rounded py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${
            isLong ? 'bg-up' : 'bg-down'
          }`}
        >
          {isLong ? 'Open Long' : 'Open Short'} · {leverage}x
        </button>
      </form>
    </Panel>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
}

function Segmented<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="grid grid-flow-col auto-cols-fr rounded bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded py-1 text-xs transition-colors ${
            value === o.value ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SideButtonProps {
  active: boolean
  tone: 'up' | 'down'
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}

function SideButton({ active, tone, onClick, icon, children }: SideButtonProps) {
  const activeClass = tone === 'up' ? 'border-up bg-up/15 text-up' : 'border-down bg-down/15 text-down'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded border py-1.5 text-xs font-semibold transition-colors ${
        active ? activeClass : 'border-edge text-muted hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

interface FieldProps {
  label: string
  unit: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

function Field({ label, unit, value, onChange, placeholder, disabled }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <span className="flex items-center rounded border border-edge bg-surface px-2 focus-within:border-accent">
        <input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className="tabular min-w-0 flex-1 bg-transparent py-1.5 text-white outline-none placeholder:text-muted/60 disabled:text-muted"
        />
        <span className="pl-2 text-[11px]">{unit}</span>
      </span>
    </label>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'down' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === 'down' ? 'text-down' : 'text-white'}>{value}</dd>
    </div>
  )
}
