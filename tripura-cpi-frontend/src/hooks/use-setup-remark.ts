import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { RoundMarketSetupOut } from '@/types'

interface SetupRemarkVars {
  setupId: number
  /** An empty string clears the remark. */
  remark: string
}

/**
 * Set or clear the DS remark on a single setup row. Unlike the setup-replace
 * mutation this touches only the one row, so it is safe to call from the survey
 * dashboard where price data already exists.
 */
export function useUpdateSetupRemark(roundId: number | null, marketId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ setupId, remark }: SetupRemarkVars) => {
      const { data } = await api.put<RoundMarketSetupOut>(`/survey/setups/${setupId}/remark`, {
        remark: remark || null,
      })
      return data
    },
    onSuccess: (_data, { remark }) => {
      queryClient.invalidateQueries({ queryKey: ['collected-data', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['market-setups', roundId, marketId] })
      toast.success(remark ? 'Remark saved' : 'Remark removed')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to save remark')
    },
  })
}
