import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key)

// Uses the publishable key only. All data access is enforced by RLS
// (signed-in user + row in public.team_members).
export const supabase = createClient(url || "http://localhost", key || "missing-key")
