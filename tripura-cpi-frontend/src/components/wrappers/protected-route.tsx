import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-auth'

export function ProtectedRoute() {
  const { data: user, isLoading, isError } = useCurrentUser()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !user || (user.role !== 'ADMIN' && user.role !== 'DISTRICT_SUPERVISOR')) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
