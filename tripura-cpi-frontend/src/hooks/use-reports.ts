import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { toastApiError } from '@/lib/api-error'
import type {
  ReportTypeOut,
  GeneratedReportOut,
  GenerateReportRequest,
  ReportPreviewOut,
  ReportPreviewRequest,
  UpdateReportRequest,
} from '@/types'

// The report catalog rarely changes within a session, so keep it fresh for a while.
export function useReportTypes() {
  return useQuery({
    queryKey: ['report-types'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get<ReportTypeOut[]>('/reports/types')
      return data
    },
  })
}

export function useGeneratedReports(offset: number, limit: number) {
  return useQuery({
    queryKey: ['generated-reports', offset, limit],
    queryFn: async () => {
      const { data } = await api.get<GeneratedReportOut[]>('/reports', {
        params: { offset, limit },
      })
      return data
    },
    // Rows are background jobs — poll while any is still rendering.
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === 'PENDING') ? 2000 : false,
  })
}

// Errors are handled by the caller (inline field errors / banners), so this mutation
// deliberately does not toast on error — see generate-tab.tsx.
export function useGenerateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: GenerateReportRequest) => {
      const { data } = await api.post<GeneratedReportOut>('/reports', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] })
    },
  })
}

// A dry run, not a cacheable read: it costs a full table scan server-side, so it
// must only fire when the user explicitly asks — hence useMutation. Errors are
// handled by the caller inline, same as useGenerateReport.
export function usePreviewReport() {
  return useMutation({
    mutationFn: async (body: ReportPreviewRequest) => {
      const { data } = await api.post<ReportPreviewOut>('/reports/preview', body)
      return data
    },
  })
}

export function useUpdateReport(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: UpdateReportRequest) => {
      const { data } = await api.put<GeneratedReportOut>(`/reports/${id}`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] })
      toast.success('Report updated')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to update report')
    },
  })
}

export function useDeleteReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/reports/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] })
      toast.success('Report deleted')
    },
    onError: (error) => {
      toastApiError(error, 'Failed to delete report')
    },
  })
}

// Re-runs the report's stored filters/columns against current data and replaces the file
// in place, flipping the row back to PENDING — the poll in useGeneratedReports picks that
// up with no extra wiring. Allowed from READY or FAILED (retrying a FAILED row is the
// documented recovery path); 409 while one is already rendering.
//
// id travels in mutate rather than as a hook argument (unlike useUpdateReport) because one
// hook instance serves every grid row — same as useDeleteReport. confirm has to be a mutate
// variable regardless, since the same report is submitted twice with different values.
//
// Errors belong to the caller: the 409 requires_confirmation handshake is a dialog, and
// toastApiError would mask the server's 403/404 text — see history-tab.tsx.
export function useRegenerateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, confirm }: { id: number; confirm?: boolean }) => {
      // Unlike POST /reports, confirm is a QUERY param here and the body is empty.
      const { data } = await api.post<GeneratedReportOut>(
        `/reports/${id}/regenerate`,
        undefined,
        confirm ? { params: { confirm: true } } : undefined,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] })
    },
  })
}

// Streams the file as a blob and triggers a browser download, using the filename the
// server sets in Content-Disposition. Mirrors src/hooks/use-template-download.ts.
export function useDownloadReport() {
  return useCallback(async (id: number, fallbackName: string) => {
    try {
      const response = await api.get(`/reports/${id}/download`, { responseType: 'blob' })
      const disposition = response.headers['content-disposition']
      const filename =
        disposition?.match(/filename=(.+)/)?.[1]?.replace(/["']/g, '') ?? fallbackName

      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      toastApiError(error, 'Failed to download report')
    }
  }, [])
}
