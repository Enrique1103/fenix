"use client"

import { memo, useCallback, useRef } from "react"
import { Check, Minus, X } from "lucide-react"
import { HabitState } from "@/lib/types"

interface HabitCellProps {
  state: HabitState | undefined
  isToday: boolean
  isPast: boolean
  date: string
  habitId: string
  onCycle: (date: string, habitId: string) => void
  size?: "sm" | "md"
}

export const HabitCell = memo(function HabitCell({
  state, isToday, isPast, date, habitId, onCycle, size = "md",
}: HabitCellProps) {
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  const handleCycle = useCallback(() => onCycle(date, habitId), [date, habitId, onCycle])

  const dim = size === "md" ? "w-9 h-9" : "w-8 h-8"
  const iconSize = size === "md" ? 13 : 11

  const bg =
    state === 'done'   ? "bg-green-500 shadow-green-500/30 shadow-sm" :
    state === 'rest'   ? "bg-zinc-500 shadow-zinc-500/20 shadow-sm" :
    state === 'failed' ? "bg-red-500 shadow-red-500/30 shadow-sm" :
    isPast             ? "bg-zinc-800" : "bg-zinc-800/30"

  const ring = isToday ? "ring-2 ring-blue-400 ring-offset-1 ring-offset-zinc-950" : ""
  const opacity = !isPast && state === undefined ? "opacity-25" : ""

  return (
    <div
      className={`${dim} flex items-center justify-center rounded-lg cursor-pointer select-none
        transition-all duration-150 active:scale-90 ${bg} ${ring} ${opacity}`}
      onTouchStart={(e) => {
        touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        if (!touchStartPos.current) return
        const dx = Math.abs(e.changedTouches[0].clientX - touchStartPos.current.x)
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartPos.current.y)
        touchStartPos.current = null
        if (dx < 10 && dy < 10) {
          e.preventDefault()
          handleCycle()
        }
      }}
      onTouchCancel={() => { touchStartPos.current = null }}
      onClick={handleCycle}
    >
      {state === 'done'   && <Check size={iconSize} strokeWidth={3} className="text-white" />}
      {state === 'rest'   && <Minus size={iconSize} strokeWidth={3} className="text-white" />}
      {state === 'failed' && <X     size={iconSize} strokeWidth={3} className="text-white" />}
    </div>
  )
})
