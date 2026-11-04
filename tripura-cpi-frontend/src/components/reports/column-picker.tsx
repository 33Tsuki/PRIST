import { useState } from 'react'
import { GripVertical, Lock } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export interface ColumnState {
  key: string
  label: string
  on: boolean
  // Set when a filter forces this column into the report — the server always renders it,
  // so the row is checked, disabled and not reorderable. Holds the filter's label.
  lockedBy?: string
}

interface ColumnPickerProps {
  columns: ColumnState[]
  onChange: (columns: ColumnState[]) => void
}

// Reorderable checklist. Selection order == column order in the generated document, so
// the visible order badge counts only checked rows. Uses native HTML5 drag-and-drop —
// no extra dependency.
export function ColumnPicker({ columns, onChange }: ColumnPickerProps) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const move = (from: string, to: string) => {
    const next = [...columns]
    const i = next.findIndex((c) => c.key === from)
    const j = next.findIndex((c) => c.key === to)
    if (i < 0 || j < 0 || i === j) return
    const [item] = next.splice(i, 1)
    next.splice(j, 0, item)
    onChange(next)
  }

  const toggle = (key: string) =>
    onChange(columns.map((c) => (c.key === key && !c.lockedBy ? { ...c, on: !c.on } : c)))

  // Document order = position among the checked rows. Precompute without mutating a
  // variable during render (which the React Compiler disallows).
  const positionByKey = new Map<string, number>()
  columns.reduce((n, c) => {
    if (!c.on) return n
    const next = n + 1
    positionByKey.set(c.key, next)
    return next
  }, 0)

  return (
    <div className="flex flex-col gap-1.5">
      {columns.map((c) => {
        const position = positionByKey.get(c.key) ?? null
        return (
          <div
            key={c.key}
            draggable={c.on && !c.lockedBy}
            onDragStart={() => setDragKey(c.key)}
            onDragEnter={() => c.on && setOverKey(c.key)}
            onDragOver={(e) => {
              if (c.on) e.preventDefault()
            }}
            onDrop={() => {
              if (dragKey && c.on) move(dragKey, c.key)
              setDragKey(null)
              setOverKey(null)
            }}
            onDragEnd={() => {
              setDragKey(null)
              setOverKey(null)
            }}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
              c.on ? 'border-border bg-background' : 'border-border/60 bg-muted/40',
              overKey === c.key && 'border-primary ring-1 ring-primary',
              dragKey === c.key && 'opacity-40',
            )}
          >
            <span
              className={cn(
                'text-muted-foreground',
                c.on && !c.lockedBy ? 'cursor-grab active:cursor-grabbing' : 'invisible',
              )}
              title="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </span>
            <Checkbox
              id={`col-${c.key}`}
              checked={c.on}
              disabled={!!c.lockedBy}
              onCheckedChange={() => toggle(c.key)}
            />
            <label
              htmlFor={`col-${c.key}`}
              className={cn(
                'flex flex-1 items-center gap-1.5 text-sm',
                c.lockedBy ? 'cursor-default' : 'cursor-pointer',
                c.on ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {c.label}
              {c.lockedBy && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> added by the “{c.lockedBy}” filter
                </span>
              )}
            </label>
            <span
              className={cn(
                'min-w-6 rounded bg-muted px-1.5 py-0.5 text-center text-xs font-medium tabular-nums text-muted-foreground',
                !c.on && 'invisible',
              )}
            >
              {position}
            </span>
          </div>
        )
      })}
    </div>
  )
}
