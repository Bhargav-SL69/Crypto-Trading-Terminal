import { useQuery } from '@tanstack/react-query'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { Panel } from '../../components/Panel'
import { mockStream } from '../../services/mockStream'
import { TIMEFRAMES, TIMEFRAME_SECONDS } from '../../types'
import type { Candle, Timeframe } from '../../types'
import { computeEMA, computeSMA, emaNext, smaAt } from './indicators'

const SMA_PERIOD = 20
const EMA_PERIOD = 50

const toBar = (c: Candle): CandlestickData => ({
  time: c.time as UTCTimestamp,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
})

function toLineData(candles: readonly Candle[], values: readonly (number | undefined)[]): LineData[] {
  const out: LineData[] = []
  candles.forEach((c, i) => {
    const value = values[i]
    if (value !== undefined) out.push({ time: c.time as UTCTimestamp, value })
  })
  return out
}

export function CandlestickChart() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [showSma, setShowSma] = useState(true)
  const [showEma, setShowEma] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  // Live state lives in refs: ticks arrive 20x/s and must never trigger React renders.
  const candlesRef = useRef<Candle[]>([])
  const emaValuesRef = useRef<(number | undefined)[]>([])

  const { data, isPending } = useQuery({
    queryKey: ['candles', timeframe],
    queryFn: () => mockStream.fetchHistory(timeframe),
    staleTime: Infinity,
    gcTime: 0,
  })

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#7d8696',
        fontSize: 11,
      },
      grid: { vertLines: { color: '#151b26' }, horzLines: { color: '#151b26' } },
      rightPriceScale: { borderColor: '#1c2330' },
      timeScale: { borderColor: '#1c2330', timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    })
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderVisible: false,
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    })
    const line = { lineWidth: 2, priceLineVisible: false, lastValueVisible: false } as const
    smaSeriesRef.current = chart.addSeries(LineSeries, { ...line, color: '#f0b90b' })
    emaSeriesRef.current = chart.addSeries(LineSeries, { ...line, color: '#4c9aff' })
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      smaSeriesRef.current = null
      emaSeriesRef.current = null
    }
  }, [])

  // Load history for the active timeframe.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const smaSeries = smaSeriesRef.current
    const emaSeries = emaSeriesRef.current
    if (!data || !candleSeries || !smaSeries || !emaSeries) {
      candlesRef.current = []
      emaValuesRef.current = []
      return
    }
    candlesRef.current = data.slice()
    emaValuesRef.current = computeEMA(data, EMA_PERIOD)
    candleSeries.setData(data.map(toBar))
    smaSeries.setData(toLineData(data, computeSMA(data, SMA_PERIOD)))
    emaSeries.setData(toLineData(data, emaValuesRef.current))
    chartRef.current?.timeScale().fitContent()
  }, [data])

  // Fold live ticks into the current candle and extend the indicator lines.
  useEffect(() => {
    const tfSeconds = TIMEFRAME_SECONDS[timeframe]
    return mockStream.onTick((tick) => {
      const candles = candlesRef.current
      const last = candles[candles.length - 1]
      if (!last) return
      const bucket = Math.floor(tick.time / 1000 / tfSeconds) * tfSeconds
      if (bucket < last.time) return

      let bar: Candle
      if (bucket === last.time) {
        bar = {
          ...last,
          high: Math.max(last.high, tick.price),
          low: Math.min(last.low, tick.price),
          close: tick.price,
        }
        candles[candles.length - 1] = bar
      } else {
        bar = {
          time: bucket,
          open: last.close,
          high: Math.max(last.close, tick.price),
          low: Math.min(last.close, tick.price),
          close: tick.price,
        }
        candles.push(bar)
      }
      candleSeriesRef.current?.update(toBar(bar))

      const i = candles.length - 1
      const time = bar.time as UTCTimestamp
      const ema = emaValuesRef.current
      const prevEma = ema[i - 1]
      const emaValue = prevEma === undefined ? undefined : emaNext(prevEma, bar.close, EMA_PERIOD)
      ema[i] = emaValue
      if (emaValue !== undefined) emaSeriesRef.current?.update({ time, value: emaValue })
      const smaValue = smaAt(candles, i, SMA_PERIOD)
      if (smaValue !== undefined) smaSeriesRef.current?.update({ time, value: smaValue })
    })
  }, [timeframe])

  useEffect(() => {
    smaSeriesRef.current?.applyOptions({ visible: showSma })
  }, [showSma])
  useEffect(() => {
    emaSeriesRef.current?.applyOptions({ visible: showEma })
  }, [showEma])

  return (
    <Panel
      title="BTC/USDT"
      actions={
        <div className="flex items-center gap-4">
          <div className="flex gap-1" role="group" aria-label="Timeframe">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                aria-pressed={timeframe === tf}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  timeframe === tf ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Indicators">
            <IndicatorToggle label={`SMA ${SMA_PERIOD}`} color="#f0b90b" active={showSma} onToggle={() => setShowSma((v) => !v)} />
            <IndicatorToggle label={`EMA ${EMA_PERIOD}`} color="#4c9aff" active={showEma} onToggle={() => setShowEma((v) => !v)} />
          </div>
        </div>
      }
    >
      <div className="relative h-full w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {isPending && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted">Loading candles…</div>
        )}
      </div>
    </Panel>
  )
}

interface IndicatorToggleProps {
  label: string
  color: string
  active: boolean
  onToggle: () => void
}

function IndicatorToggle({ label, color, active, onToggle }: IndicatorToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
      }`}
    >
      <span className="size-2 rounded-full" style={{ background: color, opacity: active ? 1 : 0.35 }} />
      {label}
    </button>
  )
}
