import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormLabel } from '@/components/ui/form-label'
import { useUpdateMarket } from '@/hooks/use-markets'
import { useSubdivisions } from '@/hooks/use-subdivisions'
import { useDistricts } from '@/hooks/use-districts'
import { CPI_DOMAINS } from '@/types/master-data'
import type { MarketOut } from '@/types'

const schema = z.object({
  market_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(RN|RT|UO)\d{4}$/, 'Enter RN, RT or UO followed by 4 digits — for example UO0001.'),
  selected_market: z.string().min(1, 'Required'),
  domain: z.string().min(1, 'Required'),
  des_corrected: z.string(),
  district_id: z.string().min(1, 'Required'),
  vill_town_mmdc: z
    .string()
    .regex(/^[0-9]{6}$/, 'Must be a 6-digit code')
    .or(z.literal('')),
  subdivision_id: z.string(),
  market_day: z.string(),
  market_time: z.string(),
  block_ulb_name: z.string(),
  block_lgd_code: z
    .string()
    .regex(/^[1-9][0-9]*$/, 'Must be a positive number')
    .or(z.literal('')),
  dso_office: z.string(),
  village_town: z.string(),
  address: z.string(),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

const NONE_VALUE = '__none__'

interface EditMarketDialogProps {
  market: MarketOut | null
  onClose: () => void
}

export function EditMarketDialog({ market, onClose }: EditMarketDialogProps) {
  const mutation = useUpdateMarket(market?.market_id ?? 0)
  const { data: subdivisions = [] } = useSubdivisions()
  const { data: districts = [] } = useDistricts()

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const watchedDistrict = watch('district_id')
  const districtSubdivisions = subdivisions.filter(
    (s) => !watchedDistrict || s.district_id === Number(watchedDistrict),
  )

  useEffect(() => {
    if (market) {
      reset({
        market_code: market.market_code,
        selected_market: market.selected_market,
        domain: market.domain,
        des_corrected: market.des_corrected ?? '',
        district_id: market.district_id.toString(),
        vill_town_mmdc: market.vill_town_mmdc ?? '',
        subdivision_id: market.subdivision_id?.toString() ?? '',
        market_day: market.market_day ?? '',
        market_time: market.market_time ?? '',
        block_ulb_name: market.block_ulb_name ?? '',
        block_lgd_code: market.block_lgd_code?.toString() ?? '',
        dso_office: market.dso_office ?? '',
        village_town: market.village_town ?? '',
        address: market.address ?? '',
        notes: market.notes ?? '',
      })
    }
  }, [market, reset])

  function onSubmit(values: FormValues) {
    mutation.mutate(
      {
        market_code: values.market_code,
        selected_market: values.selected_market,
        domain: values.domain,
        des_corrected: values.des_corrected || null,
        district_id: Number(values.district_id),
        vill_town_mmdc: values.vill_town_mmdc || null,
        subdivision_id: values.subdivision_id ? Number(values.subdivision_id) : null,
        market_day: values.market_day || null,
        market_time: values.market_time || null,
        block_ulb_name: values.block_ulb_name || null,
        block_lgd_code: values.block_lgd_code ? Number(values.block_lgd_code) : null,
        dso_office: values.dso_office || null,
        village_town: values.village_town || null,
        address: values.address || null,
        notes: values.notes || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!market} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Market</DialogTitle>
          <DialogDescription>Update market details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Identity */}
            <div className="space-y-2">
              <FormLabel required htmlFor="market_code">
                Market Code
              </FormLabel>
              <Input id="market_code" {...register('market_code')} />
              {errors.market_code && (
                <p className="text-sm text-destructive">{errors.market_code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FormLabel required htmlFor="selected_market">
                Market Name
              </FormLabel>
              <Input id="selected_market" {...register('selected_market')} />
              {errors.selected_market && (
                <p className="text-sm text-destructive">{errors.selected_market.message}</p>
              )}
            </div>

            {/* Classification */}
            <div className="space-y-2">
              <FormLabel required>Domain</FormLabel>
              <Controller
                control={control}
                name="domain"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {CPI_DOMAINS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.domain && <p className="text-sm text-destructive">{errors.domain.message}</p>}
            </div>
            <div className="space-y-2">
              <FormLabel>Corrected Domain</FormLabel>
              <Controller
                control={control}
                name="des_corrected"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE_VALUE}
                    onValueChange={(v) => field.onChange(v === NONE_VALUE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>None</SelectItem>
                      {CPI_DOMAINS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <FormLabel required>District</FormLabel>
              <Controller
                control={control}
                name="district_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v)
                      setValue('subdivision_id', '')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select district" />
                    </SelectTrigger>
                    <SelectContent>
                      {districts.map((d) => (
                        <SelectItem key={d.district_id} value={d.district_id.toString()}>
                          {d.name} ({d.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.district_id && (
                <p className="text-sm text-destructive">{errors.district_id.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="vill_town_mmdc">Vill/Town MMDC</FormLabel>
              <Input
                id="vill_town_mmdc"
                {...register('vill_town_mmdc')}
                placeholder="6-digit code"
              />
              {errors.vill_town_mmdc && (
                <p className="text-sm text-destructive">{errors.vill_town_mmdc.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FormLabel>Subdivision</FormLabel>
              <Controller
                control={control}
                name="subdivision_id"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE_VALUE}
                    onValueChange={(v) => field.onChange(v === NONE_VALUE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subdivision" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>None</SelectItem>
                      {districtSubdivisions.map((s) => (
                        <SelectItem key={s.subdivision_id} value={s.subdivision_id.toString()}>
                          {s.name} ({s.lgd_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="village_town">Village/Town</FormLabel>
              <Input id="village_town" {...register('village_town')} />
            </div>

            {/* Market details */}
            <div className="space-y-2">
              <FormLabel htmlFor="market_day">Market Day</FormLabel>
              <Input
                id="market_day"
                {...register('market_day')}
                placeholder="e.g. Sunday/ Thursday"
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="market_time">Market Time</FormLabel>
              <Input
                id="market_time"
                {...register('market_time')}
                placeholder="e.g. Morning to Afternoon"
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="block_ulb_name">Block/ULB Name</FormLabel>
              <Input id="block_ulb_name" {...register('block_ulb_name')} />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="block_lgd_code">Block LGD Code</FormLabel>
              <Input id="block_lgd_code" {...register('block_lgd_code')} placeholder="e.g. 2438" />
              {errors.block_lgd_code && (
                <p className="text-sm text-destructive">{errors.block_lgd_code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="dso_office">DSO Office</FormLabel>
              <Input id="dso_office" {...register('dso_office')} placeholder="e.g. DSO West" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <FormLabel htmlFor="address">Address</FormLabel>
              <Input id="address" {...register('address')} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <FormLabel htmlFor="notes">Notes</FormLabel>
              <Input id="notes" {...register('notes')} />
            </div>
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
