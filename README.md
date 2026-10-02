# Crypto Trading Terminal

A browser-based paper-trading terminal for BTC/USDT. It combines a live candlestick chart, a depth-style order book and a leveraged order-entry panel, all running against a **simulated** market feed. No real money, exchange account or API key is involved.

> **Simulated data only.** Prices come from a built-in random-walk generator, not a real exchange. Nothing here is financial advice.

## Features

- **Candlestick chart** with five timeframes and SMA 20 / EMA 50 indicator toggles. Live ticks update the chart without re-rendering React.
- **Order book** with 300 levels per side, price grouping (0.5 to 50), depth bars, a spread row and a re-centre control. It is virtualised for smooth scrolling.
- **Order entry** for market and limit orders, long and short, with 1x to 100x leverage, take-profit and stop-loss, and a live summary of notional, margin, fee and estimated liquidation price.
- **Positions panel** with Positions, Orders and History tabs, live PnL and ROE per row, close and cancel buttons, and close-all.
- **Trading engine** with a 100,000 USDT starting balance, isolated-margin liquidation, TP/SL triggers and a 0.05% fee.
- **Market simulator** running in a Web Worker: a mean-reverting random walk emitting about 20 ticks per second, a book snapshot every 100 ms, and generated history candles.

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 (dark theme) |
| State | Zustand |
| Data fetching | TanStack Query |
| Charts | lightweight-charts |
| Virtualised lists | TanStack Virtual |
| Icons | lucide-react |
| Quality | Oxlint, Vitest |

## Getting started

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production into `dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |
| `npm test` | Run the Vitest suite |

## Project structure

```
src/
├── App.tsx                  # Layout: ticker bar, chart, positions, order book, order entry
├── components/              # Shared UI (Panel, VirtualTable)
├── features/
│   ├── chart/               # CandlestickChart and indicator maths (SMA, EMA)
│   ├── orderbook/           # Virtualised order book
│   └── trading/             # OrderEntry and PositionsPanel
├── store/useTradeStore.ts   # Balance, orders, positions, fills, liquidation, TP/SL
├── services/
│   ├── mockStream.ts        # Main-thread facade over the worker
│   ├── mockStream.worker.ts # Simulated price, tick and order-book generator
│   ├── streamProtocol.ts    # Typed worker messages
│   └── useMarketFeed.ts     # Feeds market data into the store
├── lib/                     # Pure helpers: risk and liquidation maths, formatting
└── types/                   # Domain types
```

## How it works

1. `mockStream.worker.ts` generates prices, ticks and order-book snapshots off the main thread.
2. `useMarketFeed` forwards those messages into the Zustand store and the chart.
3. On every tick the store checks pending limit orders, TP/SL levels and liquidation prices, then updates positions and PnL.
4. Components subscribe only to the slices they need, which keeps the UI responsive at 20 ticks per second.

## Limitations and roadmap

- State is not persisted, so a refresh resets the balance, positions and history.
- Pending limit orders do not reserve margin yet.
- Market orders fill at the last price, with no slippage or book walking.
- The layout is desktop-only, and the symbol is fixed to BTC/USDT.
- Planned: a real exchange feed (for example the Binance WebSocket) behind the existing `mockStream` interface, persistence, a symbol selector, a responsive layout, and more tests and CI.
