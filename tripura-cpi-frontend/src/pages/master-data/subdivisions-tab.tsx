import { format } from 'date-fns'
import type { ColDef } from 'ag-grid-community'
import { DataGrid } from '@/components/wrappers/data-grid'
import { useSubdivisions } from '@/hooks/use-subdivisions'
import type { SubdivisionOut } from '@/types'

const columnDefs: ColDef<SubdivisionOut>[] = [
  { field: 'name', headerName: 'Name', minWidth: 200, flex: 2 },
  { field: 'lgd_code', headerName: 'LGD Code', minWidth: 130, flex: 1 },
  { field: 'district_name', headerName: 'District', minWidth: 160, flex: 1 },
  {
    field: 'created_at',
    headerName: 'Created At',
    minWidth: 160,
    valueFormatter: ({ value }) => (value ? format(new Date(value), 'dd MMM yyyy, HH:mm') : ''),
  },
]

export function SubdivisionsTab() {
  const { data: subdivisions = [], isLoading } = useSubdivisions()

  return (
    <div className="space-y-4">
      <DataGrid<SubdivisionOut>
        persistKey="master-data:subdivisions"
        rowData={subdivisions}
        columnDefs={columnDefs}
        gridOptions={{ loading: isLoading }}
      />
    </div>
  )
}
