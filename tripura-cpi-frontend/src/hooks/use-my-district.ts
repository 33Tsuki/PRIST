import { useQuery } from '@tanstack/react-query'
import api from '@/lib/axios'
import type { User } from '@/types'

// District-supervisor self-views. The backend scopes these to the caller's own
// district (GET /auth/my/*), so no district param is needed.

export interface MyMarket {
  market_id: number
  market_name: string
  market_code: string
  domain: string
  district_name: string
}

export function useMyPriceCollectors(enabled = true) {
  return useQuery({
    queryKey: ['my-price-collectors'],
    queryFn: async () => {
      const { data } = await api.get<User[]>('/auth/my/price-collectors')
      return data
    },
    enabled,
  })
}

export function useMyMarkets(enabled = true) {
  return useQuery({
    queryKey: ['my-markets'],
    queryFn: async () => {
      const { data } = await api.get<MyMarket[]>('/auth/my/markets')
      return data
    },
    enabled,
  })
}
