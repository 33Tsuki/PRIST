import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormLabel } from '@/components/ui/form-label'
import { useCreateShopDirect } from '@/hooks/use-all-shops'
import { useMarkets } from '@/hooks/use-markets'
import { cn } from '@/lib/utils'

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

interface CreateShopDirectDialogProps {
  open: boolean
  onClose: () => void
}

export function CreateShopDirectDialog({ open, onClose }: CreateShopDirectDialogProps) {
  const mutation = useCreateShopDirect()
  const { data: markets = [] } = useMarkets()

  const [selectedMarketId, setSelectedMarketId] = useState('')
  const [marketComboboxOpen, setMarketComboboxOpen] = useState(false)
  const [marketError, setMarketError] = useState(false)

  const marketNameMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of markets) {
      map.set(m.market_id, `${m.market_code} — ${m.selected_market}`)
    }
    return map
  }, [markets])

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
    setSelectedMarketId('')
    setMarketError(false)
    onClose()
  }

  function onSubmit(values: FormValues) {
    if (!selectedMarketId) {
      setMarketError(true)
      return
    }
    mutation.mutate(
      {
        marketId: selectedMarketId,
        body: {
          shop_serial_no: values.shop_serial_no,
          shop_name: values.shop_name,
          shop_phone_number: values.shop_phone_number || null,
          shop_description_and_location: values.shop_description_and_location || null,
          general_description_of_items_sold: values.general_description_of_items_sold || null,
          notes: values.notes || null,
        },
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
            <FormLabel required>Market</FormLabel>
            <Popover open={marketComboboxOpen} onOpenChange={setMarketComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={marketComboboxOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {selectedMarketId
                      ? (marketNameMap.get(Number(selectedMarketId)) ?? selectedMarketId)
                      : 'Select market'}
                  </span>
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search markets..." />
                  <CommandList>
                    <CommandEmpty>No market found.</CommandEmpty>
                    <CommandGroup>
                      {markets.map((m) => {
                        const id = String(m.market_id)
                        const label = `${m.market_code} — ${m.selected_market}`
                        return (
                          <CommandItem
                            key={m.market_id}
                            value={label}
                            onSelect={() => {
                              setSelectedMarketId(id)
                              setMarketError(false)
                              setMarketComboboxOpen(false)
                            }}
                          >
                            {label}
                            <Check
                              className={cn(
                                'ml-auto',
                                selectedMarketId === id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {marketError && <p className="text-sm text-destructive">Please select a market</p>}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="create_direct_shop_serial_no">
              Serial No.
            </FormLabel>
            <Input id="create_direct_shop_serial_no" {...register('shop_serial_no')} />
            {errors.shop_serial_no && (
              <p className="text-sm text-destructive">{errors.shop_serial_no.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel required htmlFor="create_direct_shop_name">
              Shop Name
            </FormLabel>
            <Input id="create_direct_shop_name" {...register('shop_name')} />
            {errors.shop_name && (
              <p className="text-sm text-destructive">{errors.shop_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_direct_shop_phone_number">Phone Number</FormLabel>
            <Input id="create_direct_shop_phone_number" {...register('shop_phone_number')} />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_direct_shop_desc">Location / Description</FormLabel>
            <Input id="create_direct_shop_desc" {...register('shop_description_and_location')} />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_direct_shop_items_sold">Items Sold</FormLabel>
            <Input
              id="create_direct_shop_items_sold"
              {...register('general_description_of_items_sold')}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="create_direct_shop_notes">Notes</FormLabel>
            <Input id="create_direct_shop_notes" {...register('notes')} />
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
