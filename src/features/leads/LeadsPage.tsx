import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowDownWideNarrow, ArrowLeft, Download, FolderOpen, Loader2, MoreHorizontal, Pencil, Phone, Plus, Search, Settings2, Sprout, Trash2, Upload, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMyName } from "@/lib/team"
import { GENUINENESS_LEVELS, HANDLERS, LEAD_STATUSES, type Handler, type Lead, type LeadCategory, type LeadStatus } from "@/lib/types"
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
import { exportLeadsToExcel } from "./export"
import { ImportDialog } from "./import/ImportDialog"
import { LeadFormDialog } from "./LeadFormDialog"
import {
  COMMON_REMARKS, GENUINENESS_STYLES, GREEN_GROUPS, GREEN_STATUSES, NORMAL_STATUSES, REMARKS_LIST_ID, STATUS_STYLES, deriveLeadStatus,
  greenGroup, isGreen, type GreenGroup,
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

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [categories, setCategories] = useState<LeadCategory[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("all")
  // Sub-filter inside the Green tab: Normal / Not sure / High priority.
  const [greenFilter, setGreenFilter] = useState<GreenGroup | typeof ALL>(ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  // Category to ask "delete?" about as soon as the manager opens (from the filter row).
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL)
  const [genuineFilter, setGenuineFilter] = useState<string>(ALL)
  // Highest lead score first (leads without a score last).
  const [bestFirst, setBestFirst] = useState(false)
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
    const greenLeads = inCategory.filter((l) => isGreen(l.status))
    const groups = new Map<GreenGroup, number>()
    for (const l of greenLeads) groups.set(greenGroup(l.status), (groups.get(greenGroup(l.status)) ?? 0) + 1)
    return { all: inCategory.length, green: greenLeads.length, normal: inCategory.length - greenLeads.length, groups }
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
    const rows = (leads ?? []).filter((l) => {
      if (tab !== "all" && isGreen(l.status) !== (tab === "green")) return false
      if (tab === "green" && greenFilter !== ALL && greenGroup(l.status) !== greenFilter) return false
      if (!matchesCategory(l)) return false
      if (statusFilter !== ALL && l.status !== statusFilter) return false
      if (ownerFilter !== ALL) {
        const want = ownerFilter === MINE ? myName : ownerFilter === UNASSIGNED ? null : ownerFilter
        if (l.owner !== want) return false
      }
      if (genuineFilter !== ALL && (l.genuineness ?? UNASSIGNED) !== genuineFilter) return false
      if (!q) return true
      const hay = [l.company_name, l.contact_name, l.location, l.call_status, l.email, l.notes, l.owner]
        .filter(Boolean).join(" ").toLowerCase()
      if (hay.includes(q)) return true
      return qDigits.length >= 3 && [l.phone, l.alternate_phone].some((p) => p?.replace(/\D/g, "").includes(qDigits))
    })
    if (bestFirst) rows.sort((a, b) => (b.lead_score ?? -1) - (a.lead_score ?? -1))
    // Green tab: most recently turned green first.
    else if (tab === "green") rows.sort((a, b) => (b.green_since ?? "").localeCompare(a.green_since ?? ""))
    return rows
  }, [leads, tab, greenFilter, statusFilter, ownerFilter, genuineFilter, bestFirst, myName, query, matchesCategory])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id))

  function switchTab(t: Tab) {
    setTab(t)
    setGreenFilter(ALL)
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

  async function doExport(rows: Lead[]) {
    if (!rows.length) return
    setBusy(true)
    try {
      await exportLeadsToExcel(rows, categories)
      toast.success(`Exported ${rows.length} lead${rows.length === 1 ? "" : "s"}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export")
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
      toast.success(`${ids.length === 1 ? "Lead" : `${ids.length} leads`} ${moveMessage(status)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    } finally {
      setBusy(false)
    }
  }

  // A remark can promote a normal lead ("visit" -> green), like import does, but
  // never demotes a green one: "busy" or "call later" on an interested lead is
  // just a note. Moving back to normal is explicit (Move to normal / Stage).
  async function saveCallStatus(lead: Lead, callStatus: string | null) {
    const status = !callStatus || isGreen(lead.status) ? lead.status : deriveLeadStatus(callStatus)
    try {
      replaceLeads([await updateLead(lead.id, { call_status: callStatus, status })])
      if (isGreen(status) !== isGreen(lead.status)) toast.success(`${lead.company_name} ${moveMessage(status)}`)
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
      if (isGreen(status) !== isGreen(lead.status) || greenGroup(status) !== greenGroup(lead.status)) {
        toast.success(`${lead.company_name} ${moveMessage(status)}`)
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

  const stageSelect = (l: Lead) => (
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
  )

  const rowMenu = (l: Lead) => (
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
          <DropdownMenuSubTrigger><Sprout className="text-success" /> Stage</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {GREEN_STATUSES.map((s) => (
              <DropdownMenuItem key={s} disabled={l.status === s} onSelect={() => setStatus([l.id], s)}>{s}</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
  )

  const selectAllVisible = (checked: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      visible.forEach((l) => (checked ? n.add(l.id) : n.delete(l.id)))
      return n
    })

  return (
    <>
      <PageHeader
        title="Leads"
        description="Normal leads are unfiltered. Green leads have shown interest, like agreeing to a visit."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!leads}>
              <Upload /> Import<span className="hidden sm:inline"> Excel</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => doExport(filtered)}
              disabled={!leads || filtered.length === 0 || busy}
              title="Exports the leads currently shown (all pages, with filters applied)"
            >
              <Download /> Export<span className="hidden sm:inline"> Excel</span>
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add lead
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => switchTab(v as Tab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">
              All<span className="hidden sm:inline"> leads</span> <span className="text-muted-foreground tabular-nums">{counts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="normal">
              Normal<span className="hidden sm:inline"> leads</span> <span className="text-muted-foreground tabular-nums">{counts.normal}</span>
            </TabsTrigger>
            <TabsTrigger value="green">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              Green<span className="hidden sm:inline"> leads</span> <span className="text-muted-foreground tabular-nums">{counts.green}</span>
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
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Handled by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {myName && <SelectItem value={MINE}>Handled by me</SelectItem>}
            {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={genuineFilter}
          onValueChange={(v) => {
            setGenuineFilter(v)
            setSelected(new Set())
            setPage(0)
          }}
        >
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Genuineness"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any genuineness</SelectItem>
            {GENUINENESS_LEVELS.map((g) => <SelectItem key={g} value={g}>{g} genuineness</SelectItem>)}
            <SelectItem value={UNASSIGNED}>Not rated</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={bestFirst ? "secondary" : "outline"}
          aria-pressed={bestFirst}
          onClick={() => {
            setBestFirst((b) => !b)
            setPage(0)
          }}
        >
          <ArrowDownWideNarrow /> Best score first
        </Button>
      </div>

      {tab === "green" && (
        <div className="-mx-4 mb-3 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Filter green leads">
          {[{ key: ALL, label: "All green", dot: "bg-success" }, ...GREEN_GROUPS].map((g) => {
            const count = g.key === ALL ? counts.green : (counts.groups.get(g.key as GreenGroup) ?? 0)
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={greenFilter === g.key}
                onClick={() => {
                  setGreenFilter(g.key as GreenGroup | typeof ALL)
                  setStatusFilter(ALL)
                  setSelected(new Set())
                  setPage(0)
                }}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  greenFilter === g.key && "border-foreground text-foreground",
                )}
              >
                <span className={cn("size-2 rounded-full", g.dot)} aria-hidden />
                {g.label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="-mx-4 mb-3 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Filter by category">
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
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground",
              categoryFilter === c.id && "border-foreground bg-foreground text-background hover:text-background",
            )}
          >
            {c.name}
            <span className="tabular-nums opacity-70">{categoryCounts.get(c.id) ?? 0}</span>
          </button>
        ))}
        <Button variant="ghost" size="xs" className="shrink-0" onClick={() => setCategoriesOpen(true)}>
          <Plus /> New category
        </Button>
        {activeCategoryId && categoryName.has(activeCategoryId) && (
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 text-destructive hover:text-destructive"
            onClick={() => {
              setDeleteCategoryId(activeCategoryId)
              setCategoriesOpen(true)
            }}
          >
            <Trash2 /> Delete “{categoryName.get(activeCategoryId)}”
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          {selectedLeads.some((l) => !isGreen(l.status)) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus(selectedLeads.filter((l) => !isGreen(l.status)).map((l) => l.id), GREEN_STAGE)}>
              <Sprout className="text-success" /> Mark green
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}><Sprout className="text-success" /> Set green stage</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Move {selected.size} to…</DropdownMenuLabel>
              {GREEN_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => setStatus(selectedIds, s)}>{s}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
          <Button size="sm" variant="outline" disabled={busy} onClick={() => doExport(filtered.filter((l) => selected.has(l.id)))}>
            <Download /> Export
          </Button>
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
          {query || statusFilter !== ALL || ownerFilter !== ALL || genuineFilter !== ALL
            ? "No leads match your filters."
            : categoryFilter !== ALL
              ? "No leads in this category yet. Add one, import a sheet, or move leads here with Set category."
              : tab === "green"
              ? "No green leads yet. Mark interested leads green from the Normal tab."
              : "No leads yet. Add one or import an Excel sheet."}
        </div>
      ) : (
        <>
          {/* Phones: compact cards with name, number, stage and status. */}
          <div className="md:hidden">
            <label className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox
                aria-label="Select all on this page"
                checked={allVisibleSelected}
                onCheckedChange={(c) => selectAllVisible(Boolean(c))}
              />
              Select all on this page
            </label>
            <ul className="space-y-2">
              {visible.map((l, i) => (
                <li
                  key={l.id}
                  data-state={selected.has(l.id) ? "selected" : undefined}
                  className="rounded-lg border bg-card p-3 data-[state=selected]:border-foreground/40"
                >
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      className="mt-1"
                      aria-label={`Select ${l.company_name}`}
                      checked={selected.has(l.id)}
                      onCheckedChange={() => toggle(l.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <button className="block max-w-full truncate text-left font-medium" onClick={() => setEditing(l)}>
                        <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">{currentPage * PAGE_SIZE + i + 1}.</span>
                        {l.company_name}
                      </button>
                      {l.contact_name && <div className="truncate text-xs text-muted-foreground">{l.contact_name}</div>}
                      {(l.lead_score != null || l.genuineness) && (
                        <div className="text-xs text-muted-foreground">
                          {l.lead_score != null && <>Score <span className="tabular-nums text-foreground">{l.lead_score}</span></>}
                          {l.lead_score != null && l.genuineness && " · "}
                          {l.genuineness && <span className={GENUINENESS_STYLES[l.genuineness]}>{l.genuineness} genuineness</span>}
                        </div>
                      )}
                      {tab === "green" && l.green_since && (
                        <div className="text-xs text-muted-foreground" title={formatDateTime(l.green_since)}>
                          Green since {formatDate(l.green_since.slice(0, 10))}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm tabular-nums">
                        {l.phone ? (
                          <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5">
                            <Phone className="size-3.5 text-muted-foreground" /> {l.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">No number</span>
                        )}
                        {l.alternate_phone && (
                          <a href={`tel:${l.alternate_phone}`} className="text-muted-foreground">{l.alternate_phone}</a>
                        )}
                      </div>
                    </div>
                    {rowMenu(l)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-[1.625rem]">
                    {stageSelect(l)}
                    <CallStatusCell className="min-w-0 flex-1" value={l.call_status} onSave={(v) => saveCallStatus(l, v)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allVisibleSelected}
                      onCheckedChange={(c) => selectAllVisible(Boolean(c))}
                    />
                  </TableHead>
                  <TableHead className="w-12 text-right">S.No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  {categoryFilter === ALL && <TableHead>Category</TableHead>}
                  <TableHead>Location</TableHead>
                  <TableHead>Call status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Genuine</TableHead>
                  {tab === "green" && <TableHead>Green since</TableHead>}
                  <TableHead>Handled by</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((l, i) => (
                  <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox aria-label={`Select ${l.company_name}`} checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                    </TableCell>
                    {/* Position in the current filtered list, continuing across pages. */}
                    <TableCell className="text-right text-muted-foreground tabular-nums">{currentPage * PAGE_SIZE + i + 1}</TableCell>
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
                    <TableCell>{stageSelect(l)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.lead_score ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={l.genuineness ? GENUINENESS_STYLES[l.genuineness] : "text-muted-foreground"}>
                      {l.genuineness ?? "—"}
                    </TableCell>
                    {tab === "green" && (
                      <TableCell className="whitespace-nowrap text-muted-foreground" title={formatDateTime(l.green_since)}>
                        {l.green_since ? formatDate(l.green_since.slice(0, 10)) : "—"}
                      </TableCell>
                    )}
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
                    <TableCell>{rowMenu(l)}</TableCell>
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
        onImported={load}
      />

      <CategoriesDialog
        key={categoriesOpen ? `open-${deleteCategoryId ?? ""}` : "closed"}
        open={categoriesOpen}
        initialConfirmDeleteId={deleteCategoryId}
        onOpenChange={(o) => {
          setCategoriesOpen(o)
          if (!o) setDeleteCategoryId(null)
        }}
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

// "moved to green leads (High priority)", "moved to normal leads", ...
function moveMessage(status: LeadStatus) {
  if (!isGreen(status)) return "moved to normal leads"
  const group = GREEN_GROUPS.find((g) => g.key === greenGroup(status))
  return group && group.key !== "normal" ? `moved to green leads (${group.label})` : "moved to green leads"
}

function formatDateTime(ts: string | null) {
  if (!ts) return ""
  return `Green since ${new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}
