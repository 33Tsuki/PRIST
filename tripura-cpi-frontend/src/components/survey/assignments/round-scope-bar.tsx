import { CopyCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CoverageMeter } from './coverage-meter'
import type { BoardTotals } from '@/lib/assignment-board'
import type { SurveyRoundOut } from '@/types'

interface RoundScopeBarProps {
  rounds: SurveyRoundOut[]
  selectedRoundId: string
  onRoundChange: (roundId: string) => void
  selectedRound: SurveyRoundOut | null
  roundClosed: boolean
  totals: BoardTotals
  surveyorCount: number
  onRollover: () => void
  rolloverDisabled: boolean
}

/** The "working in round" strip: round picker, open/closed state, coverage, rollover. */
export function RoundScopeBar({
  rounds,
  selectedRoundId,
  onRoundChange,
  selectedRound,
  roundClosed,
  totals,
  surveyorCount,
  onRollover,
  rolloverDisabled,
}: RoundScopeBarProps) {
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          Working in round
        </span>
        <div className="flex items-center gap-2.5">
          <Select value={selectedRoundId} onValueChange={onRoundChange}>
            <SelectTrigger className="bg-background w-52">
              <SelectValue placeholder="Select round" />
            </SelectTrigger>
            <SelectContent>
              {rounds.map((round) => (
                <SelectItem key={round.round_id} value={String(round.round_id)}>
                  Round {round.round_number}
                  {round.round_name ? ` — ${round.round_name}` : ''}
                  {round.round_status === 'CLOSED' ? '  (closed)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedRound &&
            (roundClosed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <Lock className="size-3.5" />
                Closed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Open
              </span>
            ))}
        </div>
      </div>

      <div className="bg-border hidden w-px self-stretch sm:block" />

      <CoverageMeter totals={totals} surveyorCount={surveyorCount} />

      <Button
        variant="outline"
        size="sm"
        className="bg-background"
        disabled={rolloverDisabled}
        onClick={onRollover}
      >
        <CopyCheck className="size-3.5" />
        Rollover
      </Button>
    </div>
  )
}
