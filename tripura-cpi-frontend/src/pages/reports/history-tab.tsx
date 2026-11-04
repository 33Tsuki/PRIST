import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { format as formatDate } from 'date-fns'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { Download, FileText, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { toastApiError } from '@/lib/api-error'
import { DataGrid } from '@/components/wrappers/data-grid'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { EditReportDialog } from '@/components/reports/edit-report-dialog'
import {
  useReportTypes,
  useGeneratedReports,
  useDeleteReport,
  useDownloadReport,
  useRegenerateReport,
} from '@/hooks/use-reports'
import { useDistricts } from '@/hooks/use-districts'
import type { GeneratedReportOut } from '@/types'

// The API paginates via offset/limit with no total count, so we load a generous single page
// and let AG Grid paginate/sort/filter client-side. Revisit only if report volume exceeds this.
const LIMIT = 1000

// Rows carry the resolved type/district labels so the grid can sort, quick-search and export
// on the human-readable text rather than the raw key/id.
type ReportRow = GeneratedReportOut & {
  typeTitle: string
  districtLabel: string
}

interface ReportsGridContextValue {
  download: (id: number, fallbackName: string) => void
  onEdit: (report: GeneratedReportOut) => void
  onRegenerate: (report: GeneratedReportOut) => void
  onDelete: (report: GeneratedReportOut) => void
}

const ReportsGridContext = createContext<ReportsGridContextValue>({
  download: () => {},
  onEdit: () => {},
  onRegenerate: () => {},
  onDelete: () => {},
})

export function HistoryTab() {
  const [deleting, setDeleting] = useState<GeneratedReportOut | null>(null)
  const [editing, setEditing] = useState<GeneratedReportOut | null>(null)
  // One dialog, two phases: rows === null is the plain "the old file will be replaced"
  // confirm; a non-null rows is the server's 409 large-report handshake, which swaps the
  // dialog body in place rather than opening a second dialog.
  const [regenerating, setRegenerating] = useState<{
    report: GeneratedReportOut
    rows: number | null
  } | null>(null)

  const { data: rows = [], isLoading } = useGeneratedReports(0, LIMIT)
  const { data: types = [] } = useReportTypes()
  const { data: districts = [] } = useDistricts()
  const deleteReport = useDeleteReport()
  const regenerate = useRegenerateReport()
  const download = useDownloadReport()

  const rowData = useMemo<ReportRow[]>(() => {
    const typeMap = new Map(types.map((t) => [t.key, t.title]))
    const districtMap = new Map(districts.map((d) => [d.district_id, d.name]))
    return rows.map((r) => ({
      ...r,
      typeTitle: typeMap.get(r.report_type) ?? r.report_type,
      districtLabel:
        r.district_id == null
          ? 'All districts'
          : (districtMap.get(r.district_id) ?? 'Unknown district'),
    }))
  }, [rows, types, districts])

  // Stable identity — it goes into the grid context that every cell renderer consumes.
  const startRegenerate = useCallback(
    (report: GeneratedReportOut) => setRegenerating({ report, rows: null }),
    [],
  )

  const gridContext = useMemo<ReportsGridContextValue>(
    () => ({
      download,
      onEdit: setEditing,
      onRegenerate: startRegenerate,
      onDelete: setDeleting,
    }),
    [download, startRegenerate],
  )

  const confirmDelete = () => {
    if (!deleting) return
    deleteReport.mutate(deleting.generated_report_id, { onSuccess: () => setDeleting(null) })
  }

  const runRegenerate = (confirm: boolean) => {
    if (!regenerating || regenerate.isPending) return
    const { report } = regenerating
    regenerate.mutate(
      { id: report.generated_report_id, confirm },
      {
        onSuccess: () => {
          setRegenerating(null)
          toast.success(
            `Regenerating “${report.title}” — its status will update here when it is done`,
          )
        },
        onError: (error) => {
          const rows = confirmationRows(error)
          if (rows !== null) {
            // Stay open on the same report and swap to the row-count step.
            setRegenerating((current) => (current ? { ...current, rows } : current))
            return
          }
          setRegenerating(null)
          toastRegenerateError(error)
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <EmptyState
            icon={<FileText className="size-6" />}
            title="No reports generated yet"
            subtitle="Reports you generate will be listed here with a download link. Head to the Generate tab to create your first one."
          />
        </div>
      ) : (
        <ReportsGridContext.Provider value={gridContext}>
          <DataGrid<ReportRow>
            persistKey="reports:history"
            rowData={rowData}
            columnDefs={columnDefs}
            exportFilename="reports"
            searchPlaceholder="Search by title, type, district, or person…"
            gridOptions={{
              getRowId: (p) => String(p.data.generated_report_id),
            }}
          />
        </ReportsGridContext.Provider>
      )}

      <EditReportDialog report={editing} onClose={() => setEditing(null)} />

      <AlertDialog
        open={!!regenerating}
        // Ignore ESC / overlay clicks mid-flight so a request can't outlive its own state.
        onOpenChange={(open) => {
          if (!open && !regenerate.isPending) setRegenerating(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {regenerating?.rows == null ? 'Regenerate report?' : 'Regenerate a large report?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {regenerating?.rows == null ? (
                <>
                  This will create the report again using the latest data. The current file will be
                  replaced.
                </>
              ) : (
                <>
                  It now has <b>{regenerating.rows.toLocaleString()}</b> entries and may take a few
                  minutes.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              // preventDefault keeps the dialog mounted so it can show the spinner and, on a
              // 409, switch to the row-count step — cf. delete-confirm-dialog.tsx.
              onClick={(e) => {
                e.preventDefault()
                runRegenerate(regenerating?.rows != null)
              }}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending && <Loader2 className="animate-spin" />}
              {regenerating?.rows == null ? 'Regenerate' : 'Regenerate anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={confirmDelete}
        entityLabel="report"
        identifier={deleting?.title ?? ''}
        isPending={deleteReport.isPending}
      />
    </div>
  )
}

// A 409 whose detail is an OBJECT is the large-report handshake (re-POST with
// ?confirm=true). Returns the row count for the confirmation step, or null for every other
// error — including the plain-string 409 "Report is already being generated".
function confirmationRows(error: unknown): number | null {
  if (!isAxiosError(error) || error.response?.status !== 409) return null
  const detail = (error.response.data as { detail?: unknown })?.detail
  if (
    typeof detail === 'object' &&
    detail !== null &&
    (detail as { requires_confirmation?: boolean }).requires_confirmation
  ) {
    return (detail as { rows?: number }).rows ?? 0
  }
  return null
}

// toastApiError checks its generic STATUS_MESSAGES *before* the server's detail, so 403/404
// need explicit overrides or "Report is outside your district" / "Survey round not found"
// get replaced by useless generic text. 409/422 have no generic entry and fall through to
// detail — their overrides exist to guarantee a *string* reaches sonner, since a non-string
// detail would be handed to React as a child and throw.
//
// 422 additionally gets a clause appended. A replay can be rejected for growing past the row
// cap, for a stored column that has left the catalog, for a market that moved district, or
// for params that no longer validate — and the server's advice for the first ("narrow your
// filters, or use Excel") is unreachable here, because strict replay reuses the stored
// filters, columns and format. All four mean the same thing, so the clause is appended rather
// than pattern-matched onto one of them: the server's own text (with its counts) survives
// verbatim and nothing couples to its wording. A non-string detail is the params-drift case
// specifically, which is not about size.
function toastRegenerateError(error: unknown) {
  const detail = isAxiosError(error)
    ? (error.response?.data as { detail?: unknown })?.detail
    : undefined
  const serverText = typeof detail === 'string' ? detail : undefined
  toastApiError(error, 'Could not regenerate this report', {
    403: serverText ?? 'This report is outside your district.',
    404: serverText ?? 'The data behind this report is no longer available.',
    409: serverText ?? 'This report is already being generated.',
    422: serverText
      ? `${serverText}. Regenerating can't change these options — please create a new report from the Generate tab.`
      : "This report's saved options no longer work. Please create a new one from the Generate tab.",
  })
}

const columnDefs: ColDef<ReportRow>[] = [
  { field: 'title', headerName: 'Report', minWidth: 180, flex: 2, cellClass: 'font-medium' },
  { field: 'typeTitle', headerName: 'Type', minWidth: 140, cellRenderer: ReportTypeCell },
  {
    field: 'file_format',
    headerName: 'Format',
    minWidth: 110,
    flex: 0,
    valueFormatter: ({ value }: ValueFormatterParams<ReportRow>) =>
      value ? String(value).toUpperCase() : '',
    cellRenderer: ReportFormatCell,
  },
  {
    colId: 'status',
    headerName: 'Status',
    minWidth: 130,
    valueGetter: ({ data }) => {
      if (data?.status === 'READY') return 'Ready'
      if (data?.status === 'FAILED') return 'Failed'
      return 'Generating'
    },
    cellRenderer: ReportStatusCell,
  },
  {
    field: 'districtLabel',
    headerName: 'District',
    minWidth: 140,
    cellClass: 'text-muted-foreground',
  },
  {
    field: 'generated_by_username',
    headerName: 'Generated by',
    minWidth: 140,
    cellClass: 'text-muted-foreground',
    valueFormatter: ({ value }: ValueFormatterParams<ReportRow>) => value ?? '—',
  },
  {
    field: 'created_at',
    headerName: 'Date',
    minWidth: 170,
    cellClass: 'text-muted-foreground tabular-nums',
    valueFormatter: ({ value }: ValueFormatterParams<ReportRow>) =>
      value ? formatDate(new Date(value), 'dd MMM yyyy, h:mm a') : '—',
  },
  {
    // created_at is preserved across a regenerate; completed_at is what moves. It is nulled
    // while a render is in flight, so an em dash here reads as "generating" — the Status
    // column carries the detail.
    field: 'completed_at',
    headerName: 'Last generated',
    minWidth: 170,
    cellClass: 'text-muted-foreground tabular-nums',
    valueFormatter: ({ value }: ValueFormatterParams<ReportRow>) =>
      value ? formatDate(new Date(value), 'dd MMM yyyy, h:mm a') : '—',
  },
  {
    colId: 'actions',
    headerName: '',
    // 4 × 36px buttons + 3 × 4px gaps + 16px cell padding. minWidth pins it: AG Grid refuses
    // to restore a persisted width below colDef.minWidth, so no returning user's saved
    // layout can re-narrow this to the old 3-button 132px.
    width: 172,
    minWidth: 172,
    flex: 0,
    sortable: false,
    filter: false,
    resizable: false,
    pinned: 'right',
    cellRenderer: ReportActionsCell,
  },
]

function ReportTypeCell({ value }: ICellRendererParams<ReportRow>) {
  return (
    <Badge variant="secondary" className="font-normal">
      {value}
    </Badge>
  )
}

function ReportFormatCell(params: ICellRendererParams<ReportRow>) {
  const format = params.data?.file_format
  if (!format) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-semibold',
        format === 'pdf' && 'text-destructive',
        format === 'docx' && 'text-blue-600 dark:text-blue-400',
        format === 'xlsx' && 'text-green-700 dark:text-green-400',
      )}
    >
      {format.toUpperCase()}
    </Badge>
  )
}

// PENDING shows a live % for docx/xlsx (real row-by-row progress from the server);
// pdf progress is stage-based on the backend, so a % would mislead — spinner only.
function ReportStatusCell(params: ICellRendererParams<ReportRow>) {
  const report = params.data
  if (!report) return null
  if (report.status === 'READY') {
    return (
      <Badge
        variant="outline"
        className="border-green-600/40 font-medium text-green-700 dark:text-green-400"
      >
        Ready
      </Badge>
    )
  }
  if (report.status === 'FAILED') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="cursor-help font-medium">
              Failed
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            {report.error ?? 'This report could not be generated.'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1.5 font-medium tabular-nums">
      <Loader2 className="size-3 animate-spin" />
      {report.file_format === 'pdf' ? 'Generating…' : `${report.progress}%`}
    </Badge>
  )
}

function ReportActionsCell(params: ICellRendererParams<ReportRow>) {
  const report = params.data
  const { download, onEdit, onRegenerate, onDelete } = useContext(ReportsGridContext)
  if (!report) return null
  return (
    <div className="flex h-full items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        title="Rename"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => onEdit(report)}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={
          report.status === 'READY'
            ? 'Download'
            : report.status === 'PENDING'
              ? 'Still generating — available when ready'
              : 'Generation failed — no file to download'
        }
        disabled={report.status !== 'READY'}
        onClick={() =>
          download(report.generated_report_id, `${report.title}.${report.file_format}`)
        }
      >
        <Download />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={
          report.status === 'PENDING'
            ? 'Already generating'
            : report.status === 'FAILED'
              ? 'Retry generation'
              : 'Regenerate with the latest data'
        }
        className="text-muted-foreground hover:text-foreground"
        disabled={report.status === 'PENDING'}
        onClick={() => onRegenerate(report)}
      >
        <RefreshCw />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Delete"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(report)}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
