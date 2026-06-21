"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight, Flame, TrendingUp, TrendingDown, Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { getHabits, getMonthAll, setRecord, getMonthSummary, getMonthMood, setMood, getStreak, createHabit, updateHabit, deleteHabit } from "@/lib/api"
import { Habit } from "@/lib/types"
import { MONTHS, DAYS_SHORT, daysInMonth, firstWeekdayOffset, toISODate } from "@/lib/utils"
import { HabitCell } from "@/components/habit-cell"
import { MoodEmoji } from "@/components/mood-emoji"
import { MonthlyEKGChart } from "@/components/monthly-ekg-chart"
import { SuggestedTaskCard } from "@/components/suggested-task-card"
import { diffClass } from "@/lib/color"

type RecordMatrix = Record<string, Record<string, string>>

function getWeeks(year: number, month: number): (number | null)[][] {
  const days = daysInMonth(year, month)
  const offset = firstWeekdayOffset(year, month)
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// ── Mood ─────────────────────────────────────────────────────────────────────

const MOOD_EMOJIS = ["😴","😵","😞","😔","😐","🙂","😊","😄","🤩","🥳"]

function MoodPicker({ onSelect, onClose }: {
  onSelect: (level: number) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}/>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700/60 rounded-t-2xl px-4 pt-3 pb-8">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3"/>
        <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest mb-3">Ánimo del día</p>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {MOOD_EMOJIS.map((emoji, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i + 1)}
              className="h-12 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all text-2xl"
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onSelect(0)}
          className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Borrar
        </button>
      </div>
    </>
  )
}

function MoodCell({ level, isPast, onOpen }: { level?: number; isPast: boolean; onOpen: (e: React.MouseEvent) => void }) {
  if (!isPast) return <div className="w-9 h-6" />
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(e) }}
      className="w-9 h-6 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors"
    >
      {level ? <MoodEmoji level={level}/> : <span className="text-[10px] text-zinc-700">·</span>}
    </button>
  )
}

// ── Weekly view ──────────────────────────────────────────────────────────────

