import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown, Loader2, Lock, Pencil, Trash2, Plus } from 'lucide-react'
import type {
  ColDef,
  GridApi,
  ICellRendererParams,
  SelectionChangedEvent,
  ValueGetterParams,
} from 'ag-grid-community'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DataGrid } from '@/components/wrappers/data-grid'
import { SetupFormDialog } from '@/components/survey/setup-form-dialog'
import { RoundLockBanner } from '@/components/survey/round-lock-banner'
import { BulkDeleteSetupsDialog } from '@/components/survey/bulk-delete-setups-dialog'
import { RemarkCell, type RemarkSaveOptions } from '@/components/survey/remark-cell'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import {
  useMarketSetupExport,
  useMarketSetups,
  useDeleteItemSetup,
  useReplaceItemSetup,
} from '@/hooks/use-market-setup'
import { useMarkets } from '@/hooks/use-markets'
import { useSurveyRounds } from '@/hooks/use-survey-rounds'
import { toastBlobApiError } from '@/lib/api-error'
import type { ItemSetupGroup, RoundMarketSetupOut, SetupReplace, SetupShopEntry } from '@/types'

const STATUS_ORDER: Record<string, number> = {
  'ORIGINALLY SELECTED': 0,
  'SUBSTITUTE 1': 1,
  'SUBSTITUTE 2': 2,
}

/** Group the flat per-shop setup rows into one entry per item. */
function groupSetupsByItem(setups: RoundMarketSetupOut[]): ItemSetupGroup[] {
  const byItem = new Map<number, RoundMarketSetupOut[]>()
  for (const row of setups) {
    const rows = byItem.get(row.item_id) ?? []
    rows.push(row)
    byItem.set(row.item_id, rows)
  }
  return Array.from(byItem.values())
    .map((rows) => {
      const sorted = [...rows].sort(
        (a, b) =>
          (STATUS_ORDER[a.shop_selection_status] ?? 99) -
          (STATUS_ORDER[b.shop_selection_status] ?? 99),
      )
      const primary = sorted[0]
      return {
        item_id: primary.item_id,
        item_code: primary.item_code,
        item_name: primary.item_name,
        market_item_description: primary.market_item_description,
        product_specification: primary.product_specification,
        unit_of_sale: primary.unit_of_sale,
        remark: primary.remark,
        slots: sorted.map((r) => ({
          status: r.shop_selection_status,
          shop_id: r.shop_id,
          shop_serial_no: r.shop_serial_no,
          shop_name: r.shop_name,
        })),
      }
    })
    .sort((a, b) => a.item_code.localeCompare(b.item_code))
}

/**
 * Everything the interactive cells need, delivered by context rather than closed over in the
 * colDef. columnDefs must stay referentially stable: AG Grid rebuilds its columns whenever a
 * new columnDefs array arrives, which resets the column order and re-applies defaultColDef's
 * flex — wiping the layout that `persistKey` is meant to remember.
 */
interface SetupGridContextValue {
  roundClosed: boolean
  isSaving: boolean
  saveRemark: (group: ItemSetupGroup, remark: string, opts: RemarkSaveOptions) => void
  onEdit: (group: ItemSetupGroup) => void
  onDelete: (group: ItemSetupGroup) => void
}

const SetupGridContext = createContext<SetupGridContextValue>({
  roundClosed: true,
  isSaving: false,
  saveRemark: () => {},
  onEdit: () => {},
  onDelete: () => {},
})

function SetupRemarkCell(params: ICellRendererParams<ItemSetupGroup>) {
  const { roundClosed, isSaving, saveRemark } = useContext(SetupGridContext)
  const group = params.data
  if (!group) return null
  return (
    <RemarkCell
      value={group.remark}
      readOnly={roundClosed}
      isSaving={isSaving}
      onSave={(remark, opts) => saveRemark(group, remark, opts)}
    />
  )
}

function SetupActionsCell(params: ICellRendererParams<ItemSetupGroup>) {
  const { roundClosed, onEdit, onDelete } = useContext(SetupGridContext)
  const row = params.data
  if (!row) return null
  return (
    <div className="flex items-center gap-1 h-full">
      <Button variant="ghost" size="icon-xs" disabled={roundClosed} onClick={() => onEdit(row)}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-xs" disabled={roundClosed} onClick={() => onDelete(row)}>
        <Trash2 />
      </Button>
    </div>
  )
}

