import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ColDef, ICellRendererParams, RowClassParams, RowStyle } from 'ag-grid-community'
import { format } from 'date-fns'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormLabel } from '@/components/ui/form-label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataGrid } from '@/components/wrappers/data-grid'
import { RemarkCell, type RemarkSaveOptions } from '@/components/survey/remark-cell'
import { Kpi, Meta } from '@/components/survey/dashboard/stats'
import { useSurveyRounds } from '@/hooks/use-survey-rounds'
import { useRoundMarkets } from '@/hooks/use-market-setup'
import { useCollectedData } from '@/hooks/use-collected-data'
import { usePermissions } from '@/hooks/use-permissions'
import { useApproveMarket, useUnsubmitMarket } from '@/hooks/use-market-approval'
import { useUpdateSetupRemark } from '@/hooks/use-setup-remark'
import { MARKET_STATUS_META } from '@/lib/survey-progress'
import type { CollectedDataItemOut } from '@/types'

// ---------- helpers ----------

type RowStatus = 'collected' | 'unavailable' | 'not-applicable' | 'pending'

function getRowStatus(data: CollectedDataItemOut): RowStatus {
  if (data.is_not_applicable) return 'not-applicable'
  if (data.is_na) return 'unavailable'
  if (data.current_period_price != null) return 'collected'
  return 'pending'
}

const STATUS_META: Record<
  RowStatus,
  { label: string; variant: 'default' | 'destructive' | 'secondary'; className?: string }
> = {
  collected: { label: 'Collected', variant: 'default' },
  unavailable: { label: 'Unavailable', variant: 'destructive' },
  'not-applicable': {
    label: 'Not Applicable',
    variant: 'secondary',
    className: 'bg-amber-500 text-white',
  },
  pending: { label: 'Pending', variant: 'secondary' },
}

const SUBSTITUTE_STATUSES = new Set(['SUBSTITUTE 1', 'SUBSTITUTE 2'])

const rupee = (value: number) => `₹${Number(value).toFixed(2)}`

// Soft amber tint for flagged rows. Translucent so it reads on light + dark grids.
const FLAGGED_ROW_STYLE: RowStyle = { background: 'rgba(245, 158, 11, 0.12)' }

function getRowStyle(params: RowClassParams<CollectedDataItemOut>): RowStyle | undefined {
  return params.data?.price_alert ? FLAGGED_ROW_STYLE : undefined
}

// ---------- column definitions ----------

const SELECTION_LABEL: Record<string, string> = {
  'ORIGINALLY SELECTED': 'Original',
  'SUBSTITUTE 1': 'Sub 1',
  'SUBSTITUTE 2': 'Sub 2',
}

/**
 * Everything the DS Remark cell needs, delivered by context rather than closed over in the
 * colDef. columnDefs must stay referentially stable: AG Grid rebuilds its columns whenever a
 * new columnDefs array arrives, which resets the column order and re-applies defaultColDef's
 * flex — wiping the layout that `persistKey` is meant to remember.
 */
interface DsRemarkContextValue {
  readOnly: boolean
  isSaving: boolean
  hint?: string
  save: (setupId: number, remark: string, opts: RemarkSaveOptions) => void
}

const DsRemarkContext = createContext<DsRemarkContextValue>({
  readOnly: true,
  isSaving: false,
  save: () => {},
})

function DsRemarkCell(params: ICellRendererParams<CollectedDataItemOut>) {
  const { readOnly, isSaving, hint, save } = useContext(DsRemarkContext)
  const row = params.data
  if (!row) return null
  return (
    <RemarkCell
      value={row.ds_remark}
      readOnly={readOnly}
      isSaving={isSaving}
      hint={hint}
      onSave={(remark, opts) => save(row.setup_id, remark, opts)}
    />
  )
}

