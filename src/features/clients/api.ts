import { supabase } from "@/lib/supabase"
import type { ClientStatus, Handler } from "@/lib/types"

export interface ClientRow {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  location: string | null
  status: ClientStatus
  notes: string | null
  lead_id: string | null
  owner: Handler | null
  projects: { count: number }[]
}

export type ClientInput = Omit<ClientRow, "id" | "projects">

const SELECT = "id,company_name,contact_name,phone,email,website,location,status,notes,lead_id,owner,projects(count)"

export async function fetchClients(): Promise<ClientRow[]> {
  const { data, error } = await supabase.from("clients").select(SELECT).order("company_name", { ascending: true }).limit(2000)
  if (error) throw error
  return data as unknown as ClientRow[]
}

export async function createClient(c: ClientInput): Promise<void> {
  const { error } = await supabase.from("clients").insert(c)
  if (error) throw error
}

export async function updateClient(id: string, c: Partial<ClientInput>): Promise<void> {
  const { error } = await supabase.from("clients").update(c).eq("id", id)
  if (error) throw error
}

// Their projects stay, just without a client (FK is ON DELETE SET NULL).
export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id)
  if (error) throw error
}

export const projectCount = (c: ClientRow) => c.projects?.[0]?.count ?? 0
