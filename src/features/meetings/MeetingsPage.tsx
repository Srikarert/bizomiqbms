import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, ExternalLink, Loader2, MessageSquare, Pencil, Plus, Trash2, Users, Video, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { whenLabel } from "@/lib/dates"
import { href, leadLink } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/layout/PageHeader"
import { deleteMeeting, fetchMeetings, updateMeeting, type Meeting } from "./api"
import { MeetingFormDialog } from "./MeetingFormDialog"

type Tab = "upcoming" | "past"

const endsAt = (m: Meeting) => new Date(m.starts_at).getTime() + m.duration_minutes * 60_000
const safeLink = (l: string | null) => (l && /^https?:\/\//i.test(l) ? l : null)

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  // "Now" for the upcoming/past split; refreshed whenever the list reloads.
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("upcoming")
  const [editing, setEditing] = useState<Meeting | "new" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(
    () =>
      fetchMeetings().then(
        (m) => (setMeetings(m), setNow(Date.now()), setError(null)),
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load meetings"),
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  const { upcoming, past } = useMemo(() => {
    const isUpcoming = (m: Meeting) => m.status === "Scheduled" && endsAt(m) >= now
    const all = meetings ?? []
    return {
      upcoming: all.filter(isUpcoming),
      past: all.filter((m) => !isUpcoming(m)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    }
  }, [meetings, now])

  async function setStatus(m: Meeting, status: "Completed" | "Cancelled") {
    try {
      await updateMeeting(m.id, { status })
      toast.success(status === "Completed" ? "Marked as completed" : "Meeting cancelled")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    }
  }

  async function remove(m: Meeting) {
    try {
      await deleteMeeting(m.id)
      setMeetings((ms) => ms?.filter((x) => x.id !== m.id) ?? ms)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setConfirmDelete(null)
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy. Long-press the link to copy it.")
    }
  }

  const list = tab === "upcoming" ? upcoming : past

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Schedule meetings with the team and keep the join link in one place."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={href("chat")}><MessageSquare /> Team chat</a>
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus /> Schedule meeting
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-3">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming <span className="text-muted-foreground tabular-nums">{upcoming.length}</span>
          </TabsTrigger>
          <TabsTrigger value="past">
            Past <span className="text-muted-foreground tabular-nums">{past.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </div>
      ) : !meetings ? (
        <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {tab === "upcoming" ? "No upcoming meetings. Schedule one with the button above." : "No past meetings yet."}
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((m) => {
            const link = safeLink(m.link)
            const live = m.status === "Scheduled"
            return (
              <li key={m.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className={cn("font-medium break-words", m.status === "Cancelled" && "text-muted-foreground line-through")}>
                      {m.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {whenLabel(m.starts_at)} · {m.duration_minutes} min
                      {m.status !== "Scheduled" && <span> · {m.status}</span>}
                    </p>
                  </div>
                  {link && live && (
                    <Button asChild size="sm">
                      <a href={link} target="_blank" rel="noopener noreferrer"><Video /> Join</a>
                    </Button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {m.attendees.length > 0 && (
                    <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {m.attendees.join(", ")}</span>
                  )}
                  {m.lead && (
                    <a href={leadLink(m.lead.id)} className="underline-offset-2 hover:text-foreground hover:underline">
                      Lead: {m.lead.company_name}
                    </a>
                  )}
                  {m.created_by_name && <span>Scheduled by {m.created_by_name}</span>}
                </div>
                {m.agenda && <p className="mt-2 text-sm break-words whitespace-pre-wrap">{m.agenda}</p>}

                {link && (
                  <div className="mt-3 flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-xs">
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    <a href={link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-info hover:underline">
                      {link}
                    </a>
                    <Button size="icon-xs" variant="ghost" aria-label="Copy meeting link" onClick={() => void copy(link)}>
                      <Copy />
                    </Button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {live && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => void setStatus(m, "Completed")}><Check /> Completed</Button>
                      <Button size="xs" variant="outline" onClick={() => void setStatus(m, "Cancelled")}><X /> Cancel</Button>
                    </>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => setEditing(m)}><Pencil /> Edit</Button>
                  {confirmDelete === m.id ? (
                    <span className="ml-auto flex items-center gap-1 text-xs">
                      Delete this meeting?
                      <Button size="xs" variant="destructive" onClick={() => void remove(m)}>Yes</Button>
                      <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(null)}>No</Button>
                    </span>
                  ) : (
                    <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setConfirmDelete(m.id)}>
                      <Trash2 /> Delete
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <MeetingFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        meeting={editing === "new" || editing === null ? undefined : editing}
        onSaved={() => void load()}
      />
    </>
  )
}
