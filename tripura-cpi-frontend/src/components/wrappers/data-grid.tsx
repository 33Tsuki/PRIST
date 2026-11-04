import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router'
import { RotateCcw, Search } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import type {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  StateUpdatedEvent,
} from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGridExport } from '@/hooks/use-grid-export'
import { useGridStatePersistence } from '@/hooks/use-grid-state-persistence'
import { ExportDropdown } from '@/components/wrappers/export-dropdown'
import { deriveFilenameFromPath } from '@/lib/export-utils'

ModuleRegistry.registerModules([AllCommunityModule])

// AG Grid's built-in overlays read as developer defaults ("No Rows To Show"). Overriding
// them here covers every grid in the app at once. Module-level so the reference is stable.
const GRID_LOCALE_TEXT = {
  noRowsToShow: 'Nothing to show yet.',
  loadingOoo: 'Loading…',
}

interface DataGridProps<TData> {
  rowData: TData[]
  columnDefs: ColDef<TData>[]
  gridOptions?: GridOptions<TData>
  exportFilename?: string
  searchable?: boolean
  searchPlaceholder?: string
  /** Stable key used to remember this table's column layout (order, width, visibility, pinning, sort) per device. */
  persistKey?: string
  /** Set false to hide the CSV/XLSX export — e.g. for a truncated preview, where
   *  an exported sample would masquerade as the full dataset. */
  exportable?: boolean
}

export function DataGrid<TData>({
  rowData,
  columnDefs,
  gridOptions,
  exportFilename,
  searchable = true,
  searchPlaceholder = 'Search...',
  persistKey,
  exportable = true,
}: DataGridProps<TData>) {
  const [quickFilter, setQuickFilter] = useState('')
  const [pagingPanel, setPagingPanel] = useState<HTMLElement | null>(null)
  const gridApiRef = useRef<GridApi<TData>>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const {
    onGridReady: callerOnGridReady,
    onStateUpdated: callerOnStateUpdated,
    defaultColDef: callerDefaultColDef,
    ...restGridOptions
  } = gridOptions ?? {}

  const mergedDefaultColDef = useMemo<ColDef<TData>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      minWidth: 100,
      ...callerDefaultColDef,
    }),
    [callerDefaultColDef],
  )

  const { initialState, gridKey, onStateUpdated, resetState, enabled } =
    useGridStatePersistence(persistKey)

  const handleGridReady = useCallback(
    (event: GridReadyEvent<TData>) => {
      gridApiRef.current = event.api
      const findPanel = () => {
        const panel = gridWrapperRef.current?.querySelector<HTMLElement>('.ag-paging-panel')
        if (panel) setPagingPanel(panel)
        else requestAnimationFrame(findPanel)
      }
      findPanel()
      callerOnGridReady?.(event)
    },
    [callerOnGridReady],
  )

  const handleStateUpdated = useCallback(
    (event: StateUpdatedEvent<TData>) => {
      onStateUpdated(event)
      callerOnStateUpdated?.(event)
    },
    [onStateUpdated, callerOnStateUpdated],
  )

  const location = useLocation()
  const filenamePrefix = exportFilename ?? deriveFilenameFromPath(location.pathname)

  const { exportCsv, exportXlsx } = useGridExport(gridApiRef, filenamePrefix)

  return (
    <div className="flex h-[600px] w-full flex-col gap-2">
      {searchable && (
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder={searchPlaceholder}
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      )}
      <div ref={gridWrapperRef} className="min-h-0 flex-1">
        <AgGridReact<TData>
          key={gridKey}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={mergedDefaultColDef}
          pagination
          paginationPageSize={20}
          // Column layout is persisted per device. AG Grid drops the current column order
          // whenever new columnDefs arrive unless this is set.
          maintainColumnOrder
          localeText={GRID_LOCALE_TEXT}
          {...restGridOptions}
          initialState={initialState}
          quickFilterText={quickFilter}
          cacheQuickFilter
          onGridReady={handleGridReady}
          onStateUpdated={handleStateUpdated}
        />
      </div>
      {pagingPanel &&
        createPortal(
          <div className="order-first mr-auto flex items-center gap-2">
            {exportable && <ExportDropdown onCsv={exportCsv} onXlsx={exportXlsx} />}
            {enabled && (
              <Button variant="outline" size="sm" onClick={() => resetState()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset layout
              </Button>
            )}
          </div>,
          pagingPanel,
        )}
    </div>
  )
}
