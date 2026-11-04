import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RoundsTab } from './rounds-tab'
import { AssignmentsTab } from './assignments-tab'
import { MarketSetupTab } from './market-setup-tab'

const VALID_TABS = ['rounds', 'assignments', 'market-setup'] as const
type Tab = (typeof VALID_TABS)[number]

function parseTab(value: string | null): Tab {
  return VALID_TABS.includes(value as Tab) ? (value as Tab) : 'rounds'
}

export default function SurveyManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as Tab
      setActiveTab(tab)
      setSearchParams(tab === 'rounds' ? {} : { tab }, { replace: true })
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Survey Management</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="rounds">Rounds</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="market-setup">Market-Shop-Item Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="rounds">
          <RoundsTab />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsTab />
        </TabsContent>

        <TabsContent value="market-setup">
          <MarketSetupTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
