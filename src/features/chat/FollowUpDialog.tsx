import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { localDate } from "@/lib/dates"
import { HANDLERS, type Handler } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createFollowUp, sendMessage, type LeadLite } from "./api"

interface Props {
  lead: LeadLite | null // Dialog is open while a lead is set.
  defaultOwner: Handler | null
  onClose: () => void
  onPosted: (messageId: string) => void
}

// Creates a follow-up for a lead and announces it in the team chat.
export function FollowUpDialog({ lead, defaultOwner, onClose, onPosted }: Props) {
  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set follow-up</DialogTitle>
          <DialogDescription>{lead?.company_name}</DialogDescription>
        </DialogHeader>
        {lead && <Form key={lead.id} lead={lead} defaultOwner={defaultOwner} onPosted={onPosted} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ lead, defaultOwner, onPosted }: Omit<Props, "onClose" | "lead"> & { lead: LeadLite }) {
  const [date, setDate] = useState(localDate())
  const [time, setTime] = useState("")
  const [owner, setOwner] = useState<Handler>(defaultOwner ?? HANDLERS[0])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!date) return setError("Pick a date")
    setSaving(true)
    setError(null)
    try {
      const followUpId = await createFollowUp({
        leadId: lead.id, date, time: time || null, notes: notes.trim() || null, owner,
      })
      const messageId = await sendMessage({ lead_id: lead.id, follow_up_id: followUpId })
      toast.success(`Follow-up set for ${owner}`)
      onPosted(messageId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save follow-up")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fu-date">Date</Label>
          <Input id="fu-date" type="date" required min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-time">Time (optional)</Label>
          <Input id="fu-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fu-owner">Who follows up</Label>
          <Select value={owner} onValueChange={(v) => setOwner(v as Handler)}>
            <SelectTrigger id="fu-owner" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fu-notes">Note (optional)</Label>
          <Textarea id="fu-notes" rows={3} maxLength={500} placeholder="What to discuss, what they asked for…"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Set follow-up and post
        </Button>
      </DialogFooter>
    </form>
  )
}
