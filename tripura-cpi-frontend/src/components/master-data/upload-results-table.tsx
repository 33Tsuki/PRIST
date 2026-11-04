import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from './status-badge'
import type { BulkRecordResult } from '@/types'

export function UploadResultsTable({
  records,
  isDryRun,
}: {
  records: BulkRecordResult[]
  isDryRun?: boolean
}) {
  const hasWarnings = records.some((r) => r.warning)

  return (
    <ScrollArea className="h-[280px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead>Identifier</TableHead>
            <TableHead>Detail</TableHead>
            {hasWarnings && <TableHead>Warning</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={`${record.row}-${record.identifier}`}>
              <TableCell className="font-mono text-xs">{record.row}</TableCell>
              <TableCell>
                <StatusBadge status={record.status} isDryRun={isDryRun} />
              </TableCell>
              <TableCell className="font-medium">{record.identifier}</TableCell>
              <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                {record.detail || '—'}
              </TableCell>
              {hasWarnings && (
                <TableCell className="text-yellow-600 dark:text-yellow-500 max-w-[200px] truncate text-sm">
                  {record.warning || '—'}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
