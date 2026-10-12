// Shared colours for calendar items. Tone names are semantic; the colours come
// from the theme tokens in index.css.

export type Tone = "info" | "success" | "warning" | "danger" | "muted"

export const DOT: Record<Tone, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/50",
}

export const CHIP: Record<Tone, string> = {
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-secondary text-muted-foreground",
}
