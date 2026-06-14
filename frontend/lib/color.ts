export function semanticColor(pct: number): string {
  if (pct >= 75) return "#22c55e"
  if (pct >= 50) return "#fb923c"
  return "#ef4444"
}

export function semanticClass(pct: number): string {
  if (pct >= 75) return "text-green-400"
  if (pct >= 50) return "text-amber-400"
  return "text-red-400"
}

export function semanticBg(pct: number): string {
  if (pct >= 75) return "bg-green-500/10 border-green-500/20"
  if (pct >= 50) return "bg-amber-500/10 border-amber-500/20"
  return "bg-red-500/10 border-red-500/20"
}

export function diffClass(diff: number): string {
  if (diff > 0) return "text-green-400"
  if (diff < 0) return "text-red-400"
  return "text-zinc-500"
}

export function recoveryColor(days: number): string {
  if (days <= 1) return "#22c55e"
  if (days <= 3) return "#fb923c"
  return "#ef4444"
}
