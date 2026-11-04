import { cn } from '@/lib/utils'
import type { ReportFormat } from '@/types'

const FORMATS: { value: ReportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'xlsx', label: 'Excel' },
]

interface FormatToggleProps {
  value: ReportFormat
  onChange: (format: ReportFormat) => void
  /** Formats the previewed row count fits under. Others are disabled —
   *  generating them would be rejected by the server. */
  allowedFormats?: ReportFormat[]
}

export function FormatToggle({ value, onChange, allowedFormats }: FormatToggleProps) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {FORMATS.map((f) => {
        const blocked = !!allowedFormats && !allowedFormats.includes(f.value)
        return (
          <button
            key={f.value}
            type="button"
            disabled={blocked}
            title={blocked ? `Too many rows for ${f.label}` : undefined}
            onClick={() => onChange(f.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
              value === f.value
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
              blocked && 'opacity-40 hover:text-muted-foreground',
            )}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
