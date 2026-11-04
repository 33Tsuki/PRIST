import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { User } from '@/types'

// --- Admin types ---

export interface AdminCreateInput {
  username: string
  password: string
}

export interface AdminUpdateInput {
  userId: number
  body: {
    username?: string
    password?: string
  }
}

// --- Surveyor types ---

export interface SurveyorCreateInput {
  full_name: string
  phone?: string
  email?: string | null
  district_id: number
  password: string
  is_active?: boolean
}

export interface SurveyorUpdateInput {
  userId: number
  body: {
    full_name?: string
    phone?: string
    email?: string | null
    password?: string
    is_active?: boolean
  }
}

// --- Admin hooks ---

export function useAdmins() {
  return useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const { data } = await api.get<User[]>('/auth/admins', {
        params: { limit: 200 },
      })
      return data
    },
  })
}

export function useCreateAdmin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: AdminCreateInput) => {
      const { data } = await api.post<User>('/auth/admins', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('Admin created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create admin')
    },
  })
}

export function useUpdateAdmin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, body }: AdminUpdateInput) => {
      const { data } = await api.put<User>(`/auth/admins/${userId}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('Admin updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update admin')
    },
  })
}

export function useDeleteAdmin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/auth/admins/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('Admin deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete admin')
    },
  })
}

// --- Surveyor hooks ---

// Admin-only listing of every price collector. Supervisors pass enabled=false and use
// useMyPriceCollectors() instead.
export function useSurveyors(enabled = true) {
  return useQuery({
    queryKey: ['surveyors'],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<User[]>('/auth/surveyors', {
        params: { limit: 200 },
      })
      return data
    },
  })
}

export function useCreateSurveyor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SurveyorCreateInput) => {
      const { data } = await api.post<User>('/auth/surveyors', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveyors'] })
      queryClient.invalidateQueries({ queryKey: ['surveyors-lookup'] })
      queryClient.invalidateQueries({ queryKey: ['my-price-collectors'] })
      toast.success('Surveyor created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create surveyor')
    },
  })
}

export function useUpdateSurveyor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, body }: SurveyorUpdateInput) => {
      const { data } = await api.put<User>(`/auth/surveyors/${userId}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveyors'] })
      queryClient.invalidateQueries({ queryKey: ['surveyors-lookup'] })
      queryClient.invalidateQueries({ queryKey: ['my-price-collectors'] })
      toast.success('Surveyor updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update surveyor')
    },
  })
}

export function useDeleteSurveyor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/auth/surveyors/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveyors'] })
      queryClient.invalidateQueries({ queryKey: ['surveyors-lookup'] })
      queryClient.invalidateQueries({ queryKey: ['my-price-collectors'] })
      toast.success('Surveyor deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete surveyor')
    },
  })
}

// --- District supervisor types ---

export interface SupervisorCreateInput {
  username: string
  full_name: string
  email?: string | null
  district_id: number
  password: string
  is_active?: boolean
}

export interface SupervisorUpdateInput {
  userId: number
  body: {
    full_name?: string
    phone?: string
    email?: string | null
    password?: string
    is_active?: boolean
  }
}

// --- District supervisor hooks ---

export function useSupervisors() {
  return useQuery({
    queryKey: ['supervisors'],
    queryFn: async () => {
      const { data } = await api.get<User[]>('/auth/supervisors', {
        params: { limit: 200 },
      })
      return data
    },
  })
}

export function useCreateSupervisor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SupervisorCreateInput) => {
      const { data } = await api.post<User>('/auth/supervisors', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] })
      toast.success('Supervisor created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create supervisor')
    },
  })
}

export function useUpdateSupervisor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, body }: SupervisorUpdateInput) => {
      const { data } = await api.put<User>(`/auth/supervisors/${userId}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] })
      toast.success('Supervisor updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update supervisor')
    },
  })
}

export function useDeleteSupervisor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/auth/supervisors/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] })
      toast.success('Supervisor deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete supervisor')
    },
  })
}
