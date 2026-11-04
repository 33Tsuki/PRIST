import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { ItemOut, ItemCreate, ItemUpdate, ItemsQueryParams } from '@/types'

export function useItems(params?: ItemsQueryParams) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const { data } = await api.get<ItemOut[]>('/master-data/items', { params })
      return data
    },
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ItemCreate) => {
      const { data } = await api.post<ItemOut>('/master-data/items', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create item')
    },
  })
}

export function useUpdateItem(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ItemUpdate) => {
      const { data } = await api.put<ItemOut>(`/master-data/items/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update item')
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/master-data/items/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete item')
    },
  })
}
