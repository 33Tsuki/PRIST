import { useSupervisors, useDeleteSupervisor } from '@/hooks/use-users'
import { CreateSupervisorForm } from './create-user-form'
import { UserRoleTab } from './user-role-tab'

export function SupervisorsTab() {
  const { data: supervisors = [], isLoading } = useSupervisors()
  const deleteSupervisor = useDeleteSupervisor()

  return (
    <div className="space-y-6">
      <CreateSupervisorForm />
      <UserRoleTab
        role="DISTRICT_SUPERVISOR"
        users={supervisors}
        isLoading={isLoading}
        deleteUser={deleteSupervisor}
      />
    </div>
  )
}
