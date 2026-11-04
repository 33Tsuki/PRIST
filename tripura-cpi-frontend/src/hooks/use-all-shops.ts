import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { ShopOut, ShopCreate, AllShopsQueryParams } from '@/types'

export function useAllShops(params?: AllShopsQueryParams) {
  return useQuery({
    queryKey: ['all-shops', params],
    queryFn: async () => {
      const { data } = await api.get<ShopOut[]>('/master-data/shops', { params })
      return data
    },
  })
}

export function useCreateShopDirect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ marketId, body }: { marketId: string; body: ShopCreate }) => {
      const { data } = await api.post<ShopOut>(`/master-data/markets/${marketId}/shops`, body)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-shops'] })
      queryClient.invalidateQueries({ queryKey: ['shops', variables.marketId] })
      toast.success('Shop created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create shop')
    },
  })
}
