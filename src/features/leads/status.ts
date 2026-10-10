import { LEAD_STATUSES, type LeadPriority, type LeadStatus } from "@/lib/types"

export const PRIORITY_LABELS: Record<LeadPriority, string> = { High: "High priority", Maybe: "Maybe" }
export const PRIORITY_STYLES: Record<LeadPriority, string> = {
  High: "bg-info/15 text-info",
  Maybe: "bg-warning/15 text-warning",
}
export const PRIORITY_DOT: Record<LeadPriority, string> = { High: "bg-info", Maybe: "bg-warning" }

// "high", "hot", "maybe", "mid"... from a spreadsheet; undefined if unrecognized.
export function parsePriority(raw: string): LeadPriority | undefined {
  const t = raw.trim().toLowerCase()
  if (/^(high|hot|h|urgent|top)\b/.test(t)) return "High"
  if (/^(maybe|mid|medium|m|warm)\b/.test(t)) return "Maybe"
  return undefined
}

// Green leads are the ones showing interest. Everything else is a normal lead.
export const GREEN_STATUSES: readonly LeadStatus[] = ["Interested", "Qualified", "Proposal Sent", "Negotiation", "Won"]
export const NORMAL_STATUSES: readonly LeadStatus[] = LEAD_STATUSES.filter((s) => !GREEN_STATUSES.includes(s))

export const isGreen = (status: LeadStatus) => GREEN_STATUSES.includes(status)

// Mirrors the backfill in supabase/migrations/20261009140000_leads_call_status.sql.
// Order matters: "not interested" must hit the lost rule before "interest".
const LOST_RE = /(not\s*req|not\s*interest|no\s*need|wrong\s*(no|num)|not\s*required)/
const GREEN_RE = /(visit|interest|meeting|demo|quot|proposal|deal|confirm)/

// Maps a free-text call remark from a spreadsheet onto a pipeline stage.
export function deriveLeadStatus(callStatus: string | null | undefined): LeadStatus {
  const text = (callStatus ?? "").trim().toLowerCase()
  if (!text) return "New"
  const exact = LEAD_STATUSES.find((s) => s.toLowerCase() === text)
  if (exact) return exact
  if (LOST_RE.test(text)) return "Lost"
  if (GREEN_RE.test(text)) return "Interested"
  return "Contacted"
}

// Common call outcomes offered as suggestions when editing a remark; any text is allowed.
export const COMMON_REMARKS = ["busy", "not answered", "switched off", "call later", "visit", "interested", "not req"]
// id of the shared <datalist> rendered by LeadsPage.
export const REMARKS_LIST_ID = "lead-remark-suggestions"

export const STATUS_STYLES: Record<LeadStatus, string> = {
  New: "border-border text-foreground",
  Contacted: "bg-secondary text-muted-foreground",
  Interested: "bg-success/15 text-success",
  Qualified: "bg-success/15 text-success",
  "Proposal Sent": "bg-success/15 text-success",
  Negotiation: "bg-success/15 text-success",
  Won: "bg-success text-background",
  Lost: "bg-destructive/15 text-destructive",
}
