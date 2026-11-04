import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { RoundMarketSummaryOut, SurveyRoundOut } from '@/types'

/** Shared CSS-grid template for the rounds register (header + rows must match). */
export const REGISTER_GRID =
  'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_120px_minmax(0,1fr)_minmax(140px,auto)] items-center gap-3 px-4'

export function roundLabel(round: SurveyRoundOut): string {
  return round.round_name ?? `Round ${round.round_number}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return format(parseISO(iso), 'dd MMM yyyy')
}

export function formatWindow(round: SurveyRoundOut): string {
  return `${formatDate(round.round_start_date)} – ${formatDate(round.round_end_date)}`
}

export interface DaysInfo {
  total: number
  elapsed: number
  pct: number
}

/** Elapsed/total days across the round's planned window, clamped to the window. */
export function daysInfo(round: SurveyRoundOut, today: Date = new Date()): DaysInfo {
  const start = parseISO(round.round_start_date)
  const end = parseISO(round.round_end_date)
  const total = Math.max(differenceInCalendarDays(end, start) + 1, 1)
  let elapsed: number
  if (differenceInCalendarDays(today, end) > 0) elapsed = total
  else if (differenceInCalendarDays(today, start) < 0) elapsed = 0
  else elapsed = Math.min(differenceInCalendarDays(today, start) + 1, total)
  return { total, elapsed, pct: Math.round((elapsed / total) * 100) }
}

export interface MarketsInfo {
  submitted: number
  total: number
  pct: number
}

/** "Markets submitted" = markets whose survey status is SUBMITTED or APPROVED. */
export function marketsInfo(markets: RoundMarketSummaryOut[]): MarketsInfo {
  const total = markets.length
  const submitted = markets.filter(
    (m) => m.status === 'SUBMITTED' || m.status === 'APPROVED',
  ).length
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0
  return { submitted, total, pct }
}
