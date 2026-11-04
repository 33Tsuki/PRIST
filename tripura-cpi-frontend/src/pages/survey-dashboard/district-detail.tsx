import { useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community'
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Store } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataGrid } from '@/components/wrappers/data-grid'
import { Kpi, KpiGroup } from '@/components/survey/dashboard/stats'
import { MarketFiltersBar } from '@/components/survey/dashboard/market-filters'
import { Meter } from '@/components/survey/rounds/meter'
import { useSurveyRounds } from '@/hooks/use-survey-rounds'
import { useRoundMarkets } from '@/hooks/use-market-setup'
// import { usePendingItems } from '@/hooks/use-pending-items'
import {
  MARKET_STATUS_META,
  applyMarketFilters,
  filterOptions,
  marketPct,
  roundTotals,
  type MarketFilters,
} from '@/lib/survey-progress'
import type { MarketSurveyStatus, RoundMarketSummaryOut } from '@/types'

// ---------- market grid ----------

/** Progress cell: bar + collected/total + percentage, so a market's standing is legible
 *  without opening it. */
function ProgressCell(params: ICellRendererParams<RoundMarketSummaryOut>) {
  const m = params.data
  if (!m) return null
  const pct = marketPct(m)
  return (
    <div className="flex h-full items-center gap-2">
      <div className="bg-muted h-1.5 w-16 shrink-0 overflow-hidden rounded-full">
        <span className="bg-foreground block h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-muted-foreground tabular-nums">
        {m.collected_count}/{m.total_count}
      </span>
      <span className="font-semibold tabular-nums">{pct}%</span>
    </div>
  )
}

// Module-level constant: AG Grid rebuilds its columns whenever a new columnDefs array
// arrives, which would reset the layout that `persistKey` remembers.
const marketColumnDefs: ColDef<RoundMarketSummaryOut>[] = [
  { field: 'market_code', headerName: 'Code', minWidth: 110, flex: 0 },
  { field: 'selected_market', headerName: 'Market', minWidth: 180 },
  { field: 'subdivision', headerName: 'Subdivision', minWidth: 140 },
  { field: 'domain', headerName: 'Domain', minWidth: 150 },
  {
    colId: 'progress',
    headerName: 'Progress',
    minWidth: 210,
    // Sort/filter on the numeric percentage rather than the rendered markup.
    valueGetter: (params) => (params.data ? marketPct(params.data) : 0),
    cellRenderer: ProgressCell,
  },
  {
    field: 'status',
    headerName: 'Status',
    minWidth: 130,
    flex: 0,
    cellRenderer: (params: ICellRendererParams<RoundMarketSummaryOut>) => {
      const status = params.value as MarketSurveyStatus | undefined
      if (!status) return null
      return (
        <div className="flex h-full items-center">
          <Badge className={MARKET_STATUS_META[status].className}>
            {MARKET_STATUS_META[status].label}
          </Badge>
        </div>
      )
    },
  },
  { field: 'surveyor_name', headerName: 'Surveyor', minWidth: 160 },
  {
    field: 'alert_count',
    headerName: 'Flagged',
    minWidth: 110,
    flex: 0,
    type: 'rightAligned',
    cellRenderer: (params: ICellRendererParams<RoundMarketSummaryOut>) => {
      const n = (params.value as number) ?? 0
      if (n === 0) return <span className="text-muted-foreground">—</span>
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {n}
        </span>
      )
    },
  },
  { field: 'total_count', headerName: 'Expected', minWidth: 110, flex: 0, type: 'rightAligned' },
  {
    field: 'collected_count',
    headerName: 'Collected',
    minWidth: 110,
    flex: 0,
    type: 'rightAligned',
  },
]

const FILTER_KEYS: Record<keyof MarketFilters, string> = {
  domain: 'domain',
  progress: 'progress',
  status: 'status',
  subdivisionId: 'subdivision',
  surveyorId: 'surveyor',
}