const columnDefs: ColDef<CollectedDataItemOut>[] = [
  { field: 'market_item_description', headerName: 'Local Name', minWidth: 160 },
  { field: 'product_specification', headerName: 'Specification', minWidth: 200 },
  {
    field: 'ds_remark',
    headerName: 'DS Remark',
    minWidth: 170,
    // Keep field: 'ds_remark' so search/sort/filter still work on the note text.
    cellRenderer: DsRemarkCell,
  },
  {
    field: 'previous_period_price',
    headerName: 'Previous Price (₹)',
    minWidth: 150,
    flex: 0,
    type: 'rightAligned',
    valueFormatter: ({ value }) => (value != null ? rupee(value) : '—'),
  },
  {
    field: 'current_period_price',
    headerName: 'Current Price (₹)',
    minWidth: 140,
    flex: 0,
    type: 'rightAligned',
    valueFormatter: ({ value }) => (value != null ? rupee(value) : '—'),
  },
  {
    // Merged change column: rupee delta + percentage + direction, in one cell.
    field: 'price_change',
    headerName: 'Change',
    minWidth: 160,
    flex: 0,
    type: 'rightAligned',
    cellRenderer: (params: ICellRendererParams<CollectedDataItemOut>) => {
      const data = params.data
      const change = data?.price_change
      if (data == null || change == null) return <span className="text-muted-foreground">—</span>
      const pct = data.price_change_percentage
      const sign = change > 0 ? '+' : change < 0 ? '-' : ''
      const color = data.price_alert
        ? 'text-amber-600'
        : change > 0
          ? 'text-blue-600'
          : change < 0
            ? 'text-green-600'
            : 'text-muted-foreground'
      return (
        <span
          className={`inline-flex items-center justify-end gap-1 font-semibold tabular-nums ${color}`}
          title={
            data.price_alert ? 'Price is 50% or more different from the last round' : undefined
          }
        >
          {data.price_alert ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : change > 0 ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : change < 0 ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : null}
          {sign}
          {rupee(Math.abs(change))}
          {pct != null && (
            <span className="text-xs font-medium opacity-80">
              {sign}
              {Math.abs(pct).toFixed(2)}%
            </span>
          )}
        </span>
      )
    },
  },
  {
    colId: 'status',
    headerName: 'Status',
    minWidth: 120,
    flex: 0,
    valueGetter: (params) => (params.data ? getRowStatus(params.data) : null),
    cellRenderer: (params: ICellRendererParams<CollectedDataItemOut>) => {
      const status = params.value as RowStatus | null
      if (!status) return null
      const meta = STATUS_META[status]
      return (
        <div className="flex h-full items-center">
          <Badge variant={meta.variant} className={meta.className}>
            {meta.label}
          </Badge>
        </div>
      )
    },
  },
  { field: 'unit_of_sale', headerName: 'Unit', minWidth: 90, flex: 0 },
  { field: 'item_code', headerName: 'Code', minWidth: 110, flex: 0 },
  { field: 'item_name', headerName: 'Item Name', minWidth: 180, flex: 1 },
  { field: 'shop_name', headerName: 'Shop', minWidth: 170 },
  {
    field: 'shop_selection_status',
    headerName: 'Selection',
    minWidth: 110,
    flex: 0,
    cellRenderer: (params: ICellRendererParams<CollectedDataItemOut>) => {
      const status = params.value as string
      if (!status) return null
      const isSubstitute = SUBSTITUTE_STATUSES.has(status)
      return (
        <div className="flex h-full items-center">
          <Badge variant={isSubstitute ? 'outline' : 'secondary'} className="text-xs">
            {SELECTION_LABEL[status] ?? status}
          </Badge>
        </div>
      )
    },
  },

  { field: 'price_remark', headerName: 'Surveyor Remark', minWidth: 170 },
]

// ---------- component ----------

