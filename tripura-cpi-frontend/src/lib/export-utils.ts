import type { GridApi } from 'ag-grid-community'
import type { AxiosResponse } from 'axios'

/**
 * Save a `responseType: 'blob'` axios response to disk, naming it from the
 * Content-Disposition header the download endpoints all set.
 */
export function downloadBlobResponse(response: AxiosResponse<Blob>, fallbackName: string) {
  const disposition = response.headers['content-disposition'] as string | undefined
  const filename = disposition?.match(/filename=(.+)/)?.[1]?.replace(/["']/g, '') ?? fallbackName
  triggerFileDownload(response.data, filename)
}

export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function getExportableColumnKeys(api: GridApi): string[] {
  return api
    .getAllDisplayedColumns()
    .map((col) => col.getColDef().field)
    .filter((field): field is string => !!field)
}

export function getFilteredRowData<T>(api: GridApi<T>): T[] {
  const rows: T[] = []
  api.forEachNodeAfterFilterAndSort((node) => {
    if (node.data) rows.push(node.data)
  })
  return rows
}

export function getFilterSuffix(api: GridApi): string {
  const model = api.getFilterModel()
  const parts: string[] = []
  for (const [key, value] of Object.entries(model)) {
    const v = (value as Record<string, unknown>).filter ?? (value as Record<string, unknown>).values
    if (v != null) {
      const label = Array.isArray(v) ? v.join('-') : String(v)
      parts.push(`${key}-${label}`)
    }
  }
  return parts.length > 0 ? '_' + parts.join('_') : ''
}

export function deriveFilenameFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(segments[i])) return segments[i]
  }
  return 'export'
}
