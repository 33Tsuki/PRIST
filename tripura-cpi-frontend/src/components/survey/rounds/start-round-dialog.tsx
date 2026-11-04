import { Flag, Loader2, Play, TriangleAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SurveyRoundOut } from '@/types'
import { formatWindow, roundLabel } from './utils'

interface StartRoundDialogProps {
  /** The draft round to start. Null when the dialog is closed. */
  round: SurveyRoundOut | null
  /** The currently running round in the cycle, if any (blocks starting another). */
  running: SurveyRoundOut | null
  isPending: boolean
  onCancel: () => void
  onConfirm: (round: SurveyRoundOut) => void
  onEndRunning: (round: SurveyRoundOut) => void
}

export function StartRoundDialog({
  round,
  running,
  isPending,
  onCancel,
  onConfirm,
  onEndRunning,
}: StartRoundDialogProps) {
  const blocked = !!running

  return (
    <Dialog open={!!round} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        {round && (
          <>
            <DialogHeader>
              <DialogTitle>
                {blocked ? 'Finish the current round first' : `Start ${roundLabel(round)}?`}
              </DialogTitle>
              <DialogDescription>
                {blocked
                  ? 'Only one monthly round can run at a time.'
                  : 'It becomes the live round and field staff can begin submitting prices.'}
              </DialogDescription>
            </DialogHeader>

            {blocked && running ? (
              <div className="flex gap-2.5 rounded-lg bg-amber-100 px-3.5 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-4 flex-none" />
                <span>
                  <span className="font-semibold">{roundLabel(running)}</span> is still running. End
                  it before starting <span className="font-semibold">{roundLabel(round)}</span>.
                </span>
              </div>
            ) : (
              <div className="divide-y rounded-lg border text-sm">
                <Recap label="Window" value={formatWindow(round)} />
                <Recap label="Round" value={`#${round.round_number}`} mono />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              {blocked && running ? (
                <Button variant="destructive" onClick={() => onEndRunning(running)}>
                  <Flag /> End {roundLabel(running)} first
                </Button>
              ) : (
                <Button onClick={() => onConfirm(round)} disabled={isPending}>
                  {isPending ? <Loader2 className="animate-spin" /> : <Play />} Start round
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Recap({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  )
}
