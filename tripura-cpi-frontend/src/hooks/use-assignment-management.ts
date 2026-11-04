import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type {
  CreateAssignmentInput,
  CreatePriceDataInput,
  MarketLookup,
  RolloverResult,
  SurveyorAssignment,
  SurveyorLookup,
  SurveyorMarket,
  UpdateAssignmentInput,
} from '@/types'

// These two lookups hit admin-only endpoints; supervisors pass enabled=false and use
// the district-scoped /auth/my/* lists instead.
export function useSurveyors(enabled = true) {
  return useQuery({
    queryKey: ['surveyors-lookup'],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<SurveyorLookup[]>('/survey/surveyors')
      return data
    },
  })
}

export function useMarketsLookup(enabled = true) {
  return useQuery({
    queryKey: ['markets-lookup'],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<MarketLookup[]>('/survey/markets')
      return data
    },
  })
}

export function useRoundAssignments(roundId: number | null) {
  return useQuery({
    queryKey: ['round-assignments', roundId],
    enabled: roundId !== null,
    queryFn: async () => {
      const { data } = await api.get<SurveyorAssignment[]>(`/survey/assignments/${roundId}`)
      return data
    },
  })
}

export function useCreateAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateAssignmentInput) => {
      const { data } = await api.post<SurveyorAssignment>('/survey/assignments', body)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['round-assignments', variables.round_id],
      })
      queryClient.invalidateQueries({ queryKey: ['surveyor-markets'] })
      toast.success('Assignment created')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to create assignment')
    },
  })
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assignment_id, body }: UpdateAssignmentInput) => {
      const { data } = await api.put<SurveyorAssignment>(
        `/survey/assignments/${assignment_id}`,
        body,
      )
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['round-assignments', data.round_id],
      })
      queryClient.invalidateQueries({ queryKey: ['surveyor-markets'] })
      toast.success('Assignment updated')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update assignment')
    },
  })
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assignmentId, roundId }: { assignmentId: number; roundId: number }) => {
      await api.delete(`/survey/assignments/${assignmentId}`)
      return roundId
    },
    onSuccess: (roundId) => {
      queryClient.invalidateQueries({ queryKey: ['round-assignments', roundId] })
      queryClient.invalidateQueries({ queryKey: ['surveyor-markets'] })
      toast.success('Assignment deleted')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete assignment')
    },
  })
}

export function useRolloverAssignments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ roundId, fromRoundId }: { roundId: number; fromRoundId?: number }) => {
      const params = fromRoundId ? { from_round_id: fromRoundId } : undefined
      const { data } = await api.post<RolloverResult>(
        `/survey/rounds/${roundId}/rollover-assignments`,
        null,
        { params },
      )
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['round-assignments', data.target_round_id] })
      const n = data.assignments_copied
      toast.success(`Copied ${n} ${n === 1 ? 'assignment' : 'assignments'} into this round`)
    },
    onError: (error) => {
      toastApiError(error, 'Could not copy the assignments. Please try again.')
    },
  })
}

export function useSurveyorMarkets(surveyorId: number | null, roundId: number | null) {
  return useQuery({
    queryKey: ['surveyor-markets', surveyorId, roundId],
    enabled: surveyorId !== null,
    queryFn: async () => {
      const params = roundId ? { round_id: roundId } : undefined
      const { data } = await api.get<SurveyorMarket[]>(`/survey/surveyor/markets/${surveyorId}`, {
        params,
      })
      return data
    },
  })
}

export function useSubmitPriceData() {
  return useMutation({
    mutationFn: async (body: CreatePriceDataInput) => {
      const { data } = await api.post('/survey/price-data', body)
      return data
    },
    onSuccess: () => {
      toast.success('Price submitted successfully')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to submit price')
    },
  })
}
