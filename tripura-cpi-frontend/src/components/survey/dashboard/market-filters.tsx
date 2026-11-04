import { X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  EMPTY_MARKET_FILTERS,
  MARKET_STATUS_META,
  PROGRESS_BUCKET_META,
  hasActiveFilters,
  type MarketFilters,
  type ProgressBucket,
} from '@/lib/survey-progress'
import type { MarketSurveyStatus } from '@/types'

interface Options {
  domains: string[]
  statuses: MarketSurveyStatus[]
  subdivisions: [string, string][]
  surveyors: [string, string][]
}

interface MarketFiltersBarProps {
  value: MarketFilters
  options: Options
  onChange: (next: MarketFilters) => void
  /** Shown alongside the controls, e.g. "12 of 80 markets". */
  resultLabel?: string
}

// Radix Select cannot hold '' as a value, so "no filter" travels as this sentinel.
const ALL = 'all'

function FilterSelect({
  label,
  value,
  options,
  onChange,
  width = 'w-[170px]',
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  width?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-muted-foreground text-xs font-medium">{label}</label>
      <Select
        value={value || ALL}
        onValueChange={(v) => onChange(v === ALL ? '' : v)}
        disabled={options.length === 0}
      >
        <SelectTrigger className={width}>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function MarketFiltersBar({ value, options, onChange, resultLabel }: MarketFiltersBarProps) {
  const set = <K extends keyof MarketFilters>(key: K, v: MarketFilters[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label="Domain"
        value={value.domain}
        options={options.domains.map((d) => ({ value: d, label: d }))}
        onChange={(v) => set('domain', v)}
        width="w-[180px]"
      />
      <FilterSelect
        label="Progress"
        value={value.progress}
        options={(Object.keys(PROGRESS_BUCKET_META) as ProgressBucket[]).map((b) => ({
          value: b,
          label: PROGRESS_BUCKET_META[b].label,
        }))}
        onChange={(v) => set('progress', v)}
      />
      <FilterSelect
        label="Status"
        value={value.status}
        options={options.statuses.map((s) => ({ value: s, label: MARKET_STATUS_META[s].label }))}
        onChange={(v) => set('status', v)}
      />
      <FilterSelect
        label="Subdivision"
        value={value.subdivisionId}
        options={options.subdivisions.map(([id, name]) => ({ value: id, label: name }))}
        onChange={(v) => set('subdivisionId', v)}
      />
      <FilterSelect
        label="Surveyor"
        value={value.surveyorId}
        options={options.surveyors.map(([id, name]) => ({ value: id, label: name }))}
        onChange={(v) => set('surveyorId', v)}
        width="w-[190px]"
      />

      {hasActiveFilters(value) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_MARKET_FILTERS)}
          className="mb-0.5"
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}

      {resultLabel && (
        <span className="text-muted-foreground mb-2 ml-auto text-sm">{resultLabel}</span>
      )}
    </div>
  )
}
