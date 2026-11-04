import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Store } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Kpi, KpiGroup } from '@/components/survey/dashboard/stats'
import { RollupTable } from '@/components/survey/dashboard/rollup-table'
import { Meter } from '@/components/survey/rounds/meter'
import { useAuth } from '@/hooks/use-auth'
import { useRoundSelection } from '@/hooks/use-round-selection'
import { useRoundMarkets } from '@/hooks/use-market-setup'
import { rollupByDistrict, rollupByDomain, roundTotals, type Rollup } from '@/lib/survey-progress'

export default function SurveyDashboardPage() {
  const navigate = useNavigate()
  // Shared, sessionStorage-backed round selection — the same store the setups and
  // assignments pages use, so the round survives drilling into a district and back.
  const { rounds, roundId, selectedRoundId, selectedRound, setSelectedRoundId, isLoading } =
    useRoundSelection()
  const { data: markets = [], isLoading: marketsLoading } = useRoundMarkets(roundId)

  const { user } = useAuth()
  const isSupervisor = user?.role === 'DISTRICT_SUPERVISOR'

  const totals = useMemo(() => roundTotals(markets), [markets])
  const districts = useMemo(() => rollupByDistrict(markets), [markets])
  const domains = useMemo(() => rollupByDomain(markets), [markets])

  function openDistrict(row: Rollup) {
    if (roundId && row.id != null) navigate(`/survey-dashboard/${roundId}/districts/${row.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Survey Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isSupervisor
            ? 'Collection progress across your district. Open a district to review and approve markets.'
            : 'Collection progress across the state. Open a district to see its markets.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Round</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedRoundId} onValueChange={setSelectedRoundId} disabled={isLoading}>
            <SelectTrigger className="w-full md:w-80">
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
        </CardContent>
      </Card>

      {!roundId ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Select a round to view collection progress.
        </p>
      ) : (
        <>
          {/* Round headline */}
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <Meter
                  icon={<Store className="h-3.5 w-3.5" />}
                  label="Markets submitted"
                  value={marketsLoading ? '—' : `${totals.submitted} / ${totals.markets}`}
                  sub={marketsLoading ? undefined : `${totals.submittedPct}%`}
                  pct={marketsLoading ? 0 : totals.submittedPct}
                />
                <Meter
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  label="Items collected"
                  value={marketsLoading ? '—' : `${totals.collectedItems} / ${totals.totalItems}`}
                  sub={marketsLoading ? undefined : `${totals.itemsPct}%`}
                  pct={marketsLoading ? 0 : totals.itemsPct}
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
                    value={districts.length}
                    label="Districts"
                    marker={<span className="bg-foreground h-2 w-2 rounded-full" />}
                  />
                  <Kpi
                    value={totals.submitted}
                    label="Submitted"
                    marker={<span className="h-2 w-2 rounded-full bg-green-600" />}
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

          <RollupTable
            title="By district"
            description="Open a district to filter its markets and review collected prices."
            groupLabel="District"
            rows={districts}
            onRowClick={openDistrict}
            emptyMessage={
              marketsLoading ? 'Loading…' : 'No markets have been set up for this round yet.'
            }
          />

          <RollupTable
            title="By domain"
            description={`Progress across ${
              selectedRound ? `Round ${selectedRound.round_number}` : 'the round'
            }, split by domain.`}
            groupLabel="Domain"
            rows={domains}
            emptyMessage={marketsLoading ? 'Loading…' : 'No markets to summarise.'}
          />
        </>
      )}
    </div>
  )
}
