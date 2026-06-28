"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Pencil, Trash2, X, Plus, Move } from "lucide-react"
import { Goal } from "@/lib/types"
import { getGoalsGraph, addGoalDep, removeGoalDep } from "@/lib/api"

const STORAGE_KEY    = "fenix_goal_graph_positions_v2"
const DRAG_THRESHOLD = 5

interface Pos { x: number; y: number }

function nodeColor(goal: Goal) {
  return goal.goal_type === "action"
    ? { bg: "rgba(251,146,60,0.12)", border: "#f97316", text: "#fb923c" }
    : { bg: "rgba(148,163,184,0.10)", border: "#64748b", text: "#94a3b8" }
}

export function GoalGraph({ goals, onEdit, onComplete, onDelete }: {
  goals:      Goal[]
  onEdit:     (g: Goal) => void
  onComplete: (id: number) => void
  onDelete:   (id: number) => void
}) {
  const [deps, setDeps]         = useState<{ goal_id: number; depends_on_goal_id: number }[]>([])
  const [positions, setPositions] = useState<Record<number, Pos>>({})
  const [selected, setSelected]  = useState<number | null>(null)
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
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  // Initialize / restore positions
  useEffect(() => {
    if (goals.length === 0) return
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    const next: Record<number, Pos> = {}
    goals.forEach((g, i) => {
      next[g.id] = saved[g.id] ?? { x: 40 + (i % 4) * 240, y: 40 + Math.floor(i / 4) * 160 }
    })
    setPositions(next)
  }, [goals])

  function savePositions(pos: Record<number, Pos>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
    setPositions(pos)
  }

  function beginDrag(id: number, sx: number, sy: number) {
    hasMoved.current = false
    dragRef.current  = { id, ox: positions[id]?.x ?? 0, oy: positions[id]?.y ?? 0, sx, sy }
    setDraggingId(id)
  }

  // Mouse drag from anywhere on the node body
  function onNodePointerDown(e: React.PointerEvent<HTMLDivElement>, id: number) {
    if (e.pointerType !== "mouse" || connectFrom !== null) return
    beginDrag(id, e.clientX, e.clientY)
    // Capture will happen in onContainerPointerMove once threshold crossed
  }

  // Explicit move button — works for all pointer types (touch + mouse)
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
      // Lazy capture for mouse drags from node body
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

  const NODE_W = 200
  const NODE_H = 68

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
              Ahora hacé clic en la meta que es <span className="text-cyan-300 font-medium">prerequisito</span> de esta
              — la flecha irá de esa meta hacia la tuya
            </p>
          </div>
          <button onClick={() => setConnectFrom(null)} className="shrink-0"><X size={13}/></button>
        </div>
      )}

      <div
        ref={containerRef}
        className="gc relative w-full overflow-auto"
        style={{ height: 520, touchAction: "pan-x pan-y" }}
        onPointerMove={onContainerPointerMove}
        onPointerUp={onContainerPointerUp}
        onPointerCancel={onContainerPointerUp}
      >
        {/* SVG arrows */}
        <svg className="absolute inset-0" style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#475569"/>
            </marker>
            <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#ef4444"/>
            </marker>
          </defs>
          {deps.map(dep => {
            const from = positions[dep.depends_on_goal_id]
            const to   = positions[dep.goal_id]
            if (!from || !to) return null
            const x1 = from.x + NODE_W / 2
            const y1 = from.y + NODE_H
            const x2 = to.x + NODE_W / 2
            const y2 = to.y
            const key = `${dep.goal_id}-${dep.depends_on_goal_id}`
            const hovered = hoveredDep === key
            return (
              <g key={key} style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={() => handleDisconnect(dep.goal_id, dep.depends_on_goal_id)}
                onMouseEnter={() => setHoveredDep(key)}
                onMouseLeave={() => setHoveredDep(null)}>
                {/* Hit area — línea ancha invisible para facilitar el click */}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16}/>
                {/* Línea visible */}
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={hovered ? "#ef4444" : "#475569"}
                  strokeWidth={hovered ? 2 : 1.5}
                  markerEnd={hovered ? "url(#arrow-red)" : "url(#arrow)"}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: "none" }}/>
              </g>
            )
          })}
        </svg>

        {/* Nodes */}
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
              {/* Content */}
              <div className="px-3 py-2 pr-14">
                <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: text }}>
                  {goal.title}
                </p>
                <p className="text-[9px] text-zinc-600 mt-0.5">
                  {goal.goal_type === "action" ? "Acción" : "Mentalización"} · {goal.horizon === "short" ? "Corto" : "Largo"}
                </p>
              </div>

              {/* Move button */}
              <button
                className="absolute top-0 bottom-0 right-[26px] w-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={e => onMoveButtonPointerDown(e, goal.id)}
                onClick={e => e.stopPropagation()}
              >
                <Move size={10}/>
              </button>

              {/* Separator */}
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

      {/* Selected panel */}
      {selectedGoal && (
        <div className="mt-3 gc p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-100">{selectedGoal.title}</p>
            <button onClick={() => setSelected(null)} className="text-zinc-600 hover:text-zinc-400">
              <X size={14}/>
            </button>
          </div>

          {/* Dependencies from this node */}
          {deps.filter(d => d.goal_id === selected).length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5">Depende de:</p>
              <div className="space-y-1">
                {deps.filter(d => d.goal_id === selected).map(dep => {
                  const depGoal = goals.find(g => g.id === dep.depends_on_goal_id)
                  return depGoal ? (
                    <div key={dep.depends_on_goal_id} className="flex items-center justify-between
                      px-2.5 py-1.5 rounded-lg bg-zinc-800/60 text-xs text-zinc-400">
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
