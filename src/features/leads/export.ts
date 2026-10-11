import type { Lead, LeadCategory } from "@/lib/types"

const dateCell = (d: string | null) => (d ? new Date(`${d}T00:00:00`) : "")

// Downloads the given leads (in their on-screen order) as an .xlsx file.
export async function exportLeadsToExcel(leads: Lead[], categories: LeadCategory[]) {
  const XLSX = await import("xlsx") // Lazy: keeps SheetJS out of the main bundle.
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  const rows = leads.map((l, i) => ({
    "S.No": i + 1,
    Name: l.company_name,
    "Contact person": l.contact_name ?? "",
    Phone: l.phone ?? "",
    "Alternate phone": l.alternate_phone ?? "",
    Email: l.email ?? "",
    Category: (l.category_id && categoryName.get(l.category_id)) || "",
    Location: l.location ?? "",
    "Call status": l.call_status ?? "",
    Stage: l.status,
    "Lead score": l.lead_score ?? "",
    Genuineness: l.genuineness ?? "",
    "Green since": l.green_since ? new Date(l.green_since) : "",
    "Handled by": l.owner ?? "",
    "Follow-up date": dateCell(l.follow_up_date),
    "Deal value": l.deal_value || "",
    Website: l.website ?? "",
    Source: l.source ?? "",
    Notes: l.notes ?? "",
    Created: new Date(l.created_at),
  }))

  const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true, dateNF: "dd-mmm-yyyy" })
  // Rough column widths from the header and the longest value (capped).
  const width = (v: unknown) => (v instanceof Date ? 11 : String(v).length)
  ws["!cols"] = Object.keys(rows[0] ?? {}).map((h) => ({
    wch: Math.min(40, Math.max(h.length, ...rows.map((r) => width(r[h as keyof typeof r])))) + 2,
  }))
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Leads")
  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `bizomiq-leads-${today}.xlsx`, { compression: true })
}
