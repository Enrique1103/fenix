"use client"

import { useState, useEffect } from "react"
import { Bell, Flame, Star, Trophy } from "lucide-react"
import { getHabits, getDayRecords, getWeeklyTrend, getAchievements, upsertAchievement } from "@/lib/api"
import { Habit, DayRecords } from "@/lib/types"

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

interface Achievement {
  id: string
  Icon: React.ElementType
  color: string
  bg: string
  title: string
  sub: string
  type: string
  date: string
  meta?: Record<string, unknown>
}

async function detectTodayAchievements(): Promise<Achievement[]> {
  const [habits, trend] = await Promise.all([
    getHabits(),
    getWeeklyTrend(),
  ])

  const today = getToday()
  let records: DayRecords = {}
  try { records = await getDayRecords(today) } catch { /* no records yet today */ }

  const active = habits.filter((h: Habit) => h.active)
  const list: Achievement[] = []

  // ── Día perfecto hoy ──────────────────────────────────────────────────────
  if (active.length > 0) {
    const allDone = active.every((h: Habit) => records[h.id] === "done")
    if (allDone) {
      list.push({
        id: `perfect_day_${today}`,
        type: "perfect_day",
        date: today,
        meta: { habit_count: active.length },
        Icon: Star,
        color: "text-green-400",
        bg: "bg-green-500/10",
        title: "Día perfecto",
        sub: `Completaste los ${active.length} hábito${active.length > 1 ? "s" : ""} del día.`,
      })
    }
  }

  // ── Racha semanal (semanas con ≥ 80 %) ───────────────────────────────────
  if (trend.length > 0) {
    const best = trend.reduce((a, b) => (a.pct >= b.pct ? a : b))
    if (best.pct >= 80) {
      list.push({
        id: `best_week_${best.week_start}`,
        type: "best_week",
        date: best.week_start,
        meta: { pct: best.pct },
        Icon: Flame,
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        title: `Semana de ${best.pct}%`,
        sub: `Tu mejor semana reciente fue del ${best.week_start}.`,
      })
    }

    const lastFull = trend.filter(w => w.pct === 100)
    if (lastFull.length >= 2) {
      list.push({
        id: `two_perfect_weeks`,
        type: "two_perfect_weeks",
        date: today,
        meta: { count: lastFull.length },
        Icon: Trophy,
        color: "text-yellow-400",
        bg: "bg-yellow-500/10",
        title: "Dos semanas perfectas",
        sub: `Lograste 100% de cumplimiento en ${lastFull.length} semanas recientes.`,
      })
    }
  }

  return list
}

function iconForType(type: string): React.ElementType {
  const map: Record<string, React.ElementType> = {
    perfect_day:       Star,
    best_week:         Flame,
    two_perfect_weeks: Trophy,
  }
  return map[type] ?? Bell
}

function styleForType(type: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    perfect_day:       { color: "text-green-400",  bg: "bg-green-500/10"  },
    best_week:         { color: "text-orange-400", bg: "bg-orange-500/10" },
    two_perfect_weeks: { color: "text-yellow-400", bg: "bg-yellow-500/10" },
  }
  return map[type] ?? { color: "text-zinc-400", bg: "bg-zinc-800" }
}

function labelForRecord(type: string, meta: Record<string, unknown> | null): { title: string; sub: string } {
  switch (type) {
    case "perfect_day":
      return { title: "Día perfecto", sub: `Completaste los ${meta?.habit_count ?? "?"} hábitos del día.` }
    case "best_week":
      return { title: `Semana de ${meta?.pct ?? "?"}%`, sub: "Tu mejor semana reciente." }
    case "two_perfect_weeks":
      return { title: "Dos semanas perfectas", sub: `${meta?.count ?? "?"} semanas al 100%.` }
    default:
      return { title: type, sub: "" }
  }
}

export default function NotificationsPage() {
  const [items,   setItems]   = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = getToday()

    async function load() {
      // 1. Detectar logros de hoy y persistirlos
      const todayAchievements = await detectTodayAchievements()
      await Promise.all(
        todayAchievements.map(a =>
          upsertAchievement({ type: a.type, date: a.date, meta: a.meta }).catch(() => {})
        )
      )

      // 2. Cargar historial desde backend (últimos 30 días)
      const records = await getAchievements()

      // 3. Combinar: mostrar logros de hoy primero (fresh), luego histórico sin duplicar
      const todayIds = new Set(todayAchievements.map(a => `${a.type}_${a.date}`))
      const historicItems: Achievement[] = records
        .filter(r => !todayIds.has(`${r.type}_${r.date}`))
        .map(r => {
          const { color, bg } = styleForType(r.type)
          const { title, sub } = labelForRecord(r.type, r.meta)
          return {
            id: `${r.type}_${r.date}_${r.id}`,
            type: r.type,
            date: r.date,
            Icon: iconForType(r.type),
            color, bg, title,
            sub: r.date !== today ? `${r.date} · ${sub}` : sub,
          }
        })

      setItems([...todayAchievements, ...historicItems])
      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 pb-8">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40 sticky top-[128px] z-10">
        <h1 className="text-lg font-bold">Notificaciones</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Logros y actividad reciente</p>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-900 rounded-2xl animate-pulse"/>)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-10 gap-2">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center mb-1">
              <Bell size={22} className="text-zinc-600"/>
            </div>
            <p className="text-sm font-medium text-zinc-400">Sin logros por ahora</p>
            <p className="text-xs text-zinc-600 max-w-[260px]">
              Completa tus hábitos hoy para ver tu progreso reflejado aquí.
            </p>
          </div>
        ) : (
          items.map(({ id, Icon, color, bg, title, sub }) => (
            <div key={id} className="gc p-4 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon size={20} className={color}/>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-200">{title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
