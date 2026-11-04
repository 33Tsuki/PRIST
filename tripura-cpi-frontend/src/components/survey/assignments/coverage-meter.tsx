import type { BoardTotals } from '@/lib/assignment-board'

interface CoverageMeterProps {
  totals: BoardTotals
  surveyorCount: number
}

/** Coverage headline plus a two-segment bar: covered-and-active, then covered-but-inactive. */
export function CoverageMeter({ totals, surveyorCount }: CoverageMeterProps) {
  const { total, assigned, unassigned, inactive } = totals
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-sm font-semibold tabular-nums">
          {assigned} of {total} market{total === 1 ? '' : 's'} covered
        </span>
        <span className="text-muted-foreground text-[13px] tabular-nums">
          {unassigned} unassigned · {inactive} inactive · {surveyorCount} surveyor
          {surveyorCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="bg-muted flex h-2 overflow-hidden rounded-full">
        <span
          className="bg-foreground block h-full"
          style={{ width: `${pct(assigned - inactive)}%` }}
        />
        <span className="block h-full bg-amber-500" style={{ width: `${pct(inactive)}%` }} />
      </div>
    </div>
  )
}
