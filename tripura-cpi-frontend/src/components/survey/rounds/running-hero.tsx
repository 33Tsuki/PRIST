import { Calendar, Clock, Flag, Pencil, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RoundMarketSummaryOut, SurveyRoundOut } from '@/types'
import { RoundStatusBadge, LiveDot } from './round-status-badge'
import { Meter } from './meter'
import { daysInfo, formatWindow, marketsInfo, roundLabel } from './utils'

interface RunningHeroProps {
  round: SurveyRoundOut
  markets: RoundMarketSummaryOut[]
  marketsLoading: boolean
  canManage: boolean
  onEdit: () => void
  onEnd: () => void
}

export function RunningHero({
  round,
  markets,
  marketsLoading,
  canManage,
  onEdit,
  onEnd,
}: RunningHeroProps) {
  const days = daysInfo(round)
  const mk = marketsInfo(markets)
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
              <LiveDot />
              In the field now · Monthly · Round {round.round_number}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold tracking-tight">{roundLabel(round)}</span>
              <RoundStatusBadge status="ACTIVE" />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <Calendar className="size-4" />
              <span className="tabular-nums">{formatWindow(round)}</span>
              <span>· {days.total} days</span>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-none gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil /> Edit window
              </Button>
              <Button variant="destructive" size="sm" onClick={onEnd}>
                <Flag /> End round
              </Button>
            </div>
          )}
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Meter
            icon={<Clock className="size-3.5" />}
            label="Time elapsed"
            value={`Day ${days.elapsed}`}
            sub={`of ${days.total} · ${days.pct}%`}
            pct={days.pct}
          />
          <Meter
            icon={<Store className="size-3.5" />}
            label="Markets submitted"
            value={marketsLoading ? '—' : `${mk.submitted} / ${mk.total}`}
            sub={marketsLoading ? undefined : `${mk.pct}%`}
            pct={marketsLoading ? 0 : mk.pct}
            barClassName="bg-emerald-500"
          />
        </div>
      </div>
    </div>
  )
}
