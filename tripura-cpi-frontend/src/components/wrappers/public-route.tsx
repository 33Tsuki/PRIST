import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-auth'

export function PublicRoute() {
  const { data: user, isLoading } = useCurrentUser()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (user?.role === 'ADMIN' || user?.role === 'DISTRICT_SUPERVISOR') {
    return <Navigate to="/survey-dashboard" replace />
  }

  return <Outlet />
}
