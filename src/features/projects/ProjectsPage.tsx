import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMyName } from "@/lib/team"
import { HANDLERS, PROJECT_STATUSES } from "@/lib/types"
import { CHIP } from "@/components/calendar/tones"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/layout/PageHeader"
import { fetchClients } from "@/features/clients/api"
import { dateRange, deleteProject, fetchProjects, isOverdue, projectTone, type ProjectRow } from "./api"
import { ProjectFormDialog, type ClientOption } from "./ProjectFormDialog"

const ALL = "__all__"
const MINE = "__me__"

export function ProjectsPage() {
  const myName = useMyName()
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [editing, setEditing] = useState<ProjectRow | "new" | null>(null)
  const [deleting, setDeleting] = useState<ProjectRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      Promise.all([fetchProjects(), fetchClients()]).then(
        ([p, c]) => {
          setProjects(p)
          setClients(c.map((x) => ({ id: x.id, company_name: x.company_name })))
          setError(null)
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load projects"),
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (projects ?? []).filter((p) => {
      if (status !== ALL && p.status !== status) return false
      if (owner !== ALL && p.owner !== (owner === MINE ? myName : owner)) return false
      return !q || [p.name, p.client?.company_name, p.description].filter(Boolean).join(" ").toLowerCase().includes(q)
    })
  }, [projects, query, status, owner, myName])

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteProject(deleting.id)
      setProjects((ps) => ps?.filter((p) => p.id !== deleting.id) ?? ps)
      toast.success("Project deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  const menu = (p: ProjectRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditing(p)}><Pencil /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}><Trash2 /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const statusChip = (p: ProjectRow) => (
    <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap", CHIP[projectTone(p)])}>
      {isOverdue(p) ? `${p.status} · overdue` : p.status}
    </span>
  )

  const progress = (p: ProjectRow) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-foreground/70" style={{ width: `${p.progress}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{p.progress}%</span>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Projects"
        description="Work for your clients. See them as bars on the Calendar."
        actions={<Button onClick={() => setEditing("new")}><Plus /> New project</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search project or client…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Handled by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {myName && <SelectItem value={MINE}>Handled by me</SelectItem>}
            {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>
        {projects && <span className="ml-auto text-sm text-muted-foreground tabular-nums">{filtered.length} of {projects.length}</span>}
      </div>

      {error ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </div>
      ) : !projects ? (
        <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {projects.length === 0 ? "No projects yet. Create one to see it on the Calendar." : "No projects match your filters."}
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <button className="block max-w-full truncate text-left font-medium" onClick={() => setEditing(p)}>{p.name}</button>
                    <div className="truncate text-xs text-muted-foreground">{p.client?.company_name ?? "No client"}</div>
                  </div>
                  {menu(p)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {statusChip(p)}
                  <span className="text-muted-foreground">{dateRange(p)}</span>
                  {p.owner && <span className="text-muted-foreground">{p.owner}</span>}
                </div>
                <div className="mt-2">{progress(p)}</div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Handled by</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-56">
                      <button className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => setEditing(p)}>{p.name}</button>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{p.client?.company_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{statusChip(p)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.priority}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{dateRange(p)}</TableCell>
                    <TableCell>{progress(p)}</TableCell>
                    <TableCell>{p.owner ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{menu(p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ProjectFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        project={editing === "new" || editing === null ? undefined : editing}
        clients={clients}
        defaultOwner={myName}
        onSaved={() => void load()}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the project and its bar on the Calendar. It can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
