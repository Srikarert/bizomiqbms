import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { localDate } from "@/lib/dates"
import { Button } from "@/components/ui/button"
import { CHIP, DOT, type Tone } from "./tones"

export interface CalendarItem {
  id: string
  label: string
  tone: Tone
}


const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_CHIPS = 3

// Whole weeks (Monday first) covering the month.
function monthGrid(month: Date): Date[] {
  const y = month.getFullYear()
  const m = month.getMonth()
  const offset = (new Date(y, m, 1).getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const cells = Math.ceil((offset + days) / 7) * 7
  return Array.from({ length: cells }, (_, i) => new Date(y, m, 1 - offset + i))
}

interface Props {
  month: Date // Any date inside the month to show.
  onMonthChange: (month: Date) => void
  selected: string | null // YYYY-MM-DD
  onSelect: (date: string) => void
  itemsByDate: Map<string, CalendarItem[]>
}

export function MonthCalendar({ month, onMonthChange, selected, onSelect, itemsByDate }: Props) {
  const today = localDate()
  const cells = monthGrid(month)
  const shift = (n: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-medium">
          {month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </h2>
        <Button size="xs" variant="outline" onClick={() => onMonthChange(new Date())}>Today</Button>
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></Button>
      </div>

      <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = localDate(d)
          const inMonth = d.getMonth() === month.getMonth()
          const items = itemsByDate.get(key) ?? []
          const isSelected = key === selected
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}, ${items.length} item${items.length === 1 ? "" : "s"}`}
              onClick={() => onSelect(key)}
              className={cn(
                "flex min-h-14 flex-col items-stretch gap-1 border-b border-r p-1 text-left align-top transition-colors hover:bg-muted/50 sm:min-h-24 sm:p-1.5",
                i % 7 === 6 && "border-r-0",
                i >= cells.length - 7 && "border-b-0",
                !inMonth && "bg-muted/20 text-muted-foreground",
                isSelected && "bg-muted ring-1 ring-foreground/40 ring-inset",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums",
                  key === today && "bg-foreground font-medium text-background",
                )}
              >
                {d.getDate()}
              </span>

              {/* Phones: colored dots (+ count). Larger screens: named chips. */}
              {items.length > 0 && (
                <span className="flex flex-wrap items-center gap-0.5 sm:hidden">
                  {items.slice(0, 4).map((it) => (
                    <span key={it.id} className={cn("size-1.5 rounded-full", DOT[it.tone])} aria-hidden />
                  ))}
                  {items.length > 4 && <span className="text-[10px] text-muted-foreground">+{items.length - 4}</span>}
                </span>
              )}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {items.slice(0, MAX_CHIPS).map((it) => (
                  <span key={it.id} className={cn("truncate rounded px-1 py-0.5 text-[11px] leading-tight", CHIP[it.tone])}>
                    {it.label}
                  </span>
                ))}
                {items.length > MAX_CHIPS && (
                  <span className="px-1 text-[11px] text-muted-foreground">+{items.length - MAX_CHIPS} more</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
