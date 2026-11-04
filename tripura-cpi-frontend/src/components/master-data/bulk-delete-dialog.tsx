import { useState } from 'react'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBulkDelete } from '@/hooks/use-bulk-delete'
import { countedEntity, entityLabel } from '@/lib/entity-labels'
import { DeleteResultsSummary } from './delete-results-summary'
import { DeleteResultsTable } from './delete-results-table'
import type { BulkDeleteResponse, MasterDataEntityType, SurveyEntityType } from '@/types'

type DialogStep = 'CONFIRM' | 'DELETING' | 'RESULTS'

interface BulkDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: MasterDataEntityType | SurveyEntityType
  selectedIds: number[]
  marketId?: string
  onComplete: () => void
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  entityType,
  selectedIds,
  onComplete,
}: BulkDeleteDialogProps) {
  const [step, setStep] = useState<DialogStep>('CONFIRM')
  const [results, setResults] = useState<BulkDeleteResponse | null>(null)
  const bulkDelete = useBulkDelete(entityType)

  function reset() {
    setStep('CONFIRM')
    setResults(null)
    bulkDelete.reset()
  }

  function handleClose() {
    onOpenChange(false)
    if (step === 'RESULTS') {
      onComplete()
    }
    setTimeout(reset, 200)
  }

  async function handleDelete() {
    setStep('DELETING')
    try {
      const result = await bulkDelete.mutateAsync(selectedIds)
      setResults(result)
      setStep('RESULTS')
      toast.success(`${countedEntity(entityType, result.deleted)} deleted.`)
    } catch {
      toast.error('Nothing was deleted. Please try again.')
      setStep('CONFIRM')
    }
  }

  const label = entityLabel(entityType)
  const selectedLabel = countedEntity(entityType, selectedIds.length)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete {label.title}</DialogTitle>
          <DialogDescription>
            {step === 'CONFIRM' && `You are about to delete ${selectedLabel}.`}
            {step === 'DELETING' && 'Deleting…'}
            {step === 'RESULTS' && 'Done.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'CONFIRM' && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                This action cannot be undone. {selectedLabel} will be permanently deleted.
              </AlertDescription>
            </Alert>
          )}

          {step === 'DELETING' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
              <p className="text-muted-foreground text-sm">Deleting {selectedLabel}…</p>
            </div>
          )}

          {step === 'RESULTS' && results && (
            <>
              <DeleteResultsSummary data={results} />
              <DeleteResultsTable records={results.results} />
            </>
          )}
        </div>

        <DialogFooter>
          {step === 'CONFIRM' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="size-4" />
                Delete {selectedIds.length} {entityType}
              </Button>
            </>
          )}
          {step === 'RESULTS' && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
