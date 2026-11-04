import { Flag, Loader2, TriangleAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { RoundMarketSummaryOut, SurveyRoundOut } from '@/types'
import { formatWindow, marketsInfo, roundLabel } from './utils'

interface EndRoundDialogProps {
  /** The running round to end. Null when the dialog is closed. */
  round: SurveyRoundOut | null
  markets: RoundMarketSummaryOut[]
  marketsLoading: boolean
  isPending: boolean
  onCancel: () => void
  onConfirm: (round: SurveyRoundOut) => void
}

export function EndRoundDialog({
  round,
  markets,
  marketsLoading,
  isPending,
  onCancel,
  onConfirm,
}: EndRoundDialogProps) {
  const mk = marketsInfo(markets)
  const remaining = mk.total - mk.submitted

  return (
    <Dialog open={!!round} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        {round && (
          <>
            <DialogHeader>
              <DialogTitle>End {roundLabel(round)}?</DialogTitle>
              <DialogDescription>
                Submissions stop and the round is closed for reporting.
              </DialogDescription>
            </DialogHeader>

            {!marketsLoading && remaining > 0 && (
              <div className="text-destructive flex gap-2.5 rounded-lg bg-red-100 px-3.5 py-3 text-sm dark:bg-red-900/30">
                <TriangleAlert className="mt-0.5 size-4 flex-none" />
                <span>
                  <span className="font-semibold">
                    {remaining} of {mk.total} markets
                  </span>{' '}
                  haven&apos;t submitted yet. Ending now closes the round without them.
                </span>
              </div>
            )}

            <div className="divide-y rounded-lg border text-sm">
              {!marketsLoading && mk.total > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-muted-foreground">Markets submitted</span>
                  <span className="tabular-nums">
                    {mk.submitted} / {mk.total}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-muted-foreground">Window</span>
                <span className="tabular-nums">{formatWindow(round)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => onConfirm(round)} disabled={isPending}>
                {isPending ? <Loader2 className="animate-spin" /> : <Flag />} End round
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
