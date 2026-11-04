import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Rollup } from '@/lib/survey-progress'

interface RollupTableProps {
  title: string
  description?: string
  /** Header for the grouping column, e.g. "District" / "Subdivision" / "Surveyor". */
  groupLabel: string
  rows: Rollup[]
  /** When provided, rows become clickable. */
  onRowClick?: (row: Rollup) => void
  emptyMessage?: string
}

/**
 * Compact progress rollup. Deliberately a plain table rather than a DataGrid: these are
 * 3-10 aggregate rows that exist to be read and drilled into, so grid chrome (search,
 * pagination, column persistence) would be noise.
 */
export function RollupTable({
  title,
  description,
  groupLabel,
  rows,
  onRowClick,
  emptyMessage = 'Nothing to show yet.',
}: RollupTableProps) {
  const clickable = !!onRowClick

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs font-semibold tracking-wide uppercase">
                  <th className="py-2 pr-4 font-semibold">{groupLabel}</th>
                  <th className="py-2 pr-4 text-right font-semibold">Markets</th>
                  <th className="py-2 pr-4 text-right font-semibold">Submitted</th>
                  <th className="py-2 pr-4 font-semibold">Items collected</th>
                  <th
                    className="py-2 pr-4 text-right font-semibold"
                    title="Items expected but not yet collected. This can differ from the pending list on a market's page."
                  >
                    Uncollected
                  </th>
                  <th className="py-2 pr-4 text-right font-semibold">Flagged</th>
                  {clickable && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn(
                      'border-b last:border-0',
                      clickable && 'hover:bg-muted/50 cursor-pointer',
                    )}
                  >
                    <td className="py-2.5 pr-4 font-medium">{r.label}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{r.markets}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {r.submitted}/{r.markets}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
                          <span
                            className="bg-foreground block h-full rounded-full"
                            style={{ width: `${r.itemsPct}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground tabular-nums">
                          {r.collectedItems}/{r.totalItems}
                        </span>
                        <span className="font-semibold tabular-nums">{r.itemsPct}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {r.uncollectedItems > 0 ? (
                        <span className="font-semibold text-amber-600">{r.uncollectedItems}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {r.alerts > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {r.alerts}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {clickable && (
                      <td className="py-2.5">
                        <ChevronRight className="text-muted-foreground h-4 w-4" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
