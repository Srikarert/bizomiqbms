import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Handler } from "@/lib/types"

let cached: Promise<Handler | null> | null = null

// The signed-in person's "Handled by" name (team_members.name), or null if
// their login isn't linked to one. RLS only lets a user read their own row.
function fetchMyName(): Promise<Handler | null> {
  cached ??= supabase.auth.getUser().then(async ({ data }) => {
    if (!data.user) return null
    const { data: row } = await supabase.from("team_members").select("name").eq("user_id", data.user.id).maybeSingle()
    return (row?.name as Handler | null) ?? null
  })
  return cached
}

// Signing in as someone else must not reuse the previous person's name.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") cached = null
})

export function useMyName(): Handler | null {
  const [name, setName] = useState<Handler | null>(null)
  useEffect(() => {
    let live = true
    fetchMyName().then((n) => live && setName(n))
    return () => {
      live = false
    }
  }, [])
  return name
}
