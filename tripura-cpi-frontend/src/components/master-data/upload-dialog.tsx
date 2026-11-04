import { useState } from 'react'
import { Upload, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { toastApiError } from '@/lib/api-error'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/wrappers/file-dropzone'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBulkUpload } from '@/hooks/use-bulk-upload'
import { countedEntity, entityLabel } from '@/lib/entity-labels'
import { UploadResultsSummary } from './upload-results-summary'
import { UploadResultsTable } from './upload-results-table'
import type { BulkUploadResponse, MasterDataEntityType } from '@/types'

type DialogStep = 'FILE_SELECT' | 'VALIDATING' | 'REVIEW_RESULTS' | 'UPLOADING' | 'UPLOAD_COMPLETE'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: MasterDataEntityType
  marketId?: string
}

export function UploadDialog({ open, onOpenChange, entityType, marketId }: UploadDialogProps) {
  const [step, setStep] = useState<DialogStep>('FILE_SELECT')
  const [file, setFile] = useState<File | null>(null)
  const [dryRunResults, setDryRunResults] = useState<BulkUploadResponse | null>(null)
  const [commitResults, setCommitResults] = useState<BulkUploadResponse | null>(null)
  const upload = useBulkUpload(entityType, marketId)

  function reset() {
    setStep('FILE_SELECT')
    setFile(null)
    setDryRunResults(null)
    setCommitResults(null)
    upload.reset()
  }

  function handleClose() {
    onOpenChange(false)
    // Delay reset so close animation finishes
    setTimeout(reset, 200)
  }

  async function handleValidate() {
    if (!file) return
    setStep('VALIDATING')
    try {
      const result = await upload.mutateAsync({ file, dryRun: true })
      setDryRunResults(result)
      setStep('REVIEW_RESULTS')
    } catch (error) {
      toastApiError(error, "We couldn't read that file. Please check it and try again.")
      setStep('FILE_SELECT')
    }
  }

  async function handleCommit() {
    if (!file) return
    setStep('UPLOADING')
    try {
      const result = await upload.mutateAsync({ file, dryRun: false })
      setCommitResults(result)
      setStep('UPLOAD_COMPLETE')
      toast.success(`Added ${countedEntity(entityType, result.created)}.`)
    } catch (error) {
      toastApiError(error, 'Upload failed. Please try again.')
      setStep('REVIEW_RESULTS')
    }
  }

  const label = entityLabel(entityType)
  const results = step === 'UPLOAD_COMPLETE' ? commitResults : dryRunResults

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload {label.title}</DialogTitle>
          <DialogDescription>
            {step === 'FILE_SELECT' && 'Select a file to upload.'}
            {step === 'VALIDATING' && 'Checking your file…'}
            {step === 'REVIEW_RESULTS' && 'Check the results below before confirming.'}
            {step === 'UPLOADING' && 'Saving…'}
            {step === 'UPLOAD_COMPLETE' && 'Upload complete.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Select */}
          {step === 'FILE_SELECT' && <FileDropzone file={file} onFileSelect={setFile} />}

          {/* Loading States */}
          {(step === 'VALIDATING' || step === 'UPLOADING') && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
              <p className="text-muted-foreground text-sm">
                {step === 'VALIDATING' ? 'Checking…' : 'Saving…'}
              </p>
            </div>
          )}

          {/* Results */}
          {(step === 'REVIEW_RESULTS' || step === 'UPLOAD_COMPLETE') && results && (
            <>
              <UploadResultsSummary data={results} />
              <UploadResultsTable records={results.results} isDryRun={step === 'REVIEW_RESULTS'} />
            </>
          )}

          {/* Upload Complete */}
          {step === 'UPLOAD_COMPLETE' && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle className="size-4" />
              Everything has been saved.
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'FILE_SELECT' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleValidate} disabled={!file}>
                <Upload className="size-4" />
                Validate
              </Button>
            </>
          )}
          {step === 'REVIEW_RESULTS' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCommit}
                disabled={
                  !dryRunResults ||
                  dryRunResults.total === 0 ||
                  dryRunResults.errors === dryRunResults.total
                }
              >
                <Upload className="size-4" />
                Confirm Upload
              </Button>
            </>
          )}
          {step === 'UPLOAD_COMPLETE' && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
