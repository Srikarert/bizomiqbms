import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import type { LeadCategory } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createCategory, deleteCategory, renameCategory } from "./api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: LeadCategory[]
  counts: Map<string, number> // category id -> number of leads
  onChanged: (categories: LeadCategory[], deletedId?: string) => void
}

export function CategoriesDialog({ open, onOpenChange, categories, counts, onChanged }: Props) {
  const [newName, setNewName] = useState("")
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sorted = (list: LeadCategory[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    run(async () => {
      const created = await createCategory(newName)
      onChanged(sorted([...categories, created]))
      setNewName("")
      toast.success(`Category "${created.name}" created`)
    })
  }

  const saveRename = () => {
    if (!editing || !editing.name.trim()) return
    run(async () => {
      const updated = await renameCategory(editing.id, editing.name)
      onChanged(sorted(categories.map((c) => (c.id === updated.id ? updated : c))))
      setEditing(null)
    })
  }

  const remove = (c: LeadCategory) =>
    run(async () => {
      await deleteCategory(c.id)
      onChanged(categories.filter((x) => x.id !== c.id), c.id)
      setConfirmingDelete(null)
      toast.success(`Category "${c.name}" deleted`)
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setEditing(null)
          setConfirmingDelete(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lead categories</DialogTitle>
          <DialogDescription>Group leads by business type, like Constructions, Interiors or Events.</DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="flex gap-2">
          <Input
            autoFocus
            placeholder="New category name"
            value={newName}
            maxLength={60}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            {busy && !editing && !confirmingDelete ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>

        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {categories.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No categories yet.</li>}
          {categories.map((c) => {
            const n = counts.get(c.id) ?? 0
            return (
              <li key={c.id} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm">
                {editing?.id === c.id ? (
                  <form
                    className="flex flex-1 items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      saveRename()
                    }}
                  >
                    <Input
                      autoFocus
                      className="h-7"
                      value={editing.name}
                      maxLength={60}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(null))}
                    />
                    <Button type="submit" size="icon-sm" variant="ghost" disabled={busy} aria-label="Save name"><Check /></Button>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel"><X /></Button>
                  </form>
                ) : confirmingDelete === c.id ? (
                  <>
                    <span className="flex-1">
                      Delete <b>{c.name}</b>?{n > 0 && ` Its ${n} lead${n === 1 ? "" : "s"} will become uncategorized.`}
                    </span>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(c)}>Delete</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{n} lead{n === 1 ? "" : "s"}</span>
                    <Button size="icon-sm" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setConfirmingDelete(c.id)}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
