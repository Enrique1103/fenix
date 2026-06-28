"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Pencil, Trash2, X, Plus, Move, Undo2, Link2 } from "lucide-react"
import { Goal } from "@/lib/types"
import { getGoalsGraph, addGoalDep, removeGoalDep } from "@/lib/api"

const STORAGE_KEY    = "fenix_goal_graph_positions_v4"
const DRAG_THRESHOLD = 5
const NODE_W  = 200
const NODE_H  = 68
const COL_GAP = 44
const ROW_GAP = 120

interface Pos { x: number; y: number }

// Returns fully-opaque card colors matching the app's gc aesthetic
function nodeTheme(type: "action" | "mindset", dark: boolean) {
  const card  = dark ? "rgba(16,24,50,1)"     : "rgba(255,255,255,1)"
  const cardBorder = dark ? "rgba(71,85,105,0.5)" : "rgba(148,163,184,0.45)"
  const subtitleColor = dark ? "#475569" : "#94a3b8"
  if (type === "action") return {
    card, cardBorder, subtitleColor,
    accent: dark ? "#f97316" : "#ea580c",
    title:  dark ? "#fb923c" : "#c2410c",
  }
  return {
    card, cardBorder, subtitleColor,
    accent: dark ? "#8b5cf6" : "#7c3aed",
    title:  dark ? "#a78bfa" : "#6d28d9",
  }
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

// Pick the best pair of ports (which side of each card) based on relative position
function bestPorts(sPos: Pos, tPos: Pos): {
  x1: number; y1: number; x2: number; y2: number; horiz: boolean
} {
  const scx = sPos.x + NODE_W / 2, scy = sPos.y + NODE_H / 2
  const tcx = tPos.x + NODE_W / 2, tcy = tPos.y + NODE_H / 2
  const dx = tcx - scx, dy = tcy - scy
  if (Math.abs(dx) > Math.abs(dy)) {
    // Left ↔ Right ports
    return dx > 0
      ? { x1: sPos.x + NODE_W, y1: scy, x2: tPos.x,         y2: tcy, horiz: true }
      : { x1: sPos.x,          y1: scy, x2: tPos.x + NODE_W, y2: tcy, horiz: true }
  }
  // Top ↔ Bottom ports
  return dy > 0
    ? { x1: scx, y1: sPos.y + NODE_H, x2: tcx, y2: tPos.y,         horiz: false }
    : { x1: scx, y1: sPos.y,          x2: tcx, y2: tPos.y + NODE_H, horiz: false }
}

// Orthogonal routing: V-H-V for vertical connections, H-V-H for horizontal
function elbowPath(x1: number, y1: number, x2: number, y2: number, horiz: boolean): string {
  if (horiz) {
    // H-V-H: horizontal stub → vertical middle → horizontal stub
    const mid = (x1 + x2) / 2
    if (Math.abs(y1 - y2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
    const r = Math.max(0, Math.min(10,
      Math.abs(mid - x1) - 2,
      Math.abs(x2 - mid) - 2,
      Math.abs(y2 - y1) / 2 - 2,
    ))
    if (r < 1) return `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`
    const sx = x2 > x1 ? 1 : -1, sy = y2 > y1 ? 1 : -1
    return [
      `M ${x1} ${y1}`,
      `L ${mid - sx * r} ${y1}`,
      `Q ${mid} ${y1} ${mid} ${y1 + sy * r}`,
      `L ${mid} ${y2 - sy * r}`,
      `Q ${mid} ${y2} ${mid + sx * r} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ')
  }
  // V-H-V: vertical stub → horizontal middle → vertical stub
  const mid = y1 + (y2 - y1) * 0.4
  if (Math.abs(x1 - x2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const r = Math.max(0, Math.min(10,
    Math.abs(x2 - x1) / 2 - 1,
    Math.abs(mid - y1) - 2,
    Math.abs(y2 - mid) - 2,
  ))
  if (r < 1) return `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`
  const sx = x2 > x1 ? 1 : -1, sy = y2 > y1 ? 1 : -1
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
  const [deps, setDeps]               = useState<{ goal_id: number; depends_on_goal_id: number }[]>([])
  const [depsLoaded, setDepsLoaded]   = useState(false)
  const [positions, setPositions]     = useState<Record<number, Pos>>({})
  const [selected, setSelected]       = useState<number | null>(null)
  const [connectFrom, setConnectFrom] = useState<number | null>(null)
  const [hoveredDep, setHoveredDep]   = useState<string | null>(null)
  const [draggingId, setDraggingId]   = useState<number | null>(null)
  const [isDark, setIsDark]           = useState(true)
  const [undoData, setUndoData]       = useState<{ goalId: number; depId: number } | null>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const dragRef       = useRef<{ id: number; ox: number; oy: number; sx: number; sy: number } | null>(null)
  const hasMoved      = useRef(false)
  const didDrag       = useRef(false)
  const undoTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Correct theme detection: app uses data-theme="light" (default = dark)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute("data-theme") !== "light")
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => obs.disconnect()
  }, [])

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
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoData({ goalId, depId })
    undoTimerRef.current = setTimeout(() => setUndoData(null), 5000)
  }

  async function handleUndo() {
    if (!undoData) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    await addGoalDep(undoData.goalId, undoData.depId)
    await loadGraph()
    setUndoData(null)
  }

  const posVals = Object.values(positions)
  const canvasH = posVals.length > 0
    ? Math.max(400, Math.max(...posVals.map(p => p.y + NODE_H + 60)))
    : 400

  // Edge geometries — pick best port pair based on relative position
  const edges = deps.flatMap(dep => {
    const from = positions[dep.goal_id]
    const to   = positions[dep.depends_on_goal_id]
    if (!from || !to) return []
    const { x1, y1, x2, y2, horiz } = bestPorts(from, to)
    return [{ dep, key: `${dep.goal_id}-${dep.depends_on_goal_id}`, x1, y1, x2, y2, horiz }]
  })

  // Count edges per connection point — true junctions have count >= 2
  const dotCount = new Map<string, number>()
  edges.forEach(({ x1, y1, x2, y2 }) => {
    const k1 = `${Math.round(x1)},${Math.round(y1)}`
    const k2 = `${Math.round(x2)},${Math.round(y2)}`
    dotCount.set(k1, (dotCount.get(k1) ?? 0) + 1)
    dotCount.set(k2, (dotCount.get(k2) ?? 0) + 1)
  })

  const lineColor = isDark ? "rgba(71,85,105,0.7)"  : "rgba(148,163,184,0.8)"
  const selectedGoal = goals.find(g => g.id === selected)
  const connectFromGoal = goals.find(g => g.id === connectFrom)

  return (
    <div className="relative">

      {/* ── Connect-mode banner ─────────────────────────────────────────────── */}
      {connectFrom !== null && (
        <div className="mb-3 px-4 py-3 rounded-xl flex items-center justify-between gap-3"
          style={{
            background: isDark ? "rgba(8,145,178,0.12)" : "rgba(6,182,212,0.08)",
            border: `1px solid ${isDark ? "rgba(6,182,212,0.35)" : "rgba(6,182,212,0.3)"}`,
          }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(6,182,212,0.2)" }}>
              <Link2 size={13} className="text-cyan-400"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-cyan-300">
                Conectando: <span style={{ color: isDark ? "#e2e8f0" : "#0f172a" }}>{connectFromGoal?.title}</span>
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: isDark ? "#0e7490" : "#0891b2" }}>
                Tocá la meta que debe completarse <strong>antes</strong> que esta
              </p>
            </div>
          </div>
          <button onClick={() => setConnectFrom(null)}
            className="shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: isDark ? "#0e7490" : "#0891b2" }}>
            <X size={14}/>
          </button>
        </div>
      )}

      {/* ── Graph canvas ────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="gc relative w-full overflow-auto"
        style={{
          height: canvasH,
          touchAction: "pan-x pan-y",
          cursor: connectFrom !== null ? "crosshair" : "default",
        }}
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
        onPointerCancel={onContainerPointerUp}
      >
        {/* SVG layer 1: edges only (behind nodes) */}
        <svg className="absolute inset-0" style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
          {edges.map(({ dep, key, x1, y1, x2, y2, horiz }) => {
            const hovered = hoveredDep === key
            const d       = elbowPath(x1, y1, x2, y2, horiz)
            return (
              <g key={key} style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={() => handleDisconnect(dep.goal_id, dep.depends_on_goal_id)}
                onMouseEnter={() => setHoveredDep(key)}
                onMouseLeave={() => setHoveredDep(null)}>
                {/* Wide invisible hit area */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={16}/>
                <path d={d} fill="none"
                  stroke={hovered ? "#ef4444" : lineColor}
                  strokeWidth={hovered ? 2 : 1.5}
                  strokeDasharray="5 4"
                  style={{ pointerEvents: "none" }}/>
              </g>
            )
          })}
        </svg>

        {/* Nodes */}
        {goals.map(goal => {
          const pos = positions[goal.id]
          if (!pos) return null
          const { card, cardBorder, subtitleColor, accent, title } = nodeTheme(goal.goal_type, isDark)
          const isSel      = selected === goal.id
          const isDragging = draggingId === goal.id
          const isSource   = connectFrom === goal.id
          const isTarget   = connectFrom !== null && connectFrom !== goal.id

          let boxShadow = isDark
            ? "0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)"
            : "0 2px 10px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.07)"
          if (isDragging)    boxShadow = "0 16px 40px rgba(0,0,0,0.50)"
          else if (isSource) boxShadow = `0 0 0 2px rgba(6,182,212,0.7), 0 0 20px rgba(6,182,212,0.25)`
          else if (isSel)    boxShadow = `0 0 0 2px rgba(34,197,94,0.5), 0 0 16px rgba(34,197,94,0.18)`
          else if (isTarget) boxShadow = `0 0 0 1.5px rgba(6,182,212,0.25), 0 4px 16px rgba(0,0,0,0.2)`

          return (
            <div
              key={goal.id}
              className="absolute select-none cursor-pointer rounded-xl overflow-hidden transition-shadow duration-150"
              style={{
                left: pos.x, top: pos.y,
                width: NODE_W, height: NODE_H,
                background: card,
                borderTop:    `1px solid ${isSource ? "rgba(6,182,212,0.6)" : isSel ? "rgba(34,197,94,0.5)" : cardBorder}`,
                borderRight:  `1px solid ${isSource ? "rgba(6,182,212,0.6)" : isSel ? "rgba(34,197,94,0.5)" : cardBorder}`,
                borderBottom: `1px solid ${isSource ? "rgba(6,182,212,0.6)" : isSel ? "rgba(34,197,94,0.5)" : cardBorder}`,
                borderLeft:   `3px solid ${isSource ? "#22d3ee" : isSel ? "#22c55e" : accent}`,
                borderRadius: "0.75rem",
                boxShadow,
                transform: isDragging ? "scale(1.04)" : "scale(1)",
                zIndex: isDragging ? 10 : isSource ? 5 : 1,
              }}
              onPointerDown={e => onNodePointerDown(e, goal.id)}
              onClick={() => handleNodeClick(goal.id)}
            >
              <div className="px-3 py-2 pr-14 h-full flex flex-col justify-center">
                <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: title }}>
                  {goal.title}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: subtitleColor }}>
                  {goal.goal_type === "action" ? "Acción" : "Mentalización"} · {goal.horizon === "short" ? "Corto" : "Largo"}
                </p>
              </div>

              {/* Move handle */}
              <button
                className="absolute top-0 bottom-0 right-[28px] w-6 flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing"
                style={{
                  color: isDark ? "rgba(71,85,105,0.7)" : "rgba(148,163,184,0.9)",
                  touchAction: "none",
                }}
                onPointerDown={e => onMoveButtonPointerDown(e, goal.id)}
                onClick={e => e.stopPropagation()}
              >
                <Move size={10}/>
              </button>

              <div className="absolute top-2 bottom-2 right-[26px] w-px"
                style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)" }}/>

              {/* Connect button */}
              <button
                title="Conectar con prerequisito"
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                style={{
                  background: connectFrom === goal.id
                    ? "rgba(6,182,212,0.3)"
                    : isDark ? "rgba(71,85,105,0.2)" : "rgba(148,163,184,0.15)",
                  color: connectFrom === goal.id
                    ? "#22d3ee"
                    : isDark ? "rgba(100,116,139,0.9)" : "rgba(148,163,184,0.9)",
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation()
                  if (connectFrom === goal.id) { setConnectFrom(null); return }
                  setConnectFrom(goal.id); setSelected(null)
                }}>
                <Plus size={10}/>
              </button>
            </div>
          )
        })}

        {/* SVG layer 2: junction dots (after nodes in DOM = renders on top) */}
        <svg className="absolute inset-0" style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            {/* Glow filter for true junction dots (PCB-style) */}
            <filter id="pcb-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {[...dotCount.entries()].map(([pt, count]) => {
            const [cx, cy] = pt.split(',').map(Number)
            const isJunction = count >= 2
            // True junction (≥2 lines meet): large, bright, glowing — PCB look
            // Single endpoint: small and subtle
            return isJunction ? (
              <g key={pt} filter="url(#pcb-glow)">
                {/* Outer halo ring */}
                <circle cx={cx} cy={cy} r={8}
                  fill={isDark ? "rgba(34,211,238,0.15)" : "rgba(14,116,144,0.12)"}/>
                {/* Main junction dot */}
                <circle cx={cx} cy={cy} r={5}
                  fill={isDark ? "#22d3ee" : "#0e7490"}
                  stroke={isDark ? "rgba(16,24,50,0.9)" : "rgba(255,255,255,0.9)"}
                  strokeWidth={1.5}/>
              </g>
            ) : (
              <circle key={pt} cx={cx} cy={cy} r={3}
                fill={isDark ? "#475569" : "#94a3b8"}
                stroke={isDark ? "rgba(16,24,50,0.8)" : "rgba(255,255,255,0.8)"}
                strokeWidth={1}/>
            )
          })}
        </svg>
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
              <Pencil size={11}/> Editar
            </button>
            <button onClick={() => { onComplete(selectedGoal.id); setSelected(null) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-xs text-green-400 border border-green-500/20 hover:bg-green-500/15 transition-colors">
              <Check size={11}/> Logro
            </button>
            <button onClick={() => { onDelete(selectedGoal.id); setSelected(null) }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-xs text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-colors">
              <Trash2 size={11}/> Eliminar
            </button>
          </div>
        </div>
      )}

      {/* ── Undo toast — fixed position so it's always visible ─────────────── */}
      {undoData && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderRadius: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
          background: isDark ? "rgba(16,24,50,0.97)" : "rgba(255,255,255,0.97)",
          border: isDark ? "1px solid rgba(71,85,105,0.6)" : "1px solid rgba(148,163,184,0.5)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 12, color: isDark ? "#94a3b8" : "#64748b" }}>
            Conexión eliminada
          </span>
          <button onClick={handleUndo} style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 600,
            color: "#22d3ee",
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}>
            <Undo2 size={12}/> Deshacer
          </button>
          <div style={{ width: 1, height: 14, background: isDark ? "rgba(71,85,105,0.6)" : "rgba(148,163,184,0.5)" }}/>
          <button onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoData(null) }}
            style={{
              display: "flex", background: "none", border: "none", cursor: "pointer", padding: 0,
              color: isDark ? "#475569" : "#94a3b8",
            }}>
            <X size={13}/>
          </button>
        </div>
      )}
    </div>
  )
}
