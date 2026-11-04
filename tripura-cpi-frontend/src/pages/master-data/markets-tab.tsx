import { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { format } from 'date-fns'
import type {
  ColDef,
  RowClickedEvent,
  ICellRendererParams,
  GridApi,
  SelectionChangedEvent,
} from 'ag-grid-community'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/wrappers/data-grid'
import { UploadToolbar } from '@/components/master-data/upload-toolbar'
import { BulkDeleteDialog } from '@/components/master-data/bulk-delete-dialog'
import { EditMarketDialog } from '@/components/master-data/edit-market-dialog'
import { CreateMarketDialog } from '@/components/master-data/create-market-dialog'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { useMarkets, useDeleteMarket } from '@/hooks/use-markets'
import { useDistricts } from '@/hooks/use-districts'
import { useAuth } from '@/hooks/use-auth'
import { CPI_DOMAINS } from '@/types/master-data'
import type { MarketOut } from '@/types'

interface MarketsTabProps {
  initialDomain?: string
  initialDistrictId?: string
  onFiltersChange?: (domain: string, districtId: string) => void
}

export function MarketsTab({
  initialDomain = '',
  initialDistrictId = '',
  onFiltersChange,
}: MarketsTabProps) {
  const navigate = useNavigate()
  const { data: districts = [] } = useDistricts()
  const [domain, setDomainState] = useState<string>(initialDomain)
  const [districtId, setDistrictIdState] = useState<string>(initialDistrictId)

  const setDomain = useCallback(
    (value: string) => {
      setDomainState(value)
      onFiltersChange?.(value, districtId)
    },
    [districtId, onFiltersChange],
  )

  const setDistrictId = useCallback(
    (value: string) => {
      setDistrictIdState(value)
      onFiltersChange?.(domain, value)
    },
    [domain, onFiltersChange],
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [editingMarket, setEditingMarket] = useState<MarketOut | null>(null)
  const [deletingMarket, setDeletingMarket] = useState<MarketOut | null>(null)
  const deleteMutation = useDeleteMarket()

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const gridApiRef = useRef<GridApi<MarketOut> | null>(null)

  const handleSelectionChanged = useCallback((event: SelectionChangedEvent<MarketOut>) => {
    const rows = event.api.getSelectedRows()
    setSelectedIds(rows.map((r) => r.market_id))
  }, [])

  const params = useMemo(() => {
    const p: { domain?: string; district_id?: number } = {}
    if (domain) p.domain = domain
    if (districtId) p.district_id = Number(districtId)
    return Object.keys(p).length > 0 ? p : undefined
  }, [domain, districtId])

  const { data: markets = [], isLoading } = useMarkets(params)
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const columnDefs = useMemo<ColDef<MarketOut>[]>(
    () => [
      // {
      //   colId: 'checkbox',
      //   checkboxSelection: true,
      //   headerCheckboxSelection: true,
      //   width: 50,
      //   sortable: false,
      //   filter: false,
      //   resizable: false,
      //   pinned: 'left',
      // },
      { field: 'market_code', headerName: 'Market Code', minWidth: 130 },
      { field: 'selected_market', headerName: 'Market Name', minWidth: 180, flex: 2 },
      { field: 'domain', headerName: 'Domain', minWidth: 120 },
      { field: 'district_name', headerName: 'District', minWidth: 140 },
      { field: 'subdivision', headerName: 'Subdivision', minWidth: 130 },
      { field: 'address', headerName: 'Address', minWidth: 180, flex: 1 },
      {
        field: 'created_at',
        headerName: 'Created At',
        minWidth: 160,
        valueFormatter: ({ value }) => (value ? format(new Date(value), 'dd MMM yyyy, HH:mm') : ''),
      },
      {
        colId: 'actions',
        headerName: '',
        width: 90,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams<MarketOut>) => {
          if (!params.data) return null
          const row = params.data
          return (
            <div className="flex items-center gap-1 h-full">
              <Button variant="ghost" size="icon-xs" onClick={() => setEditingMarket(row)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setDeletingMarket(row)}>
                <Trash2 />
              </Button>
            </div>
          )
        },
      },
    ],
    [],
  )

  function handleRowClick(event: RowClickedEvent<MarketOut>) {
    const target = event.event?.target as HTMLElement | undefined
    if (target?.closest('button') || target?.closest('.ag-selection-checkbox')) return
    if (event.data) {
      navigate(`/master-data/markets/${event.data.market_id}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select value={domain} onValueChange={(v) => setDomain(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {CPI_DOMAINS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={districtId || 'all'}
            onValueChange={(v) => setDistrictId(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Districts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Districts</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d.district_id} value={d.district_id.toString()}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add Market
          </Button>
          {isAdmin && <UploadToolbar entityType="markets" />}
        </div>
      </div>
      <DataGrid<MarketOut>
        persistKey="master-data:markets"
        rowData={markets}
        columnDefs={columnDefs}
        gridOptions={{
          loading: isLoading,
          onRowClicked: handleRowClick,
          rowClass: 'cursor-pointer',
          rowSelection: { mode: 'multiRow' },
          onSelectionChanged: handleSelectionChanged,
          onGridReady: (e) => {
            gridApiRef.current = e.api
          },
        }}
      />

      <CreateMarketDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditMarketDialog market={editingMarket} onClose={() => setEditingMarket(null)} />

      <DeleteConfirmDialog
        open={!!deletingMarket}
        onOpenChange={(open) => !open && setDeletingMarket(null)}
        onConfirm={() => {
          if (deletingMarket) {
            deleteMutation.mutate(deletingMarket.market_id, {
              onSuccess: () => setDeletingMarket(null),
            })
          }
        }}
        entityLabel="market"
        identifier={
          deletingMarket ? `${deletingMarket.market_code} — ${deletingMarket.selected_market}` : ''
        }
        isPending={deleteMutation.isPending}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        entityType="markets"
        selectedIds={selectedIds}
        onComplete={() => {
          setSelectedIds([])
          gridApiRef.current?.deselectAll()
        }}
      />
    </div>
  )
}
