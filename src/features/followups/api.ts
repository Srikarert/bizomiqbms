import { supabase } from "@/lib/supabase"
import type { FollowUpStatus, Handler } from "@/lib/types"

export interface FollowUpRow {
  id: string
  date: string // YYYY-MM-DD
  time: string | null // HH:MM
  notes: string | null
  status: FollowUpStatus
  owner: Handler | null
  lead_id: string | null
  lead: { id: string; company_name: string; phone: string | null } | null
}

const SELECT = "id,date,time,notes,status,owner,lead_id,lead:leads(id,company_name,phone)"

export async function fetchFollowUps(): Promise<FollowUpRow[]> {
  const { data, error } = await supabase
    .from("followups")
    .select(SELECT)
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: true })
    .limit(5000)
  if (error) throw error
  return data as unknown as FollowUpRow[]
}

export type FollowUpPatch = Partial<Pick<FollowUpRow, "date" | "time" | "notes" | "owner" | "status">>

// Keeps the lead's "next follow-up" date (shown in the Leads table) in step:
// the earliest pending follow-up, or cleared when the one just closed was it.
async function syncLeadNextFollowUp(leadId: string, touchedDate: string) {
  const { data: pending } = await supabase
    .from("followups")
    .select("date")
    .eq("lead_id", leadId)
    .eq("status", "Pending")
    .order("date", { ascending: true })
    .limit(1)
  const next = (pending?.[0]?.date as string | undefined) ?? null
  const { data: lead } = await supabase.from("leads").select("follow_up_date").eq("id", leadId).maybeSingle()
  const current = (lead?.follow_up_date as string | null | undefined) ?? null
  if (next) {
    if (current !== next) await supabase.from("leads").update({ follow_up_date: next }).eq("id", leadId)
  } else if (current && current === touchedDate) {
    await supabase.from("leads").update({ follow_up_date: null }).eq("id", leadId)
  }
}

export async function updateFollowUp(row: FollowUpRow, patch: FollowUpPatch): Promise<void> {
  const { error } = await supabase.from("followups").update(patch).eq("id", row.id)
  if (error) throw error
  if (row.lead_id) await syncLeadNextFollowUp(row.lead_id, row.date)
}

export async function deleteFollowUp(row: FollowUpRow): Promise<void> {
  const { error } = await supabase.from("followups").delete().eq("id", row.id)
  if (error) throw error
  if (row.lead_id) await syncLeadNextFollowUp(row.lead_id, row.date)
}
