import { useSurveyors, useDeleteSurveyor } from '@/hooks/use-users'
import { useMyPriceCollectors } from '@/hooks/use-my-district'
import { usePermissions } from '@/hooks/use-permissions'
import { useAuth } from '@/hooks/use-auth'
import { CreateSurveyorForm } from './create-user-form'
import { UserRoleTab } from './user-role-tab'

export function SurveyorsTab() {
  const { user } = useAuth()
  const { can } = usePermissions()
  const isSupervisor = user?.role === 'DISTRICT_SUPERVISOR'

  // Admins see all price collectors; a supervisor sees only their own district's.
  const allSurveyors = useSurveyors(!isSupervisor)
  const myPriceCollectors = useMyPriceCollectors(isSupervisor)
  const { data: surveyors = [], isLoading } = isSupervisor ? myPriceCollectors : allSurveyors

  const deleteSurveyor = useDeleteSurveyor()

  return (
    <div className="space-y-6">
      {can('create', 'User') && <CreateSurveyorForm />}
      <UserRoleTab
        role="PRICE_COLLECTOR"
        users={surveyors}
        isLoading={isLoading}
        deleteUser={deleteSurveyor}
      />
    </div>
  )
}
