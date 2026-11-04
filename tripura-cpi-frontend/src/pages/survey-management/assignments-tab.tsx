import { useMemo, useState } from 'react'
import { AssignmentFiltersBar } from '@/components/survey/assignments/assignment-filters'
import { DistrictGroup } from '@/components/survey/assignments/district-group'
import { MarketRow, type SurveyorPickerOption } from '@/components/survey/assignments/market-row'
import { RoundScopeBar } from '@/components/survey/assignments/round-scope-bar'
import { RolloverDialog } from '@/components/survey/rollover-dialog'
import { RoundLockBanner } from '@/components/survey/round-lock-banner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  BOARD_GRID,
  EMPTY_ASSIGNMENT_FILTERS,
  buildBoard,
  hasActiveFilters,
  isNarrowing,
  matchesFilters,
  type AssignmentFilters,
  type BoardRow,
  type MarketOption,
  type SurveyorOption,
} from '@/lib/assignment-board'
import {
  useCreateAssignment,
  useDeleteAssignment,
  useMarketsLookup,
  useRoundAssignments,
  useSurveyors,
  useUpdateAssignment,
} from '@/hooks/use-assignment-management'
import { useAuth } from '@/hooks/use-auth'
import { useDistricts } from '@/hooks/use-districts'
import { useMyMarkets, useMyPriceCollectors } from '@/hooks/use-my-district'
import { useRoundSelection } from '@/hooks/use-round-selection'

/**
 * Market-centric assignment board: every market in scope is a row under its district, so
 * coverage gaps are visible and assigning happens inline instead of through a separate form.
 */
