import { supabase } from "@/lib/supabase"
import type { Lead, LeadCategory } from "@/lib/types"

// Columns the app may write. Generated/managed columns are excluded.
export type LeadInput = Pick<
  Lead,
  | "company_name" | "contact_name" | "phone" | "alternate_phone" | "email" | "website"
  | "location" | "source" | "call_status" | "status" | "deal_value" | "follow_up_date" | "notes" | "category_id"
>

const PAGE = 1000 // PostgREST default max rows per request.

// Loads every lead. Filtering/search happens client-side; fine for a team CRM
// with thousands of rows, revisit with server-side paging beyond that.
export async function fetchAllLeads(): Promise<Lead[]> {
  const all: Lead[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as Lead[]))
    if (data.length < PAGE) return all
  }
}

export async function createLead(input: LeadInput): Promise<Lead> {
  const { data, error } = await supabase.from("leads").insert(input).select().single()
  if (error) throw error
  await logActivity("created", `Created lead ${input.company_name}`, data.id)
  return data as Lead
}

export async function updateLead(id: string, patch: Partial<LeadInput>): Promise<Lead> {
  const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select().single()
  if (error) throw error
  return data as Lead
}

export async function updateLeads(ids: string[], patch: Partial<LeadInput>): Promise<Lead[]> {
  const { data, error } = await supabase.from("leads").update(patch).in("id", ids).select()
  if (error) throw error
  return data as Lead[]
}

export async function deleteLeads(ids: string[]): Promise<void> {
  const { error } = await supabase.from("leads").delete().in("id", ids)
  if (error) throw error
  await logActivity("deleted", `Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}`, ids.length === 1 ? ids[0] : null)
}

// Inserts in chunks so very large sheets don't hit request size limits.
export async function insertLeads(rows: LeadInput[], onProgress?: (done: number) => void): Promise<number> {
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from("leads").insert(chunk)
    if (error) throw Object.assign(error, { inserted: done })
    done += chunk.length
    onProgress?.(done)
  }
  return done
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function fetchCategories(): Promise<LeadCategory[]> {
  const { data, error } = await supabase.from("lead_categories").select("*").order("name")
  if (error) throw error
  return data as LeadCategory[]
}

// The unique index is case-insensitive; turn its error into a readable one.
const friendly = (error: { code?: string; message: string }, name: string) =>
  error.code === "23505" ? new Error(`A category named "${name}" already exists`) : error

export async function createCategory(name: string): Promise<LeadCategory> {
  const { data, error } = await supabase.from("lead_categories").insert({ name: name.trim() }).select().single()
  if (error) throw friendly(error, name.trim())
  return data as LeadCategory
}

export async function renameCategory(id: string, name: string): Promise<LeadCategory> {
  const { data, error } = await supabase.from("lead_categories").update({ name: name.trim() }).eq("id", id).select().single()
  if (error) throw friendly(error, name.trim())
  return data as LeadCategory
}

// Leads in the category become uncategorized (FK is ON DELETE SET NULL).
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("lead_categories").delete().eq("id", id)
  if (error) throw error
}

// entity_id is NOT NULL; bulk actions use the nil UUID (existing convention).
const BULK_ENTITY = "00000000-0000-0000-0000-000000000000"

// Best effort: the activity log must never block the actual change.
export async function logActivity(action: string, description: string, entityId: string | null = null) {
  await supabase
    .from("activities")
    .insert({ entity_type: "lead", entity_id: entityId ?? BULK_ENTITY, action, description })
}
