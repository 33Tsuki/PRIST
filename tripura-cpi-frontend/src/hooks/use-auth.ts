import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import { useAuthStore } from '@/store/auth-store'
import type { User } from '@/types'

export function useAuth() {
  const { user, isAuthenticated, setUser, clearAuth } = useAuthStore()
  return { user, isAuthenticated, setUser, clearAuth }
}

export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser)

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await api.get<User>('/auth/me')
      setUser(data)
      return data
    },
    retry: false,
  })
}

export function useLogin() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      await api.post('/auth/admin/login', credentials)
      const { data } = await api.get<User>('/auth/me')
      return data
    },
    onSuccess: (user) => {
      if (user.role !== 'ADMIN' && user.role !== 'DISTRICT_SUPERVISOR') {
        toast.error(
          'This dashboard is for supervisors and admins. Price collectors should use the mobile app.',
        )
        api.post('/auth/logout').catch(() => {})
        clearAuth()
        return
      }
      // Drop any cached data from a previous session before seeding the new user,
      // so one user never sees another's district-scoped data.
      queryClient.clear()
      setUser(user)
      queryClient.setQueryData(['auth', 'me'], user)
      navigate('/survey-dashboard')
    },
    onError: (error) => {
      toastApiError(error, 'Invalid username or password.')
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api.post('/auth/me/password', body),
    onSuccess: () => {
      toast.success('Password updated')
    },
    onError: (error) => {
      // The endpoint answers a wrong current password with 403 (not 401, which would hit the
      // refresh-and-retry interceptor in @/lib/axios and could sign the user out).
      toastApiError(error, 'Failed to change password', {
        403: 'Current password is incorrect',
      })
    },
  })
}

export function useLogout() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      clearAuth()
      // Wipe every cached query, not just ['auth','me'], so the next user starts fresh.
      queryClient.clear()
      navigate('/login')
    },
  })
}
