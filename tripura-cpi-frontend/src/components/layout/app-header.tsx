import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAuth, useLogout } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ChangePasswordDialog } from './change-password-dialog'

export function AppHeader() {
  const { user } = useAuth()
  const logout = useLogout()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  // Admin accounts are created with only a username (no full_name), so fall back to it.
  const displayName = user?.full_name || user?.username || ''

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <SidebarTrigger />
      <div className="flex-1" />
      {user && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium">{displayName}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{user.username}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
                Change password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={logout.isPending}
                onSelect={() => logout.mutate()}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sibling of the menu, not a child: Radix unmounts the menu content on select. */}
          <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
        </>
      )}
    </header>
  )
}
