import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { CollectedDataResponse } from '@/types'

export function useCollectedData(roundId: number | null, marketId: number | null) {
  return useQuery({
    queryKey: ['collected-data', roundId, marketId],
    queryFn: async () => {
      const { data } = await api.get<CollectedDataResponse>(
        `/survey/rounds/${roundId}/markets/${marketId}/collected-data`,
      )
      return data
    },
    enabled: !!roundId && !!marketId,
  })
}
