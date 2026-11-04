import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SetupDownloadMenu } from './setup-download-menu'
import { SetupUploadDialog } from './setup-upload-dialog'

interface SetupUploadToolbarProps {
  roundId: number
  roundNumber?: number
  /** e.g. "Round 1 — July 2026", shown in the upload dialog. */
  roundLabel?: string
  /** Disable mutating actions (Bulk Upload) when the round is closed. */
  disabled?: boolean
}

export function SetupUploadToolbar({
  roundId,
  roundNumber,
  roundLabel,
  disabled = false,
}: SetupUploadToolbarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <SetupDownloadMenu roundId={roundId} roundNumber={roundNumber} />
      <Button size="sm" disabled={disabled} onClick={() => setDialogOpen(true)}>
        <Upload className="size-4" />
        Bulk Upload
      </Button>
      <SetupUploadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        roundId={roundId}
        roundLabel={roundLabel}
      />
    </div>
  )
}
