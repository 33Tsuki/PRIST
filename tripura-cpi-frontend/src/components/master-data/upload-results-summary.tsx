import { CheckCircle, Copy, AlertTriangle, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/** Minimal shape shared by BulkUploadResponse and BulkBundleResponse. */
interface UploadCounts {
  total: number
  created: number
  duplicates: number
  errors: number
}

const stats = [
  { key: 'total' as const, label: 'Total Rows', icon: FileText, color: 'text-blue-600' },
  { key: 'created' as const, label: 'Created', icon: CheckCircle, color: 'text-emerald-600' },
  { key: 'duplicates' as const, label: 'Duplicates', icon: Copy, color: 'text-amber-600' },
  { key: 'errors' as const, label: 'Errors', icon: AlertTriangle, color: 'text-red-600' },
]

export function UploadResultsSummary({ data }: { data: UploadCounts }) {
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
