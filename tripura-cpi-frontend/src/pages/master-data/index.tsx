import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ItemsTab } from './items-tab'
import { MarketsTab } from './markets-tab'
import { ShopsDirectTab } from './shops-direct-tab'
import { SubdivisionsTab } from './subdivisions-tab'

const VALID_TABS = ['items', 'markets', 'shops-direct', 'subdivisions'] as const
type Tab = (typeof VALID_TABS)[number]

function parseTab(value: string | null): Tab {
  return VALID_TABS.includes(value as Tab) ? (value as Tab) : 'items'
}

export default function MasterDataPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as Tab
      setActiveTab(tab)
      setSearchParams(tab === 'items' ? {} : { tab }, { replace: true })
    },
    [setSearchParams],
  )

  const initialDomain = searchParams.get('domain') ?? ''
  const initialDistrictId = searchParams.get('district_id') ?? ''
  const initialMarketId = searchParams.get('market_id') ?? ''

  const handleFiltersChange = useCallback(
    (domain: string, districtId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (domain) next.set('domain', domain)
          else next.delete('domain')
          if (districtId) next.set('district_id', districtId)
          else next.delete('district_id')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handleMarketFilterChange = useCallback(
    (marketId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (marketId) next.set('market_id', marketId)
          else next.delete('market_id')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Master Data</h1>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="shops-direct">All Shops</TabsTrigger>
          <TabsTrigger value="subdivisions">Subdivisions</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <ItemsTab />
        </TabsContent>
        <TabsContent value="markets">
          <MarketsTab
            initialDomain={initialDomain}
            initialDistrictId={initialDistrictId}
            onFiltersChange={handleFiltersChange}
          />
        </TabsContent>
        <TabsContent value="shops-direct">
          <ShopsDirectTab
            initialMarketId={initialMarketId}
            onMarketFilterChange={handleMarketFilterChange}
          />
        </TabsContent>
        <TabsContent value="subdivisions">
          <SubdivisionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
