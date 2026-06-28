"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Pencil, Trash2, X, Plus, Move, Undo2 } from "lucide-react"
import { Goal } from "@/lib/types"
import { getGoalsGraph, addGoalDep, removeGoalDep } from "@/lib/api"

const STORAGE_KEY    = "fenix_goal_graph_positions_v4"
const DRAG_THRESHOLD = 5
const NODE_W  = 200
const NODE_H  = 68
const COL_GAP = 44
const ROW_GAP = 120

interface Pos { x: number; y: number }

function nodeTheme(type: "action" | "mindset", dark: boolean) {
  if (type === "action") {
    return {
      bg:     dark
        ? "linear-gradient(145deg,rgba(251,146,60,.13),rgba(234,88,12,.07))"
        : "linear-gradient(145deg,rgba(234,88,12,.09),rgba(251,146,60,.04))",
      border: dark ? "#f97316" : "#ea580c",
      text:   dark ? "#fb923c" : "#c2410c",
      glow:   "rgba(249,115,22,.30)",
    }
  }
  return {
    bg:     dark
      ? "linear-gradient(145deg,rgba(139,92,246,.13),rgba(109,40,217,.07))"
      : "linear-gradient(145deg,rgba(124,58,237,.09),rgba(139,92,246,.04))",
    border: dark ? "#8b5cf6" : "#7c3aed",
    text:   dark ? "#a78bfa" : "#6d28d9",
    glow:   "rgba(139,92,246,.30)",
  }
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (y1 + y2) / 2
  if (Math.abs(x1 - x2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const r = Math.max(0, Math.min(10,
    Math.abs(x2 - x1) / 2 - 1,
    Math.abs(mid - y1) - 2,
    Math.abs(y2 - mid) - 2,
  ))
  if (r < 1) return `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`
  const sx = x2 > x1 ? 1 : -1
  const sy = y2 > y1 ? 1 : -1
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${mid - sy * r}`,
    `Q ${x1} ${mid} ${x1 + sx * r} ${mid}`,
    `L ${x2 - sx * r} ${mid}`,
    `Q ${x2} ${mid} ${x2} ${mid + sy * r}`,
    `L ${x2} ${y2}`,
  ].join(' ')
}

function computeLayout(
  goals: Goal[],
  deps:  { goal_id: number; depends_on_goal_id: number }[],
  saved: Record<number, Pos>
): Record<number, Pos> {
  const goalIds = new Set(goals.map(g => g.id))

  // Final goals (sinks) at level 0 = TOP; prerequisites cascade downward
  const level: Record<number, number> = {}
  goals.forEach(g => { level[g.id] = 0 })
  for (let iter = 0; iter < goals.length; iter++) {
    let changed = false
    deps.forEach(dep => {
      if (!goalIds.has(dep.goal_id) || !goalIds.has(dep.depends_on_goal_id)) return
      const needed = (level[dep.goal_id] ?? 0) + 1
      if (needed > (level[dep.depends_on_goal_id] ?? 0)) {
        level[dep.depends_on_goal_id] = needed
        changed = true
      }
    })
    if (!changed) break
  }

  const byLevel: Record<number, Goal[]> = {}
  goals.forEach(g => {
    const l = level[g.id] ?? 0
    if (!byLevel[l]) byLevel[l] = []
    byLevel[l].push(g)
  })
  const levelKeys = Object.keys(byLevel).map(Number).sort()

  // Layout adjacency: above = dependents (lower level), below = prerequisites (higher level)
  const above: Record<number, number[]> = {}
  const below: Record<number, number[]> = {}
  goals.forEach(g => { above[g.id] = []; below[g.id] = [] })
  deps.forEach(dep => {
    if (!goalIds.has(dep.goal_id) || !goalIds.has(dep.depends_on_goal_id)) return
    above[dep.depends_on_goal_id].push(dep.goal_id)
    below[dep.goal_id].push(dep.depends_on_goal_id)
  })

  // Barycenter ordering — 3 forward + backward passes
  const col: Record<number, number> = {}
  levelKeys.forEach(l => { byLevel[l].forEach((g, i) => { col[g.id] = i }) })

  function bary(id: number, ns: number[]): number {
    return ns.length === 0 ? (col[id] ?? 0) : avg(ns.map(n => col[n] ?? 0))
  }
  for (let pass = 0; pass < 3; pass++) {
    levelKeys.forEach(l => {
      byLevel[l].sort((a, b) => bary(a.id, above[a.id]) - bary(b.id, above[b.id]))
      byLevel[l].forEach((g, i) => { col[g.id] = i })
    })
    ;[...levelKeys].reverse().forEach(l => {
      byLevel[l].sort((a, b) => bary(a.id, below[a.id]) - bary(b.id, below[b.id]))
      byLevel[l].forEach((g, i) => { col[g.id] = i })
    })
  }

  const result: Record<number, Pos> = {}
  const CANVAS_W = 1100
  levelKeys.forEach((l, rowIndex) => {
    const row  = byLevel[l]
    const rowW = row.length * NODE_W + (row.length - 1) * COL_GAP
    const sx   = Math.max(40, (CANVAS_W - rowW) / 2)
    row.forEach((g, ci) => {
      result[g.id] = saved[g.id] ?? {
        x: sx + ci * (NODE_W + COL_GAP),
        y: 40 + rowIndex * (NODE_H + ROW_GAP),
      }
    })
  })
  return result
}

export function GoalGraph({ goals, onEdit, onComplete, onDelete }: {
  goals:      Goal[]
  onEdit:     (g: Goal) => void
  onComplete: (id: number) => void
  onDelete:   (id: number) => void
}) {
  const [deps, setDeps]             = useState<{ goal_id: number; depends_on_goal_id: number }[]>([])
  const [depsLoaded, setDepsLoaded] = useState(false)
  const [positions, setPositions]   = useState<Record<number, Pos>>({})
  const [selected, setSelected]     = useState<number | null>(null)
  const [connectFrom, setConnectFrom] = useState<number | null>(null)
  const [hoveredDep, setHoveredDep] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [isDark, setIsDark]         = useState(true)
  const [undoData, setUndoData]     = useState<{ goalId: number; depId: number } | null>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const dragRef       = useRef<{ id: number; ox: number; oy: number; sx: number; sy: number } | null>(null)
  const hasMoved      = useRef(false)
  const didDrag       = useRef(false)
  const undoTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Theme detection
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  // Cleanup undo timer on unmount
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  const loadGraph = useCallback(async () => {
    try {
      const data = await getGoalsGraph()
      setDeps(data.deps)
    } catch { /* ignore */ } finally { setDepsLoaded(true) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  useEffect(() => {
    if (goals.length === 0 || !depsLoaded) return
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    setPositions(computeLayout(goals, deps, saved))
  }, [goals, deps, depsLoaded])

  function savePositions(pos: Record<number, Pos>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
    setPositions(pos)
  }

  function beginDrag(id: number, sx: number, sy: number) {
    hasMoved.current = false
    dragRef.current  = { id, ox: positions[id]?.x ?? 0, oy: positions[id]?.y ?? 0, sx, sy }
    setDraggingId(id)
  }

  function onNodePointerDown(e: React.PointerEvent<HTMLDivElement>, id: number) {
    if (e.pointerType !== "mouse" || connectFrom !== null) return
    beginDrag(id, e.clientX, e.clientY)
  }

  function onMoveButtonPointerDown(e: React.PointerEvent<HTMLButtonElement>, id: number) {
    e.stopPropagation(); e.preventDefault()
    if (connectFrom !== null) return
    containerRef.current?.setPointerCapture(e.pointerId)
    beginDrag(id, e.clientX, e.clientY)
  }

  function onContainerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!hasMoved.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      hasMoved.current = true
      try { containerRef.current?.setPointerCapture(e.pointerId) } catch {}
    }
    if (hasMoved.current) setPositions(prev => ({ ...prev, [d.id]: { x: d.ox + dx, y: d.oy + dy } }))
  }

  function onContainerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    const moved = hasMoved.current
    try { containerRef.current?.releasePointerCapture(e.pointerId) } catch {}
    if (moved) {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy
      savePositions({ ...positions, [d.id]: { x: d.ox + dx, y: d.oy + dy } })
      didDrag.current = true
      setTimeout(() => { didDrag.current = false }, 50)
    }
    dragRef.current = null; hasMoved.current = false; setDraggingId(null)
  }

  async function handleNodeClick(id: number) {
    if (didDrag.current) return
    if (connectFrom !== null) {
      if (connectFrom !== id) { await addGoalDep(id, connectFrom); await loadGraph() }
      setConnectFrom(null)
      return
    }
    setSelected(id === selected ? null : id)
  }

  async function handleDisconnect(goalId: number, depId: number) {
    await removeGoalDep(goalId, depId)
    await loadGraph()
    // Undo toast
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoData({ goalId, depId })
    undoTimerRef.current = setTimeout(() => setUndoData(null), 4500)
  }

  async function handleUndo() {
    if (!undoData) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    await addGoalDep(undoData.goalId, undoData.depId)
    await loadGraph()
    setUndoData(null)
  }

  // Canvas sizing
  const posVals = Object.values(positions)
  const canvasH = posVals.length > 0
    ? Math.max(400, Math.max(...posVals.map(p => p.y + NODE_H + 60)))
    : 400

  // Edge geometries — arrow flows from goal (top) down to prerequisite (below)
  const edges = deps.flatMap(dep => {
    const from = positions[dep.goal_id]
    const to   = positions[dep.depends_on_goal_id]
    if (!from || !to) return []
    return [{ dep, key: `${dep.goal_id}-${dep.depends_on_goal_id}`,
      x1: from.x + NODE_W / 2, y1: from.y + NODE_H,
      x2: to.x   + NODE_W / 2, y2: to.y }]
  })

  // Unique junction dots
  const dotSet = new Set<string>()
  edges.forEach(({ x1, y1, x2, y2 }) => {
    dotSet.add(`${Math.round(x1)},${Math.round(y1)}`)
    dotSet.add(`${Math.round(x2)},${Math.round(y2)}`)
  })

  const lineColor = isDark ? "#64748b" : "#94a3b8"
  const dotColor  = isDark ? "#94a3b8" : "#64748b"
  const selectedGoal = goals.find(g => g.id === selected)

  return (
    <div className="relative">

      {/* ── Connect-mode banner ─────────────────────────────────────────────── */}
      {connectFrom !== null && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30
          text-xs text-cyan-400 flex items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="space-y-0.5">
            <p className="font-semibold text-cyan-300">
              ⚡ Conectando desde: <span className="text-white">{goals.find(g => g.id === connectFrom)?.title}</span>
            </p>
            <p className="text-cyan-500/80">
              Tocá la meta que debe completarse <span className="text-cyan-300 font-medium">antes</span> que esta
            </p>
          </div>
          <button onClick={() => setConnectFrom(null)}
            className="shrink-0 p-1 rounded-lg hover:bg-cyan-500/20 transition-colors">
            <X size={13}/>
          </button>
        </div>
      )}

      {/* ── Graph canvas ────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="gc relative w-full overflow-auto"
        style={{ height: canvasH, touchAction: "pan-x pan-y",
          cursor: connectFrom !== null ? "crosshair" : "default" }}
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
        onPointerCancel={onContainerPointerUp}
      >
        {/* SVG: edges + dots */}
        <svg className="absolute inset-0" style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
          {edges.map(({ dep, key, x1, y1, x2, y2 }) => {
            const hovered = hoveredDep === key
            const d       = elbowPath(x1, y1, x2, y2)
            return (
              <g key={key} style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={() => handleDisconnect(dep.goal_id, dep.depends_on_goal_id)}
                onMouseEnter={() => setHoveredDep(key)}
                onMouseLeave={() => setHoveredDep(null)}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={14}/>
                <path d={d} fill="none"
                  stroke={hovered ? "#ef4444" : lineColor}
                  strokeWidth={hovered ? 2 : 1.5}
                  strokeDasharray="5 4"
                  style={{ pointerEvents: "none" }}/>
              </g>
            )
          })}
          {[...dotSet].map(pt => {
            const [cx, cy] = pt.split(',').map(Number)
            return <circle key={pt} cx={cx} cy={cy} r={3.5} fill={dotColor} style={{ pointerEvents: "none" }}/>
          })}
        </svg>

        {/* Nodes */}
        {goals.map(goal => {
          const pos = positions[goal.id]
          if (!pos) return null
          const { bg, border, text, glow } = nodeTheme(goal.goal_type, isDark)
          const isSel        = selected === goal.id
          const isDragging   = draggingId === goal.id
          const isSource     = connectFrom === goal.id
          const isTarget     = connectFrom !== null && connectFrom !== goal.id

          let boxShadow = `0 1px 6px rgba(0,0,0,.15)`
          if (isDragging) boxShadow = "0 12px 32px rgba(0,0,0,.40)"
          else if (isSource) boxShadow = `0 0 0 2px rgba(6,182,212,.6), 0 0 16px rgba(6,182,212,.25)`
          else if (isSel)    boxShadow = `0 0 0 2px rgba(34,197,94,.4), 0 0 12px rgba(34,197,94,.15)`

          return (
            <div
              key={goal.id}
              className={[
                "absolute select-none cursor-pointer rounded-xl overflow-hidden transition-all duration-150",
                isSource ? "ring-2 ring-cyan-400 ring-offset-1" : "",
                isTarget ? "hover:ring-2 hover:ring-cyan-400/60" : "",
                isSource ? "animate-pulse" : "",
              ].join(" ")}
              style={{
                left: pos.x, top: pos.y,
                width: NODE_W, height: NODE_H,
                background: bg,
                border: `1.5px solid ${isSource ? "#22d3ee" : isSel ? "#22c55e" : border}`,
                boxShadow,
                transform: isDragging ? "scale(1.05)" : "scale(1)",
                zIndex: isDragging ? 10 : isSource ? 5 : 1,
              }}
              onPointerDown={e => onNodePointerDown(e, goal.id)}
              onClick={() => handleNodeClick(goal.id)}
            >
              {/* Target highlight overlay */}
              {isTarget && (
                <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-cyan-400/0 hover:ring-cyan-400/40 transition-all pointer-events-none"/>
              )}

              <div className="px-3 py-2 pr-14">
                <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: text }}>
                  {goal.title}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: isDark ? "#64748b" : "#94a3b8" }}>
                  {goal.goal_type === "action" ? "Acción" : "Mentalización"} · {goal.horizon === "short" ? "Corto" : "Largo"}
                </p>
              </div>

              {/* Move handle */}
              <button
                className="absolute top-0 bottom-0 right-[26px] w-6 flex items-center justify-center
                  text-zinc-600 hover:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={e => onMoveButtonPointerDown(e, goal.id)}
                onClick={e => e.stopPropagation()}
              >
                <Move size={10}/>
              </button>

              <div className="absolute top-2 bottom-2 right-[23px] w-px"
                style={{ background: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.10)" }}/>

              {/* Connect button — creates a new dependency edge */}
              <button
                title="Conectar con prerequisito"
                className={[
                  "absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all",
                  connectFrom === goal.id
                    ? "bg-cyan-500/30 text-cyan-300"
                    : "bg-zinc-700/50 hover:bg-cyan-500/25 hover:text-cyan-300 text-zinc-400",
                ].join(" ")}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation()
                  if (connectFrom === goal.id) { setConnectFrom(null); return }
                  setConnectFrom(goal.id); setSelected(null)
                }}>
                <Plus size={9}/>
              </button>
            </div>
          )
        })}

        {/* ── Undo toast (inside canvas, bottom-center) ──────────────────── */}
        {undoData && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20
            flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-xl
            text-xs font-medium
            bg-zinc-900/95 border border-zinc-700/60 text-zinc-300
            animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ backdropFilter: "blur(12px)" }}>
            <span className="text-zinc-400">Conexión eliminada</span>
            <button onClick={handleUndo}
              className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors font-semibold">
              <Undo2 size={11}/> Deshacer
            </button>
            <div className="w-px h-3 bg-zinc-700"/>
            <button onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoData(null) }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <X size={11}/>
            </button>
          </div>
        )}
      </div>

      {/* ── Selected goal detail panel ──────────────────────────────────────── */}
      {selectedGoal && (
        <div className="mt-3 gc p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-100">{selectedGoal.title}</p>
            <button onClick={() => setSelected(null)} className="text-zinc-600 hover:text-zinc-400">
              <X size={14}/>
            </button>
          </div>
          {deps.filter(d => d.goal_id === selected).length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5">Depende de:</p>
              <div className="space-y-1">
                {deps.filter(d => d.goal_id === selected).map(dep => {
                  const depGoal = goals.find(g => g.id === dep.depends_on_goal_id)
                  return depGoal ? (
                    <div key={dep.depends_on_goal_id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-800/60 text-xs text-zinc-400">
                      <span>{depGoal.title}</span>
                      <button onClick={() => handleDisconnect(selected!, dep.depends_on_goal_id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"><X size={11}/></button>
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { onEdit(selectedGoal); setSelected(null) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200">
              <Pencil size={11}/> Editar
            </button>
            <button onClick={() => { onComplete(selectedGoal.id); setSelected(null) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-xs text-green-400 border border-green-500/20">
              <Check size={11}/> Logro
            </button>
            <button onClick={() => { onDelete(selectedGoal.id); setSelected(null) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-xs text-red-400 border border-red-500/20">
              <Trash2 size={11}/> Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
