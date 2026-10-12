import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { addDays, daysBetween, localDate } from "@/lib/dates"
import { CHIP, type Tone } from "./tones"

export interface TimelineRow {
  id: string
  label: string
  sub?: string
}

export interface TimelineBar {
  id: string
  rowId: string
  label: string
  title: string // Tooltip with full details.
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD, inclusive
  tone: Tone
  progress?: number // 0-100, drawn as a fill inside the bar
}

const BAR_BORDER: Record<Tone, string> = {
  info: "border-info/50",
  success: "border-success/50",
  warning: "border-warning/50",
  danger: "border-destructive/60",
  muted: "border-border",
}
const FILL: Record<Tone, string> = {
  info: "bg-info/35",
  success: "bg-success/35",
  warning: "bg-warning/35",
  danger: "bg-destructive/35",
  muted: "bg-foreground/10",
}

const LABEL_W_WIDE = 148 // px, row label column
const LABEL_W_NARROW = 92 // phones
const LANE_H = 28
const LANE_GAP = 4
const ROW_PAD = 6

interface Props {
  start: string // First visible day, YYYY-MM-DD
  days: number
  dayWidth: number // px per day
  rows: TimelineRow[]
  bars: TimelineBar[]
  onBarClick: (id: string) => void
}

// Resource timeline ("tape chart"): one row per resource, one column per day,
// each booking drawn as a bar across the days it covers. Overlapping bars in a
// row stack into lanes so none hide each other.
export function Timeline({ start, days, dayWidth, rows, bars, onBarClick }: Props) {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setNarrow(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  const LABEL_W = narrow ? LABEL_W_NARROW : LABEL_W_WIDE
  const today = localDate()
  const todayIdx = daysBetween(start, today)
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days])
  const width = days * dayWidth

  // Month header groups.
  const months = useMemo(() => {
    const out: { key: string; label: string; span: number }[] = []
    for (const d of dayList) {
      const key = d.slice(0, 7)
      const last = out[out.length - 1]
      if (last && last.key === key) last.span++
      else {
        const [y, m] = key.split("-").map(Number)
        out.push({ key, span: 1, label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) })
      }
    }
    return out
  }, [dayList])

  // Per row: bars clipped to the window and assigned a lane.
  const laidOut = useMemo(() => {
    const byRow = new Map<string, TimelineBar[]>()
    for (const b of bars) byRow.set(b.rowId, [...(byRow.get(b.rowId) ?? []), b])
    return rows.map((row) => {
      const items = (byRow.get(row.id) ?? [])
        .map((b) => {
          const s = daysBetween(start, b.start)
          const e = daysBetween(start, b.end)
          return { b, s, e, cs: Math.max(0, s), ce: Math.min(days - 1, e) }
        })
        .filter((x) => x.e >= 0 && x.s <= days - 1)
        .sort((a, c) => a.s - c.s || a.e - c.e)
      const laneEnds: number[] = []
      const placed = items.map((x) => {
        let lane = laneEnds.findIndex((end) => end < x.cs)
        if (lane === -1) lane = laneEnds.length
        laneEnds[lane] = x.ce
        return { ...x, lane }
      })
      return { row, placed, lanes: Math.max(1, laneEnds.length) }
    })
  }, [rows, bars, start, days])

  const gridLines: CSSProperties = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayWidth - 1}px, var(--border) ${dayWidth - 1}px, var(--border) ${dayWidth}px)`,
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div style={{ width: LABEL_W + width }} className="relative">
        {/* Header: months, then days. */}
        <div className="sticky top-0 z-20 flex border-b bg-card">
          <div style={{ width: LABEL_W }} className="sticky left-0 z-30 shrink-0 border-r bg-card" />
          <div style={{ width }}>
            <div className="flex border-b">
              {months.map((m) => (
                <div
                  key={m.key}
                  style={{ width: m.span * dayWidth }}
                  className="truncate border-r px-2 py-1 text-xs font-medium last:border-r-0"
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex">
              {dayList.map((d, i) => {
                const dt = new Date(`${d}T00:00:00`)
                const weekend = dt.getDay() === 0 || dt.getDay() === 6
                return (
                  <div
                    key={d}
                    style={{ width: dayWidth }}
                    className={cn(
                      "flex flex-col items-center border-r py-1 text-[11px] leading-tight",
                      weekend && "bg-muted/40 text-muted-foreground",
                      i === todayIdx && "bg-foreground font-medium text-background",
                    )}
                  >
                    <span>{dt.toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
                    <span className="tabular-nums">{dt.getDate()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {laidOut.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">Nothing to show yet.</p>
        )}

        {laidOut.map(({ row, placed, lanes }) => {
          const height = lanes * LANE_H + (lanes - 1) * LANE_GAP + ROW_PAD * 2
          return (
            <div key={row.id} className="flex border-b last:border-b-0" style={{ height }}>
              <div
                style={{ width: LABEL_W }}
                className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r bg-background px-2.5"
              >
                <span className="truncate text-sm font-medium">{row.label}</span>
                {row.sub && <span className="truncate text-xs text-muted-foreground">{row.sub}</span>}
              </div>
              <div className="relative" style={{ width, ...gridLines }}>
                {/* Weekend shading and the today column. */}
                {dayList.map((d, i) => {
                  const dow = new Date(`${d}T00:00:00`).getDay()
                  return dow === 0 || dow === 6 ? (
                    <div key={d} className="absolute inset-y-0 bg-muted/25" style={{ left: i * dayWidth, width: dayWidth }} />
                  ) : null
                })}
                {todayIdx >= 0 && todayIdx < days && (
                  <div className="absolute inset-y-0 bg-foreground/10" style={{ left: todayIdx * dayWidth, width: dayWidth }} />
                )}

                {placed.map(({ b, s, e, cs, ce, lane }) => {
                  const left = cs * dayWidth + 1
                  const w = (ce - cs + 1) * dayWidth - 2
                  const pct = Math.max(0, Math.min(100, b.progress ?? 0))
                  return (
                    <button
                      key={b.id}
                      type="button"
                      title={b.title}
                      aria-label={b.title}
                      onClick={() => onBarClick(b.id)}
                      style={{ left, width: w, top: ROW_PAD + lane * (LANE_H + LANE_GAP), height: LANE_H }}
                      className={cn(
                        "absolute flex items-center overflow-hidden border text-left text-xs transition-opacity hover:opacity-80",
                        CHIP[b.tone],
                        BAR_BORDER[b.tone],
                        s < 0 ? "rounded-l-none border-l-0" : "rounded-l-md",
                        e > days - 1 ? "rounded-r-none border-r-0" : "rounded-r-md",
                      )}
                    >
                      {pct > 0 && (
                        <span aria-hidden className={cn("absolute inset-y-0 left-0", FILL[b.tone])} style={{ width: `${pct}%` }} />
                      )}
                      <span className="relative truncate px-2 font-medium">
                        {s < 0 && "◂ "}
                        {b.label}
                        {e > days - 1 && " ▸"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
