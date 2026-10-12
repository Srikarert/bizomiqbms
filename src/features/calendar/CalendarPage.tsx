import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { addDays, localDate } from "@/lib/dates"
import { useMyName } from "@/lib/team"
import { HANDLERS } from "@/lib/types"
import { DOT, type Tone } from "@/components/calendar/tones"
import { Timeline, type TimelineBar, type TimelineRow } from "@/components/calendar/Timeline"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchClients } from "@/features/clients/api"
import { dateRange, fetchProjects, isOverdue, projectTone, type ProjectRow } from "@/features/projects/api"
import { ProjectFormDialog, type ClientOption } from "@/features/projects/ProjectFormDialog"

type Group = "owner" | "client"
const SPANS = [14, 30, 60] as const
const NO_OWNER = "__none__"
const NO_CLIENT = "__noclient__"

// Window start: a few days before today so some recent history is visible.
const startFor = () => addDays(localDate(), -3)

export function CalendarPage() {
  const myName = useMyName()
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<Group>("owner")
  const [span, setSpan] = useState<(typeof SPANS)[number]>(30)
  const [start, setStart] = useState(startFor)
  const [editing, setEditing] = useState<ProjectRow | "new" | null>(null)

  const load = useCallback(
    () =>
      Promise.all([fetchProjects(), fetchClients()]).then(
        ([p, c]) => {
          setProjects(p)
          setClients(c.map((x) => ({ id: x.id, company_name: x.company_name })))
          setError(null)
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load the calendar"),
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  // A project needs at least one date to be drawn; with only one, it is a 1-day bar.
  const scheduled = useMemo(() => (projects ?? []).filter((p) => p.start_date || p.deadline), [projects])
  const unscheduled = useMemo(() => (projects ?? []).filter((p) => !p.start_date && !p.deadline), [projects])

  const { rows, bars } = useMemo(() => {
    const rowKey = (p: ProjectRow) => (group === "owner" ? (p.owner ?? NO_OWNER) : (p.client_id ?? NO_CLIENT))
    const bars: TimelineBar[] = scheduled.map((p) => {
      const s = p.start_date ?? p.deadline!
      const e = p.deadline ?? p.start_date!
      const client = p.client?.company_name ?? "No client"
      const tone: Tone = projectTone(p)
      return {
        id: p.id,
        rowId: rowKey(p),
        // Rows by person: the client is the bar. Rows by client: the project is.
        label: group === "owner" ? `${client} · ${p.name}` : p.name,
        title: `${client}: ${p.name}\n${dateRange(p)} · ${p.status}${isOverdue(p) ? " (overdue)" : ""} · ${p.progress}%`,
        start: s <= e ? s : e,
        end: s <= e ? e : s,
        tone,
        progress: p.progress,
      }
    })

    let rows: TimelineRow[]
    if (group === "owner") {
      rows = HANDLERS.map((h) => ({ id: h, label: h }))
      if (bars.some((b) => b.rowId === NO_OWNER)) rows.push({ id: NO_OWNER, label: "Unassigned" })
    } else {
      const used = new Set(bars.map((b) => b.rowId))
      rows = clients
        .filter((c) => used.has(c.id))
        .map((c) => ({ id: c.id, label: c.company_name }))
      if (used.has(NO_CLIENT)) rows.push({ id: NO_CLIENT, label: "No client" })
    }
    return { rows, bars }
  }, [scheduled, group, clients])

  const visibleCount = useMemo(
    () => bars.filter((b) => b.end >= start && b.start <= addDays(start, span - 1)).length,
    [bars, start, span],
  )

  const step = Math.round(span / 2)
  const dayWidth = span === 14 ? 52 : span === 30 ? 40 : 30

  const legend: { tone: Tone; label: string }[] = [
    { tone: "muted", label: "Not started / on hold" },
    { tone: "warning", label: "Planning" },
    { tone: "info", label: "In progress / review" },
    { tone: "success", label: "Completed" },
    { tone: "danger", label: "Overdue" },
  ]

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Every client's project as a bar from its start date to its deadline."
        actions={<Button onClick={() => setEditing("new")}><Plus /> New project</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={group} onValueChange={(v) => setGroup(v as Group)}>
          <TabsList>
            <TabsTrigger value="owner">By team member</TabsTrigger>
            <TabsTrigger value="client">By client</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={String(span)} onValueChange={(v) => setSpan(Number(v) as (typeof SPANS)[number])}>
          <TabsList>
            {SPANS.map((s) => <TabsTrigger key={s} value={String(s)}>{s} days</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setStart(startFor())}>Today</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Earlier" onClick={() => setStart((s) => addDays(s, -step))}><ChevronLeft /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Later" onClick={() => setStart((s) => addDays(s, step))}><ChevronRight /></Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </div>
      ) : !projects ? (
        <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {scheduled.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No projects with dates yet. Add a project with a start date and deadline to see it here as a bar.
            </div>
          ) : (
            <Timeline start={start} days={span} dayWidth={dayWidth} rows={rows} bars={bars} onBarClick={(id) => setEditing(projects.find((p) => p.id === id) ?? null)} />
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{visibleCount} in view</span>
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className={cn("size-3 rounded-sm", DOT[l.tone])} aria-hidden /> {l.label}
              </span>
            ))}
            <span>Click a bar to edit. Darker fill shows progress.</span>
          </div>

          {unscheduled.length > 0 && (
            <section className="rounded-lg border p-3">
              <h2 className="text-sm font-medium">
                Without dates <span className="font-normal text-muted-foreground tabular-nums">{unscheduled.length}</span>
              </h2>
              <p className="mb-2 text-xs text-muted-foreground">Add a start date or deadline to put these on the calendar.</p>
              <div className="flex flex-wrap gap-1.5">
                {unscheduled.map((p) => (
                  <Button key={p.id} size="xs" variant="outline" onClick={() => setEditing(p)}>
                    {p.client?.company_name ? `${p.client.company_name} · ` : ""}{p.name}
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ProjectFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        project={editing === "new" || editing === null ? undefined : editing}
        clients={clients}
        defaultOwner={myName}
        defaultStart={localDate()}
        onSaved={() => void load()}
      />
    </>
  )
}
