import { FileText, CheckCircle, Search, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { BulkDeleteResponse } from '@/types'

const stats = [
  { key: 'total' as const, label: 'Total', icon: FileText, color: 'text-blue-600' },
  { key: 'deleted' as const, label: 'Deleted', icon: CheckCircle, color: 'text-emerald-600' },
  { key: 'not_found' as const, label: 'Not Found', icon: Search, color: 'text-amber-600' },
  { key: 'errors' as const, label: 'Errors', icon: AlertTriangle, color: 'text-red-600' },
]

export function DeleteResultsSummary({ data }: { data: BulkDeleteResponse }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map(({ key, label, icon: Icon, color }) => (
        <Card key={key} className="py-3">
          <CardContent className="flex items-center gap-2 px-3">
            <Icon className={`size-4 ${color}`} />
            <div>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-lg font-semibold">{data[key]}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
