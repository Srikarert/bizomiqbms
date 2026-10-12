import { useState, type ReactNode } from "react"
import {
  BellRing, Briefcase, Building2, CalendarRange, CheckSquare, LayoutDashboard, MapPin, Menu, MessageSquare, Settings, Users, Video,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { href, type Route } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

const NAV: { route: Route; label: string; icon: LucideIcon }[] = [
  { route: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { route: "leads", label: "Leads", icon: Users },
  { route: "clients", label: "Clients", icon: Building2 },
  { route: "projects", label: "Projects", icon: Briefcase },
  { route: "calendar", label: "Calendar", icon: CalendarRange },
  { route: "tasks", label: "Tasks", icon: CheckSquare },
  { route: "follow-ups", label: "Follow-ups", icon: BellRing },
  { route: "visits", label: "Visits", icon: MapPin },
  { route: "chat", label: "Team chat", icon: MessageSquare },
  { route: "meetings", label: "Meetings", icon: Video },
  { route: "settings", label: "Settings", icon: Settings },
]

export function AppLayout({ route, email, children }: { route: Route; email?: string; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <Sidebar route={route} email={email} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar route={route} email={email} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <span className="text-sm font-semibold">Bizomiq</span>
        </header>
        <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  )
}

function Sidebar({ route, email, onNavigate }: { route: Route; email?: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center border-b border-sidebar-border px-4">
        <span className="text-sm font-semibold tracking-tight">Bizomiq</span>
        <span className="ml-1.5 text-xs text-muted-foreground">BMS</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ route: r, label, icon: Icon }) => (
          <a
            key={r}
            href={href(r)}
            onClick={onNavigate}
            aria-current={route === r ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              route === r && "bg-sidebar-accent text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </a>
        ))}
      </nav>
      {email && <div className="truncate border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">{email}</div>}
    </div>
  )
}
