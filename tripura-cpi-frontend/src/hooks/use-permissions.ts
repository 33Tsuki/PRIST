import { useAuth } from '@/hooks/use-auth'
import { canPerform, type Action, type Subject } from '@/lib/permissions'

export function usePermissions() {
  const { user } = useAuth()

  return {
    can: (action: Action, subject: Subject, resource?: { district_id?: number | null }) =>
      canPerform(user, action, subject, resource),
  }
}
