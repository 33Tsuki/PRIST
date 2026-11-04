import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import type { UseMutationResult } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/wrappers/data-grid'
import { DeleteConfirmDialog } from '@/components/master-data/delete-confirm-dialog'
import { usePermissions } from '@/hooks/use-permissions'
import type { Subject } from '@/lib/permissions'
import type { User, UserRole } from '@/types'
import { EditUserDialog } from './edit-user-dialog'

interface UserRoleTabProps {
  role: UserRole
  users: User[]
  isLoading: boolean
  deleteUser: UseMutationResult<void, Error, number>
}

function roleLabel(role: UserRole): string {
  if (role === 'ADMIN') return 'Admin'
  if (role === 'DISTRICT_SUPERVISOR') return 'Supervisor'
  return 'Surveyor'
}

export function UserRoleTab({ role, users, isLoading, deleteUser }: UserRoleTabProps) {
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const { can } = usePermissions()
  const canDelete = can('delete', 'User')
  const editSubject: Subject = role === 'PRICE_COLLECTOR' ? 'PriceCollector' : 'User'

  const columnDefs = useMemo<ColDef<User>[]>(() => {
    const baseColumns: ColDef<User>[] = [
      { field: 'username', headerName: 'Username', minWidth: 160 },
      { field: 'full_name', headerName: 'Full Name', minWidth: 220, flex: 2 },
      {
        field: 'role',
        headerName: 'Role',
        minWidth: 120,
        valueFormatter: ({ value }) => roleLabel(value as UserRole),
      },
    ]

    if (role !== 'ADMIN') {
      let insertAt = 2
      // Phone is a price-collector-only field; supervisors don't have one.
      if (role === 'PRICE_COLLECTOR') {
        baseColumns.splice(insertAt, 0, {
          field: 'phone',
          headerName: 'Phone Number',
          minWidth: 180,
          flex: 1,
        })
        insertAt += 1
      }
      baseColumns.splice(insertAt, 0, {
        field: 'district_name',
        headerName: 'District',
        minWidth: 140,
        valueGetter: ({ data }) =>
          data?.district_name
            ? data.district_code
              ? `${data.district_name} (${data.district_code})`
              : data.district_name
            : '—',
      })
      baseColumns.push({
        field: 'is_active',
        headerName: 'Active',
        minWidth: 100,
        valueFormatter: ({ value }) => (value ? 'Yes' : 'No'),
        cellStyle: ({ value }) => ({
          color: value ? 'var(--color-green-600)' : 'var(--color-destructive)',
          fontWeight: 500,
        }),
      })
    }

    baseColumns.push({
      colId: 'actions',
      headerName: '',
      width: 110,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: 'right',
      cellRenderer: (params: ICellRendererParams<User>) => {
        if (!params.data) return null
        const canEditRow = can('update', editSubject, params.data)
        return (
          <div className="flex h-full items-center gap-1">
            {canEditRow && (
              <Button variant="ghost" size="icon-xs" onClick={() => setEditingUser(params.data!)}>
                <Pencil />
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon-xs" onClick={() => setDeletingUser(params.data!)}>
                <Trash2 />
              </Button>
            )}
          </div>
        )
      },
    })

    return baseColumns
  }, [role, can, canDelete, editSubject])

  return (
    <div className="space-y-4">
      <DataGrid<User>
        persistKey="user-management:users"
        rowData={users}
        columnDefs={columnDefs}
        gridOptions={{
          loading: isLoading,
        }}
      />

      <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} />

      <DeleteConfirmDialog
        open={!!deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(null)}
        onConfirm={() => {
          if (deletingUser) {
            deleteUser.mutate(deletingUser.user_id, {
              onSuccess: () => setDeletingUser(null),
            })
          }
        }}
        entityLabel="user"
        identifier={deletingUser ? `${deletingUser.username} — ${deletingUser.full_name}` : ''}
        isPending={deleteUser.isPending}
      />
    </div>
  )
}
