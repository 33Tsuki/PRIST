import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColDef, RowClickedEvent } from 'ag-grid-community'
import { CopyCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataGrid } from '@/components/wrappers/data-grid'
import { SetupUploadToolbar } from '@/components/survey/setup-upload-toolbar'
import { RoundLockBanner } from '@/components/survey/round-lock-banner'
import { RolloverSetupsDialog } from '@/components/survey/rollover-setups-dialog'
import { useRoundMarkets } from '@/hooks/use-market-setup'
import { useMarkets } from '@/hooks/use-markets'
import { useRoundSelection } from '@/hooks/use-round-selection'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'

interface MarketWithSetupCount {
  market_id: number
  market_code: string
  selected_market: string
  domain: string
  district_name: string
  setup_count: number
}

const columnDefs: ColDef<MarketWithSetupCount>[] = [
  { field: 'market_code', headerName: 'Market Code', minWidth: 120, flex: 0 },
  { field: 'selected_market', headerName: 'Market Name', minWidth: 180 },
  { field: 'domain', headerName: 'Domain', minWidth: 100 },
  { field: 'district_name', headerName: 'District', minWidth: 140 },
  { field: 'setup_count', headerName: 'Setups', minWidth: 100, flex: 0 },
]

export function MarketSetupTab() {
  const navigate = useNavigate()
  const { rounds, roundId, selectedRoundId, selectedRound, setSelectedRoundId } =
    useRoundSelection()

  // A closed round is a historical record: setups are locked (the backend rejects changes
  // with 409), so the toolbar's mutating actions are disabled and a lock banner is shown.
  const roundClosed = selectedRound?.round_status === 'CLOSED'
  const roundLabel = selectedRound
    ? `Round ${selectedRound.round_number}${selectedRound.round_name ? ` — ${selectedRound.round_name}` : ''}`
    : ''

  const { user } = useAuth()
  const isSupervisor = user?.role === 'DISTRICT_SUPERVISOR'
  // Supervisors may upload too; the backend scopes each file to their own district
  // and rejects the rest of the bundle's out-of-scope markets individually.
  const { can } = usePermissions()
  const canUploadSetups = can('create', 'Setup') || can('update', 'Setup')

  const { data: allMarkets = [], isLoading: isLoadingMarkets } = useMarkets()
  const { data: roundMarkets = [], isLoading: isLoadingRoundMarkets } = useRoundMarkets(roundId)

  const markets = useMemo<MarketWithSetupCount[]>(() => {
    // Supervisors only see their own district's markets (already scoped by the
    // round-markets endpoint); admins see every market with its round status.
    if (isSupervisor) {
      return roundMarkets.map((rm) => ({
        market_id: rm.market_id,
        market_code: rm.market_code,
        selected_market: rm.selected_market,
        domain: rm.domain,
        district_name: rm.district_name,
        setup_count: rm.setup_count,
      }))
    }
    const infoMap = new Map(roundMarkets.map((rm) => [rm.market_id, rm]))
    return allMarkets.map((m) => {
      const rm = infoMap.get(m.market_id)
      return {
        market_id: m.market_id,
        market_code: m.market_code,
        selected_market: m.selected_market,
        domain: m.domain,
        district_name: m.district_name,
        setup_count: rm?.setup_count ?? 0,
      }
    })
  }, [allMarkets, roundMarkets, isSupervisor])

  const isLoading = isLoadingMarkets || isLoadingRoundMarkets

  const [rolloverOpen, setRolloverOpen] = useState(false)

  function handleRowClicked(event: RowClickedEvent<MarketWithSetupCount>) {
    if (event.data) {
      navigate(`/survey-management/setups/${roundId}/${event.data.market_id}`)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Round Selection</CardTitle>
          <CardDescription>Choose a round to see how its markets are set up.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={selectedRoundId}
              onValueChange={(value) => {
                setSelectedRoundId(value)
              }}
            >
              <SelectTrigger className="w-full md:w-80">
                <SelectValue placeholder="Select round" />
              </SelectTrigger>
              <SelectContent>
                {rounds.map((round) => (
                  <SelectItem key={round.round_id} value={String(round.round_id)}>
                    Round {round.round_number}
                    {round.round_name ? ` - ${round.round_name}` : ''}
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
        </CardContent>
      </Card>

      {roundId && roundClosed && (
        <RoundLockBanner
          roundLabel={roundLabel}
          message="This round is closed, so setups can no longer be changed. You can still view and export them."
        />
      )}

      {roundId && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={roundClosed}
                onClick={() => setRolloverOpen(true)}
              >
                <CopyCheck className="mr-2 h-4 w-4" />
                Rollover
              </Button>
              {canUploadSetups && (
                <SetupUploadToolbar
                  roundId={roundId}
                  roundNumber={selectedRound?.round_number}
                  roundLabel={roundLabel}
                  disabled={roundClosed}
                />
              )}
            </div>
          </div>

          <DataGrid<MarketWithSetupCount>
            persistKey="survey-management:market-setups"
            rowData={markets}
            columnDefs={columnDefs}
            gridOptions={{
              loading: isLoading,
              onRowClicked: handleRowClicked,
              rowClass: 'cursor-pointer',
            }}
          />
        </>
      )}

      {!roundId && (
        <p className="text-muted-foreground text-center text-sm py-12">
          Select a round to see its market setups.
        </p>
      )}

      {roundId && (
        <RolloverSetupsDialog
          open={rolloverOpen}
          onOpenChange={setRolloverOpen}
          roundId={roundId}
          rounds={rounds}
        />
      )}
    </div>
  )
}
