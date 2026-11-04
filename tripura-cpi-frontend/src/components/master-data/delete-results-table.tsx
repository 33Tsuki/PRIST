import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DeleteStatusBadge } from './delete-status-badge'
import type { BulkDeleteResult } from '@/types'

export function DeleteResultsTable({ records }: { records: BulkDeleteResult[] }) {
  return (
    <ScrollArea className="h-[280px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-mono text-xs">{record.id}</TableCell>
              <TableCell>
                <DeleteStatusBadge status={record.status} />
              </TableCell>
              <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                {record.detail || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
