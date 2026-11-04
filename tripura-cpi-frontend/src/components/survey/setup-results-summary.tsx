import {
  AlertTriangle,
  CheckCircle,
  CircleCheckBig,
  Copy,
  FileText,
  Pencil,
  Plus,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { SetupUploadMode } from '@/types'

interface SetupResultsCounts {
  total: number
  created: number
  updated: number
  unchanged: number
  duplicates: number
  errors: number
}

interface Stat {
  label: string
  value: number
  icon: typeof FileText
  color: string
}

/**
 * The counts that make a setup upload legible, which differ by mode:
 *
 * - `upsert` reports what the diff found — the `Unchanged` count is what makes a
 *   400-row re-upload readable, since most rows need no attention.
 * - `create` has no notion of a change, and its dry run stops before any write, so
 *   there is nothing to report as created yet: the valid rows are labelled `Ready`
 *   rather than shown as `Created: 0`.
 */
export function SetupResultsSummary({
  data,
  mode,
  isDryRun,
}: {
  data: SetupResultsCounts
  mode: SetupUploadMode
  isDryRun: boolean
}) {
  const total: Stat = {
    label: 'Total Rows',
    value: data.total,
    icon: FileText,
    color: 'text-blue-600',
  }
  const errors: Stat = {
    label: isDryRun ? 'Errors' : 'Skipped (errors)',
    value: data.errors,
    icon: AlertTriangle,
    color: isDryRun ? 'text-red-600' : 'text-amber-600',
  }

  const stats: Stat[] =
    mode === 'upsert'
      ? [
          total,
          {
            label: isDryRun ? 'To Create' : 'Created',
            value: data.created,
            icon: Plus,
            color: 'text-emerald-600',
          },
          {
            label: isDryRun ? 'To Update' : 'Updated',
            value: data.updated,
            icon: Pencil,
            color: 'text-blue-600',
          },
          {
            label: 'Unchanged',
            value: data.unchanged,
            icon: CircleCheckBig,
            color: 'text-muted-foreground',
          },
          errors,
        ]
      : [
          total,
          isDryRun
            ? {
                label: 'Ready',
                value: Math.max(data.total - data.errors, 0),
                icon: CheckCircle,
                color: 'text-emerald-600',
              }
            : {
                label: 'Created',
                value: data.created,
                icon: CheckCircle,
                color: 'text-emerald-600',
              },
          {
            label: 'Duplicates',
            value: data.duplicates,
            icon: Copy,
            color: 'text-amber-600',
          },
          errors,
        ]

  return (
    <div className={mode === 'upsert' ? 'grid grid-cols-5 gap-3' : 'grid grid-cols-4 gap-3'}>
      {stats.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="py-3">
          <CardContent className="flex items-center gap-2 px-3">
            <Icon className={`size-4 shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-xs">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
