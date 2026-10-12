import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import type { Session } from "@supabase/supabase-js"
import { toast } from "sonner"
import { BellPlus, CalendarClock, Check, Link2, Loader2, Paperclip, Phone, Send, Trash2, Video, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useMyName } from "@/lib/team"
import { cn } from "@/lib/utils"
import { clock, dateTimeLabel, dayKey, dayLabel, localDate, whenLabel } from "@/lib/dates"
import { href, leadLink } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LeadPicker } from "@/features/leads/LeadPicker"
import { GENUINENESS_STYLES, STATUS_STYLES } from "@/features/leads/status"
import {
  deleteMessage, fetchMessage, fetchMessages, sendMessage, setFollowUpStatus,
  type ChatFollowUp, type ChatMeeting, type ChatMessage, type LeadLite,
} from "./api"
import { FollowUpDialog } from "./FollowUpDialog"

const PAGE = 60
const POLL_MS = 20_000

export function ChatPage({ session }: { session: Session }) {
  const myId = session.user.id
  const myName = useMyName()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState("")
  const [attached, setAttached] = useState<LeadLite | null>(null)
  const [sending, setSending] = useState(false)
  const [picker, setPicker] = useState<"attach" | "followup" | null>(null)
  const [followUpLead, setFollowUpLead] = useState<LeadLite | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const load = useCallback(async () => {
    try {
      const r = await fetchMessages(limit)
      setMessages(r.messages)
      setHasMore(r.hasMore)
      setState("ready")
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages")
      setState((s) => (s === "ready" ? s : "error"))
    }
  }, [limit])

  // Initial load, and a slow refresh as a safety net behind realtime.
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // Realtime: new and deleted messages show up instantly for everyone.
  useEffect(() => {
    const channel = supabase
      .channel("team-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (p) => {
        const m = await fetchMessage((p.new as { id: string }).id).catch(() => null)
        if (m) setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]))
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (p) => {
        const id = (p.old as { id?: string }).id
        if (id) setMessages((ms) => ms.filter((x) => x.id !== id))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  // Keep the newest message in view unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const append = useCallback(async (id: string) => {
    const m = await fetchMessage(id).catch(() => null)
    stickToBottom.current = true
    if (m) setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]))
  }, [])

  async function send() {
    const body = text.trim()
    if ((!body && !attached) || sending) return
    setSending(true)
    try {
      const id = await sendMessage({ body, lead_id: attached?.id })
      setText("")
      setAttached(null)
      await append(id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send")
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on desktop; on phones the keyboard's Enter adds a new line.
    const touch = window.matchMedia("(pointer: coarse)").matches
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  async function remove(id: string) {
    try {
      await deleteMessage(id)
      setMessages((ms) => ms.filter((m) => m.id !== id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete")
    } finally {
      setConfirmDelete(null)
    }
  }

  async function completeFollowUp(f: ChatFollowUp) {
    try {
      await setFollowUpStatus(f.id, "Completed")
      setMessages((ms) =>
        ms.map((m) => (m.follow_up?.id === f.id ? { ...m, follow_up: { ...m.follow_up, status: "Completed" } } : m)),
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    }
  }

  const pickLead = (lead: LeadLite) => {
    const mode = picker
    setPicker(null)
    if (mode === "followup") setFollowUpLead(lead)
    else setAttached(lead)
  }

  return (
    <div className="flex h-[calc(100svh-5.5rem)] flex-col md:h-[calc(100svh-2.5rem)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Team chat</h1>
          <p className="text-xs text-muted-foreground">Srikar · Nikhil · Jethin</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={href("meetings")}><Video /> Meetings</a>
        </Button>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border p-3"
      >
        {state === "loading" ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : state === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            No messages yet. Say hello, or attach a lead to start a conversation about it.
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    stickToBottom.current = false
                    setLimit((l) => l + PAGE)
                  }}
                >
                  Load earlier messages
                </Button>
              </div>
            )}
            {messages.map((m, i) => {
              const showDay = i === 0 || dayKey(messages[i - 1].created_at) !== dayKey(m.created_at)
              return (
                <Fragment key={m.id}>
                  {showDay && (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full bg-secondary px-3 py-0.5 text-xs text-muted-foreground">{dayLabel(m.created_at)}</span>
                    </div>
                  )}
                  <MessageRow
                    m={m}
                    mine={m.sender_id === myId}
                    confirming={confirmDelete === m.id}
                    onAskDelete={() => setConfirmDelete(m.id)}
                    onCancelDelete={() => setConfirmDelete(null)}
                    onDelete={() => void remove(m.id)}
                    onFollowUp={setFollowUpLead}
                    onCompleteFollowUp={(f) => void completeFollowUp(f)}
                  />
                </Fragment>
              )
            })}
          </>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {attached && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              <b className="font-medium">{attached.company_name}</b>
              {attached.phone && <span className="text-muted-foreground"> · {attached.phone}</span>}
            </span>
            <Button size="xs" variant="outline" onClick={() => setFollowUpLead(attached)}>
              <BellPlus /> Follow-up
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Remove attached lead" onClick={() => setAttached(null)}>
              <X />
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1 sm:flex-row">
            <Button type="button" variant="outline" size="icon" aria-label="Attach a lead" title="Attach a lead" onClick={() => setPicker("attach")}>
              <Paperclip />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Set a follow-up" title="Set a follow-up for a lead" onClick={() => (attached ? setFollowUpLead(attached) : setPicker("followup"))}>
              <BellPlus />
            </Button>
          </div>
          <Textarea
            rows={2}
            maxLength={4000}
            placeholder="Message the team…"
            className="min-h-0 resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button onClick={() => void send()} disabled={sending || (!text.trim() && !attached)} aria-label="Send">
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
      </div>

      <LeadPicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={pickLead}
        title={picker === "followup" ? "Follow-up for which lead?" : "Attach a lead"}
      />
      <FollowUpDialog
        lead={followUpLead}
        defaultOwner={myName}
        onClose={() => setFollowUpLead(null)}
        onPosted={(id) => {
          setFollowUpLead(null)
          setAttached(null)
          void append(id)
        }}
      />
    </div>
  )
}

interface RowProps {
  m: ChatMessage
  mine: boolean
  confirming: boolean
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onFollowUp: (lead: LeadLite) => void
  onCompleteFollowUp: (f: ChatFollowUp) => void
}

function MessageRow({ m, mine, confirming, onAskDelete, onCancelDelete, onDelete, onFollowUp, onCompleteFollowUp }: RowProps) {
  const hasAttachment = Boolean(m.lead || m.follow_up || m.meeting)
  return (
    <div className="group flex gap-2.5 py-1.5">
      <div
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium"
        aria-hidden
      >
        {m.sender_name.slice(0, 1).toUpperCase() || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-medium", mine && "text-info")}>{m.sender_name}</span>
          <span className="text-xs text-muted-foreground">{clock(m.created_at)}</span>
          {mine &&
            (confirming ? (
              <span className="ml-auto flex items-center gap-1 text-xs">
                Delete?
                <Button size="xs" variant="destructive" onClick={onDelete}>Yes</Button>
                <Button size="xs" variant="ghost" onClick={onCancelDelete}>No</Button>
              </span>
            ) : (
              <button
                type="button"
                aria-label="Delete message"
                onClick={onAskDelete}
                className="ml-auto text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            ))}
        </div>
        {m.body && <p className="text-sm break-words whitespace-pre-wrap">{linkify(m.body)}</p>}
        {!m.body && !hasAttachment && <p className="text-sm text-muted-foreground italic">Attachment no longer available</p>}
        <div className="mt-1 space-y-1.5">
          {m.lead && <LeadCard lead={m.lead} onFollowUp={onFollowUp} />}
          {m.follow_up && <FollowUpCard f={m.follow_up} onDone={onCompleteFollowUp} />}
          {m.meeting && <MeetingCard meeting={m.meeting} />}
        </div>
      </div>
    </div>
  )
}

function LeadCard({ lead, onFollowUp }: { lead: LeadLite; onFollowUp: (l: LeadLite) => void }) {
  return (
    <div className="max-w-md rounded-lg border bg-card p-2.5 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <a href={leadLink(lead.id)} className="block truncate font-medium hover:underline">{lead.company_name}</a>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 tabular-nums text-foreground">
                <Phone className="size-3" /> {lead.phone}
              </a>
            )}
            <span className={cn("rounded-full px-2 py-0.5", STATUS_STYLES[lead.status])}>{lead.status}</span>
            {lead.owner && <span>{lead.owner}</span>}
            {lead.lead_score != null && <span>Score <span className="tabular-nums text-foreground">{lead.lead_score}</span></span>}
            {lead.genuineness && <span className={GENUINENESS_STYLES[lead.genuineness]}>{lead.genuineness} genuineness</span>}
          </div>
          {lead.call_status && <div className="mt-1 truncate text-xs">“{lead.call_status}”</div>}
        </div>
        <Button size="xs" variant="outline" onClick={() => onFollowUp(lead)}>
          <BellPlus /> Follow-up
        </Button>
      </div>
    </div>
  )
}

function FollowUpCard({ f, onDone }: { f: ChatFollowUp; onDone: (f: ChatFollowUp) => void }) {
  const pending = f.status === "Pending"
  const overdue = pending && f.date < localDate()
  return (
    <div className={cn("flex max-w-md items-center gap-2 rounded-lg border px-2.5 py-2 text-sm", overdue && "border-destructive/50")}>
      <CalendarClock className={cn("size-4 shrink-0", overdue ? "text-destructive" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          Follow-up · {dateTimeLabel(f.date, f.time)}
          {f.owner && <span className="font-normal text-muted-foreground"> · {f.owner}</span>}
        </div>
        {f.notes && <div className="truncate text-xs text-muted-foreground">{f.notes}</div>}
      </div>
      {pending ? (
        <>
          {overdue && <span className="text-xs text-destructive">Overdue</span>}
          <Button size="xs" variant="outline" onClick={() => onDone(f)}><Check /> Done</Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">{f.status}</span>
      )}
    </div>
  )
}

function MeetingCard({ meeting }: { meeting: ChatMeeting }) {
  const joinable = meeting.status === "Scheduled" && meeting.link && /^https?:\/\//i.test(meeting.link)
  return (
    <div className="flex max-w-md items-center gap-2 rounded-lg border px-2.5 py-2 text-sm">
      <Video className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{meeting.title}</div>
        <div className="text-xs text-muted-foreground">
          {whenLabel(meeting.starts_at)}
          {meeting.status !== "Scheduled" && ` · ${meeting.status}`}
        </div>
      </div>
      {joinable && (
        <Button asChild size="xs">
          <a href={meeting.link!} target="_blank" rel="noopener noreferrer"><Link2 /> Join</a>
        </Button>
      )}
    </div>
  )
}

// Turns http(s) links in a message into clickable links.
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-info underline underline-offset-2">
        {part}
      </a>
    ) : (
      part
    ),
  )
}
