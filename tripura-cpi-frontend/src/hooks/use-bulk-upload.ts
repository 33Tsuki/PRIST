import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { BulkUploadResponse, MasterDataEntityType } from '@/types'

function getUploadUrl(entityType: MasterDataEntityType, marketId?: string) {
  switch (entityType) {
    case 'items':
      return '/master-data/ingestion/items'
    case 'markets':
      return '/master-data/ingestion/markets'
    case 'shops':
      return `/master-data/ingestion/markets/${marketId}/shops`
    case 'shops-direct':
      return '/master-data/ingestion/shops'
  }
}

function getInvalidationKey(entityType: MasterDataEntityType) {
  switch (entityType) {
    case 'items':
      return 'items'
    case 'markets':
      return 'markets'
    case 'shops':
      return 'shops'
    case 'shops-direct':
      return 'all-shops'
  }
}

export function useBulkUpload(entityType: MasterDataEntityType, marketId?: string) {
  const queryClient = useQueryClient()
  const url = getUploadUrl(entityType, marketId)

  return useMutation({
    mutationFn: async ({ file, dryRun }: { file: File; dryRun: boolean }) => {
      const formData = new FormData()
      formData.append('file', file)

      const { data } = await api.post<BulkUploadResponse>(url, formData, {
        params: { dry_run: dryRun },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (_data, variables) => {
      if (!variables.dryRun) {
        queryClient.invalidateQueries({ queryKey: [getInvalidationKey(entityType)] })
      }
    },
    onError: (error) => {
      toastApiError(error, 'Upload failed. Please check the file and try again.')
    },
  })
}
