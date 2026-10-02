const formatters = new Map<number, Intl.NumberFormat>()

function formatter(decimals: number): Intl.NumberFormat {
  let f = formatters.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    formatters.set(decimals, f)
  }
  return f
}

export const formatNumber = (n: number, decimals = 2): string => formatter(decimals).format(n)

export function formatSigned(n: number, decimals = 2): string {
  const rounded = Number(n.toFixed(decimals))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${formatter(decimals).format(Math.abs(rounded))}`
}

export const formatTime = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB')

export function pnlClass(n: number): string {
  const rounded = Number(n.toFixed(2))
  return rounded > 0 ? 'text-up' : rounded < 0 ? 'text-down' : 'text-muted'
}
