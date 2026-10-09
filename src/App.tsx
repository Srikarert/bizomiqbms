import type { Session } from "@supabase/supabase-js"
import { Toaster } from "@/components/ui/sonner"
import { AppLayout } from "@/components/layout/AppLayout"
import { PageHeader } from "@/components/layout/PageHeader"
import { AuthGate } from "@/features/auth/AuthGate"
import { LeadsPage } from "@/features/leads/LeadsPage"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { useRoute, type Route } from "@/lib/router"

const TITLES: Record<Route, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  clients: "Clients",
  projects: "Projects",
  tasks: "Tasks",
  "follow-ups": "Follow-ups",
  settings: "Settings",
}

export default function App() {
  return (
    <>
      <AuthGate>{(session) => <Shell session={session} />}</AuthGate>
      <Toaster position="bottom-right" />
    </>
  )
}

function Shell({ session }: { session: Session }) {
  const route = useRoute()
  return (
    <AppLayout route={route} email={session.user.email}>
      {route === "settings" ? (
        <SettingsPage session={session} />
      ) : route === "leads" ? (
        <LeadsPage />
      ) : (
        // Placeholder until the page is built in its phase.
        <>
          <PageHeader title={TITLES[route]} />
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Not built yet.</div>
        </>
      )}
    </AppLayout>
  )
}
