import { useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react'
import type { ColDef, ICellRendererParams, GridApi, SelectionChangedEvent } from 'ag-grid-community'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/wrappers/data-grid'
import { UploadToolbar } from '@/components/master-data/upload-toolbar'
import { BulkDeleteDialog } from '@/components/master-data/bulk-delete-dialog'
import { EditShopDialog } from '@/components/master-data/edit-shop-dialog'
import { CreateShopDialog } from '@/components/master-data/create-shop-dialog'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { useMarket } from '@/hooks/use-markets'
import { useShops, useDeleteShop } from '@/hooks/use-shops'
import { useAuth } from '@/hooks/use-auth'
import type { ShopOut } from '@/types'

export default function MarketDetailPage() {
  const { marketId } = useParams<{ marketId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const { data: market, isLoading: marketLoading } = useMarket(marketId!)
  const { data: shops = [], isLoading: shopsLoading } = useShops(marketId!)
  const deleteMutation = useDeleteShop(marketId!)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingShop, setEditingShop] = useState<ShopOut | null>(null)
  const [deletingShop, setDeletingShop] = useState<ShopOut | null>(null)

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const gridApiRef = useRef<GridApi<ShopOut> | null>(null)

  const handleSelectionChanged = useCallback((event: SelectionChangedEvent<ShopOut>) => {
    const rows = event.api.getSelectedRows()
    setSelectedIds(rows.map((r) => r.shop_id))
  }, [])

  const columnDefs = useMemo<ColDef<ShopOut>[]>(
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
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4" />
          Back to Master Data
        </button>
      </div>

      {marketLoading ? (
        <div className="text-muted-foreground text-sm">Loading market details...</div>
      ) : market ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{market.selected_market}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Market Code</dt>
                  <dd className="font-medium">{market.market_code}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Domain</dt>
                  <dd className="font-medium">{market.domain}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">District</dt>
                  <dd className="font-medium">
                    {market.district_name} ({market.district_code})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Subdivision</dt>
                  <dd className="font-medium">{market.subdivision || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Market Day</dt>
                  <dd className="font-medium">{market.market_day || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Market Time</dt>
                  <dd className="font-medium">{market.market_time || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Block/ULB</dt>
                  <dd className="font-medium">{market.block_ulb_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">DSO Office</dt>
                  <dd className="font-medium">{market.dso_office || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="font-medium">{market.address || '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Shops</h2>
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
                {isAdmin && <UploadToolbar entityType="shops" marketId={marketId} />}
              </div>
            </div>
            <DataGrid<ShopOut>
              persistKey="master-data:market-shops"
              rowData={shops}
              columnDefs={columnDefs}
              gridOptions={{
                loading: shopsLoading,
                rowSelection: { mode: 'multiRow' },
                onSelectionChanged: handleSelectionChanged,
                onGridReady: (e) => {
                  gridApiRef.current = e.api
                },
              }}
            />
          </div>

          <CreateShopDialog
            open={createOpen}
            marketId={marketId!}
            onClose={() => setCreateOpen(false)}
          />
          <EditShopDialog
            shop={editingShop}
            marketId={marketId!}
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
            entityType="shops"
            selectedIds={selectedIds}
            marketId={marketId}
            onComplete={() => {
              setSelectedIds([])
              gridApiRef.current?.deselectAll()
            }}
          />
        </>
      ) : (
        <div className="text-muted-foreground text-sm">Market not found.</div>
      )}
    </div>
  )
}
