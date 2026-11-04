import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '@/components/master-data/status-badge'
import { cn } from '@/lib/utils'
import type { BulkRecordResult } from '@/types'

/** DB column names as they appear in the sheet the user edited. */
const FIELD_LABELS: Record<string, string> = {
  shop_name: 'Shop Name',
  shop_description_and_location: 'Shop Description',
  unit_of_sale: 'Unit of Sale',
  product_specification: 'Product Spec',
  market_item_description: 'Local Name',
  shop_selection_status: 'Shop Selection',
}

interface FieldChange {
  label: string
  before: string
  after: string
}

const BLANK = '(blank)'

/**
 * The backend sends each change as `field: 'old' -> 'new'` (with `(blank)` for an
 * empty value). Splitting it back apart is what lets the UI show before → after, so
 * a wrong bulk find-and-replace is caught before it lands. Anything that doesn't
 * match that shape is shown verbatim rather than dropped.
 */
function parseChange(change: string): FieldChange {
  // Both values are quoted (or the literal `(blank)`), so requiring the quotes keeps a
  // value that itself contains " -> " from being split in the wrong place.
  const match = /^(\w+): (\(blank\)|'[\s\S]*?') -> (\(blank\)|'[\s\S]*')$/.exec(change)
  if (!match) return { label: change, before: '', after: '' }
  const [, field, before, after] = match
  const unquote = (value: string) => (value === BLANK ? BLANK : value.slice(1, -1))
  return {
    label: FIELD_LABELS[field] ?? field,
    before: unquote(before),
    after: unquote(after),
  }
}

function ChangeDiff({ changes }: { changes: FieldChange[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr_auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
      {changes.map((change) => (
        <Fragment key={change.label}>
          <span className="text-muted-foreground">{change.label}</span>
          <span className="justify-self-start rounded bg-red-100 px-2 py-0.5 text-red-700 line-through dark:bg-red-900/40 dark:text-red-400">
            {change.before || BLANK}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="justify-self-start rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            {change.after || BLANK}
          </span>
        </Fragment>
      ))}
    </div>
  )
}

export function SetupResultsTable({
  records,
  isDryRun,
}: {
  records: BulkRecordResult[]
  isDryRun?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function toggle(index: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  return (
    <ScrollArea className="h-[320px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Row</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-48">Item</TableHead>
            <TableHead>Changes</TableHead>
            <TableHead className="w-60">Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const changes = (record.changes ?? []).map(parseChange)
            const isOpen = expanded.has(index)
            return (
              <Fragment key={`${record.row}-${record.identifier}-${index}`}>
                <TableRow
                  className={cn(
                    record.status === 'error' && 'bg-red-50/60 dark:bg-red-950/20',
                    changes.length > 0 && 'cursor-pointer',
                  )}
                  onClick={changes.length > 0 ? () => toggle(index) : undefined}
                >
                  <TableCell className="font-mono text-xs">{record.row}</TableCell>
                  <TableCell>
                    <StatusBadge status={record.status} isDryRun={isDryRun} />
                  </TableCell>
                  <TableCell className="font-medium">{record.identifier}</TableCell>
                  <TableCell>
                    {changes.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <ChevronRight
                          className={cn(
                            'text-muted-foreground size-3.5 shrink-0 transition-transform',
                            isOpen && 'rotate-90',
                          )}
                        />
                        {changes.map((change) => (
                          <span
                            key={change.label}
                            className="rounded-full border px-2 py-0.5 text-xs"
                          >
                            {change.label}
                          </span>
                        ))}
                      </span>
                    ) : record.status === 'created' ? (
                      <span className="text-muted-foreground text-sm">New setup</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-60 text-sm">
                    {record.status === 'error' && record.detail ? (
                      <span className="text-red-700 dark:text-red-400">{record.detail}</span>
                    ) : record.warning ? (
                      <span className="text-amber-700 dark:text-amber-500">{record.warning}</span>
                    ) : (
                      <span className="text-muted-foreground">{record.detail || '—'}</span>
                    )}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell />
                    <TableCell colSpan={4} className="py-3">
                      <ChangeDiff changes={changes} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
