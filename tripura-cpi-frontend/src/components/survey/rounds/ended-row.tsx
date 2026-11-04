import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SurveyRoundOut } from '@/types'
import { RoundStatusBadge } from './round-status-badge'
import { REGISTER_GRID, formatWindow, roundLabel } from './utils'
import { cn } from '@/lib/utils'

interface EndedRowProps {
  round: SurveyRoundOut
  onView: (round: SurveyRoundOut) => void
}

export function EndedRow({ round, onView }: EndedRowProps) {
  return (
    <div className={cn(REGISTER_GRID, 'border-b py-3 last:border-b-0')}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-semibold">{roundLabel(round)}</span>
        <span className="text-muted-foreground font-mono text-[11px]">
          Round {round.round_number}
        </span>
      </div>
      <span className="text-muted-foreground text-sm tabular-nums">{formatWindow(round)}</span>
      <RoundStatusBadge status="CLOSED" />
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
        <Check className="size-3.5" /> Complete
      </span>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onView(round)}>
          View report
        </Button>
      </div>
    </div>
  )
}
