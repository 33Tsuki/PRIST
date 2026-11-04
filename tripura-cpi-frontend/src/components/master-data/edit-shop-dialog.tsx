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
import { useUpdateShop } from '@/hooks/use-shops'
import type { ShopOut } from '@/types'

const schema = z.object({
  shop_serial_no: z.string().min(1, 'Required'),
  shop_name: z.string().min(1, 'Required'),
  shop_phone_number: z.string(),
  shop_description_and_location: z.string(),
  general_description_of_items_sold: z.string(),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

interface EditShopDialogProps {
  shop: ShopOut | null
  marketId: string
  onClose: () => void
}

export function EditShopDialog({ shop, marketId, onClose }: EditShopDialogProps) {
  const mutation = useUpdateShop(marketId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (shop) {
      reset({
        shop_serial_no: shop.shop_serial_no,
        shop_name: shop.shop_name,
        shop_phone_number: shop.shop_phone_number ?? '',
        shop_description_and_location: shop.shop_description_and_location ?? '',
        general_description_of_items_sold: shop.general_description_of_items_sold ?? '',
        notes: shop.notes ?? '',
      })
    }
  }, [shop, reset])

  function onSubmit(values: FormValues) {
    if (!shop) return
    mutation.mutate(
      {
        id: shop.shop_id,
        body: {
          shop_serial_no: values.shop_serial_no,
          shop_name: values.shop_name,
          shop_phone_number: values.shop_phone_number || null,
          shop_description_and_location: values.shop_description_and_location || null,
          general_description_of_items_sold: values.general_description_of_items_sold || null,
          notes: values.notes || null,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!shop} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Shop</DialogTitle>
          <DialogDescription>Update shop details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel required htmlFor="shop_serial_no">
              Serial No.
            </FormLabel>
            <Input id="shop_serial_no" {...register('shop_serial_no')} />
            {errors.shop_serial_no && (
              <p className="text-sm text-destructive">{errors.shop_serial_no.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="shop_name">
              Shop Name
            </FormLabel>
            <Input id="shop_name" {...register('shop_name')} />
            {errors.shop_name && (
              <p className="text-sm text-destructive">{errors.shop_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="shop_phone_number">Phone Number</FormLabel>
            <Input id="shop_phone_number" {...register('shop_phone_number')} />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="shop_description_and_location">Location / Description</FormLabel>
            <Input
              id="shop_description_and_location"
              {...register('shop_description_and_location')}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="general_description_of_items_sold">Items Sold</FormLabel>
            <Input
              id="general_description_of_items_sold"
              {...register('general_description_of_items_sold')}
            />
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
