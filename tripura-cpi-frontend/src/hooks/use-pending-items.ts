import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { PendingItemOut } from '@/types'

/**
 * Items still awaiting a price, one row per (market, item). Pass a districtId to scope the
 * list; a district supervisor is pinned to their own district by the backend regardless.
 *
 * "Pending" here is the same condition the mobile app's submission gate enforces, so a
 * fully submitted round legitimately returns an empty list.
 */
export function usePendingItems(roundId: number | null, districtId?: number | null) {
  return useQuery({
    queryKey: ['pending-items', roundId, districtId ?? null],
    queryFn: async () => {
      const { data } = await api.get<PendingItemOut[]>(`/survey/rounds/${roundId}/pending-items`, {
        params: districtId != null ? { district_id: districtId } : undefined,
      })
      return data
    },
    enabled: !!roundId,
  })
}
