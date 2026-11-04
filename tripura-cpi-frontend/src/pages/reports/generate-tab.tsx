import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { Columns3, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toastApiError } from '@/lib/api-error'
import { parseParamsSchema, buildParams, DISTRICT_FIELD_KEY } from '@/lib/report-schema'
import { useAuth } from '@/hooks/use-auth'
import { useReportTypes, useGenerateReport, usePreviewReport } from '@/hooks/use-reports'
import { ReportTypePicker } from '@/components/reports/report-type-picker'
import { FilterField } from '@/components/reports/filter-field'
import { ColumnPicker, type ColumnState } from '@/components/reports/column-picker'
import { SummaryPanel, type SummaryRow } from '@/components/reports/summary-panel'
import { GeneratingOverlay } from '@/components/reports/generating-overlay'
import { PreviewDialog } from '@/components/reports/preview-dialog'
import { ReportBanner } from '@/components/reports/report-banner'
import type { ReportFormat, ReportPreviewOut, ReportTypeOut } from '@/types'

// Rows shown in the preview dialog. The server always counts the full result, so
// this only bounds what travels over the wire.
const PREVIEW_ROWS = 100

const SectionCard = ({
  step,
  title,
  subtitle,
  action,
  children,
}: {
  step: number
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) => (
  <div className="rounded-xl border bg-card p-5 shadow-xs">
    <div className="flex items-center gap-2.5">
      <span className="grid size-6 flex-none place-items-center rounded bg-muted text-xs font-bold text-muted-foreground">
        {step}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
    {subtitle && <p className="mt-1 ml-8 text-xs text-muted-foreground">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </div>
)

function defaultColumns(type: ReportTypeOut): ColumnState[] {
  return type.columns.map((c) => ({ key: c.key, label: c.label, on: c.default }))
}

interface GenerateTabProps {
  onGenerated: () => void
}

export function GenerateTab({ onGenerated }: GenerateTabProps) {
  const { user } = useAuth()
  const { data: types, isLoading, isError } = useReportTypes()
  const generate = useGenerateReport()

  const lockedDistrictId =
    user?.role === 'DISTRICT_SUPERVISOR' && user.district_id != null
      ? String(user.district_id)
      : null

  return isLoading ? (
    <div className="space-y-3">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>
  ) : isError || !types ? (
    <ReportBanner kind="err">Could not load report types. Please try again.</ReportBanner>
  ) : types.length === 0 ? (
    <ReportBanner kind="info">No report types are available yet.</ReportBanner>
  ) : (
    // Remount the form when the locked district changes (e.g. user switch) to reset state cleanly.
    <GenerateForm
      key={lockedDistrictId ?? 'admin'}
      types={types}
      lockedDistrictId={lockedDistrictId}
      generate={generate}
      onGenerated={onGenerated}
    />
  )
}

function GenerateForm({
  types,
  lockedDistrictId,
  generate,
  onGenerated,
}: {
  types: ReportTypeOut[]
  lockedDistrictId: string | null
  generate: ReturnType<typeof useGenerateReport>
  onGenerated: () => void
}) {
  const [typeKey, setTypeKey] = useState(types[0].key)
  const type = types.find((t) => t.key === typeKey) ?? types[0]
  const preview = usePreviewReport()

  const initialValues = (): Record<string, string> =>
    lockedDistrictId ? { [DISTRICT_FIELD_KEY]: lockedDistrictId } : {}

  const [title, setTitle] = useState(type.title)
  const [description, setDescription] = useState('')
  const [format, setFormat] = useState<ReportFormat>('pdf')
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [columns, setColumns] = useState<ColumnState[]>(() => defaultColumns(type))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | undefined>()
  // Row count from a 409 requires_confirmation response; non-null shows the dialog.
  const [confirmRows, setConfirmRows] = useState<number | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // A preview describes one exact form state. Stamping it with a signature lets any
  // later edit to the type, filters or columns drop it — a stale row count and
  // stale format limits would be worse than none.
  const [previewed, setPreviewed] = useState<{ signature: string; data: ReportPreviewOut } | null>(
    null,
  )

  const fields = useMemo(() => parseParamsSchema(type.params_schema), [type])
  // Toggles read as a checkbox group, not as label-above-control fields, so they get
  // their own block below the scoping selects. Split on the widget, never on the field
  // name — any future boolean filter on any report lands here for free.
  const scopeFields = fields.filter((f) => f.widget !== 'boolean')
  const toggleFields = fields.filter((f) => f.widget === 'boolean')
  // const hasDistrictField = fields.some((f) => f.key === DISTRICT_FIELD_KEY)
  // A checked filter forces its explaining column into the report server-side (the
  // catalog publishes the mapping as columns[].implied_by). Applying it as a derived
  // view rather than mutating `columns` means unchecking the filter cleanly restores
  // whatever the user had chosen for that column.
  const impliedOn = useMemo(() => {
    const labelOf = new Map(fields.map((f) => [f.key, f.label]))
    const forced = new Map<string, string>()
    for (const c of type.columns)
      for (const p of c.implied_by ?? [])
        if (values[p] === 'true') forced.set(c.key, labelOf.get(p) ?? p)
    return forced
  }, [type, fields, values])

  const effectiveColumns = columns.map((c) =>
    impliedOn.has(c.key) ? { ...c, on: true, lockedBy: impliedOn.get(c.key) } : c,
  )
  const selectedColumns = effectiveColumns.filter((c) => c.on)
  const noColumns = selectedColumns.length === 0

  // Reordering must write through, but the forced `on` must not — otherwise a column
  // would stay selected after its filter is unchecked.
  const applyColumns = (next: ColumnState[]) =>
    setColumns(
      next.map((c) =>
        impliedOn.has(c.key)
          ? { ...c, on: columns.find((o) => o.key === c.key)?.on ?? false, lockedBy: undefined }
          : c,
      ),
    )

  const params = buildParams(fields, values)
  const columnKeys = selectedColumns.map((c) => c.key)
  const signature = JSON.stringify([type.key, params, columnKeys])
  const fresh = previewed?.signature === signature ? previewed.data : null

  const pickType = (next: ReportTypeOut) => {
    setTypeKey(next.key)
    setTitle(next.title)
    setColumns(defaultColumns(next))
    // Keep the locked district (if this type still has a district filter); clear the rest.
    const nextFields = parseParamsSchema(next.params_schema)
    setValues(
      lockedDistrictId && nextFields.some((f) => f.key === DISTRICT_FIELD_KEY)
        ? { [DISTRICT_FIELD_KEY]: lockedDistrictId }
        : {},
    )
    setFieldErrors({})
    setBanner(undefined)
  }

  const setValue = (key: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      // Cascading reset: a dependent's options are derived from this field, so an existing
      // choice may no longer be offered (market after a district change, the end of a round
      // range after its start moves).
      for (const f of fields) if (f.dependsOn === key) next[f.key] = ''
      return next
    })
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const clearFilters = () => {
    // Back to the default state — keeps the locked district for supervisors, clears the rest.
    setValues(initialValues())
    setFieldErrors({})
  }

  // Only the filters gate the preview — the title is entered later, in the dialog.
  const validateFilters = () => {
    const errors: Record<string, string> = {}
    for (const f of fields) {
      if (f.required && !values[f.key]) errors[f.key] = `${f.label} is required.`
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // FastAPI 422 -> {detail: [{loc, msg}, ...]} (field errors) or {detail: "…"} (a plain
  // guard message like "would contain N rows"). 409 with requires_confirmation is the
  // large-report handshake (re-submit with confirm: true). 403 = out-of-district.
  const handleError = (error: unknown) => {
    if (isAxiosError(error) && error.response) {
      const { status, data } = error.response
      const detail = (data as { detail?: unknown })?.detail
      if (
        status === 409 &&
        typeof detail === 'object' &&
        detail !== null &&
        (detail as { requires_confirmation?: boolean }).requires_confirmation
      ) {
        setConfirmRows((detail as { rows?: number }).rows ?? 0)
        return
      }
      if (status === 422 && Array.isArray(detail)) {
        const errors: Record<string, string> = {}
        for (const item of detail as { loc?: (string | number)[]; msg?: string }[]) {
          const key = item.loc?.[item.loc.length - 1]
          if (typeof key === 'string' && item.msg) errors[key] = item.msg
        }
        setFieldErrors((prev) => ({ ...prev, ...errors }))
        if (Object.keys(errors).length === 0)
          setBanner(
            'The report could not be generated. Please check your selections and try again.',
          )
        return
      }
      if (status === 422 && typeof detail === 'string') {
        setBanner(detail)
        return
      }
      if (status === 403) {
        setBanner('This report is outside your district.')
        return
      }
    }
    toastApiError(error, 'Failed to generate report')
  }

  const submit = (confirm: boolean) => {
    generate.mutate(
      {
        report_type: type.key,
        title: title.trim(),
        description: description.trim() || null,
        file_format: format,
        params,
        columns: columnKeys,
        confirm,
      },
      {
        onSuccess: () => {
          toast.success(`“${title.trim()}” started — you'll find it under Generated reports`)
          onGenerated()
        },
        onError: handleError,
      },
    )
  }

  // Reachable only from the dialog's details step, so a preview always exists and
  // the format is always one the row count allows.
  const run = () => {
    setBanner(undefined)
    setPreviewOpen(false)
    if (!title.trim() || noColumns) return
    // The preview already showed the user the row count, which is the only thing
    // the confirmation dialog would tell them — so skip the round trip.
    submit(!!fresh?.exceeds_warn_threshold)
  }

  const runPreview = () => {
    setBanner(undefined)
    if (!validateFilters() || noColumns) return
    setPreviewOpen(true)
    preview.mutate(
      { report_type: type.key, params, columns: columnKeys, limit: PREVIEW_ROWS },
      {
        onSuccess: (data) => setPreviewed({ signature, data }),
        onError: (error) => {
          // Field errors and banners belong next to the inputs, not in the dialog.
          setPreviewOpen(false)
          handleError(error)
        },
      },
    )
  }

  const appliedFilters = fields.filter((f) => values[f.key]).length
  // The locked district can't be cleared, so it doesn't count toward what "Clear filters" can reset.
  const clearableFilters = fields.filter(
    (f) => values[f.key] && !(lockedDistrictId && f.key === DISTRICT_FIELD_KEY),
  ).length
  const summary: SummaryRow[] = [
    { label: 'Type', value: type.title },
    { label: 'Filters', value: `${appliedFilters} applied` },
    { label: 'Columns', value: String(selectedColumns.length) },
    ...(fresh ? [{ label: 'Rows', value: fresh.total_rows.toLocaleString() }] : []),
  ]

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <SectionCard
          step={1}
          title="Report type"
          subtitle="Choose what you want to report on. The options below change to match."
        >
          <ReportTypePicker types={types} selectedKey={type.key} onSelect={pickType} />
        </SectionCard>

        <SectionCard
          step={2}
          title="Filters"
          subtitle="Choose which data to include. Filters marked * must be filled in."
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={clearableFilters === 0}
              onClick={clearFilters}
            >
              <RotateCcw /> Clear filters
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {scopeFields.map((field) => (
              <FilterField
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                values={values}
                error={fieldErrors[field.key]}
                locked={!!lockedDistrictId && field.key === DISTRICT_FIELD_KEY}
                onChange={setValue}
              />
            ))}
          </div>
          {toggleFields.length > 0 && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <div className="text-sm font-medium">Narrow the rows</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tick an option to include those entries. Each one you tick also adds a column to the
                report.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {toggleFields.map((field) => (
                  <FilterField
                    key={field.key}
                    field={field}
                    value={values[field.key] ?? ''}
                    values={values}
                    error={fieldErrors[field.key]}
                    onChange={setValue}
                  />
                ))}
              </div>
            </div>
          )}
          {/* {lockedDistrictId && hasDistrictField && (
            <div className="mt-4">
              <ReportBanner kind="info">
                You are signed in as a <b>District Supervisor</b>. Reports are scoped to your
                district — the district filter is locked.
              </ReportBanner>
            </div>
          )} */}
        </SectionCard>

        <SectionCard
          step={3}
          title="Columns"
          subtitle="Choose which columns appear in the document and in what order."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2.5 text-xs text-muted-foreground">
                <b className="font-semibold text-foreground">{selectedColumns.length}</b> of{' '}
                {effectiveColumns.length} columns selected
              </div>
              {selectedColumns.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedColumns.map((c, i) => (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1.5 rounded-md bg-muted py-1 pr-2.5 pl-1 text-xs font-medium text-muted-foreground"
                    >
                      <span className="inline-grid size-4 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground tabular-nums">
                        {i + 1}
                      </span>
                      {c.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-destructive">No columns selected yet.</div>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setColumnsOpen(true)}>
              <Columns3 /> Choose columns
            </Button>
          </div>
          {noColumns && (
            <div className="mt-3">
              <ReportBanner kind="err">
                <b>Choose at least one column</b> to continue.
              </ReportBanner>
            </div>
          )}
        </SectionCard>
      </div>

      <SummaryPanel
        summary={summary}
        onPreview={runPreview}
        previewing={preview.isPending}
        disabled={noColumns}
        disabledNote="Choose at least one column first."
        errorBanner={banner}
      />

      {generate.isPending && (
        <GeneratingOverlay format={format} columnCount={selectedColumns.length} />
      )}

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={fresh}
        isPending={preview.isPending}
        title={title}
        onTitleChange={setTitle}
        description={description}
        onDescriptionChange={setDescription}
        format={format}
        onFormatChange={setFormat}
        onGenerate={run}
        generating={generate.isPending}
      />

      <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose columns</DialogTitle>
            <DialogDescription>
              Tick the columns you want, and drag them into the order they should appear.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              <b className="font-semibold text-foreground">{selectedColumns.length}</b> of{' '}
              {effectiveColumns.length} selected · drag to set order
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setColumns(defaultColumns(type))}
            >
              <RotateCcw /> Reset to defaults
            </Button>
          </div>
          <div className="-mx-1.5 max-h-[52vh] overflow-auto px-1.5">
            <ColumnPicker columns={effectiveColumns} onChange={applyColumns} />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setColumnsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmRows !== null}
        onOpenChange={(open) => !open && setConfirmRows(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a large report?</AlertDialogTitle>
            <AlertDialogDescription>
              This report has <b>{confirmRows?.toLocaleString()}</b> entries and may take a few
              minutes. You can carry on working — it will appear under Generated reports when it is
              ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRows(null)
                submit(true)
              }}
            >
              Generate anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
