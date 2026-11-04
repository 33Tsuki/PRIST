import { useCallback, type RefObject } from 'react'
import { toast } from 'sonner'
import type { GridApi } from 'ag-grid-community'
import { format } from 'date-fns'
import {
  getExportableColumnKeys,
  getFilteredRowData,
  getFilterSuffix,
  triggerFileDownload,
} from '@/lib/export-utils'

export function useGridExport(gridApiRef: RefObject<GridApi | null>, filenamePrefix = 'export') {
  const exportCsv = useCallback(() => {
    const api = gridApiRef.current
    if (!api) return

    const columnKeys = getExportableColumnKeys(api)
    if (columnKeys.length === 0) {
      toast.error('There are no columns to export.')
      return
    }

    const dateSuffix = format(new Date(), 'yyyy-MM-dd')
    const filterSuffix = getFilterSuffix(api)
    api.exportDataAsCsv({
      columnKeys,
      fileName: `${filenamePrefix}${filterSuffix}_${dateSuffix}.csv`,
    })
    toast.success('CSV exported successfully')
  }, [gridApiRef, filenamePrefix])

  const exportXlsx = useCallback(async () => {
    const api = gridApiRef.current
    if (!api) return

    const columnKeys = getExportableColumnKeys(api)
    if (columnKeys.length === 0) {
      toast.error('There are no columns to export.')
      return
    }

    const rows = getFilteredRowData(api)
    if (rows.length === 0) {
      toast.error('There is nothing to export.')
      return
    }

    try {
      const XLSX = await import('xlsx')

      const exportData = rows.map((row) => {
        const obj: Record<string, unknown> = {}
        for (const key of columnKeys) {
          obj[key] = (row as Record<string, unknown>)[key]
        }
        return obj
      })

      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')

      const dateSuffix = format(new Date(), 'yyyy-MM-dd')
      const filterSuffix = getFilterSuffix(api)
      const buffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      })
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      triggerFileDownload(blob, `${filenamePrefix}${filterSuffix}_${dateSuffix}.xlsx`)
      toast.success('Excel file exported successfully')
    } catch {
      toast.error('Failed to export Excel file')
    }
  }, [gridApiRef, filenamePrefix])

  return { exportCsv, exportXlsx }
}
