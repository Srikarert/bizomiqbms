import { HANDLERS, type Handler, type Lead, type LeadCategory } from "@/lib/types"
import type { LeadInput } from "../api"
import { deriveLeadStatus } from "../status"

// Lead fields a spreadsheet column can be mapped to, in auto-match priority
// order: more specific fields first, so "Alternate phone" beats "phone" and
// "Contact name" beats "name".
export const IMPORT_FIELDS = [
  { key: "alternate_phone", label: "Alternate phone", synonyms: ["alternate phone", "alt phone", "alternate number", "alternate mobile", "alternate", "alt number", "phone 2", "mobile 2", "secondary phone", "other number", "landline", "whatsapp"] },
  { key: "contact_name", label: "Contact person", synonyms: ["contact name", "contact person", "person", "owner name", "contact", "proprietor"] },
  { key: "owner", label: "Handled by", synonyms: ["handled by", "assigned to", "assigned", "owner", "sales person", "salesperson", "executive", "caller", "called by"] },
  { key: "company_name", label: "Name", synonyms: ["name", "company", "company name", "business", "business name", "lead name", "firm", "shop", "organisation", "organization", "store"] },
  { key: "phone", label: "Phone number", synonyms: ["phone", "phone number", "mobile", "mobile number", "contact number", "number", "ph", "cell", "phone no", "mobile no"] },
  { key: "location", label: "Location", synonyms: ["location", "area", "address", "city", "place", "locality"] },
  { key: "category", label: "Category", synonyms: ["category", "categories", "type", "business type", "industry", "segment"] },
  { key: "call_status", label: "Status / remarks", synonyms: ["status", "call status", "remarks", "remark", "response", "outcome", "feedback", "result"] },
  { key: "email", label: "Email", synonyms: ["email", "email id", "mail", "e mail"] },
  { key: "website", label: "Website", synonyms: ["website", "web", "site", "url"] },
  { key: "source", label: "Source", synonyms: ["source", "lead source", "channel"] },
  { key: "deal_value", label: "Deal value", synonyms: ["deal value", "value", "amount", "budget"] },
  { key: "follow_up_date", label: "Follow-up date", synonyms: ["follow up", "follow up date", "followup", "next call", "callback date"] },
  { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments", "comment", "description", "details"] },
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"]
// Column index -> field, or null to ignore the column.
export type Mapping = (ImportField | null)[]

export interface Sheet {
  name: string
  headers: string[]
  rows: unknown[][]
  lines: number[] // Spreadsheet row number of each entry in rows, for messages.
}

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export async function readWorkbook(file: File): Promise<Sheet[]> {
  const XLSX = await import("xlsx") // Lazy: keeps the parser out of the main bundle.
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
  return wb.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" })
    // Header = first row with at least two filled cells (skips title rows).
    const headerAt = grid.findIndex((r) => r.filter((c) => String(c).trim() !== "").length >= 2)
    if (headerAt < 0) return { name, headers: [], rows: [], lines: [] }
    const headers = grid[headerAt].map((h, i) => String(h).trim() || `Column ${i + 1}`)
    const rows: unknown[][] = []
    const lines: number[] = []
    grid.forEach((r, i) => {
      if (i > headerAt && r.some((c) => String(c).trim() !== "")) {
        rows.push(r)
        lines.push(i + 1)
      }
    })
    return { name, headers, rows, lines }
  })
}

export function autoMap(headers: string[], saved?: Record<string, string | null>): Mapping {
  const used = new Set<ImportField>()
  const take = (f: ImportField | null) => (f && !used.has(f) ? (used.add(f), f) : null)
  const norm = headers.map(normalizeHeader)
  const mapping: Mapping = headers.map(() => null)

  // 1. A previously saved mapping for the same header wins.
  norm.forEach((h, i) => {
    if (saved && h in saved) mapping[i] = take(saved[h] as ImportField | null)
  })
  // 2. Exact synonym match, then 3. header contains a synonym.
  for (const exact of [true, false]) {
    norm.forEach((h, i) => {
      if (mapping[i] || (saved && h in saved)) return
      const field = IMPORT_FIELDS.find(
        (f) => !used.has(f.key) && f.synonyms.some((s) => (exact ? h === s : h.includes(s))),
      )
      if (field) mapping[i] = take(field.key)
    })
  }
  return mapping
}

export const mappingToTemplate = (headers: string[], mapping: Mapping) =>
  Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), mapping[i]]))

// ---------------------------------------------------------------------------
// Row conversion
// ---------------------------------------------------------------------------

export interface PreparedRow {
  line: number // Spreadsheet row number.
  lead: LeadInput
  error?: string // Row is skipped.
  warning?: string // Row is imported; the bad value is kept in notes instead.
  duplicateOf?: string // Why it is a duplicate.
}

const cellText = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  // Integers: avoid "9.87654321E+9" for phone numbers stored as numbers.
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v)
  return String(v ?? "").trim()
}

