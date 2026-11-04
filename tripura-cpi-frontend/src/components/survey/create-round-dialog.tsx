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
import { useCreateSurveyRound } from '@/hooks/use-survey-rounds'

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

interface CreateRoundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateRoundDialog({ open, onOpenChange }: CreateRoundDialogProps) {
  const mutation = useCreateSurveyRound()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      round_name: '',
      round_start_date: '',
      round_end_date: '',
    },
  })

  // Reset the form each time the dialog is opened.
  useEffect(() => {
    if (open) {
      reset({
        round_name: '',
        round_start_date: '',
        round_end_date: '',
      })
    }
  }, [open, reset])

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => reset(), 200)
  }

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        round_name: values.round_name || null,
        round_start_date: values.round_start_date,
        round_end_date: values.round_end_date,
      },
      {
        onSuccess: () => {
          handleClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prepare a new round</DialogTitle>
          <DialogDescription>
            It starts as a draft and is given the next round number automatically. Configure
            assignments and the item list, then start it when you&apos;re ready to collect prices.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="create_round_name">Round Name</FormLabel>
            <Input id="create_round_name" placeholder="Optional" {...register('round_name')} />
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="create_round_start_date">
              Start Date
            </FormLabel>
            <Input id="create_round_start_date" type="date" {...register('round_start_date')} />
            {errors.round_start_date && (
              <p className="text-destructive text-sm">{errors.round_start_date.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="create_round_end_date">
              End Date
            </FormLabel>
            <Input id="create_round_end_date" type="date" {...register('round_end_date')} />
            {errors.round_end_date && (
              <p className="text-destructive text-sm">{errors.round_end_date.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Create Draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
