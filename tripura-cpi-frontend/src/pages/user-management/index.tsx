import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { SurveyorsTab } from './surveyors-tab'
import { SupervisorsTab } from './supervisors-tab'
import { AdminsTab } from './admins-tab'

const VALID_TABS = ['surveyors', 'supervisors', 'admins'] as const
type Tab = (typeof VALID_TABS)[number]

function parseTab(value: string | null): Tab {
  return VALID_TABS.includes(value as Tab) ? (value as Tab) : 'surveyors'
}

export default function UserManagementPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))

  // Supervisors only manage their own price collectors — keep them on the surveyors tab.
  const effectiveTab: Tab = isAdmin ? activeTab : 'surveyors'

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as Tab
      setActiveTab(tab)
      setSearchParams(tab === 'surveyors' ? {} : { tab }, { replace: true })
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">User Management</h1>
      <Tabs value={effectiveTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="surveyors">Surveyors</TabsTrigger>
          {isAdmin && <TabsTrigger value="supervisors">Supervisors</TabsTrigger>}
          {isAdmin && <TabsTrigger value="admins">Admins</TabsTrigger>}
        </TabsList>
        <TabsContent value="surveyors">
          <SurveyorsTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="supervisors">
            <SupervisorsTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="admins">
            <AdminsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
