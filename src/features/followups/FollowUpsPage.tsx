import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Calendar as CalendarIcon, Check, List, Loader2, Pencil, Phone, Plus, RotateCcw, Trash2, X } from "lucide-react"
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
import { deleteFollowUp, fetchFollowUps, updateFollowUp, type FollowUpPatch, type FollowUpRow } from "./api"
import { FollowUpFormDialog } from "./FollowUpFormDialog"

type View = "list" | "calendar"
type Tab = "pending" | "closed"
const ALL = "__all__"
const MINE = "__me__"
const NONE = "__none__"

export function FollowUpsPage() {
  const myName = useMyName()
  const [rows, setRows] = useState<FollowUpRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("list")
  const [tab, setTab] = useState<Tab>("pending")
  const [owner, setOwner] = useState(ALL)
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(() => localDate())
  const [editing, setEditing] = useState<FollowUpRow | "new" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(
    () =>
      fetchFollowUps().then(
        (r) => (setRows(r), setError(null)),
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load follow-ups"),
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  const today = localDate()
  const filtered = useMemo(() => {
    const want = owner === MINE ? myName : owner === NONE ? null : owner
    return (rows ?? []).filter((f) => owner === ALL || f.owner === want)
  }, [rows, owner, myName])

  const pending = filtered.filter((f) => f.status === "Pending")
  const closed = filtered.filter((f) => f.status !== "Pending").sort((a, b) => b.date.localeCompare(a.date))
  const overdue = pending.filter((f) => f.date < today)
  const dueToday = pending.filter((f) => f.date === today)
  const upcoming = pending.filter((f) => f.date > today)

  const itemsByDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const f of filtered) {
      const tone =
        f.status === "Completed" ? "success" : f.status === "Pending" ? (f.date < today ? "danger" : "info") : "muted"
      const label = `${f.time ? f.time + " " : ""}${f.lead?.company_name ?? "Lead"}`
      m.set(f.date, [...(m.get(f.date) ?? []), { id: f.id, label, tone }])
    }
    return m
  }, [filtered, today])

  async function change(f: FollowUpRow, patch: FollowUpPatch, message: string) {
    try {
      await updateFollowUp(f, patch)
      toast.success(message)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    }
  }

  async function remove(f: FollowUpRow) {
    try {
      await deleteFollowUp(f)
      setRows((rs) => rs?.filter((x) => x.id !== f.id) ?? rs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setConfirmDelete(null)
    }
  }

  const item = (f: FollowUpRow) => (
    <FollowUpItem
      key={f.id}
      f={f}
      today={today}
      confirming={confirmDelete === f.id}
      onDone={() => void change(f, { status: "Completed" }, "Marked as done")}
      onReopen={() => void change(f, { status: "Pending" }, "Follow-up reopened")}
      onCancel={() => void change(f, { status: "Cancelled" }, "Follow-up cancelled")}
      onEdit={() => setEditing(f)}
      onAskDelete={() => setConfirmDelete(f.id)}
      onCancelDelete={() => setConfirmDelete(null)}
      onDelete={() => void remove(f)}
    />
  )

  const section = (title: string, list: FollowUpRow[], tone?: string) =>
    list.length > 0 && (
      <section key={title} className="space-y-2">
        <h2 className={cn("text-sm font-medium", tone)}>
          {title} <span className="font-normal text-muted-foreground tabular-nums">{list.length}</span>
        </h2>
        <ul className="space-y-2">{list.map(item)}</ul>
      </section>
    )

  const dayRows = selected ? filtered.filter((f) => f.date === selected) : []

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Who to call back, and when. Overdue follow-ups are highlighted."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New follow-up
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="list"><List /> List</TabsTrigger>
            <TabsTrigger value="calendar"><CalendarIcon /> Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-40" aria-label="Handled by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            {myName && <SelectItem value={MINE}>Mine</SelectItem>}
            {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            <SelectItem value={NONE}>Unassigned</SelectItem>
          </SelectContent>
        </Select>
        {rows && (
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className={cn(overdue.length > 0 ? "text-destructive" : "text-muted-foreground")}>
              <b className="tabular-nums">{overdue.length}</b> overdue
            </span>
            <span><b className="tabular-nums">{dueToday.length}</b> today</span>
            <span className="text-muted-foreground"><b className="tabular-nums">{upcoming.length}</b> upcoming</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </div>
      ) : !rows ? (
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
                <Button size="xs" variant="outline" onClick={() => setEditing("new")}><Plus /> Add on this day</Button>
              )}
            </div>
            {dayRows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No follow-ups on this day.
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
              <TabsTrigger value="pending">
                Pending <span className="text-muted-foreground tabular-nums">{pending.length}</span>
              </TabsTrigger>
              <TabsTrigger value="closed">
                Done & cancelled <span className="text-muted-foreground tabular-nums">{closed.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "pending" ? (
            pending.length === 0 ? (
              <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Nothing pending. Set a follow-up with the button above, or from a lead's ⋯ menu.
              </p>
            ) : (
              <div className="space-y-5">
                {section("Overdue", overdue, "text-destructive")}
                {section("Today", dueToday)}
                {section("Upcoming", upcoming)}
              </div>
            )
          ) : closed.length === 0 ? (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Completed and cancelled follow-ups will show here.
            </p>
          ) : (
            <ul className="space-y-2">{closed.map(item)}</ul>
          )}
        </div>
      )}

      <FollowUpFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        followUp={editing === "new" || editing === null ? undefined : editing}
        defaultOwner={myName}
        defaultDate={view === "calendar" && selected ? selected : undefined}
        onSaved={() => void load()}
      />
    </>
  )
}

interface ItemProps {
  f: FollowUpRow
  today: string
  confirming: boolean
  onDone: () => void
  onReopen: () => void
  onCancel: () => void
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}

function FollowUpItem({ f, today, confirming, onDone, onReopen, onCancel, onEdit, onAskDelete, onCancelDelete, onDelete }: ItemProps) {
  const pending = f.status === "Pending"
  const overdue = pending && f.date < today
  return (
    <li className={cn("rounded-lg border bg-card p-3", overdue && "border-destructive/50")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          {f.lead ? (
            <a href={leadLink(f.lead.id)} className="block truncate font-medium hover:underline">{f.lead.company_name}</a>
          ) : (
            <span className="block font-medium text-muted-foreground">Lead no longer exists</span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            <span className={cn(overdue && "font-medium text-destructive")}>
              {dateTimeLabel(f.date, f.time)}
              {overdue && " · Overdue"}
            </span>
            {f.owner && <span className="text-muted-foreground">{f.owner}</span>}
            {f.lead?.phone && (
              <a href={`tel:${f.lead.phone}`} className="inline-flex items-center gap-1 tabular-nums text-muted-foreground hover:text-foreground">
                <Phone className="size-3.5" /> {f.lead.phone}
              </a>
            )}
            {!pending && <span className="text-muted-foreground">{f.status}</span>}
          </div>
          {f.notes && <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">{f.notes}</p>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {pending ? (
          <>
            <Button size="xs" variant="outline" onClick={onDone}><Check /> Done</Button>
            <Button size="xs" variant="outline" onClick={onCancel}><X /> Cancel</Button>
          </>
        ) : (
          <Button size="xs" variant="outline" onClick={onReopen}><RotateCcw /> Reopen</Button>
        )}
        <Button size="xs" variant="ghost" onClick={onEdit}><Pencil /> {pending ? "Reschedule" : "Edit"}</Button>
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
