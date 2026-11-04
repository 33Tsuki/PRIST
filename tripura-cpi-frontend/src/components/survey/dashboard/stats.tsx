import type { ReactNode } from 'react'

/** Single headline number with a coloured marker and caption. Shared by the dashboard's
 *  round, district and market levels so the KPI rows read identically at every depth. */
export function Kpi({
  value,
  label,
  marker,
  accent,
}: {
  value: number | string
  label: string
  marker: ReactNode
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-2 text-lg font-bold ${accent ? 'text-amber-600' : ''}`}
      >
        {marker}
        {value}
      </div>
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
    </div>
  )
}

/**
 * A captioned cluster of `Kpi` tiles. The dashboard's headline cards mix two levels of
 * measurement — counts of markets and counts of items — and read as one undifferentiated
 * row without this: "Outstanding" (markets awaiting submission) sits beside "Uncollected"
 * (items) with nothing to tell them apart. The heading states the level instead of leaving
 * it to be inferred.
 */
export function KpiGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-x-8 gap-y-3">{children}</div>
    </div>
  )
}

/** Label-above-value metadata pair. */
export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}
