"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Flame } from "lucide-react"
import {
  getHabits, getMonthSummary, getMonthByHabit,
  getMonthAll, getWeekdayAvg, getMonthlyTrend, getTasks, getStreak,
} from "@/lib/api"
import { Habit, Task } from "@/lib/types"
import { MONTHS, daysInMonth } from "@/lib/utils"
import { TrendChart } from "@/components/trend-chart"
import { WeekdayChart } from "@/components/weekday-chart"
import { MonthlyEKGChart } from "@/components/monthly-ekg-chart"

type RecordMatrix = Record<string, Record<string, string>>

// ── 10 estados FÉNIX ─────────────────────────────────────────────────────────

const FENIX_STATES = [
  { min: 95, emoji: "🌟", label: "FÉNIX pleno",           color: "#fb923c" },
  { min: 85, emoji: "🔥", label: "Fuego intenso",         color: "#ef4444" },
  { min: 75, emoji: "🔥", label: "Fuego vivo",            color: "#f97316" },
  { min: 65, emoji: "🔥", label: "Fueguito",              color: "#f97316" },
  { min: 55, emoji: "✨", label: "Brasa encendida",       color: "#eab308" },
  { min: 45, emoji: "✨", label: "Primera chispa",        color: "#ca8a04" },
  { min: 35, emoji: "💫", label: "Cenizas encendiéndose", color: "#a3a3a3" },
  { min: 25, emoji: "🌫️", label: "Cenizas con humo",     color: "#71717a" },
  { min: 10, emoji: "⚫", label: "Cenizas frías",         color: "#52525b" },
  { min: 0,  emoji: "💨", label: "Solo humo",             color: "#3f3f46" },
]

