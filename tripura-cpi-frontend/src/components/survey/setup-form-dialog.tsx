import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useCreateSetup, useReplaceItemSetup } from '@/hooks/use-market-setup'
import { useItems } from '@/hooks/use-items'
import { useShops } from '@/hooks/use-shops'
import type { ItemSetupGroup, SetupCreate, SetupReplace, SetupShopEntry } from '@/types'

const ORIG_STATUS = 'ORIGINALLY SELECTED'
const SUB1_STATUS = 'SUBSTITUTE 1'
const SUB2_STATUS = 'SUBSTITUTE 2'

const schema = z.object({
  item_id: z.string().min(1, 'Required'),
  market_item_description: z.string(),
  product_specification: z.string(),
  unit_of_sale: z.string().min(1, 'Required'),
  remark: z.string(),
  orig_shop_id: z.string().min(1, 'Required'),
  sub1_shop_id: z.string(),
  sub2_shop_id: z.string(),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  item_id: '',
  market_item_description: '',
  product_specification: '',
  unit_of_sale: '',
  remark: '',
  orig_shop_id: '',
  sub1_shop_id: '',
  sub2_shop_id: '',
}

interface SetupFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  roundId: number
  marketId: number
  /** Required in edit mode — the item's grouped setup to pre-fill. */
  group?: ItemSetupGroup | null
  onClose: () => void
}

