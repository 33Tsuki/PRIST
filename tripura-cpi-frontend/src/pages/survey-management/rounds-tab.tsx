import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { CreateRoundDialog } from '@/components/survey/create-round-dialog'
import { EditRoundDialog } from '@/components/survey/edit-round-dialog'
import { RunningHero } from '@/components/survey/rounds/running-hero'
import { EmptyHero } from '@/components/survey/rounds/empty-hero'
import { DraftRow } from '@/components/survey/rounds/draft-row'
import { EndedRow } from '@/components/survey/rounds/ended-row'
import { StartRoundDialog } from '@/components/survey/rounds/start-round-dialog'
import { EndRoundDialog } from '@/components/survey/rounds/end-round-dialog'
import { REGISTER_GRID, roundLabel } from '@/components/survey/rounds/utils'
import {
  useSurveyRounds,
  useStartRound,
  useEndRound,
  useDeleteSurveyRound,
} from '@/hooks/use-survey-rounds'
import { useRoundMarkets } from '@/hooks/use-market-setup'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import type { SurveyRoundOut } from '@/types'

export function RoundsTab() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  // Rounds are managed by admins only (create/start/end/edit/delete); the backend
  // re-validates with require_admin. Supervisors see the register read-only.
  const canManage = can('update', 'Round')

  const { data: rounds = [], isLoading } = useSurveyRounds()

  const running = useMemo(() => rounds.find((r) => r.round_status === 'ACTIVE') ?? null, [rounds])
  const drafts = useMemo(
    () =>
      rounds
        .filter((r) => r.round_status === 'DRAFT')
        .sort((a, b) => a.round_start_date.localeCompare(b.round_start_date)),
    [rounds],
  )
  const ended = useMemo(
    () =>
      rounds
        .filter((r) => r.round_status === 'CLOSED')
        .sort((a, b) => b.round_start_date.localeCompare(a.round_start_date)),
    [rounds],
  )

  // Group ended rounds by year (ended is already sorted desc, so insertion order
  // yields years newest-first). The most recent year shows by default; older years
  // collapse behind a toggle.
  const endedByYear = useMemo(() => {
    const map = new Map<string, SurveyRoundOut[]>()
    for (const r of ended) {
      const year = r.round_start_date.slice(0, 4)
      const list = map.get(year)
      if (list) list.push(r)
      else map.set(year, [r])
    }
    return [...map.entries()]
  }, [ended])
  const olderYears = endedByYear.slice(1)
  const olderCount = olderYears.reduce((n, [, list]) => n + list.length, 0)

  const { data: runningMarkets = [], isLoading: marketsLoading } = useRoundMarkets(
    running?.round_id ?? null,
  )

  const startMutation = useStartRound()
  const endMutation = useEndRound()
  const deleteMutation = useDeleteSurveyRound()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingRound, setEditingRound] = useState<SurveyRoundOut | null>(null)
  const [startingRound, setStartingRound] = useState<SurveyRoundOut | null>(null)
  const [endingRound, setEndingRound] = useState<SurveyRoundOut | null>(null)
  const [deletingRound, setDeletingRound] = useState<SurveyRoundOut | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  function handleConfirmStart(round: SurveyRoundOut) {
    startMutation.mutate(round.round_id, { onSuccess: () => setStartingRound(null) })
  }
  // From the "start while another is running" guard → end the running one first.
  function handleEndRunningFirst(round: SurveyRoundOut) {
    setStartingRound(null)
    setEndingRound(round)
  }
  function handleConfirmEnd(round: SurveyRoundOut) {
    endMutation.mutate(round.round_id, { onSuccess: () => setEndingRound(null) })
  }
  function handleViewReport(round: SurveyRoundOut) {
    navigate(`/survey-dashboard?round=${round.round_id}`)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {running ? (
        <RunningHero
          round={running}
          markets={runningMarkets}
          marketsLoading={marketsLoading}
          canManage={canManage}
          onEdit={() => setEditingRound(running)}
          onEnd={() => setEndingRound(running)}
        />
      ) : (
        <EmptyHero
          draft={drafts[0] ?? null}
          canManage={canManage}
          onStartDraft={(r) => setStartingRound(r)}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-bold">
          Monthly rounds{' '}
          <span className="text-muted-foreground font-medium">· {rounds.length}</span>
        </h3>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Round
          </Button>
        )}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className={cn(
                REGISTER_GRID,
                'bg-muted/40 text-muted-foreground border-b py-2.5 text-[11px] font-bold tracking-wide uppercase',
              )}
            >
              <span>Period</span>
              <span>Window</span>
              <span>Status</span>
              <span>Progress</span>
              <span className="text-right">Action</span>
            </div>

            {drafts.length > 0 && <SectionLabel>In preparation · {drafts.length}</SectionLabel>}
            {drafts.map((round) => (
              <DraftRow
                key={round.round_id}
                round={round}
                canManage={canManage}
                onStart={(r) => setStartingRound(r)}
                onEdit={(r) => setEditingRound(r)}
                onDelete={(r) => setDeletingRound(r)}
              />
            ))}

            {endedByYear.slice(0, 1).map(([year, list]) => (
              <YearGroup key={year} year={year} rounds={list} onView={handleViewReport} />
            ))}

            {showHistory &&
              olderYears.map(([year, list]) => (
                <YearGroup key={year} year={year} rounds={list} onView={handleViewReport} />
              ))}

            {olderCount > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="bg-muted/30 hover:bg-muted/60 text-muted-foreground flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors"
              >
                <ChevronRight
                  className={cn('size-4 transition-transform', showHistory && 'rotate-90')}
                />
                {showHistory ? 'Hide' : 'Show'} {olderCount} earlier{' '}
                {olderCount === 1 ? 'round' : 'rounds'}
              </button>
            )}

            {rounds.length === 0 && (
              <div className="text-muted-foreground px-4 py-10 text-center text-sm">
                No rounds yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateRoundDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditRoundDialog round={editingRound} onClose={() => setEditingRound(null)} />
      <StartRoundDialog
        round={startingRound}
        running={running}
        isPending={startMutation.isPending}
        onCancel={() => setStartingRound(null)}
        onConfirm={handleConfirmStart}
        onEndRunning={handleEndRunningFirst}
      />
      <EndRoundDialog
        round={endingRound}
        markets={runningMarkets}
        marketsLoading={marketsLoading}
        isPending={endMutation.isPending}
        onCancel={() => setEndingRound(null)}
        onConfirm={handleConfirmEnd}
      />
      <DeleteConfirmDialog
        open={!!deletingRound}
        onOpenChange={(open) => !open && setDeletingRound(null)}
        onConfirm={() => {
          if (deletingRound) {
            deleteMutation.mutate(deletingRound.round_id, {
              onSuccess: () => setDeletingRound(null),
            })
          }
        }}
        entityLabel="draft round"
        identifier={deletingRound ? roundLabel(deletingRound) : ''}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 text-muted-foreground border-b px-4 py-2 text-[11px] font-bold tracking-wider uppercase">
      {children}
    </div>
  )
}

function YearGroup({
  year,
  rounds,
  onView,
}: {
  year: string
  rounds: SurveyRoundOut[]
  onView: (round: SurveyRoundOut) => void
}) {
  return (
    <>
      <SectionLabel>Completed · {year}</SectionLabel>
      {rounds.map((round) => (
        <EndedRow key={round.round_id} round={round} onView={onView} />
      ))}
    </>
  )
}
