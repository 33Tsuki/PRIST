import { useState, useRef, useCallback, useMemo } from 'react'
import { Check, ChevronsUpDown, Pencil, Trash2, Plus } from 'lucide-react'
import type { ColDef, ICellRendererParams, GridApi, SelectionChangedEvent } from 'ag-grid-community'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/wrappers/data-grid'
import { UploadToolbar } from '@/components/master-data/upload-toolbar'
import { BulkDeleteDialog } from '@/components/master-data/bulk-delete-dialog'
import { EditShopDialog } from '@/components/master-data/edit-shop-dialog'
import { CreateShopDirectDialog } from '@/components/master-data/create-shop-direct-dialog'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { useAllShops } from '@/hooks/use-all-shops'
import { useMarkets } from '@/hooks/use-markets'
import { useDeleteShop } from '@/hooks/use-shops'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import type { ShopOut } from '@/types'

interface ShopsDirectTabProps {
  initialMarketId?: string
  onMarketFilterChange?: (marketId: string) => void
}

export function ShopsDirectTab({
  initialMarketId = '',
  onMarketFilterChange,
}: ShopsDirectTabProps) {
  const [marketId, setMarketIdState] = useState<string>(initialMarketId)
  const [comboboxOpen, setComboboxOpen] = useState(false)

  const setMarketId = useCallback(
    (value: string) => {
      setMarketIdState(value)
      onMarketFilterChange?.(value)
    },
    [onMarketFilterChange],
  )

  const { data: markets = [] } = useMarkets()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingShop, setEditingShop] = useState<ShopOut | null>(null)
  const [deletingShop, setDeletingShop] = useState<ShopOut | null>(null)
  const deleteMutation = useDeleteShop(deletingShop?.market_id?.toString() ?? '0')

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const gridApiRef = useRef<GridApi<ShopOut> | null>(null)

  const handleSelectionChanged = useCallback((event: SelectionChangedEvent<ShopOut>) => {
    const rows = event.api.getSelectedRows()
    setSelectedIds(rows.map((r) => r.shop_id))
  }, [])

  const params = useMemo(() => {
    if (marketId) return { market_id: Number(marketId) }
    return undefined
  }, [marketId])

  const { data: shops = [], isLoading } = useAllShops(params)
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const marketNameMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of markets) {
      map.set(m.market_id, `${m.market_code} — ${m.selected_market}`)
    }
    return map
  }, [markets])

  const columnDefs = useMemo<ColDef<ShopOut>[]>(
    () => [
      { field: 'shop_serial_no', headerName: 'Serial No.', minWidth: 110 },
      { field: 'shop_name', headerName: 'Shop Name', minWidth: 180, flex: 2 },
      { field: 'shop_phone_number', headerName: 'Phone', minWidth: 130 },
      { field: 'shop_description_and_location', headerName: 'Location', minWidth: 160, flex: 1 },
      {
        field: 'general_description_of_items_sold',
        headerName: 'Items Sold',
        minWidth: 160,
        flex: 1,
      },
      {
        field: 'market_id',
        headerName: 'Market',
        minWidth: 180,
        valueFormatter: ({ value }) => marketNameMap.get(value) ?? String(value),
      },
      {
        colId: 'actions',
        headerName: '',
        width: 90,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams<ShopOut>) => {
          if (!params.data) return null
          const row = params.data
          return (
            <div className="flex items-center gap-1 h-full">
              <Button variant="ghost" size="icon-xs" onClick={() => setEditingShop(row)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setDeletingShop(row)}>
                <Trash2 />
              </Button>
            </div>
          )
        },
      },
    ],
    [marketNameMap],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboboxOpen}
              className="w-[280px] justify-between font-normal"
            >
              <span className="truncate">
                {marketId ? (marketNameMap.get(Number(marketId)) ?? marketId) : 'All Markets'}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search markets..." />
              <CommandList>
                <CommandEmpty>No market found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      setMarketId('')
                      setComboboxOpen(false)
                    }}
                  >
                    All Markets
                    <Check className={cn('ml-auto', !marketId ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                  {markets.map((m) => {
                    const id = String(m.market_id)
                    const label = `${m.market_code} — ${m.selected_market}`
                    return (
                      <CommandItem
                        key={m.market_id}
                        value={label}
                        onSelect={() => {
                          setMarketId(marketId === id ? '' : id)
                          setComboboxOpen(false)
                        }}
                      >
                        {label}
                        <Check
                          className={cn('ml-auto', marketId === id ? 'opacity-100' : 'opacity-0')}
                        />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add Shop
          </Button>
          {isAdmin && <UploadToolbar entityType="shops-direct" />}
        </div>
      </div>
      <DataGrid<ShopOut>
        persistKey="master-data:shops"
        rowData={shops}
        columnDefs={columnDefs}
        gridOptions={{
          loading: isLoading,
          rowSelection: { mode: 'multiRow' },
          onSelectionChanged: handleSelectionChanged,
          onGridReady: (e) => {
            gridApiRef.current = e.api
          },
        }}
      />

      <CreateShopDirectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditShopDialog
        shop={editingShop}
        marketId={editingShop?.market_id?.toString() ?? '0'}
        onClose={() => setEditingShop(null)}
      />

      <DeleteConfirmDialog
        open={!!deletingShop}
        onOpenChange={(open) => !open && setDeletingShop(null)}
        onConfirm={() => {
          if (deletingShop) {
            deleteMutation.mutate(deletingShop.shop_id, {
              onSuccess: () => setDeletingShop(null),
            })
          }
        }}
        entityLabel="shop"
        identifier={
          deletingShop ? `${deletingShop.shop_serial_no} — ${deletingShop.shop_name}` : ''
        }
        isPending={deleteMutation.isPending}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        entityType="shops-direct"
        selectedIds={selectedIds}
        onComplete={() => {
          setSelectedIds([])
          gridApiRef.current?.deselectAll()
        }}
      />
    </div>
  )
}
