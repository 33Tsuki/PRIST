import { useState } from 'react'
import { Check, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { AssignmentFilters, AssignmentStatus, SurveyorOption } from '@/lib/assignment-board'
import type { DistrictOut } from '@/types'

// Radix Select cannot hold '' as a value, so "no filter" travels as this sentinel.
const ALL = 'all'

interface StatusTab {
  value: AssignmentStatus
  label: string
  count: number
  badgeClassName: string
}

interface AssignmentFiltersBarProps {
  value: AssignmentFilters
  onChange: (next: AssignmentFilters) => void
  districts: DistrictOut[]
  surveyors: SurveyorOption[]
  counts: { all: number; unassigned: number; inactive: number }
  resultLabel: string
  allCollapsed: boolean
  onToggleAll: () => void
  /** Supervisors are already scoped to one district, so the picker is pointless for them. */
  showDistrict: boolean
  disabled?: boolean
}

export function AssignmentFiltersBar({
  value,
  onChange,
  districts,
  surveyors,
  counts,
  resultLabel,
  allCollapsed,
  onToggleAll,
  showDistrict,
  disabled = false,
}: AssignmentFiltersBarProps) {
  const set = <K extends keyof AssignmentFilters>(key: K, next: AssignmentFilters[K]) =>
    onChange({ ...value, [key]: next })

  const selectedSurveyor = value.surveyorId
    ? (surveyors.find((s) => String(s.surveyor_id) === value.surveyorId) ?? null)
    : null

  const tabs: StatusTab[] = [
    {
      value: 'all',
      label: 'All',
      count: counts.all,
      badgeClassName: 'bg-muted-foreground/15 text-muted-foreground',
    },
    {
      value: 'unassigned',
      label: 'Unassigned',
      count: counts.unassigned,
      badgeClassName: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    },
    {
      value: 'inactive',
      label: 'Inactive',
      count: counts.inactive,
      badgeClassName: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[260px] flex-1 md:max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search markets or surveyors"
          value={value.query}
          onChange={(e) => set('query', e.target.value)}
          className="pl-9"
        />
      </div>

      {showDistrict && (
        <Select
          value={value.districtId || ALL}
          onValueChange={(next) => set('districtId', next === ALL ? '' : next)}
        >
          <SelectTrigger className="w-[168px]">
            <SelectValue placeholder="All districts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All districts</SelectItem>
            {districts.map((district) => (
              <SelectItem key={district.district_id} value={String(district.district_id)}>
                {district.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <SurveyorFilter
        surveyors={surveyors}
        selected={selectedSurveyor}
        value={value.surveyorId}
        onSelect={(next) => set('surveyorId', next)}
      />

      <Tabs value={value.status} onValueChange={(next) => set('status', next as AssignmentStatus)}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {tab.label}
              <span
                className={cn(
                  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                  tab.badgeClassName,
                )}
              >
                {tab.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Button
        variant="outline"
        size="icon"
        disabled={disabled}
        onClick={onToggleAll}
        title={allCollapsed ? 'Expand all districts' : 'Collapse all districts'}
        aria-label={allCollapsed ? 'Expand all districts' : 'Collapse all districts'}
      >
        {allCollapsed ? (
          <ChevronsUpDown className="size-4" />
        ) : (
          <ChevronsDownUp className="size-4" />
        )}
      </Button>

      <span className="text-muted-foreground ml-auto text-sm whitespace-nowrap tabular-nums">
        {resultLabel}
      </span>
    </div>
  )
}

interface SurveyorFilterProps {
  surveyors: SurveyorOption[]
  selected: SurveyorOption | null
  value: string
  onSelect: (surveyorId: string) => void
}

function SurveyorFilter({ surveyors, selected, value, onSelect }: SurveyorFilterProps) {
  const [open, setOpen] = useState(false)

  function pick(surveyorId: string) {
    onSelect(surveyorId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[196px] justify-between font-normal"
        >
          <span className="truncate">
            {selected ? (
              <>
                {selected.full_name}
                <span className="text-muted-foreground ml-1.5 text-xs">({selected.username})</span>
              </>
            ) : (
              'All surveyors'
            )}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search surveyors..." />
          <CommandList>
            <CommandEmpty>No surveyor found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all surveyors" onSelect={() => pick('')}>
                All surveyors
                <Check className={cn('ml-auto', value ? 'opacity-0' : 'opacity-100')} />
              </CommandItem>
              {surveyors.map((surveyor) => (
                <CommandItem
                  key={surveyor.surveyor_id}
                  value={`${surveyor.full_name} ${surveyor.username}`}
                  onSelect={() => pick(String(surveyor.surveyor_id))}
                  className={cn(!surveyor.is_active && 'text-amber-600 dark:text-amber-400')}
                >
                  <span className="truncate">
                    {surveyor.full_name}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      ({surveyor.username})
                    </span>
                  </span>
                  <Check
                    className={cn(
                      'ml-auto',
                      value === String(surveyor.surveyor_id) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
