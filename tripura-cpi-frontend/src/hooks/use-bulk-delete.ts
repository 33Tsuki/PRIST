import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { BulkDeleteResponse, MasterDataEntityType, SurveyEntityType } from '@/types'

type BulkDeleteEntityType = MasterDataEntityType | SurveyEntityType

function getDeleteUrl(entityType: BulkDeleteEntityType) {
  switch (entityType) {
    case 'items':
      return '/master-data/items/bulk-delete'
    case 'markets':
      return '/master-data/markets/bulk-delete'
    case 'shops':
      return '/master-data/shops/bulk-delete'
    case 'shops-direct':
      return '/master-data/shops/bulk-delete'
    case 'survey-rounds':
      return '/survey/rounds/bulk-delete'
  }
}

function getInvalidationKey(entityType: BulkDeleteEntityType) {
  switch (entityType) {
    case 'items':
      return 'items'
    case 'markets':
      return 'markets'
    case 'shops':
      return 'shops'
    case 'shops-direct':
      return 'all-shops'
    case 'survey-rounds':
      return 'survey-rounds'
  }
}

export function useBulkDelete(entityType: BulkDeleteEntityType) {
  const queryClient = useQueryClient()
  const url = getDeleteUrl(entityType)

  return useMutation({
    mutationFn: async (ids: number[]) => {
      const { data } = await api.post<BulkDeleteResponse>(url, { ids })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getInvalidationKey(entityType)] })
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete items')
    },
  })
}
