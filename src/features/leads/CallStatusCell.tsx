import { useState } from "react"
import { Loader2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { REMARKS_LIST_ID } from "./status"

interface Props {
  value: string | null
  onSave: (value: string | null) => Promise<void>
  className?: string // Overrides the default fixed width.
}

// Click to edit in place. Enter or clicking away saves; Escape cancels.
export function CallStatusCell({ value, onSave, className }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function commit() {
    if (draft === null) return
    const next = draft.trim() || null
    if (next === (value ?? null)) {
      setDraft(null)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setDraft(null)
    } catch {
      // onSave reports the error; keep the input open so nothing typed is lost.
    } finally {
      setSaving(false)
    }
  }

  if (draft !== null) {
    return (
      <div className={cn("relative", className)}>
        <input
          autoFocus
          list={REMARKS_LIST_ID}
          value={draft}
          disabled={saving}
          maxLength={200}
          aria-label="Call status"
          placeholder="busy, visit, call Monday…"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setDraft(null)
          }}
          className="h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-base outline-none focus:border-ring sm:text-sm"
        />
        {saving && <Loader2 className="absolute top-1.5 right-2 size-4 animate-spin text-muted-foreground" />}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(value ?? "")}
      title="Click to edit call status"
      className={cn(
        "group/cs flex h-7 w-44 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-muted",
        !value && "text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{value ?? "Add status"}</span>
      <Pencil className="ml-auto size-3 shrink-0 opacity-0 group-hover/cs:opacity-60" />
    </button>
  )
}
