import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { MarketOut, MarketCreate, MarketUpdate, MarketsQueryParams } from '@/types'

export function useMarkets(params?: MarketsQueryParams) {
  return useQuery({
    queryKey: ['markets', params],
    queryFn: async () => {
      const { data } = await api.get<MarketOut[]>('/master-data/markets', { params })
      return data
    },
  })
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['markets', id],
    queryFn: async () => {
      const { data } = await api.get<MarketOut>(`/master-data/markets/${id}`)
      return data
    },
  })
}

export function useCreateMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: MarketCreate) => {
      const { data } = await api.post<MarketOut>('/master-data/markets', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets'] })
      toast.success('Market created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create market')
    },
  })
}

export function useUpdateMarket(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: MarketUpdate) => {
      const { data } = await api.put<MarketOut>(`/master-data/markets/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets'] })
      toast.success('Market updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update market')
    },
  })
}

export function useDeleteMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/master-data/markets/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets'] })
      toast.success('Market deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete market')
    },
  })
}
