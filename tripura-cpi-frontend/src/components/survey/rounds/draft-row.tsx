import { MoreVertical, Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SurveyRoundOut } from '@/types'
import { RoundStatusBadge } from './round-status-badge'
import { REGISTER_GRID, formatWindow, roundLabel } from './utils'
import { cn } from '@/lib/utils'

interface DraftRowProps {
  round: SurveyRoundOut
  canManage: boolean
  onStart: (round: SurveyRoundOut) => void
  onEdit: (round: SurveyRoundOut) => void
  onDelete: (round: SurveyRoundOut) => void
}

export function DraftRow({ round, canManage, onStart, onEdit, onDelete }: DraftRowProps) {
  return (
    <div className={cn(REGISTER_GRID, 'border-b py-3 last:border-b-0 dark:bg-amber-950/10')}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-semibold">{roundLabel(round)}</span>
        <span className="text-muted-foreground font-mono text-[11px]">
          Round {round.round_number} · draft
        </span>
      </div>
      <span className="text-muted-foreground text-sm tabular-nums">{formatWindow(round)}</span>
      <RoundStatusBadge status="DRAFT" />
      <span className="text-muted-foreground text-sm">Not started</span>
      <div className="flex items-center justify-end gap-1.5">
        {canManage && (
          <>
            <Button size="sm" variant="outline" onClick={() => onStart(round)}>
              <Play /> Start round
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(round)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(round)}>
                  <Trash2 /> Delete draft
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  )
}
