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
import { DeleteResultsSummary } from '@/components/master-data/delete-results-summary'
import { DeleteResultsTable } from '@/components/master-data/delete-results-table'
import { useBulkDeleteItemSetups } from '@/hooks/use-market-setup'
import type { BulkDeleteResponse } from '@/types'

type DialogStep = 'CONFIRM' | 'DELETING' | 'RESULTS'

interface BulkDeleteSetupsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roundId: number
  marketId: number
  selectedIds: number[]
  onComplete: () => void
}

export function BulkDeleteSetupsDialog({
  open,
  onOpenChange,
  roundId,
  marketId,
  selectedIds,
  onComplete,
}: BulkDeleteSetupsDialogProps) {
  const [step, setStep] = useState<DialogStep>('CONFIRM')
  const [results, setResults] = useState<BulkDeleteResponse | null>(null)
  const bulkDelete = useBulkDeleteItemSetups(roundId, marketId)

  const count = selectedIds.length
  const noun = count === 1 ? 'setup' : 'setups'

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
      toast.success(`${result.deleted} ${noun} deleted.`)
    } catch {
      toast.error('Nothing was deleted. Please try again.')
      setStep('CONFIRM')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete Setups</DialogTitle>
          <DialogDescription>
            {step === 'CONFIRM' && `You are about to delete ${count} ${noun}.`}
            {step === 'DELETING' && 'Deleting…'}
            {step === 'RESULTS' && 'Done.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'CONFIRM' && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                This action cannot be undone. The setup for {count}{' '}
                {noun === 'setup' ? 'item' : 'items'} will be permanently deleted.
              </AlertDescription>
            </Alert>
          )}

          {step === 'DELETING' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
              <p className="text-muted-foreground text-sm">
                Deleting {count} {noun}…
              </p>
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
                Delete {count} {noun}
              </Button>
            </>
          )}
          {step === 'RESULTS' && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
