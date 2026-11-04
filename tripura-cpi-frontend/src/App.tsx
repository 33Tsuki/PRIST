import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { QueryProvider } from '@/components/wrappers/query-provider'
import { router } from '@/routes'

export default function App() {
  return (
    <QueryProvider>
      <RouterProvider router={router} />
      <Toaster />
    </QueryProvider>
  )
}