export default function MarketDetailPage() {
  const { roundId: roundIdParam, marketId: marketIdParam } = useParams<{
    roundId: string
    marketId: string
  }>()
  const navigate = useNavigate()

  const roundId = roundIdParam ? Number(roundIdParam) : null
  const marketId = marketIdParam ? Number(marketIdParam) : null

  const { data: rounds = [] } = useSurveyRounds()
  // Shares the round-markets cache entry with the overview and district pages, so
  // arriving here from a drill-down needs no extra request.
  const { data: markets = [] } = useRoundMarkets(roundId)
  const { data: collectedData, isLoading } = useCollectedData(roundId, marketId)

  const selectedRound = useMemo(
    () => rounds.find((r) => r.round_id === roundId) ?? null,
    [rounds, roundId],
  )
  const selectedMarket = useMemo(
    () => markets.find((m) => m.market_id === marketId) ?? null,
    [markets, marketId],
  )

  const summary = collectedData?.summary ?? null
  const items = useMemo(() => collectedData?.items ?? [], [collectedData])

  // Approval workflow (supervisors / admins)
  const { can } = usePermissions()
  const approveMarket = useApproveMarket()
  const unsubmitMarket = useUnsubmitMarket()
  const [approveOpen, setApproveOpen] = useState(false)
  const [unsubmitOpen, setUnsubmitOpen] = useState(false)
  const [unsubmitReason, setUnsubmitReason] = useState('')
  const canApprove = can('approve', 'CollectedData')
  const canUnsubmit = can('unsubmit', 'CollectedData')

  // DS remarks live on the setup row, so they follow the setup rules: editable while the
  // round is open (even after approval), and only within a supervisor's own district.
  const { mutate: saveRemark, isPending: isSavingRemark } = useUpdateSetupRemark(roundId, marketId)
  const canEditRemark =
    selectedRound?.round_status !== 'CLOSED' &&
    can('update', 'Setup', { district_id: selectedMarket?.district_id })

  // A submitted market drops out of the price collector's /sync payload, so a remark added
  // now stays on the dashboard until the market is re-opened.
  const remarkHint = summary?.is_submitted
    ? 'This market has already been submitted. The surveyor will only see this remark after you un-submit it.'
    : undefined

  const save = useCallback(
    (setupId: number, remark: string, opts: RemarkSaveOptions) =>
      saveRemark({ setupId, remark }, opts),
    [saveRemark],
  )
  const dsRemark = useMemo<DsRemarkContextValue>(
    () => ({ readOnly: !canEditRemark, isSaving: isSavingRemark, hint: remarkHint, save }),
    [canEditRemark, isSavingRemark, remarkHint, save],
  )

  function handleApprove() {
    if (!roundId || !marketId) return
    approveMarket.mutate({ roundId, marketId }, { onSuccess: () => setApproveOpen(false) })
  }

  function handleUnsubmit() {
    if (!roundId || !marketId) return
    unsubmitMarket.mutate(
      { roundId, marketId, review_remark: unsubmitReason.trim() || undefined },
      { onSuccess: () => setUnsubmitOpen(false) },
    )
  }

  // Default filter: show originally selected shops + substitutes that have price data
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.shop_selection_status === 'ORIGINALLY SELECTED') return true
      if (SUBSTITUTE_STATUSES.has(item.shop_selection_status)) {
        return item.current_period_price != null
      }
      return false
    })
  }, [items])

  // Summary counts based on originally selected shops only
  const localSummary = useMemo(() => {
    const originals = items.filter((i) => i.shop_selection_status === 'ORIGINALLY SELECTED')
    const totalItems = originals.length
    // Collected: original has price OR is marked N/A (substitute handles it)
    // OR is marked not-applicable (item skipped for this round)
    const collectedCount = originals.filter(
      (i) => i.current_period_price != null || i.is_na || i.is_not_applicable,
    ).length
    const pendingCount = totalItems - collectedCount
    return { totalItems, collectedCount, pendingCount }
  }, [items])

  // Price validation alerts among the visible rows (±50% vs previous period)
  const alertCount = useMemo(
    () => filteredItems.filter((i) => i.price_alert).length,
    [filteredItems],
  )

  const pct =
    localSummary.totalItems > 0
      ? Math.round((localSummary.collectedCount / localSummary.totalItems) * 100)
      : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      </div>

      <div>
        <h1 className="text-3xl font-bold">
          {selectedMarket
            ? `${selectedMarket.selected_market} (${selectedMarket.market_code})`
            : 'Market'}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review collected prices and approve the market survey.
          {selectedRound ? ` Round ${selectedRound.round_number}.` : ''}
        </p>
      </div>

      {summary ? (
        <>
          {/* Review header — progress + KPIs on the left, decision on the right */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="grid lg:grid-cols-[1.25fr_1fr]">
              {/* Left: progress, KPIs, market meta */}
              <div className="space-y-4 p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">
                    <span className="text-2xl font-bold">{localSummary.collectedCount}</span>{' '}
                    <span className="text-muted-foreground">
                      of {localSummary.totalItems} items collected
                    </span>
                  </p>
                  <span className="text-muted-foreground text-sm font-semibold">{pct}%</span>
                </div>

                <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-foreground h-full rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-3">
                  <Kpi
                    value={localSummary.totalItems}
                    label="Total items"
                    marker={<span className="bg-foreground h-2 w-2 rounded-full" />}
                  />
                  <Kpi
                    value={localSummary.collectedCount}
                    label="Collected"
                    marker={<span className="h-2 w-2 rounded-full bg-green-600" />}
                  />
                  <Kpi
                    value={localSummary.pendingCount}
                    label="Pending"
                    marker={<span className="h-2 w-2 rounded-full bg-amber-500" />}
                  />
                  <Kpi
                    value={alertCount}
                    label="Flagged"
                    accent={alertCount > 0}
                    marker={
                      alertCount > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      ) : (
                        <span className="bg-muted-foreground/40 h-2 w-2 rounded-full" />
                      )
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-dashed pt-4">
                  {!summary.is_submitted && summary.surveyor_name && (
                    <Meta label="Surveyor" value={summary.surveyor_name} />
                  )}
                  {summary.submitted_by_name && (
                    <Meta label="Submitted by" value={summary.submitted_by_name} />
                  )}
                  {summary.submitted_at && (
                    <Meta
                      label="Submitted on"
                      value={format(new Date(summary.submitted_at), 'dd MMM yyyy, HH:mm')}
                    />
                  )}
                  {selectedMarket && <Meta label="District" value={selectedMarket.district_name} />}
                  {selectedMarket && (
                    <Meta label="Subdivision" value={selectedMarket.subdivision ?? '—'} />
                  )}
                  {selectedMarket && <Meta label="Domain" value={selectedMarket.domain} />}
                </div>
              </div>

              {/* Right: status + decision */}
              <div className="bg-muted/30 flex flex-col gap-3 border-t p-6 lg:border-t-0 lg:border-l">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Survey status
                  </span>
                  <Badge className={`text-sm ${MARKET_STATUS_META[summary.status].className}`}>
                    {MARKET_STATUS_META[summary.status].label}
                  </Badge>
                </div>

                <p className="text-muted-foreground text-sm leading-relaxed">
                  {summary.status === 'NOT_STARTED' && (
                    <>
                      Collection hasn&apos;t started for this round, so there are no prices for this
                      market yet.
                    </>
                  )}
                  {summary.status === 'INCOMPLETE' && (
                    <>
                      This round has ended and this market&apos;s survey was never submitted, so its
                      prices are incomplete.
                    </>
                  )}
                  {summary.status === 'IN_PROGRESS' && (
                    <>
                      This survey is still being collected in the field. It hasn&apos;t been
                      submitted for review yet.
                    </>
                  )}
                  {summary.status === 'SUBMITTED' && (
                    <>
                      {localSummary.pendingCount > 0 && (
                        <span className="font-semibold text-amber-600">
                          {localSummary.pendingCount} item
                          {localSummary.pendingCount === 1 ? '' : 's'} still pending.{' '}
                        </span>
                      )}
                      {alertCount > 0 && (
                        <>
                          {alertCount} price change{alertCount === 1 ? '' : 's'} flagged for
                          review.{' '}
                        </>
                      )}
                      Check the flagged items below before approving.
                    </>
                  )}
                  {summary.status === 'APPROVED' && (
                    <>
                      Approved and locked. These prices will be used in the
                      {selectedRound ? ` Round ${selectedRound.round_number}` : ''} index.
                    </>
                  )}
                </p>

                {(canApprove || canUnsubmit) && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    {canApprove && summary.status === 'SUBMITTED' && (
                      <Button
                        onClick={() => setApproveOpen(true)}
                        disabled={approveMarket.isPending}
                      >
                        Approve survey
                      </Button>
                    )}
                    {canUnsubmit && summary.is_submitted && (
                      <Button
                        variant="outline"
                        onClick={() => setUnsubmitOpen(true)}
                        disabled={unsubmitMarket.isPending}
                      >
                        Un-submit
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Data grid */}
          <DsRemarkContext.Provider value={dsRemark}>
            <DataGrid<CollectedDataItemOut>
              persistKey="survey-dashboard:items"
              rowData={filteredItems}
              columnDefs={columnDefs}
              gridOptions={{ getRowStyle }}
            />
          </DsRemarkContext.Provider>
        </>
      ) : (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {isLoading ? 'Loading…' : 'No prices have been collected for this market.'}
        </p>
      )}

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this survey?</AlertDialogTitle>
            <AlertDialogDescription>
              Once approved, the survey is locked and its prices are used in the
              {selectedRound ? ` Round ${selectedRound.round_number}` : ''} index.
              {(localSummary.pendingCount > 0 || alertCount > 0) && (
                <>
                  {' '}
                  {localSummary.pendingCount > 0 &&
                    `${localSummary.pendingCount} item${
                      localSummary.pendingCount === 1 ? ' is' : 's are'
                    } still pending. `}
                  {alertCount > 0 &&
                    `${alertCount} price change${
                      alertCount === 1 ? ' is' : 's are'
                    } flagged for review. `}
                </>
              )}
              You can still un-submit it later if corrections are needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approveMarket.isPending}>
              Approve survey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={unsubmitOpen}
        onOpenChange={(open) => {
          setUnsubmitOpen(open)
          if (!open) setUnsubmitReason('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Un-submit this market?</AlertDialogTitle>
            <AlertDialogDescription>
              The price collector will be able to survey this market again. Optionally tell them
              what to fix.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <FormLabel htmlFor="unsubmit-reason">Reason (optional)</FormLabel>
            <Input
              id="unsubmit-reason"
              value={unsubmitReason}
              onChange={(e) => setUnsubmitReason(e.target.value)}
              placeholder="e.g. Re-check the rice prices"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnsubmit} disabled={unsubmitMarket.isPending}>
              Un-submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