export function AssignmentsTab() {
  const { user } = useAuth()
  const isSupervisor = user?.role === 'DISTRICT_SUPERVISOR'

  const { rounds, currentRound, roundId, selectedRoundId, selectedRound, setSelectedRoundId } =
    useRoundSelection()

  // Admins use the global lookups; supervisors use the district-scoped /auth/my/* lists.
  const surveyorsQuery = useSurveyors(!isSupervisor)
  const marketsQuery = useMarketsLookup(!isSupervisor)
  const myPCsQuery = useMyPriceCollectors(isSupervisor)
  const myMarketsQuery = useMyMarkets(isSupervisor)
  const { data: districts = [] } = useDistricts(!isSupervisor)
  const assignmentsQuery = useRoundAssignments(roundId)

  const createAssignment = useCreateAssignment()
  const updateAssignment = useUpdateAssignment()
  const deleteAssignment = useDeleteAssignment()

  const [filters, setFilters] = useState<AssignmentFilters>(EMPTY_ASSIGNMENT_FILTERS)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [openRowMarketId, setOpenRowMarketId] = useState<number | null>(null)
  const [rolloverOpen, setRolloverOpen] = useState(false)

  const surveyors = useMemo<SurveyorOption[]>(
    () =>
      isSupervisor
        ? (myPCsQuery.data ?? []).map((u) => ({
            surveyor_id: u.user_id,
            full_name: u.full_name,
            username: u.username,
            is_active: u.is_active,
            district_id: u.district_id,
          }))
        : (surveyorsQuery.data ?? []).map((s) => ({
            surveyor_id: s.surveyor_id,
            full_name: s.full_name,
            username: s.username,
            is_active: s.is_active,
            district_id: s.district_id,
          })),
    [isSupervisor, myPCsQuery.data, surveyorsQuery.data],
  )

  const markets = useMemo<MarketOption[]>(
    () =>
      isSupervisor
        ? // The supervisor market list carries no district_id — the caller's own district is it.
          (myMarketsQuery.data ?? []).map((m) => ({
            market_id: m.market_id,
            market_name: m.market_name,
            market_code: m.market_code,
            district_id: user?.district_id ?? null,
            district_name: m.district_name,
          }))
        : (marketsQuery.data ?? []).map((m) => ({
            market_id: m.market_id,
            market_name: m.market_name,
            market_code: m.market_code,
            district_id: m.district_id,
            district_name: m.district_name,
          })),
    [isSupervisor, myMarketsQuery.data, marketsQuery.data, user?.district_id],
  )

  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data])

  // A closed round is a historical record: the backend rejects changes with 409, so every
  // mutating control is disabled and only reading is left.
  const roundClosed = selectedRound?.round_status === 'CLOSED'
  const roundLabel = selectedRound
    ? `Round ${selectedRound.round_number}${selectedRound.round_name ? ` — ${selectedRound.round_name}` : ''}`
    : ''
  // Only the round that is actually running is worth flagging: a surveyor who left after a
  // closed round finished is not a problem anyone can act on.
  const isCurrentRound = currentRound !== null && selectedRoundId === String(currentRound.round_id)

  const { groups, totals } = useMemo(
    () => buildBoard({ markets, surveyors, assignments, flagInactive: isCurrentRound }),
    [markets, surveyors, assignments, isCurrentRound],
  )

  const loadBySurveyor = useMemo(() => {
    const map = new Map<number, number>()
    for (const a of assignments) map.set(a.surveyor_id, (map.get(a.surveyor_id) ?? 0) + 1)
    return map
  }, [assignments])

  // The backend rejects a cross-district pair with 422, so a row only ever offers the
  // surveyors of its own district. Active surveyors sort first.
  const optionsByDistrict = useMemo(() => {
    const map = new Map<string, SurveyorPickerOption[]>()
    for (const group of groups) {
      const scoped = isSupervisor
        ? surveyors
        : surveyors.filter((s) => s.district_id === group.districtId)
      map.set(
        group.key,
        [...scoped]
          .sort(
            (a, b) =>
              Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name),
          )
          .map((surveyor) => ({ surveyor, load: loadBySurveyor.get(surveyor.surveyor_id) ?? 0 })),
      )
    }
    return map
  }, [groups, surveyors, isSupervisor, loadBySurveyor])

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({ group, rows: group.rows.filter((row) => matchesFilters(row, filters)) }))
        .filter((entry) => entry.rows.length > 0),
    [groups, filters],
  )

  const shownCount = visibleGroups.reduce((n, entry) => n + entry.rows.length, 0)
  const lastGroupKey = visibleGroups[visibleGroups.length - 1]?.group.key

  // While anything other than the district picker is narrowing the board, groups are forced
  // open so a match can't hide inside a collapsed district.
  const narrowing = isNarrowing(filters)
  const anyExpanded = groups.some((group) => !collapsed[group.key])

  const surveyorFilterOptions = useMemo(
    () => [...surveyors].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [surveyors],
  )

  const isBoardLoading =
    assignmentsQuery.isLoading ||
    marketsQuery.isLoading ||
    myMarketsQuery.isLoading ||
    surveyorsQuery.isLoading ||
    myPCsQuery.isLoading

  function updateFilters(next: AssignmentFilters) {
    setFilters(next)
    setOpenRowMarketId(null)
  }

  function toggleGroup(key: string) {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }))
    setOpenRowMarketId(null)
  }

  function toggleAllGroups() {
    const next: Record<string, boolean> = {}
    for (const group of groups) next[group.key] = anyExpanded
    setCollapsed(next)
    setOpenRowMarketId(null)
  }

  function handleAssign(row: BoardRow, surveyorId: number) {
    if (!roundId) return
    if (row.assignment) {
      if (row.assignment.surveyor_id !== surveyorId) {
        updateAssignment.mutate({
          assignment_id: row.assignment.surveyor_assignment_id,
          body: { surveyor_id: surveyorId },
        })
      }
    } else {
      createAssignment.mutate({
        surveyor_id: surveyorId,
        round_id: roundId,
        market_id: row.market.market_id,
      })
    }
    setOpenRowMarketId(null)
  }

  function handleClear(row: BoardRow) {
    if (!row.assignment) return
    deleteAssignment.mutate({
      assignmentId: row.assignment.surveyor_assignment_id,
      roundId: row.assignment.round_id,
    })
  }

  return (
    <div className="space-y-4">
      <RoundScopeBar
        rounds={rounds}
        selectedRoundId={selectedRoundId}
        onRoundChange={(value) => {
          setSelectedRoundId(value)
          updateFilters(EMPTY_ASSIGNMENT_FILTERS)
        }}
        selectedRound={selectedRound}
        roundClosed={roundClosed}
        totals={totals}
        surveyorCount={surveyors.length}
        onRollover={() => setRolloverOpen(true)}
        rolloverDisabled={!roundId || roundClosed}
      />

      {roundId && roundClosed && (
        <RoundLockBanner
          roundLabel={roundLabel}
          message="This round is closed, so assignments can no longer be changed. You can still view them."
        />
      )}

      {!roundId ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Select a round to manage assignments.
        </p>
      ) : isBoardLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <AssignmentFiltersBar
            value={filters}
            onChange={updateFilters}
            districts={districts}
            surveyors={surveyorFilterOptions}
            counts={{ all: totals.total, unassigned: totals.unassigned, inactive: totals.inactive }}
            resultLabel={
              shownCount === totals.total
                ? `${totals.total} markets`
                : `${shownCount} of ${totals.total} markets`
            }
            allCollapsed={!narrowing && !anyExpanded}
            onToggleAll={toggleAllGroups}
            showDistrict={!isSupervisor}
            disabled={narrowing}
          />

          <div className="bg-card rounded-xl border shadow-sm">
            <div
              className={cn(
                BOARD_GRID,
                'bg-muted/40 text-muted-foreground rounded-t-xl border-b py-2.5 text-[11px] font-bold tracking-wide uppercase',
              )}
            >
              <span>Market</span>
              <span>Surveyor</span>
              <span />
            </div>

            {visibleGroups.map(({ group, rows }) => (
              <DistrictGroup
                key={group.key}
                group={group}
                shown={rows.length}
                collapsed={!narrowing && Boolean(collapsed[group.key])}
                onToggle={() => toggleGroup(group.key)}
              >
                {rows.map((row, index) => (
                  <MarketRow
                    key={row.market.market_id}
                    row={row}
                    districtName={group.districtName}
                    options={optionsByDistrict.get(group.key) ?? []}
                    isOpen={openRowMarketId === row.market.market_id}
                    onOpenChange={(open) => setOpenRowMarketId(open ? row.market.market_id : null)}
                    onAssign={(surveyorId) => handleAssign(row, surveyorId)}
                    onClear={() => handleClear(row)}
                    disabled={roundClosed}
                    isLast={group.key === lastGroupKey && index === rows.length - 1}
                  />
                ))}
              </DistrictGroup>
            ))}

            {!visibleGroups.length && (
              <div className="flex flex-col items-center gap-1 px-6 py-20 text-center">
                <span className="text-sm font-semibold">
                  {hasActiveFilters(filters)
                    ? 'Nothing matches these filters'
                    : 'No markets in this round'}
                </span>
                {hasActiveFilters(filters) && (
                  <Button
                    variant="link"
                    className="text-muted-foreground h-auto p-0 text-[13px]"
                    onClick={() => updateFilters(EMPTY_ASSIGNMENT_FILTERS)}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {roundId && (
        <RolloverDialog
          open={rolloverOpen}
          onOpenChange={setRolloverOpen}
          roundId={roundId}
          rounds={rounds}
        />
      )}
    </div>
  )
}
