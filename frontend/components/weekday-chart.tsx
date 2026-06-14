"use client"

import { memo } from "react"
import { semanticColor } from "@/lib/color"

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

export const WeekdayChart = memo(function WeekdayChart({ data }: { data: Record<string, number> }) {
  const values = DAYS.map((_, i) => data[String(i)] ?? 0)
  const max = Math.max(...values, 1)

  return (
    <div className="flex items-end justify-between gap-1.5 h-24 px-1">
      {values.map((pct, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-zinc-400">{Math.round(pct)}%</span>
          <div className="w-full rounded-t-md transition-all duration-500"
            style={{
              height: `${Math.max((pct / max) * 56, 4)}px`,
              backgroundColor: semanticColor(pct),
              opacity: pct === 0 ? 0.2 : 1,
            }}
          />
          <span className="text-[10px] text-zinc-500">{DAYS[i]}</span>
        </div>
      ))}
    </div>
  )
})
