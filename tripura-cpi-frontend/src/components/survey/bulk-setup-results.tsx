import { useMemo, useState } from 'react'
import { ChevronRight, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SetupResultsSummary } from '@/components/survey/setup-results-summary'
import { SetupResultsTable } from '@/components/survey/setup-results-table'
import { useMarkets } from '@/hooks/use-markets'
import { cn } from '@/lib/utils'
import type { BulkBundleResponse, FileUploadResult, SetupUploadMode } from '@/types'

/**
 * Which market a file belongs to is only known from the sheet's own `market code`
 * column, which the per-file result doesn't echo back. Exported sheets are named
 * `setup_<MARKET CODE>_round<N>.xlsx`, so the code in the filename identifies the
 * market for the round trip this screen exists to serve; anything else falls back to
 * the filename alone.
 */
function useMarketLabeller() {
  const { data: markets = [] } = useMarkets()

  return useMemo(() => {
    const byCode = markets.map((m) => ({
      code: m.market_code.toUpperCase(),
      label: `${m.market_code} ${m.selected_market}`,
    }))
    return (filename: string): string | null => {
      const haystack = filename.toUpperCase()
      // Longest code first, so RN0101 wins over a hypothetical RN010.
      const match = [...byCode]
        .sort((a, b) => b.code.length - a.code.length)
        .find((m) => m.code && haystack.includes(m.code))
      return match?.label ?? null
    }
  }, [markets])
}

function FileCard({
  file,
  mode,
  isDryRun,
  marketLabel,
}: {
  file: FileUploadResult
  mode: SetupUploadMode
  isDryRun: boolean
  marketLabel: string | null
}) {
  const hasIssue = file.status === 'error' || file.errors > 0
  const [open, setOpen] = useState(hasIssue)

  const counts =
    mode === 'upsert'
      ? `${file.created} ${isDryRun ? 'to add' : 'added'} · ${file.updated} ${
          isDryRun ? 'to update' : 'updated'
        } · ${file.unchanged} unchanged · ${file.errors} errors`
      : `${file.created} ${isDryRun ? 'to add' : 'added'} · ${file.duplicates} duplicate · ${
          file.errors
        } errors`

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-90',
          )}
        />
        {hasIssue ? (
          <AlertTriangle className="size-4 shrink-0 text-red-600" />
        ) : (
          <CheckCircle className="size-4 shrink-0 text-emerald-600" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {marketLabel ? `${marketLabel} — ${file.filename}` : file.filename}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {file.status === 'processed' ? (
            <span className="text-muted-foreground text-xs whitespace-nowrap">{counts}</span>
          ) : (
            <Badge
              variant="outline"
              className="border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
            >
              Error
            </Badge>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t px-3 py-2">
          {file.status === 'error' ? (
            <p className="text-sm text-red-700 dark:text-red-400">
              {file.detail ?? "This file couldn't be read — nothing was saved from it."}
            </p>
          ) : file.results.length > 0 ? (
            <SetupResultsTable records={file.results} isDryRun={isDryRun} />
          ) : (
            <p className="text-muted-foreground text-sm">This file is empty.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function BulkSetupResults({
  data,
  mode,
  isDryRun,
}: {
  data: BulkBundleResponse
  mode: SetupUploadMode
  isDryRun: boolean
}) {
  const failedFiles = data.files.filter((f) => f.status === 'error').length
  const labelFor = useMarketLabeller()

  return (
    <div className="space-y-4">
      <SetupResultsSummary data={data} mode={mode} isDryRun={isDryRun} />

      {mode === 'upsert' && (
        <p className="text-muted-foreground bg-muted/60 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Setups you removed from the file are{' '}
            <span className="text-foreground font-medium">left untouched</span> — an update never
            deletes.
          </span>
        </p>
      )}

      {failedFiles > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>
            {failedFiles} of {data.file_count} file(s) could not be read
          </AlertTitle>
          <AlertDescription>Fix the highlighted files below and re-upload them.</AlertDescription>
        </Alert>
      )}

      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {data.files.map((file, index) => (
          <FileCard
            key={`${file.filename}:${index}`}
            file={file}
            mode={mode}
            isDryRun={isDryRun}
            marketLabel={labelFor(file.filename)}
          />
        ))}
      </div>
    </div>
  )
}
