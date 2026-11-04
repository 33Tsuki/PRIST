import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRolloverAssignments } from '@/hooks/use-assignment-management'
import type { SurveyRoundOut } from '@/types'

interface RolloverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roundId: number
  rounds: SurveyRoundOut[]
}

export function RolloverDialog({ open, onOpenChange, roundId, rounds }: RolloverDialogProps) {
  const [sourceRoundId, setSourceRoundId] = useState<string>('')
  const rollover = useRolloverAssignments()

  const sourceRounds = rounds.filter((r) => r.round_id !== roundId)
  const targetRound = rounds.find((r) => r.round_id === roundId)

  function handleConfirm() {
    rollover.mutate(
      {
        roundId,
        fromRoundId: sourceRoundId ? Number(sourceRoundId) : undefined,
      },
      {
        onSuccess: () => {
          setSourceRoundId('')
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rollover Assignments</AlertDialogTitle>
          <AlertDialogDescription>
            Copy every surveyor&apos;s market assignments into{' '}
            <span className="font-medium text-foreground">
              Round {targetRound?.round_number}
              {targetRound?.round_name ? ` - ${targetRound.round_name}` : ''}
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          <label className="text-sm font-medium">Source Round</label>
          <Select value={sourceRoundId} onValueChange={setSourceRoundId}>
            <SelectTrigger className="mt-1.5 w-full">
              <SelectValue placeholder="Previous round" />
            </SelectTrigger>
            <SelectContent>
              {sourceRounds.map((round) => (
                <SelectItem key={round.round_id} value={String(round.round_id)}>
                  Round {round.round_number}
                  {round.round_name ? ` - ${round.round_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={rollover.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={rollover.isPending}
          >
            {rollover.isPending && <Loader2 className="animate-spin" />}
            Rollover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
