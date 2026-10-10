import type { Session } from "@supabase/supabase-js"
import { LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useMyName } from "@/lib/team"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/PageHeader"

export function SettingsPage({ session }: { session: Session }) {
  const myName = useMyName()
  return (
    <>
      <PageHeader title="Settings" />
      <section className="max-w-lg rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Account</h2>
        <dl className="mt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate">{session.user.email}</dd>
          <dt className="text-muted-foreground">Handled by</dt>
          <dd>{myName ?? <span className="text-muted-foreground">Not linked to a team member</span>}</dd>
          <dt className="text-muted-foreground">Last sign-in</dt>
          <dd>{session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString() : "—"}</dd>
        </dl>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => supabase.auth.signOut()}>
          <LogOut /> Sign out
        </Button>
      </section>
    </>
  )
}
