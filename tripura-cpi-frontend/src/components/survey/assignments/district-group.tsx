import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardGroup } from '@/lib/assignment-board'

interface DistrictGroupProps {
  group: BoardGroup
  /** How many of the district's markets survive the current filters. */
  shown: number
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

export function DistrictGroup({ group, shown, collapsed, onToggle, children }: DistrictGroupProps) {
  const filtered = shown !== group.total

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="bg-muted hover:bg-muted/70 sticky top-0 z-10 flex h-11 w-full items-center gap-2.5 border-b px-4 text-left transition-colors"
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground size-3.5 flex-none transition-transform',
            !collapsed && 'rotate-90',
          )}
        />
        <span className="text-sm font-semibold">{group.districtName}</span>
        <span className="text-muted-foreground text-[13px] tabular-nums">
          {filtered ? `${shown} of ${group.total} markets` : `${group.total} markets`}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
            group.unassigned
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
          )}
        >
          {group.unassigned ? `${group.unassigned} unassigned` : 'All assigned'}
        </span>
      </button>
      {!collapsed && children}
    </div>
  )
}
