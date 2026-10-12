import { supabase } from "@/lib/supabase"
import { localDate } from "@/lib/dates"
import type { FollowUpStatus, Genuineness, Handler, LeadStatus } from "@/lib/types"

// Just enough of a lead to show it as a card.
export interface LeadLite {
  id: string
  company_name: string
  phone: string | null
  status: LeadStatus
  call_status?: string | null
  owner?: Handler | null
  lead_score?: number | null
  genuineness?: Genuineness | null
}

export interface ChatFollowUp {
  id: string
  date: string
  time: string | null
  notes: string | null
  status: FollowUpStatus
  owner: Handler | null
}

export interface ChatMeeting {
  id: string
  title: string
  starts_at: string
  link: string | null
  status: "Scheduled" | "Completed" | "Cancelled"
}

export interface ChatMessage {
  id: string
  sender_id: string | null
  sender_name: string
  body: string
  created_at: string
  lead: LeadLite | null
  follow_up: ChatFollowUp | null
  meeting: ChatMeeting | null
}

const SELECT =
  "id,sender_id,sender_name,body,created_at," +
  "lead:leads(id,company_name,phone,status,call_status,owner,lead_score,genuineness)," +
  "follow_up:followups(id,date,time,notes,status,owner)," +
  "meeting:meetings(id,title,starts_at,link,status)"

// The latest `limit` messages, oldest first.
export async function fetchMessages(limit: number): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit + 1)
  if (error) throw error
  const rows = data as unknown as ChatMessage[]
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit }
}

export async function fetchMessage(id: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase.from("chat_messages").select(SELECT).eq("id", id).maybeSingle()
  if (error) throw error
  return data as unknown as ChatMessage | null
}

export interface NewMessage {
  body?: string
  lead_id?: string | null
  follow_up_id?: string | null
  meeting_id?: string | null
}

// sender_id / sender_name are set by a database trigger.
export async function sendMessage(m: NewMessage): Promise<string> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      body: m.body?.trim() ?? "",
      lead_id: m.lead_id ?? null,
      follow_up_id: m.follow_up_id ?? null,
      meeting_id: m.meeting_id ?? null,
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id as string
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from("chat_messages").delete().eq("id", id)
  if (error) throw error
}

export interface NewFollowUp {
  leadId: string
  date: string // YYYY-MM-DD
  time: string | null // HH:MM
  notes: string | null
  owner: Handler
}

// Creates a follow-up in the shared followups table and keeps the lead's
// "next follow-up" date (shown in the Leads table) pointing at the soonest one.
export async function createFollowUp(f: NewFollowUp): Promise<string> {
  const { data, error } = await supabase
    .from("followups")
    .insert({ lead_id: f.leadId, date: f.date, time: f.time, notes: f.notes, owner: f.owner })
    .select("id")
    .single()
  if (error) throw error

  const { data: lead } = await supabase.from("leads").select("follow_up_date").eq("id", f.leadId).maybeSingle()
  const current = lead?.follow_up_date as string | null | undefined
  if (!current || current < localDate() || f.date < current) {
    await supabase.from("leads").update({ follow_up_date: f.date }).eq("id", f.leadId)
  }
  return data.id as string
}

export async function setFollowUpStatus(id: string, status: FollowUpStatus): Promise<void> {
  const { error } = await supabase.from("followups").update({ status }).eq("id", id)
  if (error) throw error
}
