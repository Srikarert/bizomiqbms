import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { HANDLERS, PRIORITIES, PROJECT_STATUSES, type Handler, type Priority, type ProjectStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createProject, updateProject, type ProjectRow } from "./api"

const NONE = "__none__"

export interface ClientOption {
  id: string
  company_name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: ProjectRow // Edit when set, create otherwise.
  clients: ClientOption[]
  defaultClientId?: string | null
  defaultOwner: Handler | null
  defaultStart?: string
  onSaved: () => void
}

export function ProjectFormDialog({ open, onOpenChange, project, clients, defaultClientId, defaultOwner, defaultStart, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        {open && (
          <Form
            key={project?.id ?? "new"}
            project={project}
            clients={clients}
            defaultClientId={defaultClientId ?? null}
            defaultOwner={defaultOwner}
            defaultStart={defaultStart}
            onSaved={() => {
              onSaved()
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface FormProps {
  project?: ProjectRow
  clients: ClientOption[]
  defaultClientId: string | null
  defaultOwner: Handler | null
  defaultStart?: string
  onSaved: () => void
}

function Form({ project, clients, defaultClientId, defaultOwner, defaultStart, onSaved }: FormProps) {
  const [name, setName] = useState(project?.name ?? "")
  const [clientId, setClientId] = useState<string>(project?.client_id ?? defaultClientId ?? NONE)
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "Not Started")
  const [priority, setPriority] = useState<Priority>(project?.priority ?? "Medium")
  const [start, setStart] = useState(project ? (project.start_date ?? "") : (defaultStart ?? ""))
  const [deadline, setDeadline] = useState(project?.deadline ?? "")
  const [budget, setBudget] = useState(project?.budget ? String(project.budget) : "")
  const [progress, setProgress] = useState(String(project?.progress ?? 0))
  const [owner, setOwner] = useState<string>(project?.owner ?? defaultOwner ?? NONE)
  const [description, setDescription] = useState(project?.description ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError("Give the project a name")
    if (start && deadline && deadline < start) return setError("The deadline can't be before the start date")
    const pct = Number(progress)
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return setError("Progress must be a whole number from 0 to 100")
    if (budget.trim() && !(Number(budget) >= 0)) return setError("Budget must be a positive number")

    const input = {
      name: name.trim(),
      client_id: clientId === NONE ? null : clientId,
      description: description.trim() || null,
      status,
      priority,
      start_date: start || null,
      deadline: deadline || null,
      budget: budget.trim() ? Number(budget) : 0,
      progress: pct,
      owner: owner === NONE ? null : (owner as Handler),
    }
    setSaving(true)
    setError(null)
    try {
      if (project) await updateProject(project.id, input)
      else await createProject(input)
      toast.success(project ? "Project updated" : "Project created")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the project")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid max-h-[65svh] gap-3 overflow-y-auto px-0.5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-name">Project name *</Label>
          <Input id="p-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-client">Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id="p-client" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No client</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {clients.length === 0 && (
            <p className="text-xs text-muted-foreground">No clients yet. Add one on the Clients page first.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-start">Start date</Label>
          <Input id="p-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-deadline">Deadline</Label>
          <Input id="p-deadline" type="date" value={deadline} min={start || undefined} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
            <SelectTrigger id="p-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-priority">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger id="p-priority" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-owner">Handled by</Label>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger id="p-owner" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-progress">Progress (%)</Label>
          <Input id="p-progress" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-budget">Budget (₹)</Label>
          <Input id="p-budget" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-desc">Description</Label>
          <Textarea id="p-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {project ? "Save changes" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  )
}
