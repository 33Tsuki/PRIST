import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormLabel } from '@/components/ui/form-label'
import { useUpdateSurveyRound } from '@/hooks/use-survey-rounds'
import type { SurveyRoundOut } from '@/types'

const schema = z
  .object({
    round_name: z.string(),
    round_start_date: z.string().min(1, 'Start date is required'),
    round_end_date: z.string().min(1, 'End date is required'),
  })
  .refine((data) => data.round_end_date >= data.round_start_date, {
    message: 'End date must be on or after start date',
    path: ['round_end_date'],
  })

type FormValues = z.infer<typeof schema>

interface EditRoundDialogProps {
  round: SurveyRoundOut | null
  onClose: () => void
}

export function EditRoundDialog({ round, onClose }: EditRoundDialogProps) {
  const mutation = useUpdateSurveyRound(round?.round_id ?? 0)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (round) {
      reset({
        round_name: round.round_name ?? '',
        round_start_date: round.round_start_date,
        round_end_date: round.round_end_date,
      })
    }
  }, [round, reset])

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        round_name: values.round_name || null,
        round_start_date: values.round_start_date,
        round_end_date: values.round_end_date,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!round} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit round details{round ? ` — Round ${round.round_number}` : ''}
          </DialogTitle>
          <DialogDescription>Update the round name or window.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="edit_round_name">Round Name</FormLabel>
            <Input id="edit_round_name" placeholder="Optional" {...register('round_name')} />
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="edit_round_start_date">
              Start Date
            </FormLabel>
            <Input id="edit_round_start_date" type="date" {...register('round_start_date')} />
            {errors.round_start_date && (
              <p className="text-destructive text-sm">{errors.round_start_date.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="edit_round_end_date">
              End Date
            </FormLabel>
            <Input id="edit_round_end_date" type="date" {...register('round_end_date')} />
            {errors.round_end_date && (
              <p className="text-destructive text-sm">{errors.round_end_date.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
