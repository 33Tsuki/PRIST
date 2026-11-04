import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type { SurveyRoundOut, SurveyRoundCreate, SurveyRoundUpdate } from '@/types'

export function useSurveyRounds() {
  return useQuery({
    queryKey: ['survey-rounds'],
    queryFn: async () => {
      const { data } = await api.get<SurveyRoundOut[]>('/survey/rounds')
      return data
    },
  })
}

export function useCreateSurveyRound() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SurveyRoundCreate) => {
      const { data } = await api.post<SurveyRoundOut>('/survey/rounds', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-rounds'] })
      queryClient.invalidateQueries({ queryKey: ['round-assignments'] })
      toast.success('Survey round created successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create survey round')
    },
  })
}

export function useUpdateSurveyRound(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SurveyRoundUpdate) => {
      const { data } = await api.put<SurveyRoundOut>(`/survey/rounds/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-rounds'] })
      queryClient.invalidateQueries({ queryKey: ['round-assignments'] })
      toast.success('Survey round updated successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update survey round')
    },
  })
}

export function useDeleteSurveyRound() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/survey/rounds/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-rounds'] })
      queryClient.invalidateQueries({ queryKey: ['round-assignments'] })
      toast.success('Survey round deleted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete survey round')
    },
  })
}

// Lifecycle transitions. The backend enforces "one ACTIVE round per cycle" and the
// ACTIVE-only end guard, returning 409 with a clear message that toastApiError surfaces.
export function useStartRound() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<SurveyRoundOut>(`/survey/rounds/${id}/start`)
      return data
    },
    onSuccess: (round) => {
      queryClient.invalidateQueries({ queryKey: ['survey-rounds'] })
      queryClient.invalidateQueries({ queryKey: ['round-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', round.round_id] })
      toast.success(`${roundLabel(round)} is now running`)
    },
    onError: (error) => {
      toastApiError(error, 'Failed to start round')
    },
  })
}

export function useEndRound() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<SurveyRoundOut>(`/survey/rounds/${id}/end`)
      return data
    },
    onSuccess: (round) => {
      queryClient.invalidateQueries({ queryKey: ['survey-rounds'] })
      queryClient.invalidateQueries({ queryKey: ['round-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['round-markets', round.round_id] })
      toast.success(`${roundLabel(round)} ended`)
    },
    onError: (error) => {
      toastApiError(error, 'Failed to end round')
    },
  })
}

function roundLabel(round: SurveyRoundOut): string {
  return round.round_name ?? `Round ${round.round_number}`
}
