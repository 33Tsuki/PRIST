import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTemplateDownload } from '@/hooks/use-template-download'
import { UploadDialog } from './upload-dialog'
import type { MasterDataEntityType } from '@/types'

interface UploadToolbarProps {
  entityType: MasterDataEntityType
  marketId?: string
}

export function UploadToolbar({ entityType, marketId }: UploadToolbarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const downloadTemplate = useTemplateDownload(entityType)

  async function handleDownload() {
    try {
      await downloadTemplate()
    } catch {
      toast.error('Could not download the template. Please try again.')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleDownload}>
        <Download className="size-4" />
        Download Template
      </Button>
      <Button size="sm" onClick={() => setDialogOpen(true)}>
        <Upload className="size-4" />
        Bulk Upload
      </Button>
      <UploadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entityType={entityType}
        marketId={marketId}
      />
    </div>
  )
}