function getFenixState(pct: number) {
  return FENIX_STATES.find(s => pct >= s.min) ?? FENIX_STATES[FENIX_STATES.length - 1]
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)

  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [habits, setHabits]           = useState<Habit[]>([])
  const [summary, setSummary]         = useState<Record<string, number>>({})
  const [monthPct, setMonthPct]       = useState(0)
  const [habitStats, setHabitStats]   = useState<Record<string, number>>({})
  const [weekdayAvg, setWeekdayAvg]   = useState<Record<string, number>>({})
  const [matrix, setMatrix]           = useState<RecordMatrix>({})
  const [monthlyTrend, setMonthlyTrend] = useState<{ label: string; pct: number }[]>([])
  const [tasks, setTasks]             = useState<Task[]>([])
  const [streakData, setStreakData]   = useState({ streak_current: 0, streak_best: 0 })
  const [loading, setLoading]         = useState(true)

  // Carga global — una sola vez
  useEffect(() => {
    getMonthlyTrend().then(setMonthlyTrend)
    getTasks().then(setTasks)
    getStreak().then(setStreakData)
  }, [])

  // Carga mensual — se actualiza al cambiar mes
  useEffect(() => {
    setLoading(true)
    Promise.all([
      getHabits(),
      getMonthSummary(year, month),
      getMonthByHabit(year, month),
      getWeekdayAvg(3),
      getMonthAll(year, month),
    ]).then(([h, monthRes, hs, wd, monthAll]) => {
      setHabits(h)
      setSummary(monthRes.summary)
      setMonthPct(monthRes.pct)
      setHabitStats(hs)
      setWeekdayAvg(wd)
      const m: RecordMatrix = {}
      for (const r of monthAll) {
        if (!m[r.date]) m[r.date] = {}
        m[r.date][String(r.habit_id)] = r.state
      }
      setMatrix(m)
      setLoading(false)
    })
  }, [year, month])

  function prevMonth() { month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function nextMonth() { month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1) }

  // ── Métricas ──
  const days        = daysInMonth(year, month)
  const total       = habits.length
  const currentStreak = streakData.streak_current
  const bestStreak    = streakData.streak_best
  const perfectDays = total > 0 ? Object.values(summary).filter(c => c >= total).length : 0

  const habitPcts  = habits.map(h => ({ name: h.name, pct: days ? Math.round((habitStats[h.id] ?? 0) / days * 100) : 0 }))
  const bestHabit  = habitPcts.length ? habitPcts.reduce((a, b) => a.pct >= b.pct ? a : b) : null
  const worstHabit = habitPcts.length ? habitPcts.reduce((a, b) => a.pct <= b.pct ? a : b) : null

  const wdValues  = Array.from({ length: 7 }, (_, i) => weekdayAvg[String(i)] ?? 0)
  const bestWdIdx = wdValues.indexOf(Math.max(...wdValues))
  const DAYS_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

  // Eficiencia de tareas (todas, no solo del mes)
  const totalTasks     = tasks.length
  const completedTasks = tasks.filter(t => t.completed).length
  const taskEff        = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : null

  const fenix = getFenixState(monthPct)

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">

      {/* Header */}
      <div className="px-5 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40
        flex items-center justify-between sticky top-[128px] z-10">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
          <ChevronLeft size={20}/>
        </button>
        <h2 className="text-lg font-bold tracking-tight">{MONTHS[month - 1]} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
          <ChevronRight size={20}/>
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Tendencia histórica mes a mes ── */}
        {monthlyTrend.length >= 2 && (
          <div className="gc p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                Tendencia histórica
              </p>
              <span className="text-[10px] text-zinc-600">{monthlyTrend.length} meses</span>
            </div>
            <p className="text-xs text-zinc-600 mb-3">% completado por mes</p>
            <TrendChart data={monthlyTrend} showAllLabels/>
          </div>
        )}

        {/* ── EKG del mes seleccionado ── */}
        {!loading && habits.length > 0 && (
          <div className="gc p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                {MONTHS[month - 1]} {year} · día a día
              </p>
              <span className="text-[10px] font-bold" style={{ color: fenix.color }}>{monthPct}%</span>
            </div>
            <MonthlyEKGChart
              matrix={matrix as any}
              habitCount={total}
              year={year}
              month={month}
              todayStr={today}
            />
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-zinc-900 rounded-2xl animate-pulse"/>)}
          </div>
        ) : (
          <>
            {/* ── Estado FÉNIX + Eficiencia ── */}
            <div className="grid grid-cols-2 gap-3">

              {/* Estado */}
              <div className="gc p-4">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Estado</p>
                <div className="flex items-center gap-2">
                  <span className="text-3xl leading-none">{fenix.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-snug" style={{ color: fenix.color }}>
                      {fenix.label}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{monthPct}% este mes</p>
                  </div>
                </div>
              </div>

              {/* Eficiencia o racha */}
              {taskEff !== null ? (
                <div className="gc p-4">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Eficiencia</p>
                  <p className={`text-3xl font-bold tabular-nums leading-none
                    ${taskEff >= 70 ? "text-green-400" : taskEff >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                    {taskEff}%
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1">{completedTasks}/{totalTasks} tareas</p>
                </div>
              ) : (
                <div className="gc p-4">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Racha</p>
                  <div className="flex items-center gap-1.5">
                    <Flame size={18} className={currentStreak > 0 ? "text-amber-400" : "text-zinc-600"}/>
                    <p className={`text-3xl font-bold tabular-nums leading-none
                      ${currentStreak > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                      {currentStreak}
                    </p>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">días consecutivos</p>
                </div>
              )}
            </div>

            {/* ── 3 mini stats ── */}
            <div className="grid grid-cols-3 gap-2">
              <div className="gc p-3 text-center">
                <p className={`text-xl font-bold tabular-nums ${currentStreak > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                  {currentStreak}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1">Racha</p>
              </div>
              <div className="gc p-3 text-center">
                <p className="text-xl font-bold tabular-nums text-green-400">{perfectDays}</p>
                <p className="text-[10px] text-zinc-500 mt-1">Días perfectos</p>
              </div>
              <div className="gc p-3 text-center">
                <p className="text-xl font-bold tabular-nums text-blue-400">{bestStreak}</p>
                <p className="text-[10px] text-zinc-500 mt-1">Mejor racha</p>
              </div>
            </div>

            {/* ── Por día de semana ── */}
            {wdValues.some(v => v > 0) && (
              <div className="gc p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                    Por día de semana
                  </p>
                  <span className="text-xs text-green-400 font-medium">{DAYS_FULL[bestWdIdx]}</span>
                </div>
                <WeekdayChart data={weekdayAvg}/>
                <p className="text-[10px] text-zinc-600 mt-2 text-center">Promedio últimos 3 meses</p>
              </div>
            )}

            {/* ── Hábitos destacados ── */}
            {bestHabit && worstHabit && bestHabit.name !== worstHabit.name && (
              <div className="gc p-4">
                <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-4">
                  Hábitos
                </p>
                {[
                  { arrow: "↑ Mejor",   color: "text-green-400", barColor: "#22c55e", ...bestHabit },
                  { arrow: "↓ Difícil", color: "text-red-400",   barColor: "#ef4444", ...worstHabit },
                ].map(({ arrow, color, barColor, name, pct }) => (
                  <div key={arrow} className="mb-4 last:mb-0">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${color}`}>{arrow}</span>
                        <span className="text-sm text-zinc-200 truncate max-w-[140px]">{name}</span>
                      </div>
                      <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800/70 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
