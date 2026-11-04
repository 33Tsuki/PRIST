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
import { useCreateItem } from '@/hooks/use-items'

const schema = z.object({
  item_code: z.string().regex(/^[0-9]{4}$/, 'Must be a 4-digit code'),
  item_name: z.string().min(1, 'Required'),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

interface CreateItemDialogProps {
  open: boolean
  onClose: () => void
}

export function CreateItemDialog({ open, onClose }: CreateItemDialogProps) {
  const mutation = useCreateItem()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { item_code: '', item_name: '', notes: '' },
  })

  function handleClose() {
    reset()
    onClose()
  }

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        item_code: values.item_code,
        item_name: values.item_name,
        notes: values.notes || null,
      },
      { onSuccess: handleClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
          <DialogDescription>Add an item to the master list.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel required htmlFor="create_item_code">
              Item Code
            </FormLabel>
            <Input id="create_item_code" {...register('item_code')} placeholder="e.g. 1001" />
            {errors.item_code && (
              <p className="text-sm text-destructive">{errors.item_code.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="create_item_name">
              Item Name
            </FormLabel>
            <Input id="create_item_name" {...register('item_name')} />
            {errors.item_name && (
              <p className="text-sm text-destructive">{errors.item_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_item_notes">Notes</FormLabel>
            <Input id="create_item_notes" {...register('notes')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
