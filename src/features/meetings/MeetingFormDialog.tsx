import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Link2, Loader2, Wand2, X } from "lucide-react"
import { localDate, localTime } from "@/lib/dates"
import { HANDLERS, type Handler } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { sendMessage } from "@/features/chat/api"
import { LeadPicker } from "@/features/leads/LeadPicker"
import { createMeeting, generateMeetingLink, updateMeeting, type Meeting } from "./api"

const DURATIONS = [15, 30, 45, 60, 90, 120]

// Default start for a new meeting: the next half-hour from now.
function nextSlot(): Date {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60) // 60 rolls over to the next hour (and day)
  return d
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  meeting?: Meeting // Edit when set, schedule a new one otherwise.
  onSaved: () => void
}

export function MeetingFormDialog({ open, onOpenChange, meeting, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meeting ? "Edit meeting" : "Schedule a meeting"}</DialogTitle>
        </DialogHeader>
        {open && <Form key={meeting?.id ?? "new"} meeting={meeting} onSaved={onSaved} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ meeting, onSaved, onClose }: { meeting?: Meeting; onSaved: () => void; onClose: () => void }) {
  const [start] = useState(() => (meeting ? new Date(meeting.starts_at) : nextSlot()))
  const [title, setTitle] = useState(meeting?.title ?? "")
  const [date, setDate] = useState(localDate(start))
  const [time, setTime] = useState(localTime(start))
  const [duration, setDuration] = useState(meeting?.duration_minutes ?? 30)
  const [attendees, setAttendees] = useState<Handler[]>(meeting?.attendees ?? [...HANDLERS])
  const [link, setLink] = useState(meeting?.link ?? "")
  const [lead, setLead] = useState<{ id: string; company_name: string } | null>(meeting?.lead ?? null)
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "")
  const [postToChat, setPostToChat] = useState(true)
  const [pickLead, setPickLead] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (h: Handler) =>
    setAttendees((a) => (a.includes(h) ? a.filter((x) => x !== h) : [...a, h]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError("Give the meeting a title")
    if (!date || !time) return setError("Pick a date and time")
    const trimmedLink = link.trim()
    if (trimmedLink && !/^https?:\/\/\S+$/i.test(trimmedLink)) return setError("The link must start with https://")
    const startsAt = new Date(`${date}T${time}:00`)
    if (isNaN(startsAt.getTime())) return setError("That date or time isn't valid")

    const input = {
      title: title.trim(),
      agenda: agenda.trim() || null,
      starts_at: startsAt.toISOString(),
      duration_minutes: duration,
      link: trimmedLink || null,
      attendees,
      lead_id: lead?.id ?? null,
    }
    setSaving(true)
    setError(null)
    try {
      if (meeting) {
        await updateMeeting(meeting.id, input)
        toast.success("Meeting updated")
      } else {
        const id = await createMeeting(input)
        if (postToChat) await sendMessage({ meeting_id: id, lead_id: input.lead_id }).catch(() => undefined)
        toast.success(postToChat ? "Meeting scheduled and shared in chat" : "Meeting scheduled")
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the meeting")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid max-h-[65svh] gap-3 overflow-y-auto px-0.5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="m-title">Title</Label>
          <Input id="m-title" placeholder="e.g. Pitch to Thraksha Architects" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-date">Date</Label>
          <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-time">Time</Label>
          <Input id="m-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-duration">Duration</Label>
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger id="m-duration" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d} minutes</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm leading-none font-medium">Who's joining</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1.5">
            {HANDLERS.map((h) => (
              <Label key={h} className="font-normal">
                <Checkbox checked={attendees.includes(h)} onCheckedChange={() => toggle(h)} /> {h}
              </Label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="m-link">Meeting link</Label>
          <div className="flex gap-2">
            <Input id="m-link" type="url" inputMode="url" placeholder="Paste a Google Meet / Zoom link" value={link} onChange={(e) => setLink(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => setLink(generateMeetingLink())} title="Create a free Jitsi meeting room">
              <Wand2 /> Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            “Generate” makes a free Jitsi room. Anyone with the link can join, so keep it within the team.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>About a lead (optional)</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="min-w-0 flex-1 justify-start" onClick={() => setPickLead(true)}>
              <Link2 /> <span className="truncate">{lead ? lead.company_name : "Choose a lead"}</span>
            </Button>
            {lead && (
              <Button type="button" variant="ghost" size="icon" aria-label="Remove lead" onClick={() => setLead(null)}><X /></Button>
            )}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="m-agenda">Agenda / notes</Label>
          <Textarea id="m-agenda" rows={3} value={agenda} maxLength={1000} onChange={(e) => setAgenda(e.target.value)} />
        </div>
        {!meeting && (
          <Label className="font-normal sm:col-span-2">
            <Checkbox checked={postToChat} onCheckedChange={(c) => setPostToChat(c === true)} />
            Share this meeting in the team chat
          </Label>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {meeting ? "Save changes" : "Schedule meeting"}
        </Button>
      </DialogFooter>

      <LeadPicker
        open={pickLead}
        onOpenChange={setPickLead}
        title="Meeting about which lead?"
        onPick={(l) => {
          setLead({ id: l.id, company_name: l.company_name })
          setPickLead(false)
        }}
      />
    </form>
  )
}