export default function DistrictDetailPage() {
  const { roundId: roundIdParam, districtId: districtIdParam } = useParams<{
    roundId: string
    districtId: string
  }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const roundId = roundIdParam ? Number(roundIdParam) : null
  const districtId = districtIdParam ? Number(districtIdParam) : null

  const { data: rounds = [] } = useSurveyRounds()
  // Same cache entry as the overview, so arriving here costs no extra request.
  const { data: allMarkets = [], isLoading } = useRoundMarkets(roundId)
  // const { data: pendingItems = [], isLoading: pendingLoading } = usePendingItems(
  //   roundId,
  //   districtId,
  // )

  const round = useMemo(() => rounds.find((r) => r.round_id === roundId) ?? null, [rounds, roundId])

  const districtMarkets = useMemo(
    () => allMarkets.filter((m) => m.district_id === districtId),
    [allMarkets, districtId],
  )
  const districtName = districtMarkets[0]?.district_name ?? ''

  // Filters live in the URL so a filtered view is shareable and survives reload. Written
  // with a merge-style updater — replacing the whole param set would drop the others.
  const filters = useMemo<MarketFilters>(
    () => ({
      domain: searchParams.get(FILTER_KEYS.domain) ?? '',
      progress: searchParams.get(FILTER_KEYS.progress) ?? '',
      status: searchParams.get(FILTER_KEYS.status) ?? '',
      subdivisionId: searchParams.get(FILTER_KEYS.subdivisionId) ?? '',
      surveyorId: searchParams.get(FILTER_KEYS.surveyorId) ?? '',
    }),
    [searchParams],
  )

  const handleFiltersChange = useCallback(
    (next: MarketFilters) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          for (const key of Object.keys(FILTER_KEYS) as (keyof MarketFilters)[]) {
            const param = FILTER_KEYS[key]
            if (next[key]) params.set(param, next[key])
            else params.delete(param)
          }
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const options = useMemo(() => filterOptions(districtMarkets), [districtMarkets])
  const visibleMarkets = useMemo(
    () => applyMarketFilters(districtMarkets, filters),
    [districtMarkets, filters],
  )

  // Totals reflect the whole district; the rollups follow the active filters so they
  // stay consistent with the market list below them.
  const totals = useMemo(() => roundTotals(districtMarkets), [districtMarkets])

  function handleRowClicked(event: RowClickedEvent<RoundMarketSummaryOut>) {
    if (event.data && roundId) {
      navigate(`/survey-dashboard/${roundId}/markets/${event.data.market_id}`)
    }
  }

  // The round-markets response is already district-scoped for a supervisor, so an id
  // outside their district simply yields nothing. Say so plainly rather than rendering a
  // full page of zeroes, which reads like a data problem.
  const outOfScope = !isLoading && allMarkets.length > 0 && districtMarkets.length === 0

  const backLink = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate(-1)}
        className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Survey Dashboard
      </button>
    </div>
  )

  if (outOfScope) {
    return (
      <div className="space-y-6">
        {backLink}
        <div>
          <h1 className="text-3xl font-bold">District not available</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            This district has no markets in this round, or it is not the district assigned to you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {backLink}

      <div>
        <h1 className="text-3xl font-bold">{districtName || 'District'}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {round ? `Round ${round.round_number}` : 'Round'}
          {round?.round_name ? ` — ${round.round_name}` : ''}. Open a market to review collected
          prices and approve.
        </p>
      </div>

      {/* District headline */}
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <Meter
              icon={<Store className="h-3.5 w-3.5" />}
              label="Markets submitted"
              value={isLoading ? '—' : `${totals.submitted} / ${totals.markets}`}
              sub={isLoading ? undefined : `${totals.submittedPct}%`}
              pct={isLoading ? 0 : totals.submittedPct}
            />
            <Meter
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Items collected"
              value={isLoading ? '—' : `${totals.collectedItems} / ${totals.totalItems}`}
              sub={isLoading ? undefined : `${totals.itemsPct}%`}
              pct={isLoading ? 0 : totals.itemsPct}
              barClassName="bg-green-600"
            />
          </div>
          {/* Same two columns as the meters above, so each cluster sits under the
              meter it belongs to: markets on the left, items on the right. */}
          <div className="grid gap-5 border-t border-dashed pt-4 lg:grid-cols-2">
            <KpiGroup label="Markets">
              <Kpi
                value={totals.markets}
                label="Total"
                marker={<span className="bg-foreground h-2 w-2 rounded-full" />}
              />
              <Kpi
                value={totals.markets - totals.submitted}
                label="Outstanding"
                marker={<Clock className="h-4 w-4 text-amber-500" />}
              />
            </KpiGroup>

            <KpiGroup label="Items">
              <Kpi
                value={totals.uncollectedItems}
                label="Uncollected"
                marker={<span className="h-2 w-2 rounded-full bg-amber-500" />}
              />
              <Kpi
                value={totals.alerts}
                label="Flagged"
                accent={totals.alerts > 0}
                marker={
                  totals.alerts > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  ) : (
                    <span className="bg-muted-foreground/40 h-2 w-2 rounded-full" />
                  )
                }
              />
            </KpiGroup>
          </div>
        </CardContent>
      </Card>

      {/* Markets */}
      <Card>
        <CardHeader>
          <CardTitle>Markets</CardTitle>
          <CardDescription>
            Filter by domain, progress, review status, subdivision or surveyor. Click a market to
            open it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MarketFiltersBar
            value={filters}
            options={options}
            onChange={handleFiltersChange}
            resultLabel={
              visibleMarkets.length === districtMarkets.length
                ? `${districtMarkets.length} markets`
                : `${visibleMarkets.length} of ${districtMarkets.length} markets`
            }
          />
          <DataGrid<RoundMarketSummaryOut>
            persistKey="survey-dashboard:markets"
            rowData={visibleMarkets}
            columnDefs={marketColumnDefs}
            gridOptions={{
              loading: isLoading,
              onRowClicked: handleRowClicked,
              rowClass: 'cursor-pointer',
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
