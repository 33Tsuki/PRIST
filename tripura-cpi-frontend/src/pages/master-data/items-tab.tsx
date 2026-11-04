import { useState, useRef, useCallback, useMemo } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { format } from 'date-fns'
import type { ColDef, ICellRendererParams, GridApi, SelectionChangedEvent } from 'ag-grid-community'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/wrappers/data-grid'
import { UploadToolbar } from '@/components/master-data/upload-toolbar'
import { BulkDeleteDialog } from '@/components/master-data/bulk-delete-dialog'
import { EditItemDialog } from '@/components/master-data/edit-item-dialog'
import { CreateItemDialog } from '@/components/master-data/create-item-dialog'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { useItems, useDeleteItem } from '@/hooks/use-items'
import { useAuth } from '@/hooks/use-auth'
import type { ItemOut } from '@/types'

export function ItemsTab() {
  const { data: items = [], isLoading } = useItems()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemOut | null>(null)
  const [deletingItem, setDeletingItem] = useState<ItemOut | null>(null)
  const deleteMutation = useDeleteItem()

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const gridApiRef = useRef<GridApi<ItemOut> | null>(null)

  const handleSelectionChanged = useCallback((event: SelectionChangedEvent<ItemOut>) => {
    const rows = event.api.getSelectedRows()
    setSelectedIds(rows.map((r) => r.item_id))
  }, [])

  const columnDefs = useMemo<ColDef<ItemOut>[]>(
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
      { field: 'item_code', headerName: 'Item Code', minWidth: 120 },
      { field: 'item_name', headerName: 'Item Name', minWidth: 200, flex: 2 },
      { field: 'notes', headerName: 'Notes', minWidth: 150, flex: 1 },
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
        cellRenderer: (params: ICellRendererParams<ItemOut>) => {
          if (!params.data) return null
          const row = params.data
          return (
            <div className="flex items-center gap-1 h-full">
              <Button variant="ghost" size="icon-xs" onClick={() => setEditingItem(row)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setDeletingItem(row)}>
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
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add Item
          </Button>
          {isAdmin && <UploadToolbar entityType="items" />}
        </div>
      </div>
      <DataGrid<ItemOut>
        persistKey="master-data:items"
        rowData={items}
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

      <CreateItemDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditItemDialog item={editingItem} onClose={() => setEditingItem(null)} />

      <DeleteConfirmDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
        onConfirm={() => {
          if (deletingItem) {
            deleteMutation.mutate(deletingItem.item_id, {
              onSuccess: () => setDeletingItem(null),
            })
          }
        }}
        entityLabel="item"
        identifier={deletingItem ? `${deletingItem.item_code} — ${deletingItem.item_name}` : ''}
        isPending={deleteMutation.isPending}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        entityType="items"
        selectedIds={selectedIds}
        onComplete={() => {
          setSelectedIds([])
          gridApiRef.current?.deselectAll()
        }}
      />
    </div>
  )
}
