"use client"

import { useEffect, useState, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getMonthStats, getRecovery, getStreak, getMoodAvg, MonthStats, RecoveryStats } from "@/lib/api"
import { MONTHS } from "@/lib/utils"
import { semanticColor, semanticClass, recoveryColor } from "@/lib/color"

// ── Donut chart (Canvas 2D puro) ──────────────────────────────────────────────

function DonutChart({ data, colors, size = 130, cutout = 0.75 }: {
  data: number[]
  colors: string[]
  size?: number
  cutout?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const cx = size / 2, cy = size / 2, r = size / 2 - 4
    const inner = r * cutout
    const total = data.reduce((a, b) => a + b, 0)
    ctx.clearRect(0, 0, size, size)
    if (total === 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.arc(cx, cy, inner, Math.PI * 2, 0, true)
      ctx.closePath()
      ctx.fillStyle = "#27272a"
      ctx.fill()
      return
    }
    let start = -Math.PI / 2
    data.forEach((val, i) => {
      if (val === 0) return
      const sweep = (val / total) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + r * Math.cos(start), cy + r * Math.sin(start))
      ctx.arc(cx, cy, r, start, start + sweep)
      ctx.arc(cx, cy, inner, start + sweep, start, true)
      ctx.closePath()
      ctx.fillStyle = colors[i]
      ctx.fill()
      start += sweep
    })
  }, [data, colors, size, cutout])
  return <canvas ref={ref} width={size} height={size} style={{ display: "block" }} />
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [stats, setStats]     = useState<MonthStats | null>(null)
  const [prevStats, setPrev]  = useState<MonthStats | null>(null)
  const [recovery, setRecovery] = useState<RecoveryStats | null>(null)
  const [streak, setStreak]   = useState({ streak_current: 0, streak_best: 0 })
  const [moodAvg, setMoodAvg] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStreak().then(setStreak)
    getRecovery().then(setRecovery)
  }, [])

  useEffect(() => {
    setLoading(true)
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    Promise.all([
      getMonthStats(year, month),
      getMonthStats(prevY, prevM),
      getMoodAvg(year, month),
    ]).then(([s, p, mood]) => {
      setStats(s)
      setPrev(p)
      setMoodAvg(mood.avg)
      setLoading(false)
    })
  }, [year, month])

  function prevMonth() { month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function nextMonth() { month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1) }

  const pct     = stats?.fulfillment_pct ?? 0
  const prevPct = prevStats?.fulfillment_pct ?? 0
  const diff    = Math.round(pct - prevPct)
  const prevMonthLabel = MONTHS[month === 1 ? 11 : month - 2].slice(0, 3)

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">

      {/* Header */}
      <div className="px-4 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40
        flex items-center justify-between sticky top-[128px] z-10">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
          <ChevronLeft size={20}/>
        </button>
        <h2 className="text-lg font-bold">{MONTHS[month - 1]} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-zinc-800 transition-colors">
          <ChevronRight size={20}/>
        </button>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-zinc-900 rounded-2xl animate-pulse"/>)}
        </div>
      ) : (
        <div className="p-4 space-y-3">

          {/* ── Card 1: Tasa de cumplimiento ── */}
          <div className="gc p-4">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Tasa de cumplimiento</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className={`text-5xl font-bold tabular-nums leading-none ${semanticClass(pct)}`}>
                  {pct}<span className="text-2xl">%</span>
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  {stats?.fulfillment_done} de {stats?.fulfillment_possible} posibles
                </p>
                <div className="mt-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border
                    ${diff >= 0
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                    {diff >= 0 ? "+" : ""}{diff}% vs {prevMonthLabel}
                  </span>
                </div>
              </div>
              <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
                <DonutChart
                  data={[stats?.fulfillment_done ?? 0, stats?.fulfillment_rest ?? 0, stats?.fulfillment_failed ?? 0]}
                  colors={[semanticColor(pct), "#334155", "#ef4444"]}
                  size={130}
                  cutout={0.78}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`text-lg font-bold tabular-nums ${semanticClass(pct)}`}>{pct}%</span>
                  <span className="text-[9px] text-zinc-500">{MONTHS[month - 1].slice(0, 3)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-4 pt-3 border-t border-slate-700/30">
              {[
                { color: "bg-green-500", label: "Completados", val: stats?.fulfillment_done },
                { color: "bg-slate-500", label: "Descanso",    val: stats?.fulfillment_rest },
                { color: "bg-red-500",   label: "Fallados",    val: stats?.fulfillment_failed },
              ].map(({ color, label, val }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className={`w-2 h-2 rounded-full ${color} inline-block`}/>
                  {label} <span className="font-semibold text-zinc-200 ml-1">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Grid 2 col: Días del mes + Recuperación ── */}
          <div className="grid grid-cols-2 gap-3">

            {/* Días del mes */}
            <div className="gc p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Días del mes</p>
              <div className="flex items-center gap-3">
                <div className="relative shrink-0" style={{ width: 90, height: 90 }}>
                  <DonutChart
                    data={[stats?.perfect_days ?? 0, stats?.partial_days ?? 0, stats?.empty_days ?? 0]}
                    colors={["#22c55e", "#fb923c", "#1e293b"]}
                    size={90}
                    cutout={0.72}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-sm font-bold text-zinc-100">{stats?.perfect_days}</span>
                    <span className="text-[8px] text-zinc-500">perf.</span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  {[
                    { dot: "bg-green-500",  label: "Perfectos", val: stats?.perfect_days },
                    { dot: "bg-amber-400",  label: "Parciales", val: stats?.partial_days },
                    { dot: "bg-slate-700",  label: "Vacíos",    val: stats?.empty_days   },
                  ].map(({ dot, label, val }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block shrink-0`}/>
                      <span className="flex-1">{label}</span>
                      <span className="font-semibold text-zinc-200">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recuperación */}
            <div className="gc p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Recuperación</p>
              {recovery && recovery.episodes > 0 ? (
                <>
                  <p className="text-2xl font-bold tabular-nums leading-none"
                    style={{ color: recoveryColor(recovery.avg) }}>
                    {recovery.avg}<span className="text-sm font-normal text-zinc-500"> días</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 mb-3">promedio tras fallar</p>
                  <div className="flex gap-1.5">
                    {[
                      { label: "mejor", val: recovery.best,  color: "#22c55e" },
                      { label: "típico", val: recovery.avg,  color: recoveryColor(recovery.avg) },
                      { label: "peor",  val: recovery.worst, color: "#ef4444" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex-1 bg-zinc-900/60 border border-slate-700/40 rounded-lg p-1.5 text-center">
                        <p className="text-sm font-bold" style={{ color }}>{val}d</p>
                        <p className="text-[9px] text-zinc-600 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-600 mt-2">Sin datos aún</p>
              )}
            </div>
          </div>

          {/* ── Mini stats: Racha · Mejor racha · Ánimo ── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="gc p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Racha</p>
              <p className={`text-2xl font-bold tabular-nums ${streak.streak_current > 0 ? "text-green-400" : "text-zinc-500"}`}>
                {streak.streak_current}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">días seguidos</p>
            </div>
            <div className="gc p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Mejor racha</p>
              <p className="text-2xl font-bold tabular-nums text-zinc-200">{streak.streak_best}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">histórico</p>
            </div>
            <div className="gc p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Ánimo prom.</p>
              <p className="text-2xl font-bold tabular-nums text-amber-400">
                {moodAvg !== null ? moodAvg : "—"}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">este mes</p>
            </div>
          </div>

          {/* ── Consistencia por hábito ── */}
          {stats && stats.habit_consistency.length > 0 && (
            <div className="gc p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-4">Consistencia por hábito</p>
              <div className="space-y-3">
                {stats.habit_consistency.map(h => (
                  <div key={h.id} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 w-28 truncate shrink-0">{h.name}</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${h.pct}%`, backgroundColor: semanticColor(h.pct) }}/>
                    </div>
                    <span className="text-xs font-semibold w-9 text-right shrink-0"
                      style={{ color: semanticColor(h.pct) }}>{h.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Comparación vs mes anterior ── */}
          {prevStats && (
            <div className="gc p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
                Vs {prevMonthLabel}
              </p>
              {[
                { label: "Tasa de cumplimiento", cur: `${pct}%`,              diff: diff,                                                           unit: "%" },
                { label: "Días perfectos",        cur: `${stats?.perfect_days}`, diff: (stats?.perfect_days ?? 0) - (prevStats?.perfect_days ?? 0), unit: "d" },
                { label: "Mejor racha",           cur: `${streak.streak_best}d`, diff: null,                                                        unit: ""  },
                { label: "Recuperación prom.",    cur: recovery?.episodes ? `${recovery.avg}d` : "—", diff: null,                                   unit: ""  },
                { label: "Hábito más débil",      cur: stats?.habit_consistency.at(-1)?.name ?? "—",  diff: null,                                   unit: ""  },
              ].map(({ label, cur, diff: d, unit }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-slate-700/25 last:border-0">
                  <span className="text-xs text-zinc-400">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200">{cur}</span>
                    {d !== null && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border
                        ${d >= 0
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                        {d >= 0 ? "+" : ""}{d}{unit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
