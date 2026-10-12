import { supabase } from "@/lib/supabase"
import type { Handler } from "@/lib/types"

export const VISIT_STATUSES = ["Scheduled", "Completed", "Cancelled"] as const
export type VisitStatus = (typeof VISIT_STATUSES)[number]

export interface Visit {
  id: string
  lead_id: string
  visit_date: string // YYYY-MM-DD
  visit_time: string | null // HH:MM
  address: string | null
  notes: string | null
  owner: Handler | null
  status: VisitStatus
  lead: { id: string; company_name: string; phone: string | null; location: string | null } | null
}

export interface VisitInput {
  lead_id: string
  visit_date: string
  visit_time: string | null
  address: string | null
  notes: string | null
  owner: Handler | null
}

const SELECT = "id,lead_id,visit_date,visit_time,address,notes,owner,status,lead:leads(id,company_name,phone,location)"

export async function fetchVisits(): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("visits")
    .select(SELECT)
    .order("visit_date", { ascending: true })
    .order("visit_time", { ascending: true, nullsFirst: true })
    .limit(5000)
  if (error) throw error
  return data as unknown as Visit[]
}

export async function createVisit(v: VisitInput): Promise<void> {
  const { error } = await supabase.from("visits").insert(v)
  if (error) throw error
}

export async function updateVisit(id: string, patch: Partial<VisitInput> & { status?: VisitStatus }): Promise<void> {
  const { error } = await supabase.from("visits").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteVisit(id: string): Promise<void> {
  const { error } = await supabase.from("visits").delete().eq("id", id)
  if (error) throw error
}