const columnDefs: ColDef<ItemSetupGroup>[] = [
  { field: 'item_code', headerName: 'Item Code', minWidth: 110, flex: 0 },
  { field: 'item_name', headerName: 'Item Name', minWidth: 150 },
  { field: 'market_item_description', headerName: 'Local Name', minWidth: 150 },
  { field: 'product_specification', headerName: 'Product Spec', minWidth: 140 },
  { field: 'unit_of_sale', headerName: 'Unit of Sale', minWidth: 110, flex: 0 },
  {
    colId: 'shops',
    headerName: 'Shops',
    minWidth: 220,
    sortable: false,
    valueGetter: (params: ValueGetterParams<ItemSetupGroup>) => {
      const g = params.data
      if (!g) return ''
      const serialFor = (status: string) => g.slots.find((s) => s.status === status)?.shop_serial_no
      const parts: string[] = []
      const orig = serialFor('ORIGINALLY SELECTED')
      if (orig) parts.push(`Orig: ${orig}`)
      const sub1 = serialFor('SUBSTITUTE 1')
      if (sub1) parts.push(`Sub1: ${sub1}`)
      const sub2 = serialFor('SUBSTITUTE 2')
      if (sub2) parts.push(`Sub2: ${sub2}`)
      return parts.join(' · ')
    },
  },
  {
    field: 'remark',
    headerName: 'Remark',
    minWidth: 160,
    // Keep field: 'remark' so search/sort/filter still work on the note text.
    cellRenderer: SetupRemarkCell,
  },
  {
    colId: 'actions',
    headerName: '',
    width: 90,
    sortable: false,
    filter: false,
    resizable: false,
    pinned: 'right',
    cellRenderer: SetupActionsCell,
  },
]

