import { Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ReportBanner } from './report-banner'

export interface SummaryRow {
  label: string
  value: string
  muted?: boolean
}

interface SummaryPanelProps {
  summary: SummaryRow[]
  onPreview: () => void
  previewing: boolean
  disabled: boolean
  disabledNote?: string
  errorBanner?: string
}

// Preview is the only action here: the document itself — title, description and
// format — is named in the preview dialog, once the data has been seen.
export function SummaryPanel({
  summary,
  onPreview,
  previewing,
  disabled,
  disabledNote,
  errorBanner,
}: SummaryPanelProps) {
  return (
    <div className="sticky top-6 flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Summary
      </div>

      <dl className="flex flex-col">
        {summary.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 border-b border-dashed py-2 text-sm last:border-b-0"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={cn('max-w-44 text-right font-medium', row.muted && 'text-destructive')}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {errorBanner && <ReportBanner kind="err">{errorBanner}</ReportBanner>}

      <Button className="w-full" disabled={disabled || previewing} onClick={onPreview}>
        {previewing ? <Loader2 className="animate-spin" /> : <Eye />}
        {previewing ? 'Loading preview…' : 'Preview data'}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {disabled && disabledNote
          ? disabledNote
          : 'Preview the data first — you can name the report and pick a format from there.'}
      </p>
    </div>
  )
}
