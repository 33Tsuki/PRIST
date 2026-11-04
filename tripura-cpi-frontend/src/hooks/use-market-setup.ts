import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import { downloadBlobResponse } from '@/lib/export-utils'
import type {
  RoundMarketSummaryOut,
  RoundMarketSetupOut,
  BulkDeleteResponse,
  BulkBundleResponse,
  RolloverSetupsResult,
  SetupCreate,
  SetupReplace,
  SetupUploadMode,
} from '@/types'

export function useRoundMarkets(roundId: number | null) {
  return useQuery({
    queryKey: ['round-markets', roundId],
    queryFn: async () => {
      const { data } = await api.get<RoundMarketSummaryOut[]>(`/survey/rounds/${roundId}/markets`)
      return data
    },
    enabled: !!roundId,
  })
}

export function useMarketSetups(roundId: number | null, marketId: number | null | undefined) {
  return useQuery({
    queryKey: ['market-setups', roundId, marketId],
    queryFn: async () => {
      const { data } = await api.get<RoundMarketSetupOut[]>(
        `/survey/rounds/${roundId}/markets/${marketId}/setups`,
      )
      return data
    },
    enabled: !!roundId && !!marketId,
  })
}

export function useCreateSetup(roundId: number | null, marketId: number | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SetupCreate) => {
      const { data } = await api.post<RoundMarketSetupOut[]>('/survey/setups', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-setups', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', roundId], refetchType: 'all' })
      toast.success('Setup created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create setup')
    },
  })
}

export function useReplaceItemSetup(roundId: number | null, marketId: number | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, body }: { itemId: number; body: SetupReplace }) => {
      const { data } = await api.put<RoundMarketSetupOut[]>(
        `/survey/rounds/${roundId}/markets/${marketId}/items/${itemId}/setup`,
        body,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-setups', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', roundId], refetchType: 'all' })
      toast.success('Setup updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update setup')
    },
  })
}

export function useDeleteItemSetup(roundId: number | null, marketId: number | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: number) => {
      await api.delete(`/survey/rounds/${roundId}/markets/${marketId}/items/${itemId}/setup`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-setups', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', roundId], refetchType: 'all' })
      toast.success('Setup deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete setup')
    },
  })
}

export function useBulkDeleteItemSetups(
  roundId: number | null,
  marketId: number | null | undefined,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const { data } = await api.post<BulkDeleteResponse>(
        `/survey/rounds/${roundId}/markets/${marketId}/items/bulk-delete`,
        { ids },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-setups', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', roundId], refetchType: 'all' })
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete setups')
    },
  })
}

export function useSetupBulkUpload(roundId: number | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      files,
      dryRun,
      mode,
    }: {
      files: File[]
      dryRun: boolean
      mode: SetupUploadMode
    }) => {
      const formData = new FormData()
      // Each file (CSV/XLSX, or a ZIP bundling many) is one market; the backend
      // expands zips and returns a per-file result.
      files.forEach((file) => formData.append('files', file))

      const { data } = await api.post<BulkBundleResponse>(
        `/survey/ingestion/rounds/${roundId}/market-shop-item-setup/bulk`,
        formData,
        {
          // `upsert` also applies edits to rows that already exist; on a dry run it
          // makes the response a diff preview rather than plain validation.
          params: { dry_run: dryRun, mode },
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      )
      return data
    },
    onSuccess: (_data, variables) => {
      if (!variables.dryRun) {
        queryClient.invalidateQueries({ queryKey: ['round-markets', roundId], refetchType: 'all' })
        // A bulk upload can create setups in any market — invalidate every
        // market's setups in this round (prefix match) so opening one reloads.
        queryClient.invalidateQueries({ queryKey: ['market-setups', roundId] })
      }
    },
    onError: (error) => {
      toastApiError(error, 'Failed to upload setups')
    },
  })
}

export function useRolloverSetups() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ roundId, fromRoundId }: { roundId: number; fromRoundId?: number }) => {
      const params = fromRoundId ? { from_round_id: fromRoundId } : undefined
      const { data } = await api.post<RolloverSetupsResult>(
        `/survey/rounds/${roundId}/rollover-setups`,
        null,
        { params },
      )
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['round-markets', data.target_round_id] })
      const n = data.setups_copied
      toast.success(`Copied ${n} market ${n === 1 ? 'setup' : 'setups'} into this round`)
    },
    onError: (error) => {
      toastApiError(error, 'Could not copy the setups. Please try again.')
    },
  })
}

export function useSetupTemplateDownload() {
  return useCallback(async () => {
    const response = await api.get<Blob>('/survey/ingestion/templates/market-shop-item-setup', {
      responseType: 'blob',
    })
    downloadBlobResponse(response, 'market_shop_item_setup_template.xlsx')
  }, [])
}

/**
 * One market's current setups as an XLSX in the upload sheet's own layout — edit it
 * in Excel and send it back through the bulk upload in `upsert` mode.
 */
export function useMarketSetupExport() {
  return useCallback(async (roundId: number, marketId: number) => {
    const response = await api.get<Blob>(
      `/survey/ingestion/rounds/${roundId}/markets/${marketId}/market-shop-item-setup/export`,
      { responseType: 'blob' },
    )
    downloadBlobResponse(response, `setup_market${marketId}_round${roundId}.xlsx`)
  }, [])
}

/** Every market's setups for a round, as a zip of one sheet per market. */
export function useRoundSetupExport() {
  return useCallback(async (roundId: number) => {
    const response = await api.get<Blob>(
      `/survey/ingestion/rounds/${roundId}/market-shop-item-setup/export`,
      { responseType: 'blob' },
    )
    downloadBlobResponse(response, `setups_round${roundId}.zip`)
  }, [])
}
