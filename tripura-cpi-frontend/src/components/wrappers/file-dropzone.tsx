import { useState, useRef, useCallback } from 'react'
import { FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface FileDropzoneProps {
  file: File | null
  onFileSelect: (file: File) => void
  accept?: string
}

export function FileDropzone({
  file,
  onFileSelect,
  accept = '.csv,.xlsx,.xls',
}: FileDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const allowedExtensions = accept.split(',').map((ext) => ext.trim().toLowerCase())

  const validateAndSelect = useCallback(
    (selected: File) => {
      const ext = '.' + selected.name.split('.').pop()?.toLowerCase()
      if (!allowedExtensions.includes(ext)) {
        toast.error("That file type isn't supported. Please upload a CSV or Excel file.")
        return
      }
      onFileSelect(selected)
    },
    [allowedExtensions, onFileSelect],
  )

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    setIsDragActive(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragActive(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragActive(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSelect(dropped)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) onFileSelect(selected)
  }

  return (
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
      {file ? (
        <p className="text-sm font-medium">{file.name}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {isDragActive ? 'Drop file here' : 'Click or drag a CSV or Excel file'}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
