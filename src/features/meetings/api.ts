import { supabase } from "@/lib/supabase"
import type { Handler } from "@/lib/types"

export const MEETING_STATUSES = ["Scheduled", "Completed", "Cancelled"] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

export interface Meeting {
  id: string
  title: string
  agenda: string | null
  starts_at: string
  duration_minutes: number
  link: string | null
  attendees: Handler[]
  lead_id: string | null
  lead: { id: string; company_name: string } | null
  status: MeetingStatus
  created_by_name: string | null
}

export interface MeetingInput {
  title: string
  agenda: string | null
  starts_at: string // ISO
  duration_minutes: number
  link: string | null
  attendees: Handler[]
  lead_id: string | null
}

const SELECT =
  "id,title,agenda,starts_at,duration_minutes,link,attendees,lead_id,status,created_by_name,lead:leads(id,company_name)"

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase.from("meetings").select(SELECT).order("starts_at", { ascending: true })
  if (error) throw error
  return data as unknown as Meeting[]
}

export async function createMeeting(m: MeetingInput): Promise<string> {
  const { data, error } = await supabase.from("meetings").insert(m).select("id").single()
  if (error) throw error
  return data.id as string
}

export async function updateMeeting(id: string, patch: Partial<MeetingInput> & { status?: MeetingStatus }): Promise<void> {
  const { error } = await supabase.from("meetings").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.from("meetings").delete().eq("id", id)
  if (error) throw error
}

// A free, no-account Jitsi room with an unguessable name. Anyone who has the
// link can join, so only share it with the team. Paste a Google Meet or Zoom
// link instead if you prefer.
export function generateMeetingLink(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  const id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14)
  return `https://meet.jit.si/Bizomiq-${id}`
}
