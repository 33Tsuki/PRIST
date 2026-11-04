import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormLabel } from '@/components/ui/form-label'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateSurveyor, useCreateAdmin, useCreateSupervisor } from '@/hooks/use-users'
import { useDistricts } from '@/hooks/use-districts'

const surveyorPhoneSchema = z
  .string()
  .trim()
  .transform((val) => (val && !val.startsWith('+') ? `+91${val}` : val))
  .refine((val) => val === '' || /^\+[1-9][0-9]{9,14}$/.test(val), {
    message: 'Enter a valid phone number.',
  })

const createSurveyorSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  phone: surveyorPhoneSchema,
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  district_id: z.string().min(1, 'District is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  is_active: z.boolean(),
})

const createAdminSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const createSupervisorSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters'),
  full_name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  district_id: z.string().min(1, 'District is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  is_active: z.boolean(),
})

type CreateSurveyorFormValues = z.infer<typeof createSurveyorSchema>
type CreateAdminFormValues = z.infer<typeof createAdminSchema>
type CreateSupervisorFormValues = z.infer<typeof createSupervisorSchema>

const surveyorDefaultValues: CreateSurveyorFormValues = {
  full_name: '',
  phone: '',
  email: '',
  district_id: '',
  password: '',
  is_active: true,
}

export function CreateSurveyorForm() {
  const createSurveyorMutation = useCreateSurveyor()
  const { data: districts = [] } = useDistricts()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateSurveyorFormValues>({
    resolver: zodResolver(createSurveyorSchema),
    defaultValues: surveyorDefaultValues,
  })

  function onSubmit(values: CreateSurveyorFormValues) {
    const email = (values.email ?? '').trim()
    const phone = values.phone.trim()
    createSurveyorMutation.mutate(
      {
        full_name: values.full_name.trim(),
        district_id: Number(values.district_id),
        password: values.password,
        is_active: values.is_active,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
      },
      {
        onSuccess: () => reset(surveyorDefaultValues),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Surveyor</CardTitle>
        <CardDescription>
          The district is fixed once the user is added and cannot be changed later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-2">
            <FormLabel required htmlFor="create-surveyor-full-name">
              Full Name
            </FormLabel>
            <Input
              id="create-surveyor-full-name"
              placeholder="Enter full name"
              autoComplete="off"
              {...register('full_name')}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="create-surveyor-phone">Phone Number</FormLabel>
            <Input
              id="create-surveyor-phone"
              placeholder="Enter phone number (optional)"
              autoComplete="off"
              {...register('phone')}
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="space-y-2">
            <FormLabel required>District</FormLabel>
            <Controller
              control={control}
              name="district_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select district" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d.district_id} value={d.district_id.toString()}>
                        {d.name} ({d.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.district_id && (
              <p className="text-sm text-destructive">{errors.district_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required htmlFor="create-surveyor-password">
              Password
            </FormLabel>
            <PasswordInput
              id="create-surveyor-password"
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="create-surveyor-email">Email</FormLabel>
            <Input
              id="create-surveyor-email"
              type="email"
              placeholder="Enter email (optional)"
              autoComplete="off"
              {...register('email')}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <FormLabel>Active</FormLabel>
            <div className="flex h-9 items-center">
              <Checkbox
                id="create-surveyor-is-active"
                className="size-5"
                checked={watch('is_active')}
                onCheckedChange={(checked) => setValue('is_active', !!checked)}
              />
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex justify-end">
            <Button type="submit" disabled={createSurveyorMutation.isPending}>
              {createSurveyorMutation.isPending && <Loader2 className="animate-spin" />}
              Create Surveyor
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function CreateAdminForm() {
  const createAdminMutation = useCreateAdmin()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAdminFormValues>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  })

  function onSubmit(values: CreateAdminFormValues) {
    createAdminMutation.mutate(
      {
        username: values.username.trim(),
        password: values.password,
      },
      {
        onSuccess: () =>
          reset({
            username: '',
            password: '',
          }),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Admin</CardTitle>
        <CardDescription>An admin can see and manage every district.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-2">
            <FormLabel required htmlFor="create-admin-username">
              Username
            </FormLabel>
            <Input
              id="create-admin-username"
              placeholder="Enter username"
              autoComplete="off"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required htmlFor="create-admin-password">
              Password
            </FormLabel>
            <PasswordInput
              id="create-admin-password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="flex items-end">
            <Button type="submit" disabled={createAdminMutation.isPending}>
              {createAdminMutation.isPending && <Loader2 className="animate-spin" />}
              Create Admin
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const supervisorDefaultValues: CreateSupervisorFormValues = {
  username: '',
  full_name: '',
  email: '',
  district_id: '',
  password: '',
  is_active: true,
}

export function CreateSupervisorForm() {
  const createSupervisorMutation = useCreateSupervisor()
  const { data: districts = [] } = useDistricts()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateSupervisorFormValues>({
    resolver: zodResolver(createSupervisorSchema),
    defaultValues: supervisorDefaultValues,
  })

  function onSubmit(values: CreateSupervisorFormValues) {
    const email = (values.email ?? '').trim()
    createSupervisorMutation.mutate(
      {
        username: values.username.trim(),
        full_name: values.full_name.trim(),
        district_id: Number(values.district_id),
        password: values.password,
        is_active: values.is_active,
        ...(email ? { email } : {}),
      },
      {
        onSuccess: () => reset(supervisorDefaultValues),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create District Supervisor</CardTitle>
        <CardDescription>
          The district is fixed once the user is added and cannot be changed later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-2">
            <FormLabel required htmlFor="create-supervisor-username">
              Username
            </FormLabel>
            <Input
              id="create-supervisor-username"
              placeholder="Enter username"
              autoComplete="off"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required htmlFor="create-supervisor-full-name">
              Full Name
            </FormLabel>
            <Input
              id="create-supervisor-full-name"
              placeholder="Enter full name"
              autoComplete="off"
              {...register('full_name')}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required>District</FormLabel>
            <Controller
              control={control}
              name="district_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select district" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d.district_id} value={d.district_id.toString()}>
                        {d.name} ({d.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.district_id && (
              <p className="text-sm text-destructive">{errors.district_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel required htmlFor="create-supervisor-password">
              Password
            </FormLabel>
            <PasswordInput
              id="create-supervisor-password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="create-supervisor-email">Email</FormLabel>
            <Input
              id="create-supervisor-email"
              type="email"
              placeholder="optional"
              autoComplete="off"
              {...register('email')}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <FormLabel>Active</FormLabel>
            <div className="flex h-9 items-center">
              <Checkbox
                id="create-supervisor-is-active"
                className="size-5"
                checked={watch('is_active')}
                onCheckedChange={(checked) => setValue('is_active', !!checked)}
              />
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex justify-end">
            <Button type="submit" disabled={createSupervisorMutation.isPending}>
              {createSupervisorMutation.isPending && <Loader2 className="animate-spin" />}
              Create Supervisor
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
