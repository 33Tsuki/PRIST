import { AlertCircle, Lock } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { FormLabel } from '@/components/ui/form-label'
import { useSurveyRounds } from '@/hooks/use-survey-rounds'
import { useDistricts } from '@/hooks/use-districts'
import { useMarkets } from '@/hooks/use-markets'
import { DISTRICT_FIELD_KEY, type FilterField as FilterFieldDef } from '@/lib/report-schema'

interface FilterFieldProps {
  field: FilterFieldDef
  value: string
  values: Record<string, string> // sibling values, for cascading lookups
  error?: string
  locked?: boolean // district field locked for a District Supervisor
  onChange: (key: string, value: string) => void
}

interface Option {
  value: string
  label: string
}

// A styled <select> for a fixed option list, shared by every lookup/enum widget.
function OptionSelect({
  id,
  value,
  placeholder,
  options,
  disabled,
  invalid,
  onChange,
}: {
  id: string
  value: string
  placeholder: string
  options: Option[]
  disabled?: boolean
  invalid?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RoundSelect({
  afterRoundId,
  ...props
}: Omit<Parameters<typeof OptionSelect>[0], 'options' | 'placeholder'> & {
  // When this field ends a round range, only rounds at or after the range's start are
  // offered. Rounds are ordered by round_number within a cycle, so the bound is applied
  // per cycle — the same rule the backend enforces when resolving the range.
  afterRoundId?: string
}) {
  const { data: rounds = [], isLoading } = useSurveyRounds()
  const lowerBound = afterRoundId
    ? rounds.find((r) => String(r.round_id) === afterRoundId)
    : undefined
  const options = rounds
    .filter(
      (r) =>
        !lowerBound || (r.cycle === lowerBound.cycle && r.round_number >= lowerBound.round_number),
    )
    .map((r) => ({
      value: String(r.round_id),
      label: r.round_name ?? `Round ${r.round_number}`,
    }))
  return (
    <OptionSelect
      {...props}
      placeholder={isLoading ? 'Loading rounds…' : 'Select a round'}
      options={options}
    />
  )
}

function DistrictSelect(
  props: Omit<Parameters<typeof OptionSelect>[0], 'options' | 'placeholder'>,
) {
  const { data: districts = [], isLoading } = useDistricts()
  const options = districts.map((d) => ({ value: String(d.district_id), label: d.name }))
  return (
    <OptionSelect
      {...props}
      placeholder={isLoading ? 'Loading districts…' : 'All districts'}
      options={options}
    />
  )
}

function MarketSelect({
  districtId,
  ...props
}: Omit<Parameters<typeof OptionSelect>[0], 'options' | 'placeholder'> & {
  districtId: string
}) {
  // Markets cascade from the selected district; skip the fetch until one is chosen.
  const { data: markets = [], isLoading } = useMarkets(
    districtId ? { district_id: Number(districtId) } : undefined,
  )
  const options = districtId
    ? markets.map((m) => ({
        value: String(m.market_id),
        label: `${m.selected_market} (${m.market_code})`,
      }))
    : []
  return (
    <OptionSelect
      {...props}
      disabled={props.disabled || !districtId}
      placeholder={
        !districtId ? 'Select a district first' : isLoading ? 'Loading markets…' : 'All markets'
      }
      options={options}
    />
  )
}

export function FilterField({ field, value, values, error, locked, onChange }: FilterFieldProps) {
  const id = `filter-${field.key}`
  const invalid = !!error

  function renderControl() {
    // Lookups dispatch on kind, not on the field name, so a new lookup field only has to be
    // registered in LOOKUP_FIELDS. `dependsOn` carries the sibling each cascade reads.
    const cascadeValue = field.dependsOn ? values[field.dependsOn] : ''
    switch (field.kind) {
      case 'round':
        return (
          <RoundSelect
            id={id}
            value={value}
            invalid={invalid}
            afterRoundId={cascadeValue}
            onChange={(v) => onChange(field.key, v)}
          />
        )
      case 'district':
        return (
          <DistrictSelect
            id={id}
            value={value}
            invalid={invalid}
            disabled={locked}
            onChange={(v) => onChange(field.key, v)}
          />
        )
      case 'market':
        return (
          <MarketSelect
            id={id}
            value={value}
            invalid={invalid}
            districtId={cascadeValue}
            onChange={(v) => onChange(field.key, v)}
          />
        )
    }

    if (field.widget === 'enum') {
      return (
        <OptionSelect
          id={id}
          value={value}
          invalid={invalid}
          placeholder={`Select ${field.label.toLowerCase()}`}
          options={(field.enumValues ?? []).map((v) => ({ value: String(v), label: String(v) }))}
          onChange={(v) => onChange(field.key, v)}
        />
      )
    }

    const inputType =
      field.widget === 'integer' || field.widget === 'number'
        ? 'number'
        : field.widget === 'date'
          ? 'date'
          : 'text'
    return (
      <Input
        id={id}
        type={inputType}
        value={value}
        aria-invalid={invalid}
        placeholder={field.required ? '' : 'Optional'}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    )
  }

  // A toggle carries its own label, so it renders as one row rather than the
  // label-above-control shape every other widget uses.
  if (field.widget === 'boolean') {
    return (
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox
          id={id}
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(field.key, checked ? 'true' : '')}
        />
        {field.label}
      </label>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FormLabel htmlFor={id} required={field.required} className="flex items-center gap-1.5">
        {field.label}
        {locked && field.key === DISTRICT_FIELD_KEY && (
          <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Lock className="size-3" /> Assigned to you
          </span>
        )}
      </FormLabel>
      {renderControl()}
      {error && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" /> {error}
        </span>
      )}
    </div>
  )
}
