import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BannerKind = 'info' | 'warn' | 'err'

const STYLES: Record<BannerKind, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200',
  warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200',
  err: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export function ReportBanner({ kind, children }: { kind: BannerKind; children: React.ReactNode }) {
  const Icon = kind === 'info' ? Info : AlertTriangle
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed',
        STYLES[kind],
      )}
    >
      <Icon className="mt-0.5 size-4 flex-none" />
      <div>{children}</div>
    </div>
  )
}
