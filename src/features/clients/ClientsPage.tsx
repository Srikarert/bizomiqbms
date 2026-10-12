import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Briefcase, Loader2, MoreHorizontal, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMyName } from "@/lib/team"
import { CLIENT_STATUSES, HANDLERS, type ClientStatus } from "@/lib/types"
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
import { ProjectFormDialog } from "@/features/projects/ProjectFormDialog"
import { deleteClient, fetchClients, projectCount, type ClientRow } from "./api"
import { ClientFormDialog } from "./ClientFormDialog"

const ALL = "__all__"
const MINE = "__me__"

const STATUS_STYLE: Record<ClientStatus, string> = {
  Active: "bg-success/15 text-success",
  Inactive: "bg-secondary text-muted-foreground",
  Archived: "bg-secondary text-muted-foreground",
}

export function ClientsPage() {
  const myName = useMyName()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null)
  const [projectFor, setProjectFor] = useState<ClientRow | null>(null)
  const [deleting, setDeleting] = useState<ClientRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      fetchClients().then(
        (c) => (setClients(c), setError(null)),
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load clients"),
      ),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    return (clients ?? []).filter((c) => {
      if (status !== ALL && c.status !== status) return false
      if (owner !== ALL && c.owner !== (owner === MINE ? myName : owner)) return false
      if (!q) return true
      const hay = [c.company_name, c.contact_name, c.location, c.email, c.notes].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q) || (qDigits.length >= 3 && Boolean(c.phone?.replace(/\D/g, "").includes(qDigits)))
    })
  }, [clients, query, status, owner, myName])

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteClient(deleting.id)
      setClients((cs) => cs?.filter((c) => c.id !== deleting.id) ?? cs)
      toast.success(`${deleting.company_name} deleted`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  const menu = (c: ClientRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.company_name}`}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditing(c)}><Pencil /> Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setProjectFor(c)}><Briefcase /> Add project</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}><Trash2 /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const projects = (c: ClientRow) => {
    const n = projectCount(c)
    return n === 0 ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{n}</span>
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Businesses you work with. Add a client from an existing lead in one click."
        actions={<Button onClick={() => setEditing("new")}><Plus /> Add client</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, phone, location…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
        {clients && <span className="ml-auto text-sm text-muted-foreground tabular-nums">{filtered.length} of {clients.length}</span>}
      </div>

      {error ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </div>
      ) : !clients ? (
        <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {clients.length === 0 ? "No clients yet. Add one, or turn a lead into a client." : "No clients match your filters."}
        </div>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((c) => (
              <li key={c.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <button className="block max-w-full truncate text-left font-medium" onClick={() => setEditing(c)}>
                      {c.company_name}
                    </button>
                    {c.contact_name && <div className="truncate text-xs text-muted-foreground">{c.contact_name}</div>}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm tabular-nums">
                        <Phone className="size-3.5 text-muted-foreground" /> {c.phone}
                      </a>
                    )}
                  </div>
                  {menu(c)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className={cn("rounded-full px-2 py-0.5", STATUS_STYLE[c.status])}>{c.status}</span>
                  {c.owner && <span>{c.owner}</span>}
                  <span>{projectCount(c)} project{projectCount(c) === 1 ? "" : "s"}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Larger screens: table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Handled by</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-64">
                      <button className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => setEditing(c)}>
                        {c.company_name}
                      </button>
                      {c.contact_name && <div className="truncate text-xs text-muted-foreground">{c.contact_name}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{c.location ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_STYLE[c.status])}>{c.status}</span>
                    </TableCell>
                    <TableCell>{c.owner ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{projects(c)}</TableCell>
                    <TableCell>{menu(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ClientFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        client={editing === "new" || editing === null ? undefined : editing}
        defaultOwner={myName}
        onSaved={() => void load()}
      />
      <ProjectFormDialog
        open={projectFor !== null}
        onOpenChange={(o) => !o && setProjectFor(null)}
        clients={(clients ?? []).map((c) => ({ id: c.id, company_name: c.company_name }))}
        defaultClientId={projectFor?.id}
        defaultOwner={projectFor?.owner ?? myName}
        onSaved={() => void load()}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.company_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their projects are kept but will no longer have a client. The original lead (if any) is not touched. This can't be undone.
            </AlertDialogDescription>
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
