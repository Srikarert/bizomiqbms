import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { Loader2 } from "lucide-react"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Membership = "unknown" | "member" | "not-member"

const USERNAME_DOMAIN = "bizomiq.local"

// Renders children only for signed-in users listed in public.team_members.
// This is a UX gate; the real enforcement is RLS in the database.
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Keyed by user id so a stale result never applies to a different user.
  const [checked, setChecked] = useState<{ userId: string; isMember: boolean } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    supabase
      .from("team_members")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setChecked({ userId, isMember: Boolean(data) }))
  }, [userId])

  const membership: Membership =
    !checked || checked.userId !== userId ? "unknown" : checked.isMember ? "member" : "not-member"

  if (!isSupabaseConfigured) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and set
          the project URL and publishable key.
        </p>
      </Centered>
    )
  }

  if (session === undefined || (session && membership === "unknown")) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Centered>
    )
  }

  if (!session) return <SignIn />

  if (membership === "not-member") {
    return (
      <Centered>
        <p className="text-sm">Signed in as {session.user.email}</p>
        <p className="text-sm text-muted-foreground">
          This account is not on the Bizomiq team list. Ask an admin to add you.
        </p>
        <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </Centered>
    )
  }

  return <>{children(session)}</>
}

function SignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Supabase logins are emails; a plain username ("bizomiq7448") maps to
    // the shared account's placeholder address.
    const login = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({
      email: login.includes("@") ? login : `${login}@${USERNAME_DOMAIN}`,
      password,
    })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <Centered>
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4 rounded-lg border bg-card p-6 text-left">
        <div>
          <h1 className="text-base font-semibold">Bizomiq BMS</h1>
          <p className="text-xs text-muted-foreground">Sign in to continue</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email or username</Label>
          <Input id="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>
}
