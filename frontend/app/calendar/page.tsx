"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { getHabits, getMonthSummary, getDayRecords } from "@/lib/api"
import { Habit, MonthSummary, DayRecords } from "@/lib/types"
import { MONTHS, DAYS_SHORT, daysInMonth, firstWeekdayOffset, toISODate } from "@/lib/utils"

interface DayDetail {
  day: number
  records: DayRecords
  habits: Habit[]
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [habits, setHabits] = useState<Habit[]>([])
  const [summary, setSummary] = useState<MonthSummary>({})
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<DayDetail | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([getHabits(), getMonthSummary(year, month)]).then(([h, monthRes]) => {
      setHabits(h)
      setSummary(monthRes.summary)
      setLoading(false)
    })
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function openDay(day: number) {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
    const r = await getDayRecords(dateStr)
    setDetail({ day, records: r, habits })
  }

  const total = habits.length
  const days = daysInMonth(year, month)
  const offset = firstWeekdayOffset(year, month)
  const cells = [...Array(offset).fill(null), ...Array.from({length: days}, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  function cellColor(day: number): string {
    const key = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
    const count = summary[key] ?? 0
    if (count === 0) return "bg-zinc-800"
    if (total > 0 && count >= total) return "bg-green-500"
    return "bg-yellow-400"
  }

  const today = toISODate(new Date())

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="px-5 pt-10 pb-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-bold">{MONTHS[month - 1]} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-3 pt-3 pb-1">
        {DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs text-zinc-500 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="grid grid-cols-7 gap-1 px-3">
          {Array.from({length: 35}).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 px-3">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
            const isToday = dateStr === today
            return (
              <button
                key={i}
                onClick={() => openDay(day)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all
                  ${cellColor(day)}
                  ${isToday ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-950" : ""}
                  hover:opacity-80`}
              >
                <span className="text-xs font-semibold text-white">{day}</span>
                <span className="text-[10px] text-white/70">
                  {summary[`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`] ?? 0}/{total}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 justify-center mt-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block"/>Completo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block"/>Parcial</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-zinc-800 inline-block"/>Vacío</span>
      </div>

      {/* Day detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setDetail(null)}>
          <div className="bg-zinc-900 w-full max-w-[480px] mx-auto rounded-t-3xl p-5 pb-8"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">
                {detail.day} de {MONTHS[month - 1]}
              </h3>
              <button onClick={() => setDetail(null)} className="p-1 rounded-lg hover:bg-zinc-800">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {detail.habits.map(h => {
                const state = detail.records[h.id]
                const cfg =
                  state === "done"   ? { bg: "bg-green-500",  label: "✓", text: "text-zinc-200" } :
                  state === "rest"   ? { bg: "bg-zinc-500",   label: "−", text: "text-zinc-400" } :
                  state === "failed" ? { bg: "bg-red-500",    label: "✗", text: "text-zinc-400" } :
                                       { bg: "bg-zinc-800",   label: "·", text: "text-zinc-500" }
                return (
                  <div key={h.id} className="flex items-center gap-3 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${cfg.bg}`}>
                      {cfg.label}
                    </span>
                    <span className={cfg.text}>{h.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
