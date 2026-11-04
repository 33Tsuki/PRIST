import { useRef, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

/** Quick-insert notes surfaced as chips in the popover (from the Setup Lock design). */
const REMARK_PRESETS = [
  'Seasonal',
  'Out of stock',
  'Verify spec',
  'Price rising',
  'Shop closed',
  'Substitute used',
]

export interface RemarkSaveOptions {
  onSuccess: () => void
}

interface RemarkCellProps {
  value: string | null
  /** Render the note without a popover — just the value (or a dash). */
  readOnly: boolean
  isSaving: boolean
  /** An empty string clears the remark. */
  onSave: (remark: string, opts: RemarkSaveOptions) => void
  /** Optional note shown under the textarea, e.g. a caveat about who will see this. */
  hint?: string
}

/**
 * Inline remark editor for a grid cell. Renders a compact chip (filled) or an
 * "Add remark" affordance (empty); clicking opens a popover to edit the note without
 * touching the full Edit Setup dialog. The caller owns how the note is persisted.
 */
export function RemarkCell({ value: remark, readOnly, isSaving, onSave, hint }: RemarkCellProps) {
  const value = remark ?? ''
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync the draft to the persisted value each time the popover opens.
  function handleOpenChange(next: boolean) {
    if (next) setText(value)
    setOpen(next)
  }

  if (readOnly) {
    return value ? (
      <span className="bg-muted text-muted-foreground inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-xs font-medium">
        {value}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  }

  function addPreset(preset: string) {
    setText((t) => (t.trim() ? `${t.replace(/\s*$/, '')}; ${preset}` : preset))
    textareaRef.current?.focus()
  }

  function save(next: string) {
    onSave(next.trim(), { onSuccess: () => setOpen(false) })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {value ? (
          <button
            type="button"
            title="Edit remark"
            className="bg-muted text-muted-foreground hover:bg-accent inline-flex max-w-full cursor-pointer items-center truncate rounded-md px-2 py-0.5 text-xs font-medium transition-colors"
          >
            {value}
          </button>
        ) : (
          <button
            type="button"
            title="Add remark"
            className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium opacity-70 transition-colors hover:opacity-100"
          >
            <Plus className="size-3" />
            Add remark
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2.5 p-3">
        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Remark
        </div>
        <Textarea
          ref={textareaRef}
          value={text}
          rows={3}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              save(text)
            }
          }}
          placeholder="Add a short note for this item…"
        />
        <div className="flex flex-wrap gap-1.5">
          {REMARK_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addPreset(preset)}
              className="border-input bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
        {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
        <div className="flex items-center justify-between gap-2">
          {value ? (
            <button
              type="button"
              onClick={() => save('')}
              disabled={isSaving}
              className="text-destructive px-1 py-1 text-xs font-semibold hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={isSaving} onClick={() => save(text)}>
              {isSaving && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