// Last 10 digits so "+91 98765 43210" and "9876543210" match.
export const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "")
  return d.length >= 6 ? d.slice(-10) : null
}

function parseDate(v: unknown): string | null | "invalid" {
  if (v instanceof Date) return isNaN(v.getTime()) ? "invalid" : v.toISOString().slice(0, 10)
  const s = cellText(v)
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return toIso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/) // Indian order: dd/mm/yyyy
  if (m) return toIso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return "invalid"
}

function toIso(y: number, mo: number, d: number): string | "invalid" {
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "invalid"
  return dt.toISOString().slice(0, 10)
}

export interface PrepareOptions {
  source: string
  categoryId: string | null // Applied to every row without its own category.
  categories: LeadCategory[]
  owner: Handler | null // Applied to every row without its own "Handled by" value.
}

// "srikar", "Srikar Akula" -> "Srikar"; anything else is unknown.
export function matchHandler(raw: string): Handler | undefined {
  const first = raw.trim().toLowerCase().split(/\s+/)[0]
  return HANDLERS.find((h) => h.toLowerCase() === first)
}

export function prepareRows(sheet: Sheet, mapping: Mapping, existing: Lead[], opts: PrepareOptions): PreparedRow[] {
  const categoryByName = new Map(opts.categories.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const seenPhones = new Map<string, string>()
  const seenEmails = new Map<string, string>()
  for (const l of existing) {
    for (const p of [l.phone, l.alternate_phone]) {
      const k = phoneKey(p)
      if (k) seenPhones.set(k, `already in CRM (${l.company_name})`)
    }
    if (l.email_normalized) seenEmails.set(l.email_normalized, `already in CRM (${l.company_name})`)
  }

  return sheet.rows.flatMap((cells, idx): PreparedRow[] => {
    const line = sheet.lines[idx]
    const get = (field: ImportField) => {
      const col = mapping.indexOf(field)
      return col < 0 ? undefined : cells[col]
    }
    const text = (field: ImportField) => cellText(get(field)) || null
    // Rows with data only in ignored columns (e.g. a serial number) are blank.
    if (mapping.every((f, col) => !f || cellText(cells[col]) === "")) return []

    const contact = text("contact_name")
    const callStatus = text("call_status")
    const lead: LeadInput = {
      company_name: text("company_name") ?? contact ?? "",
      contact_name: contact,
      phone: text("phone"),
      alternate_phone: text("alternate_phone"),
      email: text("email"),
      website: text("website"),
      location: text("location"),
      source: text("source") ?? opts.source,
      call_status: callStatus,
      status: deriveLeadStatus(callStatus),
      deal_value: 0,
      follow_up_date: null,
      notes: text("notes"),
      category_id: opts.categoryId,
      owner: opts.owner,
    }

    // Bad optional values don't cost the lead: blank the field, keep the text in notes.
    const warnings: string[] = []
    const keep = (label: string, raw: string) => {
      warnings.push(`invalid ${label}`)
      lead.notes = [lead.notes, `${label[0].toUpperCase()}${label.slice(1)} (as imported): ${raw}`].filter(Boolean).join("\n")
    }
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      keep("email", lead.email)
      lead.email = null
    }
    const rawCategory = text("category")
    if (rawCategory) {
      const id = categoryByName.get(rawCategory.toLowerCase())
      if (id) lead.category_id = id
      else warnings.push(`unknown category "${rawCategory}"`)
    }
    const rawOwner = text("owner")
    if (rawOwner) {
      const h = matchHandler(rawOwner)
      if (h) lead.owner = h
      else warnings.push(`unknown "Handled by" "${rawOwner}"`)
    }
    const rawValue = text("deal_value")
    if (rawValue) {
      const n = Number(rawValue.replace(/[₹,\s]|rs\.?/gi, ""))
      if (Number.isFinite(n) && n >= 0) lead.deal_value = n
      else keep("deal value", rawValue)
    }
    const date = parseDate(get("follow_up_date"))
    if (date === "invalid") keep("follow-up date", cellText(get("follow_up_date")))
    else lead.follow_up_date = date

    const row: PreparedRow = { line, lead, warning: warnings.join(", ") || undefined }
    if (!lead.company_name) return [{ ...row, error: "name is empty" }]

    const phones = [lead.phone, lead.alternate_phone].map(phoneKey).filter((k): k is string => Boolean(k))
    const email = lead.email?.toLowerCase() ?? null
    const dup = phones.map((k) => seenPhones.get(k)).find(Boolean) ?? (email ? seenEmails.get(email) : undefined)
    const self = `same as row ${line}`
    phones.forEach((k) => seenPhones.has(k) || seenPhones.set(k, self))
    if (email && !seenEmails.has(email)) seenEmails.set(email, self)
    return [dup ? { ...row, duplicateOf: dup } : row]
  })
}
