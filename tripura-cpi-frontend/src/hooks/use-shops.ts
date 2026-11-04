import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { ShopOut, ShopCreate, ShopUpdate, ShopsQueryParams } from '@/types'

export function useShops(marketId: string, params?: ShopsQueryParams) {
  return useQuery({
    queryKey: ['shops', marketId, params],
    queryFn: async () => {
      const { data } = await api.get<ShopOut[]>(`/master-data/markets/${marketId}/shops`, {
        params,
      })
      return data
    },
  })
}

export function useCreateShop(marketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ShopCreate) => {
      const { data } = await api.post<ShopOut>(`/master-data/markets/${marketId}/shops`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shops', marketId] })
      toast.success('Shop created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create shop')
    },
  })
}

export function useUpdateShop(marketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: ShopUpdate }) => {
      const { data } = await api.put<ShopOut>(`/master-data/shops/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shops', marketId] })
      toast.success('Shop updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update shop')
    },
  })
}

export function useDeleteShop(marketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/master-data/shops/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shops', marketId] })
      toast.success('Shop deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete shop')
    },
  })
}
