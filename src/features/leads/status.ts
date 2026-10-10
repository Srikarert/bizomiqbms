import { LEAD_STATUSES, type LeadStatus } from "@/lib/types"

// Green leads are the ones showing interest. Everything else is a normal lead.
export const GREEN_STATUSES: readonly LeadStatus[] = [
  "Interested", "Not Sure", "High Priority", "Qualified", "Proposal Sent", "Negotiation", "Won",
]
export const NORMAL_STATUSES: readonly LeadStatus[] = LEAD_STATUSES.filter((s) => !GREEN_STATUSES.includes(s))

export const isGreen = (status: LeadStatus) => GREEN_STATUSES.includes(status)

// Green leads split into three groups; "normal" is every other green stage.
export const GREEN_GROUPS = [
  { key: "normal", label: "Normal", dot: "bg-success" },
  { key: "Not Sure", label: "Not sure", dot: "bg-warning" },
  { key: "High Priority", label: "High priority", dot: "bg-info" },
] as const
export type GreenGroup = (typeof GREEN_GROUPS)[number]["key"]
export const greenGroup = (status: LeadStatus): GreenGroup =>
  status === "Not Sure" || status === "High Priority" ? status : "normal"

// Mirrors the backfill in supabase/migrations/20261009140000_leads_call_status.sql
// (the "Not Sure" rule was added later and only applies to new remarks).
// Order matters: "not interested" must hit the lost rule before "interest".
const LOST_RE = /(not\s*req|not\s*interest|no\s*need|wrong\s*(no|num)|not\s*required)/
const NOT_SURE_RE = /(not\s*sure|maybe)/
const GREEN_RE = /(visit|interest|meeting|demo|quot|proposal|deal|confirm)/

// Maps a free-text call remark from a spreadsheet onto a pipeline stage.
export function deriveLeadStatus(callStatus: string | null | undefined): LeadStatus {
  const text = (callStatus ?? "").trim().toLowerCase()
  if (!text) return "New"
  const exact = LEAD_STATUSES.find((s) => s.toLowerCase() === text)
  if (exact) return exact
  if (LOST_RE.test(text)) return "Lost"
  if (NOT_SURE_RE.test(text)) return "Not Sure"
  if (GREEN_RE.test(text)) return "Interested"
  return "Contacted"
}

// Common call outcomes offered as suggestions when editing a remark; any text is allowed.
export const COMMON_REMARKS = ["busy", "not answered", "switched off", "call later", "visit", "interested", "not sure", "not req"]
// id of the shared <datalist> rendered by LeadsPage.
export const REMARKS_LIST_ID = "lead-remark-suggestions"

export const STATUS_STYLES: Record<LeadStatus, string> = {
  New: "border-border text-foreground",
  Contacted: "bg-secondary text-muted-foreground",
  Interested: "bg-success/15 text-success",
  "Not Sure": "bg-warning/15 text-warning",
  "High Priority": "bg-info/15 text-info",
  Qualified: "bg-success/15 text-success",
  "Proposal Sent": "bg-success/15 text-success",
  Negotiation: "bg-success/15 text-success",
  Won: "bg-success text-background",
  Lost: "bg-destructive/15 text-destructive",
}
