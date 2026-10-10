import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, FolderOpen, Loader2, MoreHorizontal, Pencil, Plus, Search, Settings2, Sprout, Trash2, Upload, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMyName } from "@/lib/team"
import { HANDLERS, LEAD_STATUSES, type Handler, type Lead, type LeadCategory, type LeadStatus } from "@/lib/types"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { deleteLeads, fetchAllLeads, fetchCategories, updateLead, updateLeads } from "./api"
import { CallStatusCell } from "./CallStatusCell"
import { CategoriesDialog } from "./CategoriesDialog"
import { ImportDialog } from "./import/ImportDialog"
import { LeadFormDialog } from "./LeadFormDialog"
import {
  COMMON_REMARKS, GREEN_STATUSES, NORMAL_STATUSES, REMARKS_LIST_ID, STATUS_STYLES, deriveLeadStatus, isGreen,
} from "./status"

type Tab = "all" | "normal" | "green"
const PAGE_SIZE = 50
const ALL = "__all__"
const UNCATEGORIZED = "__none__"
const MINE = "__me__"
const UNASSIGNED = "__none__"

// Marking a lead green moves it to the first interested stage; moving it back
// to normal means it was contacted but isn't interested (yet).
const GREEN_STAGE: LeadStatus = "Interested"
const NORMAL_STAGE: LeadStatus = "Contacted"
// Stages set deliberately later in the deal; a new call remark never overrides them.
const ADVANCED_STAGES: readonly LeadStatus[] = ["Qualified", "Proposal Sent", "Negotiation", "Won"]

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [categories, setCategories] = useState<LeadCategory[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL)
  const myName = useMyName()
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Lead | "new" | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      Promise.all([fetchAllLeads(), fetchCategories()]).then(
        ([data, cats]) => {
          setLeads(data)
          setCategories(cats)
          setLoadError(null)
        },
        (e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not load leads"),
      ),
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const matchesCategory = useCallback(
    (l: Lead) =>
      categoryFilter === ALL ||
      (categoryFilter === UNCATEGORIZED ? !l.category_id || !categoryName.has(l.category_id) : l.category_id === categoryFilter),
    [categoryFilter, categoryName],
  )

  // Tab counts follow the selected category; category counts follow the tab.
  const counts = useMemo(() => {
    const inCategory = (leads ?? []).filter(matchesCategory)
    const green = inCategory.filter((l) => isGreen(l.status)).length
    return { all: inCategory.length, green, normal: inCategory.length - green }
  }, [leads, matchesCategory])

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads ?? []) {
      if (tab !== "all" && isGreen(l.status) !== (tab === "green")) continue
      const key = l.category_id && categoryName.has(l.category_id) ? l.category_id : UNCATEGORIZED
      m.set(key, (m.get(key) ?? 0) + 1)
      m.set(ALL, (m.get(ALL) ?? 0) + 1)
    }
    return m
  }, [leads, tab, categoryName])

  // Leads per category regardless of tab, for the manage dialog.
  const totalPerCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads ?? []) if (l.category_id) m.set(l.category_id, (m.get(l.category_id) ?? 0) + 1)
    return m
  }, [leads])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    return (leads ?? []).filter((l) => {
      if (tab !== "all" && isGreen(l.status) !== (tab === "green")) return false
      if (!matchesCategory(l)) return false
      if (statusFilter !== ALL && l.status !== statusFilter) return false
      if (ownerFilter !== ALL) {
        const want = ownerFilter === MINE ? myName : ownerFilter === UNASSIGNED ? null : ownerFilter
        if (l.owner !== want) return false
      }
      if (!q) return true
      const hay = [l.company_name, l.contact_name, l.location, l.call_status, l.email, l.notes, l.owner]
        .filter(Boolean).join(" ").toLowerCase()
      if (hay.includes(q)) return true
      return qDigits.length >= 3 && [l.phone, l.alternate_phone].some((p) => p?.replace(/\D/g, "").includes(qDigits))
    })
  }, [leads, tab, statusFilter, ownerFilter, myName, query, matchesCategory])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id))

  function switchTab(t: Tab) {
    setTab(t)
    setStatusFilter(ALL)
    setSelected(new Set())
    setPage(0)
  }

  function switchCategory(c: string) {
    setCategoryFilter(c)
    setSelected(new Set())
    setPage(0)
  }

  async function setCategory(ids: string[], categoryId: string | null) {
    setBusy(true)
    try {
      replaceLeads(ids.length === 1 ? [await updateLead(ids[0], { category_id: categoryId })] : await updateLeads(ids, { category_id: categoryId }))
      setSelected(new Set())
      const name = categoryId ? categoryName.get(categoryId) : "Uncategorized"
      toast.success(`${ids.length === 1 ? "Lead" : `${ids.length} leads`} moved to ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    } finally {
      setBusy(false)
    }
  }

  async function setOwner(ids: string[], owner: Handler | null) {
    setBusy(true)
    try {
      replaceLeads(ids.length === 1 ? [await updateLead(ids[0], { owner })] : await updateLeads(ids, { owner }))
      setSelected(new Set())
      const n = ids.length === 1 ? "Lead" : `${ids.length} leads`
      toast.success(owner ? `${n} assigned to ${owner}` : `${n} unassigned`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    } finally {
      setBusy(false)
    }
  }

  function replaceLeads(updated: Lead[]) {
    const byId = new Map(updated.map((l) => [l.id, l]))
    setLeads((ls) => ls?.map((l) => byId.get(l.id) ?? l) ?? ls)
  }

  async function setStatus(ids: string[], status: LeadStatus) {
    setBusy(true)
    try {
      replaceLeads(ids.length === 1 ? [await updateLead(ids[0], { status })] : await updateLeads(ids, { status }))
      setSelected(new Set())
      const n = ids.length === 1 ? "Lead" : `${ids.length} leads`
      toast.success(isGreen(status) ? `${n} moved to green leads` : `${n} moved to normal leads`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    } finally {
      setBusy(false)
    }
  }

  // Saving a remark also moves the stage, like import does ("visit" -> green).
  async function saveCallStatus(lead: Lead, callStatus: string | null) {
    const status =
      !callStatus || ADVANCED_STAGES.includes(lead.status) ? lead.status : deriveLeadStatus(callStatus)
    try {
      replaceLeads([await updateLead(lead.id, { call_status: callStatus, status })])
      if (isGreen(status) !== isGreen(lead.status)) {
        toast.success(isGreen(status) ? `${lead.company_name} moved to green leads` : `${lead.company_name} moved to normal leads`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
      throw e
    }
  }

  // Suggestions: common outcomes plus the team's most used remarks.
  const remarkSuggestions = useMemo(() => {
    const freq = new Map<string, number>()
    for (const l of leads ?? []) {
      const r = l.call_status?.trim()
      if (r) freq.set(r, (freq.get(r) ?? 0) + 1)
    }
    const used = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([r]) => r)
    const seen = new Set(used.map((r) => r.toLowerCase()))
    return [...used, ...COMMON_REMARKS.filter((r) => !seen.has(r))]
  }, [leads])

  async function changeStage(lead: Lead, status: LeadStatus) {
    try {
      replaceLeads([await updateLead(lead.id, { status })])
      if (isGreen(status) !== isGreen(lead.status)) {
        toast.success(isGreen(status) ? "Moved to green leads" : "Moved to normal leads")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    }
  }

  async function doDelete(ids: string[]) {
    setBusy(true)
    try {
      await deleteLeads(ids)
      setLeads((ls) => ls?.filter((l) => !ids.includes(l.id)) ?? ls)
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))))
      toast.success(ids.length === 1 ? "Lead deleted" : `${ids.length} leads deleted`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setBusy(false)
      setConfirmDelete(null)
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const stageOptions = tab === "green" ? GREEN_STATUSES : tab === "normal" ? NORMAL_STATUSES : LEAD_STATUSES
  const selectedLeads = (leads ?? []).filter((l) => selected.has(l.id))
  // New leads and imports default to the category being viewed.
  const activeCategoryId = categoryFilter !== ALL && categoryFilter !== UNCATEGORIZED ? categoryFilter : null

  const categoryMenu = (ids: string[], current?: string | null) => (
    <>
      {categories.map((c) => (
        <DropdownMenuItem key={c.id} disabled={current === c.id} onSelect={() => setCategory(ids, c.id)}>{c.name}</DropdownMenuItem>
      ))}
      <DropdownMenuItem disabled={current === null} onSelect={() => setCategory(ids, null)}>Uncategorized</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setCategoriesOpen(true)}><Settings2 /> Manage categories…</DropdownMenuItem>
    </>
  )
  const ownerMenu = (ids: string[], current?: Handler | null) => (
    <>
      {HANDLERS.map((h) => (
        <DropdownMenuItem key={h} disabled={current === h} onSelect={() => setOwner(ids, h)}>{h}</DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={current === null} onSelect={() => setOwner(ids, null)}>Unassigned</DropdownMenuItem>
    </>
  )
  const selectedIds = [...selected]

  return (
    <>
      <PageHeader
        title="Leads"
        description="Normal leads are unfiltered. Green leads have shown interest, like agreeing to a visit."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!leads}>
              <Upload /> Import Excel
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add lead
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => switchTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="all">
              All leads <span className="text-muted-foreground tabular-nums">{counts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="normal">
              Normal leads <span className="text-muted-foreground tabular-nums">{counts.normal}</span>
            </TabsTrigger>
            <TabsTrigger value="green">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              Green leads <span className="text-muted-foreground tabular-nums">{counts.green}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, location…"
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {stageOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={ownerFilter}
          onValueChange={(v) => {
            setOwnerFilter(v)
            setSelected(new Set())
            setPage(0)
          }}
        >
          <SelectTrigger className="w-40" aria-label="Handled by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {myName && <SelectItem value={MINE}>Handled by me</SelectItem>}
            {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
        {[
          { id: ALL, name: "All categories" },
          ...categories,
          ...((categoryCounts.get(UNCATEGORIZED) ?? 0) > 0 || categoryFilter === UNCATEGORIZED
            ? [{ id: UNCATEGORIZED, name: "Uncategorized" }]
            : []),
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={categoryFilter === c.id}
            onClick={() => switchCategory(c.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground",
              categoryFilter === c.id && "border-foreground bg-foreground text-background hover:text-background",
            )}
          >
            {c.name}
            <span className="tabular-nums opacity-70">{categoryCounts.get(c.id) ?? 0}</span>
          </button>
        ))}
        <Button variant="ghost" size="xs" onClick={() => setCategoriesOpen(true)}>
          <Plus /> New category
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          {selectedLeads.some((l) => !isGreen(l.status)) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus(selectedLeads.filter((l) => !isGreen(l.status)).map((l) => l.id), GREEN_STAGE)}>
              <Sprout className="text-success" /> Mark green
            </Button>
          )}
          {selectedLeads.some((l) => isGreen(l.status)) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus(selectedLeads.filter((l) => isGreen(l.status)).map((l) => l.id), NORMAL_STAGE)}>
              <ArrowLeft /> Move to normal
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}><FolderOpen /> Set category</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Move {selected.size} to…</DropdownMenuLabel>
              {categoryMenu(selectedIds)}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}><UserRound /> Assign to</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Assign {selected.size} to…</DropdownMenuLabel>
              {ownerMenu(selectedIds)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(selectedIds)}>
            <Trash2 /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border p-8 text-center text-sm">
          <p className="text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
        </div>
      ) : !leads ? (
        <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {query || statusFilter !== ALL || ownerFilter !== ALL
            ? "No leads match your filters."
            : categoryFilter !== ALL
              ? "No leads in this category yet. Add one, import a sheet, or move leads here with Set category."
              : tab === "green"
              ? "No green leads yet. Mark interested leads green from the Normal tab."
              : "No leads yet. Add one or import an Excel sheet."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allVisibleSelected}
                      onCheckedChange={(c) =>
                        setSelected((s) => {
                          const n = new Set(s)
                          visible.forEach((l) => (c ? n.add(l.id) : n.delete(l.id)))
                          return n
                        })
                      }
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  {categoryFilter === ALL && <TableHead>Category</TableHead>}
                  <TableHead>Location</TableHead>
                  <TableHead>Call status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Handled by</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((l) => (
                  <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox aria-label={`Select ${l.company_name}`} checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <button className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => setEditing(l)}>
                        {l.company_name}
                      </button>
                      {l.contact_name && <div className="truncate text-xs text-muted-foreground">{l.contact_name}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {l.phone ? <a href={`tel:${l.phone}`} className="hover:underline">{l.phone}</a> : <span className="text-muted-foreground">—</span>}
                      {l.alternate_phone && (
                        <div className="text-xs text-muted-foreground">
                          <a href={`tel:${l.alternate_phone}`} className="hover:underline">{l.alternate_phone}</a>
                        </div>
                      )}
                    </TableCell>
                    {categoryFilter === ALL && (
                      <TableCell className="whitespace-nowrap">
                        {l.category_id && categoryName.has(l.category_id)
                          ? categoryName.get(l.category_id)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="max-w-40 truncate">{l.location ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="py-1">
                      <CallStatusCell value={l.call_status} onSave={(v) => saveCallStatus(l, v)} />
                    </TableCell>
                    <TableCell>
                      <Select value={l.status} onValueChange={(v) => changeStage(l, v as LeadStatus)}>
                        <SelectTrigger
                          size="sm"
                          aria-label="Stage"
                          className={cn("h-6 w-auto gap-1 rounded-full border-transparent px-2 text-xs", STATUS_STYLES[l.status])}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {isGreen(s) && <span className="size-1.5 rounded-full bg-success" aria-hidden />}
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={l.owner ?? UNASSIGNED} onValueChange={(v) => setOwner([l.id], v === UNASSIGNED ? null : (v as Handler))}>
                        <SelectTrigger
                          size="sm"
                          aria-label="Handled by"
                          className={cn("h-6 w-auto gap-1 border-transparent px-2 text-xs", !l.owner && "text-muted-foreground")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(l.follow_up_date)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Lead actions"><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(l)}><Pencil /> Edit</DropdownMenuItem>
                          {isGreen(l.status) ? (
                            <DropdownMenuItem onSelect={() => setStatus([l.id], NORMAL_STAGE)}><ArrowLeft /> Move to normal</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setStatus([l.id], GREEN_STAGE)}><Sprout className="text-success" /> Mark green</DropdownMenuItem>
                          )}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger><FolderOpen /> Category</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>{categoryMenu([l.id], l.category_id)}</DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger><UserRound /> Handled by</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>{ownerMenu([l.id], l.owner)}</DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete([l.id])}><Trash2 /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            {pageCount > 1 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</Button>
              </div>
            )}
          </div>
        </>
      )}

      <datalist id={REMARKS_LIST_ID}>
        {remarkSuggestions.map((r) => <option key={r} value={r} />)}
      </datalist>

      <LeadFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        lead={editing === "new" || editing === null ? undefined : editing}
        categories={categories}
        defaultCategoryId={activeCategoryId}
        defaultOwner={myName}
        onSaved={(saved) => {
          setLeads((ls) => (ls?.some((l) => l.id === saved.id) ? ls.map((l) => (l.id === saved.id ? saved : l)) : [saved, ...(ls ?? [])]))
          setEditing(null)
        }}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existing={leads ?? []}
        categories={categories}
        defaultCategoryId={activeCategoryId}
        onCategoriesCreated={(created) => setCategories((cs) => [...cs, ...created].sort((a, b) => a.name.localeCompare(b.name)))}
        onImported={load}
      />

      <CategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
        counts={totalPerCategory}
        onChanged={(cats, deletedId) => {
          setCategories(cats)
          if (deletedId) {
            // Mirror ON DELETE SET NULL locally.
            setLeads((ls) => ls?.map((l) => (l.category_id === deletedId ? { ...l, category_id: null } : l)) ?? ls)
            if (categoryFilter === deletedId) switchCategory(ALL)
          }
        }}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length === 1 ? "this lead" : `${confirmDelete?.length} leads`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This also removes their follow-ups and tags. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault() // Keep open until the delete finishes.
                if (confirmDelete) doDelete(confirmDelete)
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

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}