export function SetupFormDialog({
  open,
  mode,
  roundId,
  marketId,
  group,
  onClose,
}: SetupFormDialogProps) {
  const createMutation = useCreateSetup(roundId, marketId)
  const replaceMutation = useReplaceItemSetup(roundId, marketId)
  const mutation = mode === 'create' ? createMutation : replaceMutation

  const { data: items = [] } = useItems()
  const { data: shops = [] } = useShops(String(marketId))

  const [showSub1, setShowSub1] = useState(false)
  const [showSub2, setShowSub2] = useState(false)

  const [itemComboboxOpen, setItemComboboxOpen] = useState(false)
  const [origShopComboboxOpen, setOrigShopComboboxOpen] = useState(false)
  const [sub1ShopComboboxOpen, setSub1ShopComboboxOpen] = useState(false)
  const [sub2ShopComboboxOpen, setSub2ShopComboboxOpen] = useState(false)

  const itemNameMap = useMemo(
    () => new Map(items.map((i) => [String(i.item_id), `${i.item_code} — ${i.item_name}`])),
    [items],
  )
  const shopNameMap = useMemo(
    () => new Map(shops.map((s) => [String(s.shop_id), `${s.shop_serial_no} — ${s.shop_name}`])),
    [shops],
  )

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  // (Re)initialise the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && group) {
      const slotShop = (status: string) => group.slots.find((s) => s.status === status)?.shop_id
      const orig = slotShop(ORIG_STATUS)
      const sub1 = slotShop(SUB1_STATUS)
      const sub2 = slotShop(SUB2_STATUS)
      reset({
        item_id: String(group.item_id),
        market_item_description: group.market_item_description ?? '',
        product_specification: group.product_specification ?? '',
        unit_of_sale: group.unit_of_sale ?? '',
        remark: group.remark ?? '',
        orig_shop_id: orig ? String(orig) : '',
        sub1_shop_id: sub1 ? String(sub1) : '',
        sub2_shop_id: sub2 ? String(sub2) : '',
      })
      setShowSub1(sub1 != null)
      setShowSub2(sub2 != null)
    } else {
      reset(emptyValues)
      setShowSub1(false)
      setShowSub2(false)
    }
  }, [open, mode, group, reset])

  const selectedItemId = watch('item_id')
  const selectedOrigShopId = watch('orig_shop_id')
  const selectedSub1ShopId = watch('sub1_shop_id')
  const selectedSub2ShopId = watch('sub2_shop_id')

  function handleClose() {
    reset(emptyValues)
    setShowSub1(false)
    setShowSub2(false)
    setItemComboboxOpen(false)
    setOrigShopComboboxOpen(false)
    setSub1ShopComboboxOpen(false)
    setSub2ShopComboboxOpen(false)
    onClose()
  }

  function onSubmit(values: FormValues) {
    // Shared item-level values applied to every shop slot.
    const shared = {
      unit_of_sale: values.unit_of_sale || null,
      product_specification: values.product_specification || null,
      market_item_description: values.market_item_description || null,
      remark: values.remark || null,
    }
    const buildEntry = (shopId: string): SetupShopEntry | null =>
      shopId ? { shop_id: Number(shopId), ...shared } : null

    const originally_selected = buildEntry(values.orig_shop_id)!
    const substitute_1 = showSub1 ? buildEntry(values.sub1_shop_id) : null
    const substitute_2 = showSub1 && showSub2 ? buildEntry(values.sub2_shop_id) : null

    if (mode === 'create') {
      const body: SetupCreate = {
        item_id: Number(values.item_id),
        round_id: roundId,
        originally_selected,
        substitute_1,
        substitute_2,
      }
      createMutation.mutate(body, { onSuccess: handleClose })
    } else {
      const body: SetupReplace = { originally_selected, substitute_1, substitute_2 }
      replaceMutation.mutate({ itemId: Number(values.item_id), body }, { onSuccess: handleClose })
    }
  }

  function renderShopSelect(
    label: string,
    prefix: 'orig' | 'sub1' | 'sub2',
    comboboxOpen: boolean,
    setComboboxOpen: (o: boolean) => void,
    selectedShopId: string,
    onRemove?: () => void,
  ) {
    const shopKey = `${prefix}_shop_id` as const
    return (
      <fieldset className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">{label}</legend>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <FormLabel required={prefix === 'orig'}>Shop</FormLabel>
        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboboxOpen}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">
                {selectedShopId
                  ? (shopNameMap.get(selectedShopId) ?? selectedShopId)
                  : 'Select shop'}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search shops..." />
              <CommandList>
                <CommandEmpty>No shop found.</CommandEmpty>
                <CommandGroup>
                  {shops.map((shop) => {
                    const id = String(shop.shop_id)
                    const shopLabel = `${shop.shop_serial_no} — ${shop.shop_name}`
                    return (
                      <CommandItem
                        key={shop.shop_id}
                        value={shopLabel}
                        onSelect={() => {
                          setValue(shopKey, id, { shouldValidate: true })
                          setComboboxOpen(false)
                        }}
                      >
                        {shopLabel}
                        <Check
                          className={cn(
                            'ml-auto',
                            selectedShopId === id ? 'opacity-100' : 'opacity-0',
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
        {prefix === 'orig' && errors.orig_shop_id && (
          <p className="text-sm text-destructive">{errors.orig_shop_id.message}</p>
        )}
      </fieldset>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Setup' : 'Edit Setup'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Set up an item and the shops it will be priced in.'
              : 'Edit this item’s setup — shared details and shops.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Item — combobox in create, locked in edit */}
          <div className="space-y-2">
            <FormLabel required>Item</FormLabel>
            {mode === 'edit' ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {itemNameMap.get(selectedItemId) ??
                  (group ? `${group.item_code} — ${group.item_name}` : selectedItemId)}
              </div>
            ) : (
              <>
                <Popover open={itemComboboxOpen} onOpenChange={setItemComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemComboboxOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedItemId
                          ? (itemNameMap.get(selectedItemId) ?? selectedItemId)
                          : 'Select item'}
                      </span>
                      <ChevronsUpDown className="opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search items..." />
                      <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        <CommandGroup>
                          {items.map((item) => {
                            const id = String(item.item_id)
                            const itemLabel = `${item.item_code} — ${item.item_name}`
                            return (
                              <CommandItem
                                key={item.item_id}
                                value={itemLabel}
                                onSelect={() => {
                                  setValue('item_id', id, { shouldValidate: true })
                                  setItemComboboxOpen(false)
                                }}
                              >
                                {itemLabel}
                                <Check
                                  className={cn(
                                    'ml-auto',
                                    selectedItemId === id ? 'opacity-100' : 'opacity-0',
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
                {errors.item_id && (
                  <p className="text-sm text-destructive">{errors.item_id.message}</p>
                )}
              </>
            )}
          </div>

          {/* Shared item-level fields (applied to all shops) */}
          <div className="space-y-2">
            <FormLabel htmlFor="setup_local_name">Locally Reported Name</FormLabel>
            <Input id="setup_local_name" {...register('market_item_description')} />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="setup_product_spec">Product Specification</FormLabel>
            <Input id="setup_product_spec" {...register('product_specification')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FormLabel htmlFor="setup_unit" required>
                Unit of Sale
              </FormLabel>
              <Input id="setup_unit" {...register('unit_of_sale')} />
              {errors.unit_of_sale && (
                <p className="text-sm text-destructive">{errors.unit_of_sale.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="setup_remark">Remark</FormLabel>
              <Input id="setup_remark" {...register('remark')} />
            </div>
          </div>

          {/* Shop slots */}
          {renderShopSelect(
            'Originally Selected',
            'orig',
            origShopComboboxOpen,
            setOrigShopComboboxOpen,
            selectedOrigShopId,
          )}

          {showSub1 &&
            renderShopSelect(
              'Substitute 1',
              'sub1',
              sub1ShopComboboxOpen,
              setSub1ShopComboboxOpen,
              selectedSub1ShopId,
              () => {
                setShowSub1(false)
                setValue('sub1_shop_id', '')
                if (showSub2) {
                  setShowSub2(false)
                  setValue('sub2_shop_id', '')
                }
              },
            )}

          {showSub1 &&
            showSub2 &&
            renderShopSelect(
              'Substitute 2',
              'sub2',
              sub2ShopComboboxOpen,
              setSub2ShopComboboxOpen,
              selectedSub2ShopId,
              () => {
                setShowSub2(false)
                setValue('sub2_shop_id', '')
              },
            )}

          {(!showSub1 || !showSub2) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!showSub1) setShowSub1(true)
                else setShowSub2(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Substitute
            </Button>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {mode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
