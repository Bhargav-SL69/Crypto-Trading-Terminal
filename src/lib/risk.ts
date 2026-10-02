import type { Position, Side } from '../types'

export const INITIAL_BALANCE = 100_000
export const FEE_RATE = 0.0005
export const MAINT_MARGIN_RATE = 0.005
export const MAX_LEVERAGE = 100
export const SIZE_STEP = 0.001

export function liquidationPrice(side: Side, entry: number, leverage: number): number {
  const initial = 1 / leverage
  return side === 'long'
    ? entry * (1 - initial + MAINT_MARGIN_RATE)
    : entry * (1 + initial - MAINT_MARGIN_RATE)
}

export function unrealizedPnl(
  position: Pick<Position, 'side' | 'size' | 'entryPrice'>,
  mark: number,
): number {
  const move = position.side === 'long' ? mark - position.entryPrice : position.entryPrice - mark
  return move * position.size
}

export const requiredMargin = (notional: number, leverage: number): number => notional / leverage

export const tradingFee = (notional: number): number => notional * FEE_RATE

/** Returns an error message, or null when the TP/SL targets are coherent. */
export function validateBrackets(
  side: Side,
  reference: number,
  takeProfit: number | null,
  stopLoss: number | null,
  leverage: number,
): string | null {
  const liq = liquidationPrice(side, reference, leverage)
  if (side === 'long') {
    if (takeProfit !== null && takeProfit <= reference) return 'Take-profit must be above entry'
    if (stopLoss !== null && stopLoss >= reference) return 'Stop-loss must be below entry'
    if (stopLoss !== null && stopLoss <= liq) return 'Stop-loss is beyond the liquidation price'
  } else {
    if (takeProfit !== null && takeProfit >= reference) return 'Take-profit must be below entry'
    if (stopLoss !== null && stopLoss <= reference) return 'Stop-loss must be above entry'
    if (stopLoss !== null && stopLoss >= liq) return 'Stop-loss is beyond the liquidation price'
  }
  return null
}
