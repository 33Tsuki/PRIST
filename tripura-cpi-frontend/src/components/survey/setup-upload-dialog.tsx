import { useState } from 'react'
import { AlertTriangle, CheckCircle, Info, Loader2, Pencil, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MultiFileDropzone } from '@/components/wrappers/multi-file-dropzone'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSetupBulkUpload } from '@/hooks/use-market-setup'
import { BulkSetupResults } from '@/components/survey/bulk-setup-results'
import { toastApiError } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import type { BulkBundleResponse, SetupUploadMode } from '@/types'

type DialogStep =
  | 'MODE'
  | 'FILE_SELECT'
  | 'VALIDATING'
  | 'REVIEW_RESULTS'
  | 'UPLOADING'
  | 'UPLOAD_COMPLETE'

interface SetupUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roundId: number
  roundLabel?: string
}

const MODE_OPTIONS: {
  mode: SetupUploadMode
  icon: typeof Plus
  title: string
  description: string
}[] = [
  {
    mode: 'create',
    icon: Plus,
    title: 'Add new setups',
    description: "For markets that haven't been set up yet. Anything already there is skipped.",
  },
  {
    mode: 'upsert',
    icon: Pencil,
    title: 'Update existing setups',
    description:
      'Upload the files you downloaded and edited. Existing entries are updated, new ones are added.',
  },
]

