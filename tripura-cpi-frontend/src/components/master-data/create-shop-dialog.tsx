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
import { useCreateShop } from '@/hooks/use-shops'

const schema = z.object({
  shop_serial_no: z.string().min(1, 'Required'),
  shop_name: z.string().min(1, 'Required'),
  shop_phone_number: z.string(),
  shop_description_and_location: z.string(),
  general_description_of_items_sold: z.string(),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

const defaultValues: FormValues = {
  shop_serial_no: '',
  shop_name: '',
  shop_phone_number: '',
  shop_description_and_location: '',
  general_description_of_items_sold: '',
  notes: '',
}

interface CreateShopDialogProps {
  open: boolean
  marketId: string
  onClose: () => void
}

export function CreateShopDialog({ open, marketId, onClose }: CreateShopDialogProps) {
  const mutation = useCreateShop(marketId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  function handleClose() {
    reset(defaultValues)
    onClose()
  }

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        shop_serial_no: values.shop_serial_no,
        shop_name: values.shop_name,
        shop_phone_number: values.shop_phone_number || null,
        shop_description_and_location: values.shop_description_and_location || null,
        general_description_of_items_sold: values.general_description_of_items_sold || null,
        notes: values.notes || null,
      },
      { onSuccess: handleClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Shop</DialogTitle>
          <DialogDescription>Add a shop to the master list.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel required htmlFor="create_shop_serial_no">
              Serial No.
            </FormLabel>
            <Input id="create_shop_serial_no" {...register('shop_serial_no')} />
            {errors.shop_serial_no && (
              <p className="text-sm text-destructive">{errors.shop_serial_no.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="create_shop_name">
              Shop Name
            </FormLabel>
            <Input id="create_shop_name" {...register('shop_name')} />
            {errors.shop_name && (
              <p className="text-sm text-destructive">{errors.shop_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_shop_phone_number">Phone Number</FormLabel>
            <Input id="create_shop_phone_number" {...register('shop_phone_number')} />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_shop_description_and_location">
              Location / Description
            </FormLabel>
            <Input
              id="create_shop_description_and_location"
              {...register('shop_description_and_location')}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_general_description_of_items_sold">Items Sold</FormLabel>
            <Input
              id="create_general_description_of_items_sold"
              {...register('general_description_of_items_sold')}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_shop_notes">Notes</FormLabel>
            <Input id="create_shop_notes" {...register('notes')} />
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