function WeeklyView({
  weeks, habits, matrix, moodMap, year, month, todayStr, onCycle, onMoodOpen,
}: {
  weeks: (number | null)[][]
  habits: Habit[]
  matrix: RecordMatrix
  moodMap: Record<string, number>
  year: number
  month: number
  todayStr: string
  onCycle: (date: string, habitId: string) => void
  onMoodOpen: (date: string, e: React.MouseEvent) => void
}) {
  const currentWeekIdx = weeks.findIndex(week =>
    week.some(d => d && dateStr(year, month, d) === todayStr)
  )

  return (
    <div className="px-3 py-4 space-y-3 pb-24">
      {weeks.map((week, wi) => {
        const isCurrentWeek = wi === currentWeekIdx
        const firstDay = week.find(d => d !== null)
        const lastDay = [...week].reverse().find(d => d !== null)

        return (
          <div
            key={wi}
            className={`rounded-2xl overflow-hidden border ${
              isCurrentWeek ? "border-green-500/40 bg-green-500/5" : "border-slate-700/40 bg-slate-900/60"
            }`}
          >
            {/* Week header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
              <span className={`text-xs font-bold tracking-wider ${isCurrentWeek ? "text-green-400" : "text-zinc-400"}`}>
                SEMANA {wi + 1}
              </span>
              <span className="text-xs text-zinc-500">
                {firstDay}–{lastDay} {MONTHS[month - 1]}
              </span>
            </div>

            {/* Header: day letters + numbers */}
            <div className="grid items-center px-2 pt-2 pb-1"
              style={{ gridTemplateColumns: "minmax(90px, 1fr) repeat(7, minmax(0, 1fr))" }}>
              <div />
              {DAYS_SHORT.map((d, i) => {
                const day = week[i]
                const ds = day ? dateStr(year, month, day) : null
                const isToday = ds === todayStr
                return (
                  <div key={i} className="flex flex-col items-center">
                    <span className={`text-[10px] ${isToday ? "text-blue-400" : "text-zinc-500"}`}>{d}</span>
                    <span className={`text-xs font-semibold ${isToday ? "text-blue-400" : day ? "text-zinc-300" : "text-zinc-700"}`}>
                      {day ?? "·"}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Habit rows */}
            <div className="px-2 pb-2 space-y-1">
              {habits.map(habit => (
                <div
                  key={habit.id}
                  className="grid items-center gap-0"
                  style={{ gridTemplateColumns: "minmax(90px, 1fr) repeat(7, minmax(0, 1fr))" }}
                >
                  <span className="text-xs text-zinc-300 truncate pr-1 py-1">{habit.name}</span>
                  {week.map((day, i) => {
                    if (!day) return <div key={i} className="flex justify-center"><div className="w-9 h-9" /></div>
                    const ds = dateStr(year, month, day)
                    const isToday = ds === todayStr
                    const isPast = ds <= todayStr
                    return (
                      <div key={i} className="flex justify-center py-0.5">
                        <HabitCell
                          state={matrix[ds]?.[habit.id] as any}
                          isToday={isToday}
                          isPast={isPast}
                          onCycle={() => onCycle(ds, habit.id)}
                        />
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Mood row */}
              <div
                className="grid items-center gap-0 border-t border-zinc-800/60 pt-1 mt-1"
                style={{ gridTemplateColumns: "minmax(90px, 1fr) repeat(7, minmax(0, 1fr))" }}
              >
                <span className="text-[10px] text-zinc-500 pr-1 py-1 uppercase tracking-wider">Ánimo</span>
                {week.map((day, i) => {
                  if (!day) return <div key={i} className="flex justify-center"><div className="w-9 h-6" /></div>
                  const ds = dateStr(year, month, day)
                  const isPast = ds <= todayStr
                  return (
                    <div key={i} className="flex justify-center py-0.5">
                      <MoodCell
                        level={moodMap[ds]}
                        isPast={isPast}
                        onOpen={(e) => onMoodOpen(ds, e)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Monthly view ─────────────────────────────────────────────────────────────

function MonthlyView({
  habits, matrix, moodMap, year, month, todayStr, onCycle, onMoodOpen,
}: {
  habits: Habit[]
  matrix: RecordMatrix
  moodMap: Record<string, number>
  year: number
  month: number
  todayStr: string
  onCycle: (date: string, habitId: string) => void
  onMoodOpen: (date: string, e: React.MouseEvent) => void
}) {
  const days = daysInMonth(year, month)
  const allDays = Array.from({ length: days }, (_, i) => i + 1)

  return (
    <div className="overflow-x-auto pb-24">
      <table className="border-collapse" style={{ minWidth: `${160 + days * 36}px` }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-950 border-b border-zinc-800 px-3 py-2 text-left text-xs text-zinc-500 font-normal min-w-[160px]">
              Hábito
            </th>
            {allDays.map(day => {
              const ds = dateStr(year, month, day)
              const isToday = ds === todayStr
              const dow = new Date(year, month - 1, day).getDay()
              const letter = ["D", "L", "M", "X", "J", "V", "S"][dow]
              const isMon = dow === 1 && day > 1
              return (
                <th
                  key={day}
                  className={`border-b border-zinc-800 w-9 py-1 text-center
                    ${isToday ? "bg-blue-500/10" : ""}
                    ${isMon ? "border-l border-l-zinc-700" : ""}`}
                >
                  <div className={`text-[10px] ${isToday ? "text-blue-400" : "text-zinc-600"}`}>{letter}</div>
                  <div className={`text-xs font-semibold ${isToday ? "text-blue-400" : "text-zinc-300"}`}>{day}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {habits.map((habit, idx) => (
            <tr key={habit.id} className={idx % 2 === 0 ? "" : "bg-zinc-900/20"}>
              <td className="sticky left-0 z-10 bg-[var(--sticky-bg)] border-b border-slate-700/25 px-3 py-1">
                <span className="text-sm text-zinc-200 whitespace-nowrap">{habit.name}</span>
              </td>
              {allDays.map(day => {
                const ds = dateStr(year, month, day)
                const isToday = ds === todayStr
                const isPast = ds <= todayStr
                const dow = new Date(year, month - 1, day).getDay()
                const isMon = dow === 1 && day > 1
                return (
                  <td
                    key={day}
                    className={`border-b border-slate-700/25 py-1
                      ${isToday ? "bg-blue-500/5" : ""}
                      ${isMon ? "border-l border-l-zinc-700" : ""}`}
                  >
                    <div className="flex justify-center">
                      <HabitCell
                        state={matrix[ds]?.[habit.id] as any}
                        isToday={isToday}
                        isPast={isPast}
                        onCycle={() => onCycle(ds, habit.id)}
                        size="sm"
                      />
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          {/* Mood row */}
          <tr className="border-t border-zinc-700/50">
            <td className="sticky left-0 z-10 bg-[var(--sticky-bg)] px-3 py-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider whitespace-nowrap">Ánimo</span>
            </td>
            {allDays.map(day => {
              const ds = dateStr(year, month, day)
              const isPast = ds <= todayStr
              const dow = new Date(year, month - 1, day).getDay()
              const isMon = dow === 1 && day > 1
              return (
                <td
                  key={day}
                  className={`py-1 ${isMon ? "border-l border-l-zinc-700" : ""}`}
                >
                  <div className="flex justify-center">
                    <MoodCell
                      level={moodMap[ds]}
                      isPast={isPast}
                      onOpen={(e) => onMoodOpen(ds, e)}
                    />
                  </div>
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Habit Manager Modal ───────────────────────────────────────────────────────

function HabitManagerModal({
  habits, onClose, onAdd, onRename, onDelete,
}: {
  habits: Habit[]
  onClose: () => void
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [newName, setNewName] = useState("")
  const [apiError, setApiError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  async function handleAdd() {
    if (!newName.trim()) return
    setApiError("")
    try {
      await onAdd(newName.trim())
      setNewName("")
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Error")
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return
    await onRename(id, editName.trim())
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="gc w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/40">
          <h2 className="font-semibold text-sm">Gestionar Hábitos</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={18}/>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
              placeholder="Nuevo hábito..."
              className="flex-1 bg-zinc-800 rounded-xl px-3 py-2 text-sm outline-none placeholder-zinc-500 focus:ring-1 focus:ring-green-500/50"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-9 h-9 bg-green-500 hover:bg-green-400 disabled:opacity-30 rounded-xl flex items-center justify-center transition-colors shrink-0"
            >
              <Plus size={16} className="text-black"/>
            </button>
          </div>
          {apiError && <p className="text-xs text-red-400 mt-1.5">{apiError}</p>}
        </div>

        <div className="max-h-64 overflow-y-auto">
          {habits.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-6">Sin hábitos aún</p>
          ) : (
            habits.map((h, idx) => (
              <div key={h.id} className={`flex items-center gap-2 px-4 py-2.5 ${idx < habits.length - 1 ? "border-b border-slate-700/25" : ""}`}>
                {editingId === h.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(h.id); if (e.key === "Escape") setEditingId(null) }}
                      className="flex-1 bg-zinc-800 rounded-lg px-2 py-1 text-sm outline-none"
                    />
                    <button onClick={() => handleRename(h.id)} className="text-green-400 p-1"><Check size={15}/></button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-500 p-1"><X size={15}/></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-zinc-200">{h.name}</span>
                    <button onClick={() => { setEditingId(h.id); setEditName(h.name) }}
                      className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors">
                      <Pencil size={14}/>
                    </button>
                    <button onClick={() => onDelete(h.id)}
                      className="text-zinc-500 hover:text-red-400 p-1 transition-colors">
                      <Trash2 size={14}/>
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HabitTrackerPage() {
  const now = new Date()
  const today = toISODate(now)

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [habits, setHabits] = useState<Habit[]>([])
  const [matrix, setMatrix] = useState<RecordMatrix>({})
  const [loading, setLoading] = useState(true)
  const [streakData, setStreakData] = useState({ streak_current: 0, streak_best: 0 })
  const [monthPct, setMonthPct] = useState(0)
  const [prevMonthPct, setPrevMonthPct] = useState(0)
  const [view, setView] = useState<"weekly" | "monthly">("weekly")
  const [moodMap, setMoodMap] = useState<Record<string, number>>({})
  const [picker, setPicker] = useState<string | null>(null)
  const [habitModal, setHabitModal] = useState(false)

  // Auto-detecta vista según ancho. Se actualiza al redimensionar.
  useEffect(() => {
    function detect() {
      setView(window.innerWidth >= 768 ? "monthly" : "weekly")
    }
    detect()
    window.addEventListener("resize", detect)
    return () => window.removeEventListener("resize", detect)
  }, [])

  // Load data
  const load = useCallback(async () => {
    setLoading(true)
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    const [h, records, monthRes, prevMonthRes, streakRes, moodData] = await Promise.all([
      getHabits(),
      getMonthAll(year, month),
      getMonthSummary(year, month),
      getMonthSummary(prevY, prevM),
      getStreak(),
      getMonthMood(year, month).catch(() => ({} as Record<string, number>)),
    ])
    setHabits(h)
    const m: RecordMatrix = {}
    for (const r of records) {
      if (!m[r.date]) m[r.date] = {}
      m[r.date][r.habit_id] = r.state
    }
    setMatrix(m)
    setMoodMap(moodData)
    setMonthPct(monthRes.pct)
    setPrevMonthPct(prevMonthRes.pct)
    setStreakData(streakRes)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1)
  }

  function nextState(s: string | undefined): string | undefined {
    if (s === undefined) return 'done'
    if (s === 'done') return 'rest'
    if (s === 'rest') return 'failed'
    return undefined
  }

  async function handleCycle(ds: string, habitId: string) {
    const current = matrix[ds]?.[habitId]
    const next = nextState(current)
    setMatrix(prev => {
      const updated = { ...prev, [ds]: { ...(prev[ds] ?? {}) } }
      if (next === undefined) delete updated[ds][habitId]
      else updated[ds][habitId] = next
      return updated
    })
    try {
      await setRecord(ds, habitId, next ?? null)
    } catch (err) {
      console.error("Error guardando registro:", err)
      load()
    }
  }

  async function handleAddHabit(name: string) {
    await createHabit(name)
    await load()
  }

  async function handleRenameHabit(id: string, name: string) {
    await updateHabit(id, { name })
    await load()
  }

  async function handleDeleteHabit(id: string) {
    await deleteHabit(id)
    await load()
  }

  function openMoodPicker(date: string, e: React.MouseEvent) {
    e.stopPropagation()
    setPicker(date)
  }

  async function handleMoodSelect(level: number) {
    if (!picker) return
    const date = picker
    setPicker(null)
    setMoodMap(prev => {
      const updated = { ...prev }
      if (level === 0) delete updated[date]
      else updated[date] = level
      return updated
    })
    try {
      await setMood(date, level)
    } catch (err) {
      console.error("Error guardando ánimo:", err)
      load()
    }
  }

  const weeks = getWeeks(year, month)

  // ── Insights ──
  const todayDate = new Date()
  const daysElapsed = (year === todayDate.getFullYear() && month === todayDate.getMonth() + 1)
    ? todayDate.getDate()
    : daysInMonth(year, month)
  const habitPcts = habits.map(h => {
    const done = Object.values(matrix).filter(dayRec => dayRec[h.id] === 'done').length
    return { id: h.id, name: h.name, pct: daysElapsed > 0 ? Math.round(done / daysElapsed * 100) : 0 }
  })
  const bestHabit = habitPcts.length > 0 ? habitPcts.reduce((a, b) => a.pct >= b.pct ? a : b) : null
  const diffPct = Math.round(monthPct - prevMonthPct)

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Sticky header */}
      <div className="sticky top-[128px] z-20 bg-[var(--sticky-bg)] border-b border-slate-700/40 px-4 pt-2 pb-2">

        {/* 3 cards */}
        <div className="grid grid-cols-3 gap-2 mb-2">

          {/* Mes */}
          <div className="rounded-lg px-1.5 py-1.5 flex flex-col items-center gap-0.5 bg-zinc-800/50 border border-slate-700/30">
            <div className="flex items-center justify-between w-full">
              <button onClick={prevMonth} className="p-0.5 rounded hover:bg-zinc-700 transition-colors text-zinc-400">
                <ChevronLeft size={10}/>
              </button>
              <span className="text-[10px] font-bold text-zinc-200 leading-none">
                {MONTHS[month - 1].slice(0, 3)} {String(year).slice(2)}
              </span>
              <button onClick={nextMonth} className="p-0.5 rounded hover:bg-zinc-700 transition-colors text-zinc-400">
                <ChevronRight size={10}/>
              </button>
            </div>
            <p className="text-[8px] text-zinc-600 leading-none">Período</p>
          </div>

          {/* Índice de Resiliencia */}
          <div className={`rounded-lg px-2 py-1.5 flex flex-col gap-0.5
            ${streakData.streak_current > 0 ? "bg-amber-500/10 border border-amber-500/25" : "bg-zinc-800/50 border border-slate-700/30"}`}>
            <div className="flex items-center gap-1">
              <Flame size={11} className={streakData.streak_current > 0 ? "text-amber-400" : "text-zinc-500"}/>
              <span className={`text-sm font-bold tabular-nums leading-none ${streakData.streak_current > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                {streakData.streak_current}
              </span>
            </div>
            <p className="text-[8px] text-zinc-500 leading-none">Índice Resiliencia</p>
          </div>

          {/* vs mes anterior */}
          <div className={`rounded-lg px-2 py-1.5 flex flex-col gap-0.5
            ${diffPct >= 0 ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            <div className="flex items-center gap-1">
              {diffPct >= 0
                ? <TrendingUp size={11} className="text-green-400"/>
                : <TrendingDown size={11} className="text-red-400"/>}
              <span className={`text-sm font-bold tabular-nums leading-none ${diffClass(diffPct)}`}>
                {diffPct >= 0 ? "+" : ""}{diffPct}%
              </span>
            </div>
            <p className="text-[8px] text-zinc-500 leading-none">vs mes anterior</p>
          </div>
        </div>

      </div>

      {/* Tendencia del mes */}
      {!loading && habits.length > 0 && (
        <div className="mx-4 mt-3 gc p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Tendencia del mes
            </p>
            <span className="text-[10px] text-zinc-600">{MONTHS[month - 1]} {year}</span>
          </div>
          <MonthlyEKGChart
            matrix={matrix}
            habitCount={habits.length}
            year={year}
            month={month}
            todayStr={today}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="p-4 pt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 bg-zinc-900 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : habits.length === 0 ? (
        <div className="text-center text-zinc-500 mt-20 px-6">
          <p className="text-lg">Sin hábitos configurados</p>
          <button
            onClick={() => setHabitModal(true)}
            className="mt-3 flex items-center gap-1.5 mx-auto text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <Plus size={15}/> Crear primer hábito
          </button>
        </div>
      ) : (
        <>
        <div className="px-4 pt-3 pb-1"><SuggestedTaskCard/></div>
        {view === "weekly" ? (
        <div className="mt-2">
        <WeeklyView
          weeks={weeks}
          habits={habits}
          matrix={matrix}
          moodMap={moodMap}
          year={year}
          month={month}
          todayStr={today}
          onCycle={handleCycle}
          onMoodOpen={openMoodPicker}
        />
        </div>
        ) : (
        <div className="mt-2">
        <MonthlyView
          habits={habits}
          matrix={matrix}
          moodMap={moodMap}
          year={year}
          month={month}
          todayStr={today}
          onCycle={handleCycle}
          onMoodOpen={openMoodPicker}
        />
        </div>
        )}
        </>
      )}

      <div className="pb-10"/>

      {/* FAB */}
      <button
        onClick={() => setHabitModal(true)}
        className="fixed bottom-24 right-4 w-12 h-12 bg-green-500 hover:bg-green-400 active:scale-95 rounded-full flex items-center justify-center shadow-lg shadow-green-500/25 z-30 transition-all"
      >
        <Plus size={20} className="text-black"/>
      </button>

      {picker && (
        <MoodPicker
          onSelect={handleMoodSelect}
          onClose={() => setPicker(null)}
        />
      )}

      {habitModal && (
        <HabitManagerModal
          habits={habits}
          onClose={() => setHabitModal(false)}
          onAdd={handleAddHabit}
          onRename={handleRenameHabit}
          onDelete={handleDeleteHabit}
        />
      )}
    </div>
  )
}
