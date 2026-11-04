import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { SubdivisionOut } from '@/types'

export function useSubdivisions() {
  return useQuery({
    queryKey: ['subdivisions'],
    queryFn: async () => {
      const { data } = await api.get<SubdivisionOut[]>('/master-data/subdivisions')
      return data
    },
  })
}
