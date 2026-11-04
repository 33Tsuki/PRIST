import { Loader2 } from 'lucide-react'
import type { ReportFormat } from '@/types'

interface GeneratingOverlayProps {
  format: ReportFormat
  columnCount: number
}

// Product names rather than file extensions, matching the wording used on the Reports page.
const FORMAT_NAMES: Record<ReportFormat, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel' }

// Shown while POST /reports is in flight — the server validates and fetches the data
// synchronously, then queues rendering as a background job (tracked in History).
export function GeneratingOverlay({ format, columnCount }: GeneratingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm">
      <div className="flex w-80 flex-col items-center gap-4 rounded-xl border bg-card p-7 shadow-lg">
        <Loader2 className="size-7 animate-spin text-primary" />
        <div className="text-sm font-semibold">Preparing your {FORMAT_NAMES[format]} report…</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/5 animate-[report-progress_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
        <div className="text-center text-xs leading-relaxed text-muted-foreground">
          Gathering the data for {columnCount} column{columnCount === 1 ? '' : 's'}. This carries on
          in the background, so you can keep working.
        </div>
      </div>
      <style>{`@keyframes report-progress { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
    </div>
  )
}
