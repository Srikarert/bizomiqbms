import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Calendar as CalendarIcon, Check, List, Loader2, MapPin, Pencil, Phone, Plus, RotateCcw, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { dateTimeLabel, localDate } from "@/lib/dates"
import { leadLink } from "@/lib/router"
import { useMyName } from "@/lib/team"
import { HANDLERS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MonthCalendar, type CalendarItem } from "@/components/calendar/MonthCalendar"
import { PageHeader } from "@/components/layout/PageHeader"
import { deleteVisit, fetchVisits, updateVisit, type Visit, type VisitStatus } from "./api"
import { VisitFormDialog } from "./VisitFormDialog"

type View = "list" | "calendar"
type Tab = "scheduled" | "closed"
const ALL = "__all__"
const MINE = "__me__"
const NONE = "__none__"

export function VisitsPage() {
  const myName = useMyName()
  const [visits, setVisits] = useState<Visit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("calendar")
  const [tab, setTab] = useState<Tab>("scheduled")
  const [owner, setOwner] = useState(ALL)
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(() => localDate())
  const [editing, setEditing] = useState<Visit | "new" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(
    () =>
      fetchVisits().then(
        (v) => (setVisits(v), setError(null)),
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load visits"),
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  const today = localDate()
  const filtered = useMemo(() => {
    const want = owner === MINE ? myName : owner === NONE ? null : owner
    return (visits ?? []).filter((v) => owner === ALL || v.owner === want)
  }, [visits, owner, myName])

  const scheduled = filtered.filter((v) => v.status === "Scheduled")
  const closed = filtered.filter((v) => v.status !== "Scheduled").sort((a, b) => b.visit_date.localeCompare(a.visit_date))
  const needsUpdate = scheduled.filter((v) => v.visit_date < today)
  const dueToday = scheduled.filter((v) => v.visit_date === today)
  const upcoming = scheduled.filter((v) => v.visit_date > today)

  const itemsByDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const v of filtered) {
      const tone =
        v.status === "Completed" ? "success" : v.status === "Cancelled" ? "muted" : v.visit_date < today ? "warning" : "info"
      const label = `${v.visit_time ? v.visit_time + " " : ""}${v.lead?.company_name ?? "Lead"}`
      m.set(v.visit_date, [...(m.get(v.visit_date) ?? []), { id: v.id, label, tone }])
    }
    return m
  }, [filtered, today])

  async function setStatus(v: Visit, status: VisitStatus, message: string) {
    try {
      await updateVisit(v.id, { status })
      toast.success(message)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    }
  }

  async function remove(v: Visit) {
    try {
      await deleteVisit(v.id)
      setVisits((vs) => vs?.filter((x) => x.id !== v.id) ?? vs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setConfirmDelete(null)
    }
  }

  const item = (v: Visit) => (
    <VisitItem
      key={v.id}
      v={v}
      today={today}
      confirming={confirmDelete === v.id}
      onComplete={() => void setStatus(v, "Completed", "Visit marked as completed")}
      onCancel={() => void setStatus(v, "Cancelled", "Visit cancelled")}
      onReopen={() => void setStatus(v, "Scheduled", "Visit rescheduled")}
      onEdit={() => setEditing(v)}
      onAskDelete={() => setConfirmDelete(v.id)}
      onCancelDelete={() => setConfirmDelete(null)}
      onDelete={() => void remove(v)}
    />
  )

  const section = (title: string, list: Visit[], tone?: string) =>
    list.length > 0 && (
      <section key={title} className="space-y-2">
        <h2 className={cn("text-sm font-medium", tone)}>
          {title} <span className="font-normal text-muted-foreground tabular-nums">{list.length}</span>
        </h2>
        <ul className="space-y-2">{list.map(item)}</ul>
      </section>
    )

  const dayRows = selected ? filtered.filter((v) => v.visit_date === selected) : []

  return (
    <>
      <PageHeader
        title="Visits"
        description="Visits planned with leads. The calendar shows which day each visit is."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Schedule visit
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="calendar"><CalendarIcon /> Calendar</TabsTrigger>
            <TabsTrigger value="list"><List /> List</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-40" aria-label="Who is visiting"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            {myName && <SelectItem value={MINE}>Mine</SelectItem>}
            {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            <SelectItem value={NONE}>Unassigned</SelectItem>
          </SelectContent>
        </Select>
        {visits && (
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span><b className="tabular-nums">{dueToday.length}</b> today</span>
            <span className="text-muted-foreground"><b className="tabular-nums">{upcoming.length}</b> upcoming</span>
            {needsUpdate.length > 0 && (
              <span className="text-warning"><b className="tabular-nums">{needsUpdate.length}</b> to update</span>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </div>
      ) : !visits ? (
        <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : view === "calendar" ? (
        <div className="space-y-4">
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={setSelected}
            itemsByDate={itemsByDate}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                {selected ? dateTimeLabel(selected) : "Pick a day"}
                <span className="ml-2 font-normal text-muted-foreground tabular-nums">{dayRows.length}</span>
              </h2>
              {selected && (
                <Button size="xs" variant="outline" onClick={() => setEditing("new")}><Plus /> Add visit on this day</Button>
              )}
            </div>
            {dayRows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No visits on this day.
              </p>
            ) : (
              <ul className="space-y-2">{dayRows.map(item)}</ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="scheduled">
                Scheduled <span className="text-muted-foreground tabular-nums">{scheduled.length}</span>
              </TabsTrigger>
              <TabsTrigger value="closed">
                Completed & cancelled <span className="text-muted-foreground tabular-nums">{closed.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "scheduled" ? (
            scheduled.length === 0 ? (
              <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                No visits scheduled. Use the button above, or "Schedule visit" in a lead's ⋯ menu.
              </p>
            ) : (
              <div className="space-y-5">
                {section("Past date, mark completed or cancelled", needsUpdate, "text-warning")}
                {section("Today", dueToday)}
                {section("Upcoming", upcoming)}
              </div>
            )
          ) : closed.length === 0 ? (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Completed and cancelled visits will show here.
            </p>
          ) : (
            <ul className="space-y-2">{closed.map(item)}</ul>
          )}
        </div>
      )}

      <VisitFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        visit={editing === "new" || editing === null ? undefined : editing}
        defaultOwner={myName}
        defaultDate={view === "calendar" && selected ? selected : undefined}
        onSaved={() => void load()}
      />
    </>
  )
}

interface ItemProps {
  v: Visit
  today: string
  confirming: boolean
  onComplete: () => void
  onCancel: () => void
  onReopen: () => void
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}

function VisitItem({ v, today, confirming, onComplete, onCancel, onReopen, onEdit, onAskDelete, onCancelDelete, onDelete }: ItemProps) {
  const scheduled = v.status === "Scheduled"
  const stale = scheduled && v.visit_date < today
  return (
    <li className={cn("rounded-lg border bg-card p-3", stale && "border-warning/50")}>
      <div className="min-w-0">
        {v.lead ? (
          <a href={leadLink(v.lead.id)} className="block truncate font-medium hover:underline">{v.lead.company_name}</a>
        ) : (
          <span className="block font-medium text-muted-foreground">Lead no longer exists</span>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
          <span className={cn(stale && "font-medium text-warning")}>{dateTimeLabel(v.visit_date, v.visit_time)}</span>
          {v.owner && <span className="text-muted-foreground">{v.owner}</span>}
          {v.lead?.phone && (
            <a href={`tel:${v.lead.phone}`} className="inline-flex items-center gap-1 tabular-nums text-muted-foreground hover:text-foreground">
              <Phone className="size-3.5" /> {v.lead.phone}
            </a>
          )}
          {!scheduled && <span className="text-muted-foreground">{v.status}</span>}
        </div>
        {v.address && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-words">{v.address}</span>
          </p>
        )}
        {v.notes && <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">{v.notes}</p>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {scheduled ? (
          <>
            <Button size="xs" variant="outline" onClick={onComplete}><Check /> Completed</Button>
            <Button size="xs" variant="outline" onClick={onCancel}><X /> Cancel</Button>
          </>
        ) : (
          <Button size="xs" variant="outline" onClick={onReopen}><RotateCcw /> Reschedule</Button>
        )}
        <Button size="xs" variant="ghost" onClick={onEdit}><Pencil /> Edit</Button>
        {confirming ? (
          <span className="ml-auto flex items-center gap-1 text-xs">
            Delete?
            <Button size="xs" variant="destructive" onClick={onDelete}>Yes</Button>
            <Button size="xs" variant="ghost" onClick={onCancelDelete}>No</Button>
          </span>
        ) : (
          <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={onAskDelete}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>
    </li>
  )
}
