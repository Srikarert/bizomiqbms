import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Loader2, UserRoundPlus } from "lucide-react"
import { CLIENT_STATUSES, HANDLERS, type ClientStatus, type Handler } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { LeadPicker } from "@/features/leads/LeadPicker"
import { createClient, updateClient, type ClientRow } from "./api"

const NONE = "__none__"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: ClientRow // Edit when set, create otherwise.
  defaultOwner: Handler | null
  onSaved: () => void
}

export function ClientFormDialog({ open, onOpenChange, client, defaultOwner, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>
        {open && (
          <Form
            key={client?.id ?? "new"}
            client={client}
            defaultOwner={defaultOwner}
            onSaved={() => {
              onSaved()
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const blank = (v: string | null | undefined) => v ?? ""

function Form({ client, defaultOwner, onSaved }: Omit<Props, "open" | "onOpenChange">) {
  const [company, setCompany] = useState(blank(client?.company_name))
  const [contact, setContact] = useState(blank(client?.contact_name))
  const [phone, setPhone] = useState(blank(client?.phone))
  const [email, setEmail] = useState(blank(client?.email))
  const [website, setWebsite] = useState(blank(client?.website))
  const [location, setLocation] = useState(blank(client?.location))
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "Active")
  const [owner, setOwner] = useState<string>(client?.owner ?? defaultOwner ?? NONE)
  const [notes, setNotes] = useState(blank(client?.notes))
  const [leadId, setLeadId] = useState<string | null>(client?.lead_id ?? null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fill the form from an existing lead (the usual way a client is born).
  async function fromLead(id: string) {
    setPicking(false)
    const { data, error: e } = await supabase
      .from("leads")
      .select("company_name,contact_name,phone,email,website,location,owner,notes")
      .eq("id", id)
      .maybeSingle()
    if (e || !data) return toast.error("Could not load that lead")
    setLeadId(id)
    setCompany(blank(data.company_name))
    setContact(blank(data.contact_name))
    setPhone(blank(data.phone))
    setEmail(blank(data.email))
    setWebsite(blank(data.website))
    setLocation(blank(data.location))
    if (data.owner) setOwner(data.owner)
    if (data.notes) setNotes(data.notes)
    toast.success("Filled in from the lead")
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company.trim()) return setError("Company name is required")
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email")
    const n = (v: string) => v.trim() || null
    const input = {
      company_name: company.trim(),
      contact_name: n(contact),
      phone: n(phone),
      email: n(email),
      website: n(website),
      location: n(location),
      status,
      notes: n(notes),
      lead_id: leadId,
      owner: owner === NONE ? null : (owner as Handler),
    }
    setSaving(true)
    setError(null)
    try {
      if (client) await updateClient(client.id, input)
      else await createClient(input)
      toast.success(client ? "Client updated" : "Client added")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the client")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid max-h-[65svh] gap-3 overflow-y-auto px-0.5 sm:grid-cols-2">
        {!client && (
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" className="w-full" onClick={() => setPicking(true)}>
              <UserRoundPlus /> Fill in from an existing lead
            </Button>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="c-company">Company name *</Label>
          <Input id="c-company" value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-contact">Contact person</Label>
          <Input id="c-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Phone</Label>
          <Input id="c-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-website">Website</Label>
          <Input id="c-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="c-location">Location</Label>
          <Input id="c-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
            <SelectTrigger id="c-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-owner">Handled by</Label>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger id="c-owner" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="c-notes">Notes</Label>
          <Textarea id="c-notes" rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {client ? "Save changes" : "Add client"}
        </Button>
      </DialogFooter>

      <LeadPicker
        open={picking}
        onOpenChange={setPicking}
        title="Which lead became a client?"
        onPick={(l) => void fromLead(l.id)}
      />
    </form>
  )
}
