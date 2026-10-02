import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, type ReactNode } from 'react'

export interface Column<T> {
  id: string
  header: string
  /** CSS grid track size, e.g. "90px" or "minmax(80px, 1fr)". */
  width: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
}

interface VirtualTableProps<T> {
  rows: readonly T[]
  columns: readonly Column<T>[]
  getKey: (row: T) => string
  emptyMessage: string
  rowHeight?: number
}

export function VirtualTable<T>({ rows, columns, getKey, emptyMessage, rowHeight = 28 }: VirtualTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  })
  const template = columns.map((c) => c.width).join(' ')
  const cell = (align: Column<T>['align']) => (align === 'right' ? 'text-right' : 'text-left')

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="min-w-[760px]">
        <div
          className="sticky top-0 z-10 grid border-b border-edge bg-panel px-3 text-[11px] text-muted"
          style={{ gridTemplateColumns: template, height: 26, alignItems: 'center' }}
        >
          {columns.map((c) => (
            <div key={c.id} className={`truncate pr-2 ${cell(c.align)}`}>
              {c.header}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="grid h-24 place-items-center text-xs text-muted">{emptyMessage}</div>
        ) : (
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              if (!row) return null
              return (
                <div
                  key={getKey(row)}
                  className="tabular absolute left-0 top-0 grid w-full items-center px-3 text-xs hover:bg-white/5"
                  style={{
                    gridTemplateColumns: template,
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {columns.map((c) => (
                    <div key={c.id} className={`truncate pr-2 ${cell(c.align)}`}>
                      {c.render(row)}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
