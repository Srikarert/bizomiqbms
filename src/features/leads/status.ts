import { LEAD_STATUSES, type Genuineness, type LeadStatus } from "@/lib/types"

// Genuineness text colours: High is good, Low is a warning to double-check.
export const GENUINENESS_STYLES: Record<Genuineness, string> = {
  High: "text-success",
  Medium: "text-warning",
  Low: "text-muted-foreground",
}

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

// The stage is only ever set by a person (Stage dropdown, bulk actions, the
// lead form). Call-status text never changes it. The one exception is an
// import: a cell whose text is exactly a stage name ("Interested", "Lost")
// is taken as that stage; anything else starts as "New".
export function stageFromText(text: string | null | undefined): LeadStatus {
  const t = (text ?? "").trim().toLowerCase()
  return LEAD_STATUSES.find((s) => s.toLowerCase() === t) ?? "New"
}

// Common call outcomes offered as suggestions when editing a remark; any text is allowed.
export const COMMON_REMARKS = ["busy", "not answered", "switched off", "call later", "visit", "interested", "not sure", "not req"]
// id of the shared <datalist> rendered by LeadsPage.
export const REMARKS_LIST_ID = "lead-remark-suggestions"

export const STATUS_STYLES: Record<LeadStatus, string> = {
  New: "border-border text-foreground",
  "Not Answered": "bg-secondary text-muted-foreground",
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
