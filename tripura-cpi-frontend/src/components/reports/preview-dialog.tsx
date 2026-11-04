import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, FileSearch, Loader2, Play } from 'lucide-react'
import type { ColDef } from 'ag-grid-community'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormLabel } from '@/components/ui/form-label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataGrid } from '@/components/wrappers/data-grid'
import { FormatToggle } from './format-toggle'
import { ReportBanner } from './report-banner'
import type { ReportFormat, ReportPreviewOut, ReportPreviewSection } from '@/types'

const FORMAT_LABELS: Record<ReportFormat, string> = { pdf: 'PDF', docx: 'DOCX', xlsx: 'Excel' }

interface PreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ReportPreviewOut | null
  isPending: boolean
  title: string
  onTitleChange: (title: string) => void
  description: string
  onDescriptionChange: (description: string) => void
  format: ReportFormat
  onFormatChange: (format: ReportFormat) => void
  onGenerate: () => void
  generating: boolean
}

export function PreviewDialog({
  open,
  onOpenChange,
  data,
  isPending,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  format,
  onFormatChange,
  onGenerate,
  generating,
}: PreviewDialogProps) {
  // The dialog can only be reopened through a close, so resetting there is enough.
  const [step, setStep] = useState<'preview' | 'details'>('preview')
  const handleOpenChange = (next: boolean) => {
    if (!next) setStep('preview')
    onOpenChange(next)
  }

  const goToDetails = () => {
    // 'pdf' is only the default, not a choice the user has made yet — so if the row
    // count rules it out, land them on a format that actually works.
    if (data && !data.allowed_formats.includes(format) && data.allowed_formats.length > 0) {
      onFormatChange(data.allowed_formats[0])
    }
    setStep('details')
  }

  const ready = !isPending && !!data
  const canGenerate = ready && data.total_rows > 0 && data.allowed_formats.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[95vw] lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'details' ? 'Name this report' : (data?.report_title ?? 'Preview')}
          </DialogTitle>
          <DialogDescription>
            {step === 'details'
              ? 'These appear on the document itself and in the reports history.'
              : 'A sample of the data this report will contain. Nothing is generated or saved yet.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'details' && data ? (
          <DetailsStep
            data={data}
            title={title}
            onTitleChange={onTitleChange}
            description={description}
            onDescriptionChange={onDescriptionChange}
            format={format}
            onFormatChange={onFormatChange}
            onBack={() => setStep('preview')}
          />
        ) : !ready ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-14 w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* The document's own header block, so the user sees the scope it will print. */}
            <div className="flex flex-wrap gap-1.5">
              {data.meta.map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {label}
                  <b className="font-semibold text-foreground">{value}</b>
                </span>
              ))}
            </div>

            <PreviewStats data={data} />

            {data.total_rows === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 grid size-14 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <FileSearch className="size-6" />
                </div>
                <div className="text-base font-semibold">Nothing matches these filters</div>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Try a different round, district or market, then preview again.
                </p>
              </div>
            ) : (
              data.sections.map((section, i) => (
                <PreviewSection key={section.heading ?? i} section={section} />
              ))
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          {step === 'details' ? (
            <Button type="button" disabled={generating || !title.trim()} onClick={onGenerate}>
              {generating ? <Loader2 className="animate-spin" /> : <Play />}
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          ) : (
            <Button type="button" disabled={!canGenerate} onClick={goToDetails}>
              Generate report <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailsStep({
  data,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  format,
  onFormatChange,
  onBack,
}: {
  data: ReportPreviewOut
  title: string
  onTitleChange: (title: string) => void
  description: string
  onDescriptionChange: (description: string) => void
  format: ReportFormat
  onFormatChange: (format: ReportFormat) => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft /> Back to preview
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <FormLabel htmlFor="report-title" required>
          Report title
        </FormLabel>
        <Input
          id="report-title"
          value={title}
          maxLength={200}
          aria-invalid={!title.trim()}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Market Survey Detailed Report — West Tripura"
        />
        {!title.trim() && <span className="text-xs text-destructive">A title is required.</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <FormLabel htmlFor="report-description">Description</FormLabel>
        <Textarea
          id="report-description"
          value={description}
          maxLength={1000}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add a short note describing the purpose or scope of this report…"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Format</span>
        <FormatToggle
          value={format}
          onChange={onFormatChange}
          allowedFormats={data.allowed_formats}
        />
        {data.allowed_formats.length < 3 ? (
          <FormatLimitBanner data={data} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {data.total_rows.toLocaleString()} entries. It is prepared in the background — look
            under Generated reports.
          </p>
        )}
      </div>
    </div>
  )
}

// Format-neutral: the format is chosen in the next step, so this reports what the
// entry count means for all three rather than judging one selection.
function PreviewStats({ data }: { data: ReportPreviewOut }) {
  const rows = data.total_rows.toLocaleString()
  const shown = data.truncated
    ? `Showing the first ${data.returned_rows.toLocaleString()} of ${rows} rows.`
    : `Showing all ${rows} rows.`

  if (data.allowed_formats.length === 0) {
    return (
      <ReportBanner kind="err">
        <b>{rows} entries is too many for any format.</b> {shown} Add more filters to reduce the
        amount, then preview again.
      </ReportBanner>
    )
  }
  if (data.exceeds_warn_threshold) {
    return (
      <ReportBanner kind="warn">
        <b>{rows} entries — this is a large report</b> and may take a few minutes. {shown} It is
        prepared in the background, so you can keep working.
      </ReportBanner>
    )
  }
  return (
    <ReportBanner kind="info">
      <b>{rows} entries.</b> {shown} Values are shown exactly as they will appear in the document.
    </ReportBanner>
  )
}

// Shown on the details step (beside the format toggle) when the entry count rules out
// some formats — this is where the user actually picks the format, so the warning lives here.
function FormatLimitBanner({ data }: { data: ReportPreviewOut }) {
  const rows = data.total_rows.toLocaleString()
  const shown = data.truncated
    ? `Showing the first ${data.returned_rows.toLocaleString()} of ${rows} rows.`
    : `Showing all ${rows} rows.`
  const blocked = (['pdf', 'docx', 'xlsx'] as ReportFormat[])
    .filter((f) => !data.allowed_formats.includes(f))
    .map((f) => FORMAT_LABELS[f])
  const allowed = data.allowed_formats.map((f) => FORMAT_LABELS[f])
  return (
    <ReportBanner kind="err">
      <b>
        {rows} entries — too many for {blocked.join(' and ')}.
      </b>{' '}
      {shown} You can still generate this as {allowed.join(' or ')}, or add more filters.
    </ReportBanner>
  )
}

function PreviewSection({ section }: { section: ReportPreviewSection }) {
  // AG Grid drops the current column order whenever columnDefs are referentially
  // unstable, so both of these must be memoized.
  const columnDefs = useMemo<ColDef<Record<string, string>>[]>(
    () => section.columns.map((c) => ({ field: c.key, headerName: c.label })),
    [section.columns],
  )
  // Rows arrive positional (string[]) — zip them back against the column keys.
  const rowData = useMemo(() => {
    const keys = section.columns.map((c) => c.key)
    return section.rows.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? ''])))
  }, [section.columns, section.rows])

  return (
    <div className="flex flex-col gap-2">
      {section.heading && <h3 className="text-sm font-semibold">{section.heading}</h3>}
      {/* No persistKey: columns here are dynamic per report type and per column
          selection, so a remembered layout would not apply to the next preview. */}
      <DataGrid
        rowData={rowData}
        columnDefs={columnDefs}
        exportable={false}
        searchPlaceholder="Search preview rows..."
      />
    </div>
  )
}
