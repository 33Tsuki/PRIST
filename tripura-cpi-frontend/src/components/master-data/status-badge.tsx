import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BulkRecordStatus } from '@/types'

const statusConfig: Record<BulkRecordStatus, { label: string; className: string }> = {
  created: {
    label: 'Created',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  },
  updated: {
    label: 'Updated',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  unchanged: {
    label: 'Unchanged',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  duplicate: {
    label: 'Duplicate',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  },
  skipped: {
    label: 'Skipped',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  },
}

// A dry run reports what *would* happen, so the labels are phrased as intentions.
// ('created'/'updated' only reach a dry run from an upsert preview.)
const dryRunOverrides: Partial<Record<BulkRecordStatus, { label: string; className: string }>> = {
  skipped: {
    label: 'Ready',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  },
  created: {
    label: 'Create',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  },
  updated: {
    label: 'Update',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
}

export function StatusBadge({
  status,
  isDryRun,
}: {
  status: BulkRecordStatus
  isDryRun?: boolean
}) {
  const config = (isDryRun && dryRunOverrides[status]) || statusConfig[status]

  return (
    <Badge variant="outline" className={cn('border-transparent', config.className)}>
      {config.label}
    </Badge>
  )
}
