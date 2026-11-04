import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GenerateTab } from './generate-tab'
import { HistoryTab } from './history-tab'

const VALID_TABS = ['generate', 'history'] as const
type Tab = (typeof VALID_TABS)[number]

function parseTab(value: string | null): Tab {
  return VALID_TABS.includes(value as Tab) ? (value as Tab) : 'generate'
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as Tab
      setActiveTab(tab)
      setSearchParams(tab === 'generate' ? {} : { tab }, { replace: true })
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create price, coverage and index reports as PDF, Word or Excel — and find everything
          you've already made.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate">Generate report</TabsTrigger>
          <TabsTrigger value="history">Generated reports</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <GenerateTab onGenerated={() => handleTabChange('history')} />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
