import { useEffect, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LeadLite } from "@/features/chat/api"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { searchLeads } from "./api"
import { STATUS_STYLES } from "./status"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (lead: LeadLite) => void
  title?: string
}

// Search leads by name, contact or phone and pick one.
export function LeadPicker({ open, onOpenChange, onPick, title = "Choose a lead" }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Search by business name, contact or phone number.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open so the search resets each time. */}
        {open && <PickerBody onPick={onPick} />}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({ onPick }: { onPick: (lead: LeadLite) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchLeads>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // Debounce typing; the first (empty) search shows the newest leads.
    const t = setTimeout(() => {
      searchLeads(q).then(
        (r) => live && (setResults(r), setError(null)),
        (e: unknown) => live && setError(e instanceof Error ? e.message : "Search failed"),
      )
    }, q ? 250 : 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus placeholder="Search leads…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {error ? (
          <p className="p-4 text-center text-sm text-destructive">{error}</p>
        ) : !results ? (
          <div className="flex justify-center p-6"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : results.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No leads match.</p>
        ) : (
          <ul className="divide-y">
            {results.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onPick(l)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.company_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[l.contact_name, l.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", STATUS_STYLES[l.status])}>{l.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
