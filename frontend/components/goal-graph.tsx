"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Pencil, Trash2, X, Plus, Move } from "lucide-react"
import { Goal } from "@/lib/types"
import { getGoalsGraph, addGoalDep, removeGoalDep } from "@/lib/api"

const STORAGE_KEY    = "fenix_goal_graph_positions_v4"
const DRAG_THRESHOLD = 5
const NODE_W  = 200
const NODE_H  = 68
const COL_GAP = 44
const ROW_GAP = 120  // gap between rows — edges route in this space

interface Pos { x: number; y: number }

function nodeColor(goal: Goal) {
  return goal.goal_type === "action"
    ? { bg: "rgba(251,146,60,0.12)", border: "#f97316", text: "#fb923c" }
    : { bg: "rgba(148,163,184,0.10)", border: "#64748b", text: "#94a3b8" }
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * Orthogonal elbow path: vertical → horizontal (at mid Y) → vertical.
 * Rounded corners via quadratic bezier. Works for any direction.
 */
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

  // ── Reversed level assignment ──────────────────────────────────────────────────
  // dep.goal_id DEPENDS ON dep.depends_on_goal_id.
  // We want the FINAL GOALS (sinks — nothing depends on them) at level 0 = TOP.
  // Prerequisites are pushed to higher levels = lower on screen.
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

  // Group by level
  const byLevel: Record<number, Goal[]> = {}
  goals.forEach(g => {
    const l = level[g.id] ?? 0
    if (!byLevel[l]) byLevel[l] = []
    byLevel[l].push(g)
  })
  const levelKeys = Object.keys(byLevel).map(Number).sort()

  // ── Layout-direction adjacency ─────────────────────────────────────────────────
  // "above" = nodes visually above (lower level number = dependents that rely on this)
  // "below" = nodes visually below (higher level number = prerequisites)
  const above: Record<number, number[]> = {}
  const below: Record<number, number[]> = {}
  goals.forEach(g => { above[g.id] = []; below[g.id] = [] })
  deps.forEach(dep => {
    if (!goalIds.has(dep.goal_id) || !goalIds.has(dep.depends_on_goal_id)) return
    above[dep.depends_on_goal_id].push(dep.goal_id)
    below[dep.goal_id].push(dep.depends_on_goal_id)
  })

  // ── Barycenter ordering: 3 forward + backward passes ──────────────────────────
  const col: Record<number, number> = {}
  levelKeys.forEach(l => { byLevel[l].forEach((g, i) => { col[g.id] = i }) })

  function bary(id: number, neighbors: number[]): number {
    return neighbors.length === 0 ? (col[id] ?? 0) : avg(neighbors.map(n => col[n] ?? 0))
  }

  for (let pass = 0; pass < 3; pass++) {
    // Forward: order each level by the mean x of nodes directly ABOVE
    levelKeys.forEach(l => {
      byLevel[l].sort((a, b) => bary(a.id, above[a.id]) - bary(b.id, above[b.id]))
      byLevel[l].forEach((g, i) => { col[g.id] = i })
    })
    // Backward: order each level by the mean x of nodes directly BELOW
    ;[...levelKeys].reverse().forEach(l => {
      byLevel[l].sort((a, b) => bary(a.id, below[a.id]) - bary(b.id, below[b.id]))
      byLevel[l].forEach((g, i) => { col[g.id] = i })
    })
  }

  // ── Assign final x / y positions (center each row horizontally) ────────────────
  const result: Record<number, Pos> = {}
  const CANVAS_W = 1100

  levelKeys.forEach((l, rowIndex) => {
    const row = byLevel[l]
    const rowW = row.length * NODE_W + (row.length - 1) * COL_GAP
    const startX = Math.max(40, (CANVAS_W - rowW) / 2)
    row.forEach((g, ci) => {
      result[g.id] = saved[g.id] ?? {
        x: startX + ci * (NODE_W + COL_GAP),
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
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef      = useRef<{ id: number; ox: number; oy: number; sx: number; sy: number } | null>(null)
  const hasMoved     = useRef(false)
  const didDrag      = useRef(false)

  const loadGraph = useCallback(async () => {
    try {
      const data = await getGoalsGraph()
      setDeps(data.deps)
    } catch { /* ignore */ } finally { setDepsLoaded(true) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  // Wait for deps before computing layout to avoid a flash of wrong positions
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
    e.stopPropagation()
    e.preventDefault()
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
    if (hasMoved.current) {
      setPositions(prev => ({ ...prev, [d.id]: { x: d.ox + dx, y: d.oy + dy } }))
    }
  }

  function onContainerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    const moved = hasMoved.current
    try { containerRef.current?.releasePointerCapture(e.pointerId) } catch {}
    if (moved) {
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      savePositions({ ...positions, [d.id]: { x: d.ox + dx, y: d.oy + dy } })
      didDrag.current = true
      setTimeout(() => { didDrag.current = false }, 50)
    }
    dragRef.current  = null
    hasMoved.current = false
    setDraggingId(null)
  }

  async function handleNodeClick(id: number) {
    if (didDrag.current) return
    if (connectFrom !== null) {
      if (connectFrom !== id) {
        await addGoalDep(id, connectFrom)
        await loadGraph()
      }
      setConnectFrom(null)
      return
    }
    setSelected(id === selected ? null : id)
  }

  async function handleDisconnect(goalId: number, depId: number) {
    await removeGoalDep(goalId, depId)
    await loadGraph()
  }

  // Dynamic canvas height
  const posVals = Object.values(positions)
  const canvasH = posVals.length > 0
    ? Math.max(400, Math.max(...posVals.map(p => p.y + NODE_H + 60)))
    : 400

  // Pre-compute all edge geometries
  const edges = deps.flatMap(dep => {
    // Arrow: goal_id (top, dependent) → depends_on_goal_id (bottom, prerequisite)
    const from = positions[dep.goal_id]
    const to   = positions[dep.depends_on_goal_id]
    if (!from || !to) return []
    return [{
      dep,
      key: `${dep.goal_id}-${dep.depends_on_goal_id}`,
      x1: from.x + NODE_W / 2,
      y1: from.y + NODE_H,       // bottom-center of dependent (top node)
      x2: to.x   + NODE_W / 2,
      y2: to.y,                  // top-center of prerequisite (bottom node)
    }]
  })

  // Unique junction dots (circuit convention: dot = real connection)
  const dotSet = new Set<string>()
  edges.forEach(({ x1, y1, x2, y2 }) => {
    dotSet.add(`${Math.round(x1)},${Math.round(y1)}`)
    dotSet.add(`${Math.round(x2)},${Math.round(y2)}`)
  })

  const selectedGoal = goals.find(g => g.id === selected)

  return (
    <div className="relative">
      {connectFrom !== null && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-400 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="font-medium">
              Origen: <span className="text-white">{goals.find(g => g.id === connectFrom)?.title}</span>
            </p>
            <p className="text-cyan-500/80">
              Hacé clic en la meta que es <span className="text-cyan-300 font-medium">prerequisito</span> de esta
            </p>
          </div>
          <button onClick={() => setConnectFrom(null)} className="shrink-0"><X size={13}/></button>
        </div>
      )}

      <div
        ref={containerRef}
        className="gc relative w-full overflow-auto"
        style={{ height: canvasH, touchAction: "pan-x pan-y" }}
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
        onPointerCancel={onContainerPointerUp}
      >
        {/* SVG layer: edges + junction dots */}
        <svg
          className="absolute inset-0"
          style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {/* Edges */}
          {edges.map(({ dep, key, x1, y1, x2, y2 }) => {
            const hovered = hoveredDep === key
            const stroke  = hovered ? "#ef4444" : "#475569"
            const d       = elbowPath(x1, y1, x2, y2)
            return (
              <g key={key} style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={() => handleDisconnect(dep.goal_id, dep.depends_on_goal_id)}
                onMouseEnter={() => setHoveredDep(key)}
                onMouseLeave={() => setHoveredDep(null)}>
                {/* Wide transparent hit area */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={14}/>
                {/* Visible orthogonal line */}
                <path d={d} fill="none" stroke={stroke} strokeWidth={1.5}
                  strokeDasharray="5 4" style={{ pointerEvents: "none" }}/>
              </g>
            )
          })}

          {/* Junction dots — circuit convention: dot = real connection, no dot = crossing only */}
          {[...dotSet].map(pt => {
            const [cx, cy] = pt.split(',').map(Number)
            return (
              <circle key={pt} cx={cx} cy={cy} r={3.5}
                fill="#475569" style={{ pointerEvents: "none" }}/>
            )
          })}
        </svg>

        {/* Nodes — rendered after SVG so they appear on top of lines */}
        {goals.map(goal => {
          const pos = positions[goal.id]
          if (!pos) return null
          const { bg, border, text } = nodeColor(goal)
          const isSel      = selected === goal.id
          const isDragging = draggingId === goal.id
          return (
            <div
              key={goal.id}
              className="absolute select-none cursor-pointer rounded-xl overflow-hidden"
              style={{
                left: pos.x, top: pos.y,
                width: NODE_W, height: NODE_H,
                background: bg,
                border: `1.5px solid ${isSel ? "#22c55e" : border}`,
                boxShadow: isDragging
                  ? "0 10px 28px rgba(0,0,0,0.4)"
                  : isSel ? "0 0 0 2px rgba(34,197,94,0.2)" : "none",
                transform: isDragging ? "scale(1.06)" : "scale(1)",
                transition: "transform 0.12s ease, box-shadow 0.12s ease",
                zIndex: isDragging ? 10 : 1,
              }}
              onPointerDown={e => onNodePointerDown(e, goal.id)}
              onClick={() => handleNodeClick(goal.id)}
            >
              <div className="px-3 py-2 pr-14">
                <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: text }}>
                  {goal.title}
                </p>
                <p className="text-[9px] text-zinc-500 mt-0.5">
                  {goal.goal_type === "action" ? "Acción" : "Mentalización"} · {goal.horizon === "short" ? "Corto" : "Largo"}
                </p>
              </div>

              {/* Move handle */}
              <button
                className="absolute top-0 bottom-0 right-[26px] w-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={e => onMoveButtonPointerDown(e, goal.id)}
                onClick={e => e.stopPropagation()}
              >
                <Move size={10}/>
              </button>

              <div className="absolute top-2 bottom-2 right-[23px] w-px bg-zinc-700/50"/>

              {/* Connect button */}
              <button
                className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-zinc-700/60 flex items-center justify-center hover:bg-cyan-500/20 transition-colors"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setConnectFrom(goal.id); setSelected(null) }}>
                <Plus size={8} className="text-zinc-400"/>
              </button>
            </div>
          )
        })}
      </div>

      {/* Selected goal detail panel */}
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
                        className="text-zinc-600 hover:text-red-400 transition-colors">
                        <X size={11}/>
                      </button>
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
