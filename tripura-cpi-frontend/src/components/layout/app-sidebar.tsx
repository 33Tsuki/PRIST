import { Link, useLocation } from 'react-router-dom'
import { Database, Users, ClipboardList, BarChart3, FileText } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { usePermissions } from '@/hooks/use-permissions'
import type { Action, Subject } from '@/lib/permissions'

const navItems: {
  title: string
  url: string
  icon: typeof BarChart3
  action: Action
  subject: Subject
}[] = [
  {
    title: 'Survey Dashboard',
    url: '/survey-dashboard',
    icon: BarChart3,
    action: 'read',
    subject: 'Dashboard',
  },
  {
    title: 'Master Data',
    url: '/master-data',
    icon: Database,
    action: 'read',
    subject: 'MasterData',
  },
  {
    title: 'User Management',
    url: '/user-management',
    icon: Users,
    action: 'read',
    subject: 'User',
  },
  {
    title: 'Survey Management',
    url: '/survey-management',
    icon: ClipboardList,
    action: 'read',
    subject: 'Setup',
  },
  {
    title: 'Reports',
    url: '/reports',
    icon: FileText,
    action: 'read',
    subject: 'Report',
  },
]

export function AppSidebar() {
  const location = useLocation()
  const { can } = usePermissions()
  const items = navItems.filter((item) => can(item.action, item.subject))

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="text-lg font-bold">PRIST</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
