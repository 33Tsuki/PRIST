import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportTypeOut } from '@/types'

interface ReportTypePickerProps {
  types: ReportTypeOut[]
  selectedKey: string
  onSelect: (type: ReportTypeOut) => void
}

// Card grid over the catalog, in the server's order — which is `sequence` order, the
// number each card shows. Nothing here is hardcoded per report type.
export function ReportTypePicker({ types, selectedKey, onSelect }: ReportTypePickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {types.map((type) => {
        const selected = type.key === selectedKey
        return (
          <button
            key={type.key}
            type="button"
            onClick={() => onSelect(type)}
            className={cn(
              'relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
              selected
                ? 'border-primary bg-accent/40 ring-1 ring-primary'
                : 'border-border hover:border-foreground/30 hover:bg-accent/30',
            )}
          >
            <span
              className={cn(
                'flex size-9 flex-none items-center justify-center rounded-md text-sm font-bold tabular-nums',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {type.sequence}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{type.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {type.description}
              </span>
            </span>
            {selected && (
              <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
