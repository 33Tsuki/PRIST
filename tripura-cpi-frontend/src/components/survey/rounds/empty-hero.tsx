import { Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SurveyRoundOut } from '@/types'
import { roundLabel } from './utils'

interface EmptyHeroProps {
  draft: SurveyRoundOut | null
  canManage: boolean
  onStartDraft: (round: SurveyRoundOut) => void
  onCreate: () => void
}

export function EmptyHero({ draft, canManage, onStartDraft, onCreate }: EmptyHeroProps) {
  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-5">
      <div className="bg-muted text-muted-foreground flex size-10 flex-none items-center justify-center rounded-xl">
        <Play className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">No monthly round is running</div>
        <div className="text-muted-foreground mt-0.5 text-sm">
          {draft ? (
            <>
              Your next draft,{' '}
              <span className="text-foreground font-medium">{roundLabel(draft)}</span>, is ready to
              go live.
            </>
          ) : (
            <>Prepare a round, then start it to begin collecting prices.</>
          )}
        </div>
      </div>
      {canManage &&
        (draft ? (
          <Button onClick={() => onStartDraft(draft)}>
            <Play /> Start {roundLabel(draft)}
          </Button>
        ) : (
          <Button onClick={onCreate}>
            <Plus /> Create round
          </Button>
        ))}
    </div>
  )
}
