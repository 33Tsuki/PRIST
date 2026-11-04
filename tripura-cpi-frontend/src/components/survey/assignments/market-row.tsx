import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { BOARD_GRID, initials, type BoardRow, type SurveyorOption } from '@/lib/assignment-board'

/** A faint hatch marking a market nobody is covering yet. Theme-neutral so it reads in both modes. */
const UNASSIGNED_HATCH = {
  backgroundImage:
    'repeating-linear-gradient(135deg, transparent, transparent 7px, rgba(128,128,128,.07) 7px, rgba(128,128,128,.07) 14px)',
} as const

export interface SurveyorPickerOption {
  surveyor: SurveyorOption
  /** How many markets this surveyor already covers in the selected round. */
  load: number
}

interface MarketRowProps {
  row: BoardRow
  districtName: string
  options: SurveyorPickerOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onAssign: (surveyorId: number) => void
  onClear: () => void
  disabled: boolean
  isLast: boolean
}

export function MarketRow({
  row,
  districtName,
  options,
  isOpen,
  onOpenChange,
  onAssign,
  onClear,
  disabled,
  isLast,
}: MarketRowProps) {
  const { market, assignment, surveyor, isInactive } = row

  return (
    <div
      className={cn(
        BOARD_GRID,
        'hover:bg-muted/40 relative h-11 border-b text-sm transition-colors',
        isInactive && 'bg-amber-500/10 hover:bg-amber-500/15',
        isLast && 'border-b-0',
      )}
    >
      {!assignment && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={UNASSIGNED_HATCH}
        />
      )}

      <div className="relative flex min-w-0 items-baseline gap-2">
        <span className={cn('truncate font-medium', !assignment && 'text-muted-foreground')}>
          {market.market_name}
        </span>
        <span className="text-muted-foreground flex-none text-xs">{market.market_code}</span>
      </div>

      <div className="relative min-w-0">
        <Popover open={isOpen} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            {assignment ? (
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  'hover:bg-muted flex h-7 w-full max-w-[300px] items-center gap-2 rounded-md px-1.5 text-[13px] transition-colors',
                  'disabled:pointer-events-none disabled:opacity-60',
                  isInactive && 'text-amber-700 dark:text-amber-400',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 flex-none items-center justify-center rounded-full text-[10px] font-bold',
                    isInactive
                      ? 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {initials(assignment.surveyor_name)}
                </span>
                <span className="truncate">{assignment.surveyor_name}</span>
                <span className="text-muted-foreground flex-none text-xs">
                  {surveyor ? `(${surveyor.username})` : ''}
                  {isInactive ? ' · inactive' : ''}
                </span>
                <ChevronsUpDown className="ml-auto size-3 flex-none opacity-50" />
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  'hover:border-foreground/40 hover:bg-background inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-[13px] font-medium transition-colors',
                  'disabled:pointer-events-none disabled:opacity-60',
                )}
              >
                <Plus className="size-3.5" />
                Assign surveyor
              </button>
            )}
          </PopoverTrigger>

          {/* Mounted only while open — every market is a row, so hundreds of hidden
              Commands would otherwise be built on each render. */}
          {isOpen && (
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search surveyors..." />
                <CommandList>
                  <CommandEmpty>No surveyor in {districtName}.</CommandEmpty>
                  <CommandGroup
                    heading={`${assignment ? 'Switch' : 'Assign'} surveyor · ${districtName}`}
                  >
                    {options.map(({ surveyor: option, load }) => (
                      <CommandItem
                        key={option.surveyor_id}
                        value={`${option.full_name} ${option.username}`}
                        onSelect={() => onAssign(option.surveyor_id)}
                        className={cn(
                          'items-start gap-2.5',
                          !option.is_active && 'text-amber-600 dark:text-amber-400',
                        )}
                      >
                        <span className="bg-muted text-muted-foreground flex size-[22px] flex-none items-center justify-center rounded-full text-[10px] font-bold">
                          {initials(option.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{option.full_name}</div>
                          <div className="text-muted-foreground truncate text-[11px]">
                            {option.username} · {load} market{load === 1 ? '' : 's'}
                            {option.is_active ? '' : ' · inactive'}
                          </div>
                        </div>
                        <Check
                          className={cn(
                            'mt-0.5',
                            assignment?.surveyor_id === option.surveyor_id
                              ? 'opacity-100'
                              : 'opacity-0',
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          )}
        </Popover>
      </div>

      <div className="relative flex justify-end">
        {assignment && (
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onClear}
            title="Remove assignment"
            aria-label={`Remove assignment for ${market.market_name}`}
            className="text-muted-foreground hover:text-destructive size-7"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
