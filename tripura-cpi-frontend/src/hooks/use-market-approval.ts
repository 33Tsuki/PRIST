import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { MarketSurveyStatus } from '@/types'

export interface MarketStatusOut {
  round_id: number
  market_id: number
  status: MarketSurveyStatus
  submitted_at: string | null
  submitted_by: number | null
  reviewed_at: string | null
  reviewed_by: number | null
  review_remark: string | null
}

interface MarketRef {
  roundId: number
  marketId: number
}

export function useApproveMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ roundId, marketId }: MarketRef) => {
      const { data } = await api.post<MarketStatusOut>(
        `/survey/rounds/${roundId}/markets/${marketId}/approve`,
      )
      return data
    },
    onSuccess: (_data, { roundId, marketId }) => {
      queryClient.invalidateQueries({ queryKey: ['collected-data', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', roundId] })
      toast.success('Market approved')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to approve market')
    },
  })
}

export function useUnsubmitMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      roundId,
      marketId,
      review_remark,
    }: MarketRef & { review_remark?: string }) => {
      const { data } = await api.post<MarketStatusOut>(
        `/survey/rounds/${roundId}/markets/${marketId}/unsubmit`,
        { review_remark: review_remark || null },
      )
      return data
    },
    onSuccess: (_data, { roundId, marketId }) => {
      queryClient.invalidateQueries({ queryKey: ['collected-data', roundId, marketId] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', roundId] })
      toast.success('Market re-opened for the price collector')
    },
    onError: (error) => {
      toastApiError(error, 'Could not re-open this market')
    },
  })
}
