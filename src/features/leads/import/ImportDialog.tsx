import { useMemo, useState } from "react"
import { toast } from "sonner"
import { FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { HANDLERS, type Handler, type Lead, type LeadCategory } from "@/lib/types"
import { useMyName } from "@/lib/team"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createCategory, insertLeads, logActivity } from "../api"
import { isGreen } from "../status"
import {
  IMPORT_FIELDS, autoMap, mappingToTemplate, prepareRows, readWorkbook,
  type ImportField, type Mapping, type PreparedRow, type Sheet,
} from "./parse"

const TEMPLATE_NAME = "Last used"
const IGNORE = "__ignore__"
const NO_CATEGORY = "__none__"
const UNASSIGNED = "__none__"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: Lead[]
  categories: LeadCategory[]
  defaultCategoryId: string | null
  onCategoriesCreated: (created: LeadCategory[]) => void
  onImported: () => void
}

export function ImportDialog({
  open, onOpenChange, existing, categories, defaultCategoryId, onCategoriesCreated, onImported,
}: Props) {
  const [fileName, setFileName] = useState("")
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [mapping, setMapping] = useState<Mapping>([])
  const [saved, setSaved] = useState<Record<string, string | null>>()
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  // undefined = follow the category currently selected on the leads page.
  const [chosenCategory, setChosenCategory] = useState<string | null>()
  const categoryId = chosenCategory === undefined ? defaultCategoryId : chosenCategory
  // undefined = the signed-in person.
  const myName = useMyName()
  const [chosenOwner, setChosenOwner] = useState<Handler | null>()
  const owner = chosenOwner === undefined ? myName : chosenOwner
  const [createMissing, setCreateMissing] = useState(true)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)

  const sheet = sheets[sheetIdx]
  const source = `Import: ${fileName}`
  // Category names in the file that don't exist yet (case-insensitive).
  const missingCategories = useMemo(() => {
    const col = mapping.indexOf("category")
    if (!sheet || col < 0) return []
    const known = new Set(categories.map((c) => c.name.trim().toLowerCase()))
    const found = new Map<string, string>()
    for (const r of sheet.rows) {
      const name = String(r[col] ?? "").trim()
      if (name && !known.has(name.toLowerCase())) found.set(name.toLowerCase(), name)
    }
    return [...found.values()]
  }, [sheet, mapping, categories])
  // Preview treats to-be-created categories as existing (placeholder ids are
  // never written: runImport re-prepares rows after creating them).
  const previewCategories = useMemo(
    () =>
      createMissing
        ? [...categories, ...missingCategories.map((name) => ({ id: `pending:${name}`, name, created_at: "" }))]
        : categories,
    [categories, missingCategories, createMissing],
  )
  const prepared = useMemo(
    () =>
      sheet && mapping.includes("company_name")
        ? prepareRows(sheet, mapping, existing, { source, categoryId, categories: previewCategories, owner })
        : [],
    [sheet, mapping, existing, source, categoryId, previewCategories, owner],
  )
  const invalid = prepared.filter((r) => r.error)
  const duplicates = prepared.filter((r) => !r.error && r.duplicateOf)
  const warned = toImportOf(prepared, skipDuplicates).filter((r) => r.warning)
  const toImport = toImportOf(prepared, skipDuplicates)
  const green = toImport.filter((r) => isGreen(r.lead.status)).length

  function reset() {
    setFileName("")
    setSheets([])
    setSheetIdx(0)
    setMapping([])
    setImporting(null)
    setChosenCategory(undefined)
    setChosenOwner(undefined)
  }

  async function onFile(file: File) {
    setReading(true)
    try {
      const [wb, tpl] = await Promise.all([
        readWorkbook(file),
        supabase.from("import_templates").select("mapping").eq("entity", "leads").eq("name", TEMPLATE_NAME).maybeSingle(),
      ])
      const first = wb.findIndex((s) => s.rows.length > 0)
      if (first < 0) throw new Error("No rows found in this file.")
      const savedMapping = (tpl.data?.mapping as Record<string, string | null> | undefined) ?? undefined
      setSaved(savedMapping)
      setFileName(file.name)
      setSheets(wb)
      setSheetIdx(first)
      setMapping(autoMap(wb[first].headers, savedMapping))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read this file.")
    } finally {
      setReading(false)
    }
  }

  function selectSheet(i: number) {
    setSheetIdx(i)
    setMapping(autoMap(sheets[i].headers, saved))
  }

  function setColumn(col: number, field: ImportField | null) {
    // A field can only come from one column: unassign it elsewhere.
    setMapping((m) => m.map((f, i) => (i === col ? field : f === field ? null : f)))
  }

  async function runImport() {
    let rows = toImport.map((r) => r.lead)
    setImporting({ done: 0, total: rows.length })
    try {
      if (createMissing && missingCategories.length) {
        const created = await Promise.all(missingCategories.map((name) => createCategory(name)))
        onCategoriesCreated(created)
        // Re-run with the new categories so those rows pick them up.
        const all = [...categories, ...created]
        rows = toImportOf(prepareRows(sheet, mapping, existing, { source, categoryId, categories: all, owner }), skipDuplicates)
          .map((r) => r.lead)
      }
      const n = await insertLeads(rows, (done) => setImporting({ done, total: rows.length }))
      await Promise.all([
        logActivity("imported", `Imported ${n} leads from ${fileName}`),
        supabase.from("import_templates").upsert(
          { name: TEMPLATE_NAME, entity: "leads", mapping: { ...saved, ...mappingToTemplate(sheet.headers, mapping) } },
          { onConflict: "entity,name" },
        ),
      ])
      toast.success(`Imported ${n} lead${n === 1 ? "" : "s"}`)
      onImported()
      onOpenChange(false)
      reset()
    } catch (e) {
      const inserted = (e as { inserted?: number }).inserted ?? 0
      toast.error(`Import stopped after ${inserted} rows: ${e instanceof Error ? e.message : "unknown error"}`)
      if (inserted) onImported()
      setImporting(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (importing) return
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file, then match its columns to lead fields.
          </DialogDescription>
        </DialogHeader>

        {!sheet ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center hover:bg-muted/40">
            {reading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <Upload className="size-6 text-muted-foreground" />}
            <span className="text-sm">{reading ? "Reading file…" : "Choose a .xlsx, .xls or .csv file"}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              disabled={reading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ""
              }}
            />
          </label>
        ) : (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-muted-foreground" />
              <span className="truncate font-medium">{fileName}</span>
              {sheets.length > 1 && (
                <Select value={String(sheetIdx)} onValueChange={(v) => selectSheet(Number(v))}>
                  <SelectTrigger size="sm" className="w-auto"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sheets.map((s, i) => (
                      <SelectItem key={s.name} value={String(i)}>{s.name} ({s.rows.length} rows)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="ghost" size="xs" className="ml-auto" onClick={reset} disabled={Boolean(importing)}>
                Change file
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="import-category">Category for these leads</Label>
              <Select value={categoryId ?? NO_CATEGORY} onValueChange={(v) => setChosenCategory(v === NO_CATEGORY ? null : v)}>
                <SelectTrigger id="import-category" size="sm" className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {mapping.includes("category") && (
                <span className="text-xs text-muted-foreground">Rows with their own Category column value use that instead.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="import-owner">Handled by</Label>
              <Select value={owner ?? UNASSIGNED} onValueChange={(v) => setChosenOwner(v === UNASSIGNED ? null : (v as Handler))}>
                <SelectTrigger id="import-owner" size="sm" className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
              {mapping.includes("owner") && (
                <span className="text-xs text-muted-foreground">Rows with their own Handled by value use that instead.</span>
              )}
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Column in file</th>
                    <th className="px-3 py-2 font-medium">Sample</th>
                    <th className="px-3 py-2 font-medium">Import as</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.headers.map((h, col) => (
                    <tr key={col} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{h}</td>
                      <td className="max-w-48 truncate px-3 py-1.5 text-muted-foreground">
                        {sheet.rows.slice(0, 3).map((r) => String(r[col] ?? "")).filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <Select
                          value={mapping[col] ?? IGNORE}
                          onValueChange={(v) => setColumn(col, v === IGNORE ? null : (v as ImportField))}
                        >
                          <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={IGNORE}>Don't import</SelectItem>
                            {IMPORT_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!mapping.includes("company_name") ? (
              <p className="text-sm text-destructive">Map one column to <b>Name</b> to continue.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <span><b>{toImport.length}</b> will be imported</span>
                  <span className="text-success"><b>{green}</b> green (interested)</span>
                  <span className="text-muted-foreground"><b>{duplicates.length}</b> duplicates</span>
                  {invalid.length > 0 && <span className="text-destructive"><b>{invalid.length}</b> with errors (skipped)</span>}
                  {warned.length > 0 && <span className="text-muted-foreground"><b>{warned.length}</b> with warnings (still imported)</span>}
                </div>
                {missingCategories.length > 0 && (
                  <Label className="font-normal">
                    <Checkbox checked={createMissing} onCheckedChange={(c) => setCreateMissing(c === true)} />
                    Create {missingCategories.length} new categor{missingCategories.length === 1 ? "y" : "ies"}:{" "}
                    {missingCategories.slice(0, 5).join(", ")}{missingCategories.length > 5 && "…"}
                  </Label>
                )}
                {duplicates.length > 0 && (
                  <Label className="font-normal">
                    <Checkbox checked={skipDuplicates} onCheckedChange={(c) => setSkipDuplicates(c === true)} />
                    Skip duplicates (matched by phone or email)
                  </Label>
                )}
                {(invalid.length > 0 || duplicates.length > 0 || warned.length > 0) && (
                  <ul className="max-h-28 overflow-auto rounded-lg border p-2 text-xs text-muted-foreground">
                    {[...invalid, ...duplicates, ...warned]
                      .sort((a, b) => a.line - b.line)
                      .slice(0, 200)
                      .map((r) => (
                        <li key={r.line} className={r.error ? "text-destructive" : undefined}>
                          Row {r.line} · {r.lead.company_name || "(no name)"} —{" "}
                          {[r.error, r.duplicateOf && `duplicate, ${r.duplicateOf}`, r.warning].filter(Boolean).join("; ")}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={runImport}
            disabled={!sheet || !mapping.includes("company_name") || toImport.length === 0 || Boolean(importing)}
          >
            {importing ? (
              <><Loader2 className="animate-spin" /> Importing {importing.done}/{importing.total}</>
            ) : (
              `Import ${toImport.length || ""} leads`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function toImportOf(rows: PreparedRow[], skipDuplicates: boolean) {
  return rows.filter((r) => !r.error && !(skipDuplicates && r.duplicateOf))
}
