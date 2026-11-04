import type { MarketSurveyStatus, RoundMarketSummaryOut } from '@/types'
import { marketsInfo } from '@/components/survey/rounds/utils'

/** Display metadata for a market's survey status. Shared by every dashboard level so
 *  the status vocabulary is defined once. */
export const MARKET_STATUS_META: Record<MarketSurveyStatus, { label: string; className: string }> =
  {
    IN_PROGRESS: { label: 'In Progress', className: 'bg-secondary text-secondary-foreground' },
    SUBMITTED: { label: 'Submitted', className: 'bg-amber-500 text-white' },
    APPROVED: { label: 'Approved', className: 'bg-green-600 text-white' },
    NOT_STARTED: { label: 'Not Started', className: 'bg-muted text-muted-foreground' },
    INCOMPLETE: { label: 'Incomplete', className: 'bg-rose-500 text-white' },
  }

export const MARKET_STATUSES = Object.keys(MARKET_STATUS_META) as MarketSurveyStatus[]

// ---------- progress ----------

export type ProgressBucket = 'not-started' | 'in-progress' | 'complete'

export const PROGRESS_BUCKET_META: Record<ProgressBucket, { label: string }> = {
  'not-started': { label: 'Not started' },
  'in-progress': { label: 'In progress' },
  complete: { label: 'Complete' },
}

/** Collected share of a market's expected items, 0-100. */
export function marketPct(m: Pick<RoundMarketSummaryOut, 'collected_count' | 'total_count'>) {
  if (m.total_count <= 0) return 0
  return Math.round((m.collected_count / m.total_count) * 100)
}

/**
 * Which progress bucket a market falls in.
 *
 * "Complete" is keyed off the survey status rather than a raw collected/total equality:
 * a handful of markets carry an extra expected unit that can never be priced (a shop-item
 * slot with more than one product specification, where an old spec lingers), so they sit
 * at 99% forever despite having been submitted and approved. Treating SUBMITTED/APPROVED
 * as complete keeps those markets out of the "in progress" bucket, where they would be
 * mistaken for outstanding work.
 */
export function progressBucket(m: RoundMarketSummaryOut): ProgressBucket {
  if (m.status === 'SUBMITTED' || m.status === 'APPROVED') return 'complete'
  if (m.collected_count <= 0) return 'not-started'
  if (m.total_count > 0 && m.collected_count >= m.total_count) return 'complete'
  return 'in-progress'
}

// ---------- filtering ----------

export interface MarketFilters {
  domain: string
  progress: string
  status: string
  subdivisionId: string
  surveyorId: string
}

export const EMPTY_MARKET_FILTERS: MarketFilters = {
  domain: '',
  progress: '',
  status: '',
  subdivisionId: '',
  surveyorId: '',
}

export function hasActiveFilters(f: MarketFilters): boolean {
  return Object.values(f).some(Boolean)
}

export function applyMarketFilters(
  markets: RoundMarketSummaryOut[],
  f: MarketFilters,
): RoundMarketSummaryOut[] {
  return markets.filter((m) => {
    if (f.domain && m.domain !== f.domain) return false
    if (f.status && m.status !== f.status) return false
    if (f.progress && progressBucket(m) !== f.progress) return false
    if (f.subdivisionId && String(m.subdivision_id ?? '') !== f.subdivisionId) return false
    if (f.surveyorId && String(m.surveyor_id ?? '') !== f.surveyorId) return false
    return true
  })
}

// ---------- rollups ----------

export interface Rollup {
  key: string
  /** Grouping id where one exists (district_id, subdivision_id, surveyor_id). */
  id: number | null
  label: string
  markets: number
  /** Markets whose survey status is SUBMITTED or APPROVED. */
  submitted: number
  submittedPct: number
  totalItems: number
  collectedItems: number
  /**
   * Expected minus collected, from the market counters. Deliberately NOT called "pending":
   * a market may carry an expected unit that can never be priced (a shop-item slot with
   * more than one product specification, where an old spec lingers), so this can read 1
   * while nothing is actually blocking submission. The authoritative "still to collect"
   * list is the pending-items endpoint, which uses the submission gate's definition.
   */
  uncollectedItems: number
  itemsPct: number
  alerts: number
}

function summarise(
  key: string,
  id: number | null,
  label: string,
  group: RoundMarketSummaryOut[],
): Rollup {
  const totalItems = group.reduce((n, m) => n + m.total_count, 0)
  const collectedItems = group.reduce((n, m) => n + m.collected_count, 0)
  // Reuse the same "markets submitted" definition the rounds page meter uses, so every
  // level of the dashboard agrees with the round header by construction.
  const { submitted, pct: submittedPct } = marketsInfo(group)
  return {
    key,
    id,
    label,
    markets: group.length,
    submitted,
    submittedPct,
    totalItems,
    collectedItems,
    uncollectedItems: totalItems - collectedItems,
    itemsPct: totalItems > 0 ? Math.round((collectedItems / totalItems) * 100) : 0,
    alerts: group.reduce((n, m) => n + m.alert_count, 0),
  }
}

function groupBy(
  markets: RoundMarketSummaryOut[],
  keyOf: (m: RoundMarketSummaryOut) => { key: string; id: number | null; label: string },
): Rollup[] {
  const groups = new Map<
    string,
    { id: number | null; label: string; rows: RoundMarketSummaryOut[] }
  >()
  for (const m of markets) {
    const { key, id, label } = keyOf(m)
    const existing = groups.get(key)
    if (existing) existing.rows.push(m)
    else groups.set(key, { id, label, rows: [m] })
  }
  return [...groups.entries()]
    .map(([key, g]) => summarise(key, g.id, g.label, g.rows))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function rollupByDistrict(markets: RoundMarketSummaryOut[]): Rollup[] {
  return groupBy(markets, (m) => ({
    key: String(m.district_id),
    id: m.district_id,
    label: m.district_name,
  }))
}

export function rollupBySubdivision(markets: RoundMarketSummaryOut[]): Rollup[] {
  return groupBy(markets, (m) => ({
    key: String(m.subdivision_id ?? 'none'),
    id: m.subdivision_id,
    label: m.subdivision ?? 'Unassigned',
  }))
}

export function rollupByDomain(markets: RoundMarketSummaryOut[]): Rollup[] {
  return groupBy(markets, (m) => ({ key: m.domain, id: null, label: m.domain }))
}

export function rollupBySurveyor(markets: RoundMarketSummaryOut[]): Rollup[] {
  return groupBy(markets, (m) => ({
    key: String(m.surveyor_id ?? 'none'),
    id: m.surveyor_id,
    label: m.surveyor_name ?? 'Unassigned',
  }))
}

/** Round-level totals across every market in scope. */
export function roundTotals(markets: RoundMarketSummaryOut[]): Rollup {
  return summarise('all', null, 'All', markets)
}

/** Distinct option lists for the filter controls, derived from the markets in scope so
 *  a filter never offers a value that would return nothing. */
export function filterOptions(markets: RoundMarketSummaryOut[]) {
  const domains = [...new Set(markets.map((m) => m.domain))].sort()
  const statuses = MARKET_STATUSES.filter((s) => markets.some((m) => m.status === s))
  const subdivisions = [
    ...new Map(
      markets
        .filter((m) => m.subdivision_id != null)
        .map((m) => [String(m.subdivision_id), m.subdivision ?? '']),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
  const surveyors = [
    ...new Map(
      markets
        .filter((m) => m.surveyor_id != null)
        .map((m) => [String(m.surveyor_id), m.surveyor_name ?? '']),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
  return { domains, statuses, subdivisions, surveyors }
}
