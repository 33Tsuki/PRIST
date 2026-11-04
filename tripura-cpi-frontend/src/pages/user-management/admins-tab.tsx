import { useAdmins, useDeleteAdmin } from '@/hooks/use-users'
import { CreateAdminForm } from './create-user-form'
import { UserRoleTab } from './user-role-tab'

export function AdminsTab() {
  const { data: admins = [], isLoading } = useAdmins()
  const deleteAdmin = useDeleteAdmin()

  return (
    <div className="space-y-6">
      <CreateAdminForm />
      <UserRoleTab role="ADMIN" users={admins} isLoading={isLoading} deleteUser={deleteAdmin} />
    </div>
  )
}
