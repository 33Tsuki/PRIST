import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { FormLabel } from '@/components/ui/form-label'
import { useChangePassword } from '@/hooks/use-auth'

// Passwords are never trimmed: the login form (src/pages/login.tsx) sends them verbatim, so
// trimming here would lock out anyone whose password has leading or trailing whitespace.
const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

function clearInputObservably(el: HTMLInputElement) {
  // Use the native value setter + a real input event so BOTH React Hook Form and Chrome's
  // password agent record the field as empty. A bare `el.value = ''` (what reset() does)
  // updates the DOM but never notifies Chrome, so its cached credential survives and Chrome
  // offers to save it when the form is removed on close.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(el, '')
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const changePassword = useChangePassword()
  const formRef = useRef<HTMLFormElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  function close() {
    // Clear the fields observably so Chrome doesn't treat the dismissed (still-filled) password
    // form as a submitted login and pop its "save password?" bubble. See clearInputObservably.
    formRef.current?.querySelectorAll('input').forEach(clearInputObservably)
    reset()
    // Defer the unmount one tick as belt-and-suspenders: the cleared inputs are fully processed
    // before Radix removes the form, so there's no filled password form left for Chrome to save.
    setTimeout(() => onOpenChange(false), 0)
  }

  function handleOpenChange(next: boolean) {
    if (next) onOpenChange(true)
    else close()
  }

  function onSubmit(values: ChangePasswordFormValues) {
    changePassword.mutate(
      { current_password: values.current_password, new_password: values.new_password },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Use at least 8 characters.</DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <FormLabel required htmlFor="current-password">
              Current password
            </FormLabel>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              {...register('current_password')}
            />
            {errors.current_password && (
              <p className="text-sm text-destructive">{errors.current_password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required htmlFor="new-password">
              New password
            </FormLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              {...register('new_password')}
            />
            {errors.new_password && (
              <p className="text-sm text-destructive">{errors.new_password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required htmlFor="confirm-password">
              Confirm new password
            </FormLabel>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
            {errors.confirm_password && (
              <p className="text-sm text-destructive">{errors.confirm_password.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending && <Loader2 className="animate-spin" />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
