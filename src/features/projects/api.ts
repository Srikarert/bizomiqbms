import { supabase } from "@/lib/supabase"
import type { Handler, Priority, ProjectStatus } from "@/lib/types"
import type { Tone } from "@/components/calendar/tones"
import { localDate, shortDate } from "@/lib/dates"

export interface ProjectRow {
  id: string
  name: string
  client_id: string | null
  client: { id: string; company_name: string } | null
  description: string | null
  status: ProjectStatus
  priority: Priority
  start_date: string | null
  deadline: string | null
  budget: number
  progress: number
  owner: Handler | null
}

export type ProjectInput = Omit<ProjectRow, "id" | "client">

const SELECT =
  "id,name,client_id,description,status,priority,start_date,deadline,budget,progress,owner,client:clients(id,company_name)"

export async function fetchProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(2000)
  if (error) throw error
  return data as unknown as ProjectRow[]
}

export async function createProject(p: ProjectInput): Promise<void> {
  const { error } = await supabase.from("projects").insert(p)
  if (error) throw error
}

export async function updateProject(id: string, p: Partial<ProjectInput>): Promise<void> {
  const { error } = await supabase.from("projects").update(p).eq("id", id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) throw error
}

// Colour of a project everywhere it is drawn. Past its deadline and not
// completed means it is overdue.
export function projectTone(p: Pick<ProjectRow, "status" | "deadline">): Tone {
  if (p.status === "Completed") return "success"
  if (p.deadline && p.deadline < localDate()) return "danger"
  switch (p.status) {
    case "In Progress":
    case "Review":
      return "info"
    case "Planning":
      return "warning"
    default:
      return "muted"
  }
}

export const isOverdue = (p: Pick<ProjectRow, "status" | "deadline">) =>
  p.status !== "Completed" && Boolean(p.deadline && p.deadline < localDate())

export function dateRange(p: Pick<ProjectRow, "start_date" | "deadline">) {
  if (p.start_date && p.deadline) return `${shortDate(p.start_date)} → ${shortDate(p.deadline)}`
  if (p.deadline) return `Due ${shortDate(p.deadline)}`
  if (p.start_date) return `From ${shortDate(p.start_date)}`
  return "No dates"
}
