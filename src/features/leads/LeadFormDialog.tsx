import { useState, type FormEvent, type ReactNode } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { HANDLERS, LEAD_PRIORITIES, LEAD_STATUSES, type Handler, type Lead, type LeadCategory, type LeadPriority, type LeadStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createLead, updateLead, type LeadInput } from "./api"
import { PRIORITY_DOT, PRIORITY_LABELS, deriveLeadStatus } from "./status"

type FormState = Record<Exclude<keyof LeadInput, "status">, string> & { status: LeadStatus }

const NO_CATEGORY = "__none__"
const UNASSIGNED = "__none__"
const NO_PRIORITY = "__none__"

const toForm = (l?: Lead, defaultCategoryId?: string | null, defaultOwner?: Handler | null): FormState => ({
  company_name: l?.company_name ?? "",
  contact_name: l?.contact_name ?? "",
  phone: l?.phone ?? "",
  alternate_phone: l?.alternate_phone ?? "",
  email: l?.email ?? "",
  website: l?.website ?? "",
  location: l?.location ?? "",
  source: l?.source ?? "",
  call_status: l?.call_status ?? "",
  status: l?.status ?? "New",
  deal_value: l?.deal_value ? String(l.deal_value) : "",
  follow_up_date: l?.follow_up_date ?? "",
  notes: l?.notes ?? "",
  category_id: (l ? l.category_id : defaultCategoryId) ?? "",
  owner: (l ? l.owner : defaultOwner) ?? "",
  priority: l?.priority ?? "",
})

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const e: Partial<Record<keyof FormState, string>> = {}
  if (!f.company_name.trim()) e.company_name = "Name is required"
  for (const k of ["phone", "alternate_phone"] as const) {
    if (f[k].trim() && f[k].replace(/\D/g, "").length < 6) e[k] = "Enter a valid phone number"
  }
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid email"
  if (f.deal_value.trim() && !(Number(f.deal_value) >= 0)) e.deal_value = "Must be a positive number"
  return e
}

const blankToNull = (s: string) => s.trim() || null

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead?: Lead // Edit when set, create otherwise.
  categories: LeadCategory[]
  defaultCategoryId?: string | null // Preselected for new leads.
  defaultOwner?: Handler | null // Preselected "Handled by" for new leads.
  onSaved: (lead: Lead) => void
}

export function LeadFormDialog({ open, onOpenChange, lead, categories, defaultCategoryId, defaultOwner, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "Add lead"}</DialogTitle>
        </DialogHeader>
        {/* Keyed so the form resets whenever a different lead is opened. */}
        {open && (
          <LeadForm
            key={lead?.id ?? "new"}
            lead={lead}
            categories={categories}
            defaultCategoryId={defaultCategoryId}
            defaultOwner={defaultOwner}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function LeadForm({ lead, categories, defaultCategoryId, defaultOwner, onSaved }: Omit<Props, "open" | "onOpenChange">) {
  const [form, setForm] = useState(() => toForm(lead, defaultCategoryId, defaultOwner))
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({})
  const [saving, setSaving] = useState(false)
  // Until the user picks a status by hand, follow the call remark.
  const [statusTouched, setStatusTouched] = useState(Boolean(lead))

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length) return

    const input: LeadInput = {
      company_name: form.company_name.trim(),
      contact_name: blankToNull(form.contact_name),
      phone: blankToNull(form.phone),
      alternate_phone: blankToNull(form.alternate_phone),
      email: blankToNull(form.email),
      website: blankToNull(form.website),
      location: blankToNull(form.location),
      source: blankToNull(form.source),
      call_status: blankToNull(form.call_status),
      status: form.status,
      deal_value: form.deal_value.trim() ? Number(form.deal_value) : 0,
      follow_up_date: blankToNull(form.follow_up_date),
      notes: blankToNull(form.notes),
      category_id: form.category_id || null,
      owner: (form.owner || null) as Handler | null,
      priority: (form.priority || null) as LeadPriority | null,
    }
    setSaving(true)
    try {
      const saved = lead ? await updateLead(lead.id, input) : await createLead(input)
      toast.success(lead ? "Lead updated" : "Lead added")
      onSaved(saved)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save lead")
    } finally {
      setSaving(false)
    }
  }

  const field = (k: keyof FormState, label: string, input: ReactNode, wide = false) => (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={k}>{label}</Label>
      {input}
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  )
  const text = (k: Exclude<keyof FormState, "status">, label: string, type = "text", wide = false) =>
    field(k, label, (
      <Input id={k} type={type} value={form[k]} aria-invalid={Boolean(errors[k])} onChange={(e) => set(k, e.target.value)} />
    ), wide)

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid max-h-[65svh] gap-3 overflow-y-auto px-0.5 sm:grid-cols-2">
        {text("company_name", "Name *")}
        {field("category_id", "Category", (
          <Select value={form.category_id || NO_CATEGORY} onValueChange={(v) => set("category_id", v === NO_CATEGORY ? "" : v)}>
            <SelectTrigger id="category_id" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {field("owner", "Handled by", (
          <Select value={form.owner || UNASSIGNED} onValueChange={(v) => set("owner", v === UNASSIGNED ? "" : v)}>
            <SelectTrigger id="owner" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {field("priority", "Priority", (
          <Select value={form.priority || NO_PRIORITY} onValueChange={(v) => set("priority", v === NO_PRIORITY ? "" : v)}>
            <SelectTrigger id="priority" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PRIORITY}>No priority</SelectItem>
              {LEAD_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className={`size-2 rounded-full ${PRIORITY_DOT[p]}`} aria-hidden />
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {text("contact_name", "Contact person")}
        {text("location", "Location")}
        {text("phone", "Phone number", "tel")}
        {text("alternate_phone", "Alternate phone", "tel")}
        {field("call_status", "Call status / remarks", (
          <Input
            id="call_status"
            placeholder="e.g. busy, visit, call Monday"
            value={form.call_status}
            onChange={(e) => {
              set("call_status", e.target.value)
              if (!statusTouched) set("status", deriveLeadStatus(e.target.value))
            }}
          />
        ))}
        {field("status", "Stage", (
          <Select
            value={form.status}
            onValueChange={(v) => {
              setStatusTouched(true)
              set("status", v as LeadStatus)
            }}
          >
            <SelectTrigger id="status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {text("email", "Email", "email")}
        {text("website", "Website")}
        {text("source", "Source")}
        {text("deal_value", "Deal value (₹)", "number")}
        {text("follow_up_date", "Follow-up date", "date")}
        {field("notes", "Notes", (
          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        ), true)}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {lead ? "Save changes" : "Add lead"}
        </Button>
      </DialogFooter>
    </form>
  )
}