export function SetupUploadDialog({
  open,
  onOpenChange,
  roundId,
  roundLabel,
}: SetupUploadDialogProps) {
  const [step, setStep] = useState<DialogStep>('MODE')
  const [mode, setMode] = useState<SetupUploadMode>('create')
  const [files, setFiles] = useState<File[]>([])
  const [skipErrors, setSkipErrors] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<BulkBundleResponse | null>(null)
  const [commitResults, setCommitResults] = useState<BulkBundleResponse | null>(null)
  const upload = useSetupBulkUpload(roundId)

  const isUpsert = mode === 'upsert'
  const modeOption = MODE_OPTIONS.find((o) => o.mode === mode)!
  const ModeIcon = modeOption.icon

  function reset() {
    setStep('MODE')
    setMode('create')
    setFiles([])
    setSkipErrors(false)
    setDryRunResults(null)
    setCommitResults(null)
    upload.reset()
  }

  function handleClose() {
    onOpenChange(false)
    setTimeout(reset, 200)
  }

  async function handleValidate() {
    if (files.length === 0) return
    setStep('VALIDATING')
    try {
      const result = await upload.mutateAsync({ files, dryRun: true, mode })
      setDryRunResults(result)
      setSkipErrors(false)
      setStep('REVIEW_RESULTS')
    } catch (error) {
      toastApiError(error, "We couldn't read those files. Please check them and try again.")
      setStep('FILE_SELECT')
    }
  }

  async function handleCommit() {
    if (files.length === 0) return
    setStep('UPLOADING')
    try {
      const result = await upload.mutateAsync({ files, dryRun: false, mode })
      setCommitResults(result)
      setStep('UPLOAD_COMPLETE')
      toast.success(
        isUpsert
          ? `Applied ${result.created + result.updated} change(s) across ${result.file_count} file(s).`
          : `Added ${result.created} ${result.created === 1 ? 'entry' : 'entries'} across ${
              result.file_count
            } file(s).`,
      )
    } catch (error) {
      toastApiError(error, 'Upload failed. Please try again.')
      setStep('REVIEW_RESULTS')
    }
  }

  const results = step === 'UPLOAD_COMPLETE' ? commitResults : dryRunResults
  const plannedChanges = dryRunResults ? dryRunResults.created + dryRunResults.updated : 0
  // Every row is committed on its own savepoint server-side, so a bad row only ever
  // fails alone — this is the user's explicit go-ahead to land the rest anyway.
  const errorsBlockApply = !!dryRunResults && dryRunResults.errors > 0 && !skipErrors
  const marketsTouched = commitResults?.files.filter((f) => f.status === 'processed').length ?? 0

  const title = isUpsert ? 'Update Market-Shop-Item Setup' : 'Bulk Upload Market-Shop-Item Setup'

  const description: Record<DialogStep, string> = {
    MODE: `${roundLabel ? `${roundLabel}. ` : ''}What do you want to do?`,
    FILE_SELECT: isUpsert
      ? 'Select the edited CSV/XLSX files, or a ZIP bundle — each file is one market.'
      : 'Select one or more CSV/XLSX files, or a ZIP bundle — each file is one market.',
    VALIDATING: 'Checking your files…',
    REVIEW_RESULTS: isUpsert
      ? 'Review what will change before applying.'
      : 'Check the results below before confirming.',
    UPLOADING: isUpsert ? 'Applying changes…' : 'Saving…',
    UPLOAD_COMPLETE: isUpsert ? 'Update complete.' : 'Upload complete.',
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{step === 'MODE' ? 'Bulk Market-Shop-Item Setup' : title}</DialogTitle>
          <DialogDescription>{description[step]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'MODE' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {MODE_OPTIONS.map((option) => {
                  const selected = option.mode === mode
                  const Icon = option.icon
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setMode(option.mode)}
                      className={cn(
                        'flex gap-3 rounded-lg border p-4 text-left transition-colors',
                        selected ? 'border-primary bg-muted/40' : 'hover:bg-muted/40',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg',
                          selected ? 'bg-primary text-primary-foreground' : 'bg-muted',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold">{option.title}</span>
                        <span className="text-muted-foreground text-sm leading-relaxed">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-muted-foreground bg-muted/60 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Neither mode deletes anything. To remove a setup, delete it from the market's
                  page.
                </span>
              </p>
            </>
          )}

          {step === 'FILE_SELECT' && (
            <>
              <div className="bg-muted/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <ModeIcon className="size-3.5" />
                  <span className="font-semibold">{modeOption.title}</span>
                </span>
                <Button variant="link" size="sm" onClick={() => setStep('MODE')}>
                  Change
                </Button>
              </div>
              <MultiFileDropzone files={files} onFilesChange={setFiles} />
            </>
          )}

          {(step === 'VALIDATING' || step === 'UPLOADING') && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
              <p className="text-muted-foreground text-sm">{description[step]}</p>
            </div>
          )}

          {(step === 'REVIEW_RESULTS' || step === 'UPLOAD_COMPLETE') && results && (
            <BulkSetupResults data={results} mode={mode} isDryRun={step === 'REVIEW_RESULTS'} />
          )}

          {step === 'UPLOAD_COMPLETE' && commitResults && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                <CheckCircle className="size-4 shrink-0" />
                {isUpsert
                  ? `${commitResults.created + commitResults.updated} change(s) saved across ${marketsTouched} market(s).`
                  : 'Everything has been saved.'}
              </div>
              {commitResults.errors > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-500">
                  <AlertTriangle className="size-4 shrink-0" />
                  {commitResults.errors} {commitResults.errors === 1 ? 'entry was' : 'entries were'}{' '}
                  skipped — open the files above to see why.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'MODE' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep('FILE_SELECT')}>Continue</Button>
            </>
          )}
          {step === 'FILE_SELECT' && (
            <>
              <Button variant="outline" onClick={() => setStep('MODE')}>
                Back
              </Button>
              <Button onClick={handleValidate} disabled={files.length === 0}>
                <Upload className="size-4" />
                Validate
              </Button>
            </>
          )}
          {step === 'REVIEW_RESULTS' && (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
              {dryRunResults && dryRunResults.errors > 0 ? (
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={skipErrors}
                    onCheckedChange={(checked) => setSkipErrors(checked === true)}
                  />
                  Apply the valid entries and skip the {dryRunResults.errors} with errors
                </label>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={
                    !dryRunResults ||
                    dryRunResults.total === 0 ||
                    dryRunResults.errors === dryRunResults.total ||
                    errorsBlockApply ||
                    (isUpsert && plannedChanges === 0)
                  }
                >
                  <Upload className="size-4" />
                  {isUpsert ? `Apply ${plannedChanges} change(s)` : 'Confirm Upload'}
                </Button>
              </div>
            </div>
          )}
          {step === 'UPLOAD_COMPLETE' && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
