import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MeterProps {
  icon?: ReactNode
  label: string
  value: string
  sub?: string
  pct: number
  barClassName?: string
}

/** Labelled progress meter. shadcn has no `progress` primitive here, so this is a
 *  thin Tailwind bar matching the prototype. */
export function Meter({ icon, label, value, sub, pct, barClassName }: MeterProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          {icon}
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {value} {sub && <span className="text-muted-foreground font-normal">{sub}</span>}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <span
          className={cn(
            'bg-foreground block h-full rounded-full transition-[width] duration-500',
            barClassName,
          )}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
    </div>
  )
}
