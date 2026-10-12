// Local-time date helpers. Dates in the database are plain YYYY-MM-DD (no
// timezone); timestamps are ISO strings shown in the viewer's timezone.

const pad = (n: number) => String(n).padStart(2, "0")

export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const dayDiff = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000)

const dayName = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })

// "Today", "Yesterday", "Tomorrow" or "Mon, 12 Oct".
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const n = dayDiff(d)
  return n === 0 ? "Today" : n === -1 ? "Yesterday" : n === 1 ? "Tomorrow" : dayName(d)
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })

// "Today, 4:30 pm" / "Wed, 14 Oct, 4:30 pm".
export const whenLabel = (iso: string) => `${dayLabel(iso)}, ${clock(iso)}`

// YYYY-MM-DD (+ optional "HH:MM") -> "14 Oct, 4:30 pm".
export function dateTimeLabel(date: string, time?: string | null): string {
  const d = new Date(`${date}T${time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "00:00"}:00`)
  const base = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
  return time && /^\d{2}:\d{2}/.test(time)
    ? `${base}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
    : base
}

// Same calendar day key, for grouping messages.
export const dayKey = (iso: string) => localDate(new Date(iso))

// --- Calendar-day arithmetic on YYYY-MM-DD strings (DST-safe) ----------------

const DAY_MS = 86_400_000
const utcDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export const daysBetween = (from: string, to: string) => Math.round((utcDay(to) - utcDay(from)) / DAY_MS)

export function addDays(date: string, n: number): string {
  const d = new Date(utcDay(date) + n * DAY_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// YYYY-MM-DD -> "14 Oct".
export const shortDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
