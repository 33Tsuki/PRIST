import { useState } from 'react'
import { ChevronDown, Download, FileText, Loader2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toastBlobApiError } from '@/lib/api-error'
import {
  useRoundMarkets,
  useRoundSetupExport,
  useSetupTemplateDownload,
} from '@/hooks/use-market-setup'

interface SetupDownloadMenuProps {
  roundId: number
  roundNumber?: number
}

/**
 * The two round-level downloads: a blank sheet to fill in, and every market's current
 * setups in that same layout — the file the upload accepts back in `upsert` mode. A
 * single market's file is downloaded from its own page instead.
 *
 * Both are read-only, so this menu stays enabled on a closed round.
 */
export function SetupDownloadMenu({ roundId, roundNumber }: SetupDownloadMenuProps) {
  const [pending, setPending] = useState<'template' | 'zip' | null>(null)
  const downloadTemplate = useSetupTemplateDownload()
  const downloadRoundZip = useRoundSetupExport()

  // The zip carries one sheet per market that has setups; markets with none are
  // skipped server-side (an empty sheet would fail on re-upload).
  const { data: roundMarkets = [] } = useRoundMarkets(roundId)
  const marketsWithSetups = roundMarkets.filter((m) => m.setup_count > 0).length

  async function handleTemplate() {
    setPending('template')
    try {
      await downloadTemplate()
    } catch (error) {
      await toastBlobApiError(error, 'Could not download the template. Please try again.')
    } finally {
      setPending(null)
    }
  }

  async function handleZip() {
    setPending('zip')
    try {
      await downloadRoundZip(roundId)
    } catch (error) {
      await toastBlobApiError(error, 'Could not download the setup files. Please try again.', {
        404: 'No market in this round has setups yet.',
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending !== null}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download
          <ChevronDown className="text-muted-foreground size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem onClick={handleTemplate} className="items-start gap-2.5">
          <FileText className="text-muted-foreground mt-0.5 size-4" />
          <div className="flex flex-col gap-0.5">
            <span>Blank template</span>
            <span className="text-muted-foreground text-xs">
              Empty sheet with the required columns.
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleZip}
          disabled={marketsWithSetups === 0}
          className="items-start gap-2.5"
        >
          <Package className="mt-0.5 size-4" />
          <div className="flex flex-col gap-0.5">
            <span>Current setups — all markets (ZIP)</span>
            <span className="text-muted-foreground text-xs">
              {marketsWithSetups === 0
                ? 'No market has setups yet.'
                : `${marketsWithSetups} file(s)${roundNumber ? ` · Round ${roundNumber}` : ''} · one sheet per market.`}
            </span>
          </div>
        </DropdownMenuItem>
        <p className="text-muted-foreground px-2 py-1.5 text-xs">
          A single market's file is downloaded from that market's page.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
