import type { SurveyorAssignment } from '@/types'

/** Shared CSS-grid template for the assignments board (header + rows must match). */
export const BOARD_GRID =
  'grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)_56px] items-center gap-3 px-4'

export interface SurveyorOption {
  surveyor_id: number
  full_name: string
  username: string
  is_active: boolean
  district_id: number | null
}

export interface MarketOption {
  market_id: number
  market_name: string
  market_code: string
  district_id: number | null
  district_name: string | null
}

export interface BoardRow {
  market: MarketOption
  assignment: SurveyorAssignment | null
  surveyor: SurveyorOption | null
  /** Assigned to a deactivated surveyor — only flagged on the round that is actually running. */
  isInactive: boolean
  /** Pre-lowercased search text, so filtering a few hundred rows per keystroke stays cheap. */
  haystack: string
}

export interface BoardGroup {
  key: string
  districtId: number | null
  districtName: string
  rows: BoardRow[]
  total: number
  unassigned: number
}

export interface BoardTotals {
  total: number
  assigned: number
  unassigned: number
  inactive: number
}

export type AssignmentStatus = 'all' | 'unassigned' | 'inactive'

export interface AssignmentFilters {
  query: string
  /** Empty string means "all" — the Select maps it to/from the ALL sentinel. */
  districtId: string
  surveyorId: string
  status: AssignmentStatus
}

export const EMPTY_ASSIGNMENT_FILTERS: AssignmentFilters = {
  query: '',
  districtId: '',
  surveyorId: '',
  status: 'all',
}

const HONORIFIC = /^(shri|smt\.?|sri|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i

/** Two-letter avatar label: first + last name initial, ignoring the honorific prefix. */
export function initials(fullName: string): string {
  const parts = fullName.replace(HONORIFIC, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

interface BuildBoardInput {
  markets: MarketOption[]
  surveyors: SurveyorOption[]
  assignments: SurveyorAssignment[]
  flagInactive: boolean
}

/**
 * Joins every market in scope with the round's assignments, grouped by district.
 * Markets are the spine, so coverage gaps are rows rather than a missing entry.
 */
export function buildBoard({ markets, surveyors, assignments, flagInactive }: BuildBoardInput): {
  groups: BoardGroup[]
  totals: BoardTotals
} {
  const assignmentByMarket = new Map<number, SurveyorAssignment>()
  for (const assignment of assignments) assignmentByMarket.set(assignment.market_id, assignment)

  const surveyorById = new Map<number, SurveyorOption>()
  for (const surveyor of surveyors) surveyorById.set(surveyor.surveyor_id, surveyor)

  const totals: BoardTotals = { total: 0, assigned: 0, unassigned: 0, inactive: 0 }
  const byDistrict = new Map<string, BoardGroup>()

  for (const market of markets) {
    const assignment = assignmentByMarket.get(market.market_id) ?? null
    const surveyor = assignment ? (surveyorById.get(assignment.surveyor_id) ?? null) : null
    const isInactive = flagInactive && !!surveyor && !surveyor.is_active

    totals.total += 1
    if (assignment) totals.assigned += 1
    else totals.unassigned += 1
    if (isInactive) totals.inactive += 1

    // The assignments payload carries surveyor_name but no username, so the username
    // for search comes from the lookup and is simply absent if the id isn't in scope.
    const surveyorText = assignment
      ? `${assignment.surveyor_name} ${surveyor?.username ?? ''}`
      : 'unassigned'

    const row: BoardRow = {
      market,
      assignment,
      surveyor,
      isInactive,
      haystack: `${market.market_name} ${market.market_code} ${surveyorText}`.toLowerCase(),
    }

    const key =
      market.district_id === null
        ? `name:${market.district_name ?? ''}`
        : String(market.district_id)
    let group = byDistrict.get(key)
    if (!group) {
      group = {
        key,
        districtId: market.district_id,
        districtName: market.district_name ?? 'Unknown district',
        rows: [],
        total: 0,
        unassigned: 0,
      }
      byDistrict.set(key, group)
    }
    group.rows.push(row)
    group.total += 1
    if (!assignment) group.unassigned += 1
  }

  const groups = [...byDistrict.values()].sort((a, b) =>
    a.districtName.localeCompare(b.districtName),
  )
  for (const group of groups) {
    group.rows.sort((a, b) => a.market.market_name.localeCompare(b.market.market_name))
  }

  return { groups, totals }
}

export function matchesFilters(row: BoardRow, filters: AssignmentFilters): boolean {
  if (filters.districtId && String(row.market.district_id) !== filters.districtId) return false
  if (filters.surveyorId && String(row.assignment?.surveyor_id ?? '') !== filters.surveyorId) {
    return false
  }
  if (filters.status === 'unassigned' && row.assignment) return false
  if (filters.status === 'inactive' && !row.isInactive) return false

  const query = filters.query.trim().toLowerCase()
  if (query && !row.haystack.includes(query)) return false

  return true
}

export function hasActiveFilters(filters: AssignmentFilters): boolean {
  return Boolean(
    filters.query.trim() || filters.districtId || filters.surveyorId || filters.status !== 'all',
  )
}

/**
 * True when something other than the district picker is narrowing the board. Districts stay
 * collapsible while narrowing, but the groups are forced open so matches can't hide inside a
 * collapsed district.
 */
export function isNarrowing(filters: AssignmentFilters): boolean {
  return Boolean(filters.query.trim() || filters.surveyorId || filters.status !== 'all')
}