export default function MarketSetupDetailPage() {
  const { roundId: roundIdParam, marketId: marketIdParam } = useParams<{
    roundId: string
    marketId: string
  }>()
  const navigate = useNavigate()

  const roundId = roundIdParam ? Number(roundIdParam) : null
  const marketId = marketIdParam ? Number(marketIdParam) : null

  const { data: rounds = [] } = useSurveyRounds()
  const { data: allMarkets = [], isLoading: isLoadingMarkets } = useMarkets()
  const { data: setups = [], isLoading } = useMarketSetups(roundId, marketId)
  const deleteMutation = useDeleteItemSetup(roundId, marketId)
  // Destructured because `mutate` is stable across renders while the mutation object is not,
  // and the grid's context value must not change identity on every render.
  const { mutate: replaceSetup, isPending: isReplacing } = useReplaceItemSetup(roundId, marketId)

  const round = rounds.find((r) => r.round_id === roundId)
  const market = allMarkets.find((m) => m.market_id === marketId)
  // A closed round is a historical record: setups are locked (the backend rejects changes
  // with 409), so the create/edit/delete controls are disabled.
  const roundClosed = round?.round_status === 'CLOSED'

  const itemGroups = useMemo(() => groupSetupsByItem(setups), [setups])

  const [createOpen, setCreateOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ItemSetupGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<ItemSetupGroup | null>(null)

  // This market's setups in the bulk-upload sheet layout, for editing in Excel and
  // sending back through the round's Bulk Upload in "Update existing setups" mode.
  // Deliberately separate from the grid's own Export, which mirrors the visible
  // columns and the user's saved layout rather than the fixed upload format.
  const exportSetupFile = useMarketSetupExport()
  const [isExporting, setIsExporting] = useState(false)

  async function handleExportSetupFile() {
    if (!roundId || !marketId) return
    setIsExporting(true)
    try {
      await exportSetupFile(roundId, marketId)
    } catch (error) {
      await toastBlobApiError(error, 'Could not download the setup file. Please try again.', {
        404: 'This market has no setups in this round yet.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const gridApiRef = useRef<GridApi<ItemSetupGroup> | null>(null)

  const handleSelectionChanged = useCallback((event: SelectionChangedEvent<ItemSetupGroup>) => {
    setSelectedItemIds(event.api.getSelectedRows().map((g) => g.item_id))
  }, [])

  // Persist an inline remark edit. There's no dedicated remark endpoint, so this rebuilds the
  // full setup-replace body from the group's existing slots (the remark applies to every shop
  // slot, matching the Edit Setup dialog).
  const saveRemark = useCallback(
    (group: ItemSetupGroup, remark: string, opts: RemarkSaveOptions) => {
      const entryFor = (status: string): SetupShopEntry | null => {
        const slot = group.slots.find((s) => s.status === status)
        if (!slot) return null
        return {
          shop_id: slot.shop_id,
          unit_of_sale: group.unit_of_sale,
          product_specification: group.product_specification,
          market_item_description: group.market_item_description,
          remark: remark || null,
        }
      }
      const originally_selected = entryFor('ORIGINALLY SELECTED')
      if (!originally_selected) return
      const body: SetupReplace = {
        originally_selected,
        substitute_1: entryFor('SUBSTITUTE 1'),
        substitute_2: entryFor('SUBSTITUTE 2'),
      }
      replaceSetup({ itemId: group.item_id, body }, opts)
    },
    [replaceSetup],
  )

  const setupGrid = useMemo<SetupGridContextValue>(
    () => ({
      roundClosed,
      isSaving: isReplacing,
      saveRemark,
      onEdit: setEditingGroup,
      onDelete: setDeletingGroup,
    }),
    [roundClosed, isReplacing, saveRemark],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4" />
          Back to Survey Management
        </button>
      </div>

      {market ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle>
                  {market.selected_market} ({market.market_code})
                </CardTitle>
                {round && <Badge variant="secondary">Round {round.round_number}</Badge>}
                {roundClosed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    <Lock className="size-3" />
                    Closed
                  </span>
                )}
              </div>
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
                  <dd className="font-medium">{market.subdivision ?? '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {roundClosed && round && (
            <RoundLockBanner
              roundLabel={`Round ${round.round_number}${round.round_name ? ` — ${round.round_name}` : ''}`}
              message="This round is closed, so these setups can no longer be changed. You can still view and export them."
            />
          )}

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Setup Records ({itemGroups.length})</h2>
                {roundClosed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <Lock className="size-3" />
                    Round closed — setups are locked
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedItemIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={roundClosed}
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete Selected ({selectedItemIds.length})
                  </Button>
                )}
                {/* A read-only export, so it stays available on a closed round. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting || itemGroups.length === 0}
                  onClick={handleExportSetupFile}
                >
                  {isExporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileDown className="size-4" />
                  )}
                  Download Setup File
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={roundClosed}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" />
                  Add Setup
                </Button>
              </div>
            </div>
            <SetupGridContext.Provider value={setupGrid}>
              <DataGrid<ItemSetupGroup>
                persistKey="survey-management:setup-items"
                rowData={itemGroups}
                columnDefs={columnDefs}
                gridOptions={{
                  loading: isLoading,
                  // No bulk-select checkboxes on a closed round — setups are read-only.
                  rowSelection: roundClosed ? undefined : { mode: 'multiRow' },
                  onSelectionChanged: handleSelectionChanged,
                  onGridReady: (e) => {
                    gridApiRef.current = e.api
                  },
                }}
              />
            </SetupGridContext.Provider>
          </div>

          <SetupFormDialog
            open={createOpen}
            mode="create"
            roundId={roundId!}
            marketId={marketId!}
            onClose={() => setCreateOpen(false)}
          />
          <SetupFormDialog
            open={!!editingGroup}
            mode="edit"
            roundId={roundId!}
            marketId={marketId!}
            group={editingGroup}
            onClose={() => setEditingGroup(null)}
          />
          <DeleteConfirmDialog
            open={!!deletingGroup}
            onOpenChange={(open) => !open && setDeletingGroup(null)}
            onConfirm={() => {
              if (deletingGroup) {
                deleteMutation.mutate(deletingGroup.item_id, {
                  onSuccess: () => setDeletingGroup(null),
                })
              }
            }}
            entityLabel="setup"
            identifier={
              deletingGroup ? `${deletingGroup.item_code} — ${deletingGroup.item_name}` : ''
            }
            isPending={deleteMutation.isPending}
          />
          <BulkDeleteSetupsDialog
            open={bulkDeleteOpen}
            onOpenChange={setBulkDeleteOpen}
            roundId={roundId!}
            marketId={marketId!}
            selectedIds={selectedItemIds}
            onComplete={() => {
              setSelectedItemIds([])
              gridApiRef.current?.deselectAll()
            }}
          />
        </>
      ) : (
        <div className="text-muted-foreground text-sm">
          {isLoadingMarkets ? 'Loading market details...' : 'Market not found.'}
        </div>
      )}
    </div>
  )
}
