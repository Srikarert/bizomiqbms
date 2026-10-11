// Row types mirroring the live schema: init_bms_schema (2026-10-08) +
// supabase/migrations/20261009130000_reconcile_crm.sql.
// Status lists must stay in sync with the CHECK constraints there.

export const LEAD_STATUSES = [
  "New", "Contacted", "Interested", "Not Sure", "High Priority", "Qualified",
  "Proposal Sent", "Negotiation", "Won", "Lost",
] as const
export const CLIENT_STATUSES = ["Active", "Inactive", "Archived"] as const
export const PROJECT_STATUSES = ["Not Started", "Planning", "In Progress", "Review", "Completed", "On Hold"] as const
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const
export const TASK_STATUSES = ["To Do", "In Progress", "Done"] as const
export const FOLLOW_UP_STATUSES = ["Pending", "Completed", "Rescheduled", "Cancelled"] as const
// Team members a record can be "handled by" (the owner column). Keep in sync with
// the CHECK constraints in 20261010120000_handled_by.sql.
export const HANDLERS = ["Srikar", "Nikhil", "Jethin"] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type ClientStatus = (typeof CLIENT_STATUSES)[number]
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export type Priority = (typeof PRIORITIES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]
export type Handler = (typeof HANDLERS)[number]

interface Timestamps {
  created_at: string
  updated_at: string
}

export interface Lead extends Timestamps {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  alternate_phone: string | null
  email: string | null
  website: string | null
  location: string | null
  source: string | null
  // Remark as written on the call sheet ("busy", "visit"); status is derived from it.
  call_status: string | null
  status: LeadStatus
  category_id: string | null
  deal_value: number
  follow_up_date: string | null
  owner: Handler | null // "Handled by"
  notes: string | null
  // When the lead became green (set by a DB trigger); null while not green.
  green_since: string | null
  // Generated columns (read-only), used for duplicate detection.
  email_normalized: string | null
  phone_normalized: string | null
}

// Team-defined lead category (Constructions, Interiors, Events...). One per lead.
export interface LeadCategory {
  id: string
  name: string
  created_at: string
}

// Tags are a shared vocabulary linked to leads through lead_tags.
export interface Tag {
  id: string
  name: string
  created_at: string
}

export interface LeadTag {
  lead_id: string
  tag_id: string
}

export interface Client extends Timestamps {
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
}

export interface Project extends Timestamps {
  id: string
  name: string
  client_id: string | null
  description: string | null
  status: ProjectStatus
  priority: Priority
  start_date: string | null
  deadline: string | null
  budget: number
  progress: number
  owner: Handler | null
}

export interface Task extends Timestamps {
  id: string
  title: string
  description: string | null
  project_id: string | null
  client_id: string | null
  due_date: string | null
  priority: Priority
  status: TaskStatus
  owner: Handler | null
}

// Table name is "followups" (no underscore).
export interface FollowUp extends Timestamps {
  id: string
  lead_id: string | null
  client_id: string | null
  date: string
  time: string | null
  notes: string | null
  status: FollowUpStatus
  owner: Handler | null
}

export interface Activity {
  id: string
  entity_type: string
  entity_id: string
  action: string
  description: string
  created_at: string
}

export interface ImportTemplate extends Timestamps {
  id: string
  name: string
  entity: "leads"
  mapping: Record<string, string | null>
  created_by: string | null
}
