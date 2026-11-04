import { useEffect } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { FormLabel } from '@/components/ui/form-label'
import { useUpdateAdmin, useUpdateSurveyor, useUpdateSupervisor } from '@/hooks/use-users'
import type { User } from '@/types'

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{9,14}$/, 'Enter a valid phone number.')

const surveyorSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  // Optional here: supervisors have no phone field; price collectors keep it (pre-filled).
  phone: phoneSchema.or(z.literal('')).optional(),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  password: z
    .string()
    .trim()
    .refine((v) => v.length === 0 || v.length >= 6, {
      message: 'Password must be at least 6 characters',
    })
    .optional(),
  is_active: z.boolean(),
})

const adminSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters'),
  password: z
    .string()
    .trim()
    .refine((value) => value.length === 0 || value.length >= 8, {
      message: 'Password must be at least 8 characters',
    })
    .optional(),
})

type SurveyorFormValues = z.infer<typeof surveyorSchema>
type AdminFormValues = z.infer<typeof adminSchema>

interface EditUserDialogProps {
  user: User | null
  onClose: () => void
}

export function EditUserDialog({ user, onClose }: EditUserDialogProps) {
  const adminMutation = useUpdateAdmin()
  const surveyorMutation = useUpdateSurveyor()
  const supervisorMutation = useUpdateSupervisor()
  // Price collectors and district supervisors share the same read-only-username
  // profile form; only the target endpoint differs.
  const profileMutation =
    user?.role === 'DISTRICT_SUPERVISOR' ? supervisorMutation : surveyorMutation

  const {
    register: registerSurveyor,
    handleSubmit: handleSurveyorSubmit,
    reset: resetSurveyor,
    watch: watchSurveyor,
    setValue: setSurveyorValue,
    formState: { errors: surveyorErrors },
  } = useForm<SurveyorFormValues>({
    resolver: zodResolver(surveyorSchema),
  })

  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    reset: resetAdmin,
    formState: { errors: adminErrors },
  } = useForm<AdminFormValues>({
    resolver: zodResolver(adminSchema),
  })

  useEffect(() => {
    if (!user) {
      return
    }

    if (user.role !== 'ADMIN') {
      resetSurveyor({
        full_name: user.full_name,
        phone: user.phone,
        email: user.email ?? '',
        password: '',
        is_active: user.is_active,
      })
      return
    }

    resetAdmin({
      username: user.username,
      password: '',
    })
  }, [user, resetAdmin, resetSurveyor])

  function onSurveyorSubmit(values: SurveyorFormValues) {
    if (!user) return
    const password = (values.password ?? '').trim()
    const email = (values.email ?? '').trim()
    const phone = (values.phone ?? '').trim()
    profileMutation.mutate(
      {
        userId: user.user_id,
        body: {
          full_name: values.full_name.trim(),
          is_active: values.is_active,
          ...(phone ? { phone } : {}),
          ...(password ? { password } : {}),
          email: email || null,
        },
      },
      { onSuccess: onClose },
    )
  }

  function onAdminSubmit(values: AdminFormValues) {
    if (!user) return
    const password = (values.password ?? '').trim()
    adminMutation.mutate(
      {
        userId: user.user_id,
        body: {
          username: values.username.trim(),
          ...(password ? { password } : {}),
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit{' '}
            {user?.role === 'ADMIN'
              ? 'Admin'
              : user?.role === 'DISTRICT_SUPERVISOR'
                ? 'Supervisor'
                : 'Surveyor'}
          </DialogTitle>
          <DialogDescription>
            Update account details. Leave password blank to keep it unchanged.
          </DialogDescription>
        </DialogHeader>

        {user?.role === 'ADMIN' ? (
          <form onSubmit={handleAdminSubmit(onAdminSubmit)} className="space-y-4">
            <div className="space-y-2">
              <FormLabel required htmlFor="edit-admin-username">
                Username
              </FormLabel>
              <Input id="edit-admin-username" autoComplete="off" {...registerAdmin('username')} />
              {adminErrors.username && (
                <p className="text-sm text-destructive">{adminErrors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <FormLabel htmlFor="edit-admin-password">Password</FormLabel>
              <PasswordInput
                id="edit-admin-password"
                placeholder="Leave blank to keep unchanged"
                autoComplete="new-password"
                {...registerAdmin('password')}
              />
              {adminErrors.password && (
                <p className="text-sm text-destructive">{adminErrors.password.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={adminMutation.isPending}>
                {adminMutation.isPending && <Loader2 className="animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleSurveyorSubmit(onSurveyorSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FormLabel htmlFor="edit-surveyor-username">Username</FormLabel>
                <Input id="edit-surveyor-username" value={user?.username ?? ''} disabled readOnly />
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="edit-surveyor-district">District</FormLabel>
                <Input
                  id="edit-surveyor-district"
                  value={
                    user?.district_name
                      ? `${user.district_name} (${user.district_code ?? ''})`
                      : '—'
                  }
                  disabled
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <FormLabel required htmlFor="edit-surveyor-full-name">
                Full Name
              </FormLabel>
              <Input
                id="edit-surveyor-full-name"
                autoComplete="off"
                {...registerSurveyor('full_name')}
              />
              {surveyorErrors.full_name && (
                <p className="text-sm text-destructive">{surveyorErrors.full_name.message}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {user?.role === 'PRICE_COLLECTOR' && (
                <div className="space-y-2">
                  <FormLabel required htmlFor="edit-surveyor-phone">
                    Phone Number
                  </FormLabel>
                  <Input
                    id="edit-surveyor-phone"
                    autoComplete="off"
                    {...registerSurveyor('phone')}
                  />
                  {surveyorErrors.phone && (
                    <p className="text-sm text-destructive">{surveyorErrors.phone.message}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <FormLabel htmlFor="edit-surveyor-email">Email</FormLabel>
                <Input
                  id="edit-surveyor-email"
                  type="email"
                  autoComplete="off"
                  placeholder="optional"
                  {...registerSurveyor('email')}
                />
                {surveyorErrors.email && (
                  <p className="text-sm text-destructive">{surveyorErrors.email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <FormLabel htmlFor="edit-surveyor-password">Password</FormLabel>
              <PasswordInput
                id="edit-surveyor-password"
                placeholder="Leave blank to keep unchanged"
                autoComplete="new-password"
                {...registerSurveyor('password')}
              />
              {surveyorErrors.password && (
                <p className="text-sm text-destructive">{surveyorErrors.password.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-surveyor-is-active"
                checked={watchSurveyor('is_active')}
                onCheckedChange={(checked) => setSurveyorValue('is_active', !!checked)}
              />
              <FormLabel htmlFor="edit-surveyor-is-active">Active</FormLabel>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending && <Loader2 className="animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
