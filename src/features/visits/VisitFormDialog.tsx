import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Link2, Loader2 } from "lucide-react"
import { localDate } from "@/lib/dates"
import { HANDLERS, type Handler } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { LeadLite } from "@/features/chat/api"
import { LeadPicker } from "@/features/leads/LeadPicker"
import { createVisit, updateVisit, type Visit } from "./api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  visit?: Visit // Edit when set, schedule a new one otherwise.
  lead?: LeadLite | null // Preselected lead for a new visit.
  defaultOwner: Handler | null
  defaultDate?: string // Preselected date for a new visit (YYYY-MM-DD).
  onSaved: () => void
}

export function VisitFormDialog({ open, onOpenChange, visit, lead, defaultOwner, defaultDate, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{visit ? "Edit visit" : "Schedule a visit"}</DialogTitle>
        </DialogHeader>
        {open && (
          <Form
            key={visit?.id ?? lead?.id ?? "new"}
            visit={visit}
            lead={lead ?? null}
            defaultOwner={defaultOwner}
            defaultDate={defaultDate}
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

interface FormProps {
  visit?: Visit
  lead: LeadLite | null
  defaultOwner: Handler | null
  defaultDate?: string
  onSaved: () => void
}

function Form({ visit, lead: presetLead, defaultOwner, defaultDate, onSaved }: FormProps) {
  const [lead, setLead] = useState<LeadLite | null>(presetLead)
  const [date, setDate] = useState(visit?.visit_date ?? defaultDate ?? localDate())
  const [time, setTime] = useState(visit?.visit_time ?? "")
  const [address, setAddress] = useState(visit?.address ?? presetLead?.location ?? "")
  const [owner, setOwner] = useState<Handler>(visit?.owner ?? defaultOwner ?? HANDLERS[0])
  const [notes, setNotes] = useState(visit?.notes ?? "")
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!visit && !lead) return setError("Choose a lead")
    if (!date) return setError("Pick a date")
    setSaving(true)
    setError(null)
    try {
      const fields = {
        visit_date: date,
        visit_time: time || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        owner,
      }
      if (visit) {
        await updateVisit(visit.id, fields)
        toast.success("Visit updated")
      } else {
        await createVisit({ lead_id: lead!.id, ...fields })
        toast.success(`Visit scheduled for ${owner}`)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the visit")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Lead</Label>
          {visit ? (
            <p className="text-sm font-medium">{visit.lead?.company_name ?? "Lead no longer exists"}</p>
          ) : (
            <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setPicking(true)}>
              <Link2 /> <span className="truncate">{lead ? lead.company_name : "Choose a lead"}</span>
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-date">Visit date</Label>
          <Input id="v-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-time">Time (optional)</Label>
          <Input id="v-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="v-address">Address / location</Label>
          <Input id="v-address" maxLength={200} placeholder="Where to go" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="v-owner">Who is visiting</Label>
          <Select value={owner} onValueChange={(v) => setOwner(v as Handler)}>
            <SelectTrigger id="v-owner" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="v-notes">Notes (optional)</Label>
          <Textarea id="v-notes" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {visit ? "Save changes" : "Schedule visit"}
        </Button>
      </DialogFooter>

      <LeadPicker
        open={picking}
        onOpenChange={setPicking}
        title="Visit which lead?"
        onPick={(l) => {
          setLead(l)
          if (!address.trim() && l.location) setAddress(l.location)
          setPicking(false)
        }}
      />
    </form>
  )
}
