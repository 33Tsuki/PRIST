import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RoundStatus } from '@/types'

const CONFIG: Record<RoundStatus, { label: string; className: string; dot: string }> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  ACTIVE: {
    label: 'Running',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  CLOSED: {
    label: 'Ended',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    dot: 'bg-gray-400',
  },
}

export function RoundStatusBadge({ status }: { status: RoundStatus }) {
  const config = CONFIG[status]
  return (
    <Badge variant="outline" className={cn('border-transparent', config.className)}>
      {status === 'ACTIVE' ? (
        <LiveDot />
      ) : (
        <span className={cn('size-1.5 rounded-full', config.dot)} />
      )}
      {config.label}
    </Badge>
  )
}

/** A small emerald dot with a pulsing halo, marking a live/running round. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  )
}
