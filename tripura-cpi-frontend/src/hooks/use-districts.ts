import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { DistrictOut } from '@/types'

export function useDistricts(enabled = true) {
  return useQuery({
    queryKey: ['districts'],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<DistrictOut[]>('/master-data/districts')
      return data
    },
  })
}
