import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Link2, Loader2 } from "lucide-react"
import { localDate } from "@/lib/dates"
import { HANDLERS, type Handler } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createFollowUp, sendMessage, type LeadLite } from "@/features/chat/api"
import { LeadPicker } from "@/features/leads/LeadPicker"
import { updateFollowUp, type FollowUpRow } from "./api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  followUp?: FollowUpRow // Edit when set, create otherwise.
  lead?: LeadLite | null // Preselected lead for a new follow-up.
  defaultOwner: Handler | null
  defaultDate?: string // Preselected date for a new follow-up (YYYY-MM-DD).
  onSaved: () => void
}

export function FollowUpFormDialog({ open, onOpenChange, followUp, lead, defaultOwner, defaultDate, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{followUp ? "Edit follow-up" : "New follow-up"}</DialogTitle>
        </DialogHeader>
        {open && (
          <Form
            key={followUp?.id ?? lead?.id ?? "new"}
            followUp={followUp}
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
  followUp?: FollowUpRow
  lead: LeadLite | null
  defaultOwner: Handler | null
  defaultDate?: string
  onSaved: () => void
}

function Form({ followUp, lead: presetLead, defaultOwner, defaultDate, onSaved }: FormProps) {
  const [lead, setLead] = useState<LeadLite | null>(presetLead)
  const [date, setDate] = useState(followUp?.date ?? defaultDate ?? localDate())
  const [time, setTime] = useState(followUp?.time ?? "")
  const [owner, setOwner] = useState<Handler>(followUp?.owner ?? defaultOwner ?? HANDLERS[0])
  const [notes, setNotes] = useState(followUp?.notes ?? "")
  const [share, setShare] = useState(false)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!followUp && !lead) return setError("Choose a lead")
    if (!date) return setError("Pick a date")
    setSaving(true)
    setError(null)
    try {
      if (followUp) {
        await updateFollowUp(followUp, { date, time: time || null, owner, notes: notes.trim() || null })
        toast.success("Follow-up updated")
      } else {
        const id = await createFollowUp({ leadId: lead!.id, date, time: time || null, notes: notes.trim() || null, owner })
        if (share) await sendMessage({ lead_id: lead!.id, follow_up_id: id }).catch(() => undefined)
        toast.success(share ? "Follow-up set and shared in chat" : "Follow-up set")
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the follow-up")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Lead</Label>
          {followUp ? (
            <p className="text-sm font-medium">{followUp.lead?.company_name ?? "Lead no longer exists"}</p>
          ) : (
            <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setPicking(true)}>
              <Link2 /> <span className="truncate">{lead ? lead.company_name : "Choose a lead"}</span>
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-date">Date</Label>
          <Input id="fu-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-time">Time (optional)</Label>
          <Input id="fu-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fu-owner">Who follows up</Label>
          <Select value={owner} onValueChange={(v) => setOwner(v as Handler)}>
            <SelectTrigger id="fu-owner" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fu-notes">Note (optional)</Label>
          <Textarea id="fu-notes" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {!followUp && (
          <Label className="font-normal sm:col-span-2">
            <Checkbox checked={share} onCheckedChange={(c) => setShare(c === true)} />
            Also share in the team chat
          </Label>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {followUp ? "Save changes" : "Set follow-up"}
        </Button>
      </DialogFooter>

      <LeadPicker
        open={picking}
        onOpenChange={setPicking}
        title="Follow-up for which lead?"
        onPick={(l) => {
          setLead(l)
          setPicking(false)
        }}
      />
    </form>
  )
}
