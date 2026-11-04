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
import { useUpdateItem } from '@/hooks/use-items'
import type { ItemOut } from '@/types'

const schema = z.object({
  item_code: z.string().regex(/^[0-9]{4}$/, 'Must be a 4-digit code'),
  item_name: z.string().min(1, 'Required'),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

interface EditItemDialogProps {
  item: ItemOut | null
  onClose: () => void
}

export function EditItemDialog({ item, onClose }: EditItemDialogProps) {
  const mutation = useUpdateItem(item?.item_id ?? 0)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (item) {
      reset({
        item_code: item.item_code,
        item_name: item.item_name,
        notes: item.notes ?? '',
      })
    }
  }, [item, reset])

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        item_code: values.item_code,
        item_name: values.item_name,
        notes: values.notes || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
          <DialogDescription>Update item details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel required htmlFor="item_code">
              Item Code
            </FormLabel>
            <Input id="item_code" {...register('item_code')} />
            {errors.item_code && (
              <p className="text-sm text-destructive">{errors.item_code.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="item_name">
              Item Name
            </FormLabel>
            <Input id="item_name" {...register('item_name')} />
            {errors.item_name && (
              <p className="text-sm text-destructive">{errors.item_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="notes">Notes</FormLabel>
            <Input id="notes" {...register('notes')} />
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
