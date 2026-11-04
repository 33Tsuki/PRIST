import { useState, useRef, useCallback } from 'react'
import { FileUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Mirror the backend bulk limits so we fail fast before uploading.
const MAX_FILE_MB = 10
const MAX_FILES = 100

interface MultiFileDropzoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  accept?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MultiFileDropzone({
  files,
  onFilesChange,
  accept = '.csv,.xlsx,.zip',
}: MultiFileDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const allowedExtensions = accept.split(',').map((ext) => ext.trim().toLowerCase())

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const maxBytes = MAX_FILE_MB * 1024 * 1024
      const accepted: File[] = [...files]
      const seen = new Set(files.map((f) => `${f.name}:${f.size}`))
      const rejected: string[] = []

      for (const file of Array.from(incoming)) {
        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
        if (!allowedExtensions.includes(ext)) {
          rejected.push(`${file.name} (not a CSV, Excel or ZIP file)`)
          continue
        }
        if (file.size > maxBytes) {
          rejected.push(`${file.name} (over ${MAX_FILE_MB} MB)`)
          continue
        }
        const key = `${file.name}:${file.size}`
        if (seen.has(key)) continue
        if (accepted.length >= MAX_FILES) {
          rejected.push(`${file.name} (max ${MAX_FILES} files)`)
          continue
        }
        seen.add(key)
        accepted.push(file)
      }

      if (rejected.length > 0) {
        const shown = rejected.slice(0, 3).join(', ')
        const more = rejected.length > 3 ? `, and ${rejected.length - 3} more` : ''
        toast.error(`Skipped ${rejected.length} file(s): ${shown}${more}`)
      }
      if (accepted.length !== files.length) {
        onFilesChange(accepted)
      }
    },
    [allowedExtensions, files, onFilesChange],
  )

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    setIsDragActive(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragActive(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragActive(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files)
    // Allow re-selecting the same file(s) after a removal.
    e.target.value = ''
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <FileUp className="text-muted-foreground size-10" />
        <p className="text-muted-foreground text-sm">
          {isDragActive ? 'Drop files here' : 'Click or drag CSV / Excel files, or a ZIP bundle'}
        </p>
        <p className="text-muted-foreground/70 text-xs">
          Up to {MAX_FILES} files, max {MAX_FILE_MB} MB each. Each file is one market.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{files.length} file(s) selected</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}:${file.size}:${index}`}
                className="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
