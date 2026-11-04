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
import { Textarea } from '@/components/ui/textarea'
import { FormLabel } from '@/components/ui/form-label'
import { useUpdateReport } from '@/hooks/use-reports'
import type { GeneratedReportOut } from '@/types'

const schema = z.object({
  title: z.string().min(1, 'Report title is required').max(200),
  description: z.string().max(1000),
})

type FormValues = z.infer<typeof schema>

interface EditReportDialogProps {
  report: GeneratedReportOut | null
  onClose: () => void
}

export function EditReportDialog({ report, onClose }: EditReportDialogProps) {
  const mutation = useUpdateReport(report?.generated_report_id ?? 0)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (report) {
      reset({ title: report.title, description: report.description ?? '' })
    }
  }, [report, reset])

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        title: values.title.trim(),
        description: values.description.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!report} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit report</DialogTitle>
          <DialogDescription>Rename this report or update its description.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel required htmlFor="edit_report_title">
              Report title
            </FormLabel>
            <Input
              id="edit_report_title"
              maxLength={200}
              aria-invalid={!!errors.title}
              placeholder="e.g. Market Survey Detailed Report — West Tripura"
              {...register('title')}
            />
            {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="edit_report_description">Description</FormLabel>
            <Textarea
              id="edit_report_description"
              maxLength={1000}
              placeholder="Add a short note describing the purpose or scope of this report…"
              {...register('description')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
