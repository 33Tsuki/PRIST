import { Lock } from 'lucide-react'

interface RoundLockBannerProps {
  roundLabel: string
  message: string
}

/** Read-only notice shown across the survey screens when the selected round is CLOSED.
 *  Recreates the "lockbar" treatment from the Setup Lock design. */
export function RoundLockBanner({ roundLabel, message }: RoundLockBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/20">
      <span className="grid size-7 flex-none place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <Lock className="size-4" />
      </span>
      <p className="flex-1 text-sm leading-relaxed text-amber-900/80 dark:text-amber-200/80">
        <span className="font-semibold text-amber-900 dark:text-amber-200">
          {roundLabel} is closed.
        </span>{' '}
        {message}
      </p>
      <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-transparent dark:text-amber-300">
        <Lock className="size-3" />
        Read-only
      </span>
    </div>
  )
}
