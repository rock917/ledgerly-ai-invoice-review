import type { Detail } from '../types'

export function evidenceValue(extraction: NonNullable<Detail['extraction']>, field: string): string {
  const direct = extraction[field]
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct)

  const indexed = /^line_items(?:\[(\d+)\]|\.(\d+))\.(description|quantity|unit_price|amount)$/.exec(field)
  const column = indexed?.[3] || field
  if (!['description', 'quantity', 'unit_price', 'amount'].includes(column)) return '—'
  const index = indexed ? Number(indexed[1] ?? indexed[2]) : extraction.line_items.length === 1 ? 0 : null
  if (index === null) return 'See line-item table'
  const line = extraction.line_items[index]
  return String(line?.[column as keyof typeof line] ?? '—')
}
