import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BulkDeleteRecordStatus } from '@/types'

const statusConfig: Record<BulkDeleteRecordStatus, { label: string; className: string }> = {
  deleted: {
    label: 'Deleted',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  },
  not_found: {
    label: 'Not Found',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  },
}

export function DeleteStatusBadge({ status }: { status: BulkDeleteRecordStatus }) {
  const config = statusConfig[status]

  return (
    <Badge variant="outline" className={cn('border-transparent', config.className)}>
      {config.label}
    </Badge>
  )
}
