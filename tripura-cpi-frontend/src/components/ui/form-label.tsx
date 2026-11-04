import type { ComponentProps } from 'react'
import { Label } from '@/components/ui/label'

function FormLabel({
  required,
  children,
  ...props
}: ComponentProps<typeof Label> & { required?: boolean }) {
  return (
    <Label {...props}>
      {children}
      {required && <span className="text-destructive">*</span>}
    </Label>
  )
}

export { FormLabel }
