"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Task } from "@/lib/types"
import { X, Trash2, Check, Pencil } from "lucide-react"
import { DateInput } from "@/components/date-input"

const NODE_W         = 200
const NODE_H         = 64
const H_GAP          = 40
const V_GAP          = 72
const PAD            = 32
const DRAG_THRESHOLD = 5

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function isBlocked(task: Task, all: Task[]) {
  return task.dep_ids.some(id => {
    const dep = all.find(t => t.id === id)
    return dep && !dep.completed
  })
}

function wrapTitle(title: string): [string, string | null] {
  const MAX = 20
  if (title.length <= MAX) return [title, null]
  const brk = title.lastIndexOf(" ", MAX)
  if (brk <= 4) return [title.slice(0, MAX - 1) + "…", null]
  const rest = title.slice(brk + 1)
  return [title.slice(0, brk), rest.length > MAX ? rest.slice(0, MAX - 1) + "…" : rest]
}

// Top-down org chart layout using parent_task_id
function computeLayout(tasks: Task[]): Map<number, { x: number; y: number }> {
  if (tasks.length === 0) return new Map()

  const ids = new Set(tasks.map(t => t.id))

  // Build children map
  const children = new Map<number | null, Task[]>()
  children.set(null, [])
  tasks.forEach(t => {
    const pid = t.parent_task_id !== null && ids.has(t.parent_task_id) ? t.parent_task_id : null
    if (!children.has(pid)) children.set(pid, [])
    children.get(pid)!.push(t)
  })

  // Minimum subtree width for a node
  function subtreeW(id: number): number {
    const kids = children.get(id) ?? []
    if (kids.length === 0) return NODE_W + H_GAP
    return Math.max(NODE_W + H_GAP, kids.reduce((s, k) => s + subtreeW(k.id), 0))
  }

  const positions = new Map<number, { x: number; y: number }>()

  function place(parentId: number | null, startX: number, depth: number) {
    const kids = children.get(parentId) ?? []
    let cx = startX
    kids.forEach(k => {
      const w = subtreeW(k.id)
      positions.set(k.id, {
        x: cx + (w - NODE_W) / 2,
        y: PAD + depth * (NODE_H + V_GAP),
      })
      place(k.id, cx, depth + 1)
      cx += w
    })
  }

  place(null, PAD, 0)
  return positions
}

function loadPositions(key: string): Map<number, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, { x: number; y: number }>
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]))
  } catch { return new Map() }
}

function savePositions(key: string, positions: Map<number, { x: number; y: number }>) {
  const obj: Record<number, { x: number; y: number }> = {}
  positions.forEach((v, k) => { obj[k] = v })
  localStorage.setItem(key, JSON.stringify(obj))
}

// ── Add subtask modal ─────────────────────────────────────────────────────────

function AddSubModal({ parent, onAdd, onClose }: {
  parent: Task
  onAdd: (title: string, deadline: string, parentId: number) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle]       = useState("")
  const [deadline, setDeadline] = useState("")
  const [saving, setSaving]     = useState(false)

  async function handleAdd() {
    if (!title.trim() || saving) return
    setSaving(true)
    try { await onAdd(title.trim(), deadline, parent.id); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/40">
          <p className="text-sm font-semibold text-zinc-100 truncate">
            Subtarea de <span className="text-zinc-400">"{parent.title}"</span>
          </p>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 shrink-0">
            <X size={16}/>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") onClose() }}
            placeholder="Título de la subtarea…"
            className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50"
          />
          <DateInput value={deadline || null} onChange={v => setDeadline(v ?? "")} placeholder="Fecha límite"/>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={!title.trim() || saving}
              className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40 text-xs font-semibold text-black transition-colors">
              {saving ? "…" : "Agregar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Node ─────────────────────────────────────────────────────────────────────

function GraphNode({ task, p, allTasks, isSelected, isActiveDrag, onMainPointerDown, onNodeClick, onAddClick, today }: {
  task: Task
  p: { x: number; y: number }
  allTasks: Task[]
  isSelected: boolean
  isActiveDrag: boolean
  onMainPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onNodeClick: () => void
  onAddClick: () => void
  today: string
}) {
  const blocked = isBlocked(task, allTasks)
  const overdue = !task.completed && !!task.deadline && task.deadline < today

  const border = isSelected ? "#4ade80" : task.completed ? "#22c55e" : blocked ? "#3f3f46" : overdue ? "#ef444480" : "#52525b"
  const bg     = isSelected ? "rgba(74,222,128,0.08)" : task.completed ? "rgba(34,197,94,0.07)" : blocked ? "rgba(24,24,27,0.55)" : overdue ? "rgba(239,68,68,0.05)" : "rgba(39,39,42,0.75)"
  const textCol = task.completed ? "#71717a" : blocked ? "#52525b" : "#e4e4e7"
  const dotCol  = task.completed ? "#22c55e" : blocked ? "#3f3f46" : overdue ? "#ef4444" : "#71717a"

  const [line1, line2] = wrapTitle(task.title)
  const hasLine2 = !!line2
  const hasMeta  = !!task.deadline

  const center = p.y + NODE_H / 2
  let t1y: number, t2y: number | null = null, my: number | null = null
  if (!hasLine2 && !hasMeta)      { t1y = center + 4 }
  else if (!hasLine2 && hasMeta)  { t1y = center - 7; my = center + 9 }
  else if (hasLine2 && !hasMeta)  { t1y = center - 8; t2y = center + 6 }
  else                            { t1y = center - 15; t2y = center - 1; my = center + 15 }

  const noEvt: React.CSSProperties = { pointerEvents: "none" }

  return (
    <g>
      {/* Main rect — click to select (mouse also drags from here) */}
      <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="10"
        fill={isActiveDrag ? "rgba(74,222,128,0.12)" : bg}
        stroke={isActiveDrag ? "#4ade80" : border}
        strokeWidth={isSelected || isActiveDrag ? "2" : "1.5"}
        onPointerDown={onMainPointerDown}
        onClick={onNodeClick}
        style={{ cursor: isActiveDrag ? "grabbing" : "pointer",
          filter: isActiveDrag ? "drop-shadow(0 6px 16px rgba(0,0,0,0.5))" : "none" }}
      />

      {/* Status dot */}
      <circle cx={p.x + 14} cy={center} r="5" fill={dotCol} style={noEvt}/>
      {task.completed && (
        <text x={p.x + 14} y={center + 4} textAnchor="middle" fontSize="7" fill="#000" fontWeight="bold" style={noEvt}>✓</text>
      )}

      {/* Title lines */}
      <text x={p.x + 26} y={t1y} fontSize="11" fontWeight="500" fill={textCol}
        style={{ textDecoration: task.completed ? "line-through" : "none", pointerEvents: "none" }}>
        {line1}
      </text>
      {hasLine2 && t2y !== null && (
        <text x={p.x + 26} y={t2y} fontSize="11" fontWeight="500" fill={textCol}
          style={{ textDecoration: task.completed ? "line-through" : "none", pointerEvents: "none" }}>
          {line2}
        </text>
      )}
      {hasMeta && my !== null && (
        <text x={p.x + 26} y={my} fontSize="9" fill={overdue ? "#f87171" : "#71717a"} style={noEvt}>
          {task.deadline ? fmt(task.deadline) : ""}
        </text>
      )}

      {/* Move button — visual only; events handled by HTML overlay in GraphCanvas */}
      <g style={{ pointerEvents: "none" }}>
        <circle cx={p.x + NODE_W - 32} cy={p.y + 12} r="10" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5"/>
        {/* 4-arrow move icon */}
        {(() => {
          const cx = p.x + NODE_W - 32, cy = p.y + 12, r = 5
          const s = { ...noEvt, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
          return <>
            <line x1={cx} y1={cy-r} x2={cx} y2={cy+r} stroke="#71717a" strokeWidth="1.5" style={noEvt}/>
            <line x1={cx-r} y1={cy} x2={cx+r} y2={cy} stroke="#71717a" strokeWidth="1.5" style={noEvt}/>
            <polyline points={`${cx-2},${cy-r+2} ${cx},${cy-r} ${cx+2},${cy-r+2}`} fill="none" stroke="#71717a" strokeWidth="1.5" style={s}/>
            <polyline points={`${cx-2},${cy+r-2} ${cx},${cy+r} ${cx+2},${cy+r-2}`} fill="none" stroke="#71717a" strokeWidth="1.5" style={s}/>
            <polyline points={`${cx-r+2},${cy-2} ${cx-r},${cy} ${cx-r+2},${cy+2}`} fill="none" stroke="#71717a" strokeWidth="1.5" style={s}/>
            <polyline points={`${cx+r-2},${cy-2} ${cx+r},${cy} ${cx+r-2},${cy+2}`} fill="none" stroke="#71717a" strokeWidth="1.5" style={s}/>
          </>
        })()}
      </g>

      {/* Separator between move and + */}
      <line x1={p.x + NODE_W - 20} y1={p.y + 4} x2={p.x + NODE_W - 20} y2={p.y + 20}
        stroke="#3f3f46" strokeWidth="1" style={noEvt}/>

      {/* "+" subtask button */}
      <g onClick={e => { e.stopPropagation(); onAddClick() }} onPointerDown={e => e.stopPropagation()} style={{ cursor: "pointer" }}>
        <circle cx={p.x + NODE_W - 10} cy={p.y + 12} r="9" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5"/>
        <text x={p.x + NODE_W - 10} y={p.y + 17} textAnchor="middle" fontSize="14" fill="#52525b" fontWeight="300">+</text>
      </g>
    </g>
  )
}

// ── GraphCanvas ───────────────────────────────────────────────────────────────

function GraphCanvas({ tasks, allTasks, storageKey, selectedNodeId, onNodeSelect, onAddSubtask }: {
  tasks: Task[]
  allTasks: Task[]
  storageKey: string
  selectedNodeId: number | null
  onNodeSelect: (task: Task) => void
  onAddSubtask: (task: Task) => void
}) {
  const taskKey  = useMemo(() => tasks.map(t => t.id).sort().join("-"), [tasks])
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(() => {
    const saved    = loadPositions(storageKey)
    const computed = computeLayout(tasks)
    const merged   = new Map(computed)
    saved.forEach((pos, id) => { if (merged.has(id)) merged.set(id, pos) })
    return merged
  })
  const [isDragging,   setIsDragging]   = useState(false)
  const [activeDragId, setActiveDragId] = useState<number | null>(null)

  const svgRef     = useRef<SVGSVGElement>(null)
  const dragRef    = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const hasMoved   = useRef(false)

  useEffect(() => {
    const saved    = loadPositions(storageKey)
    const computed = computeLayout(tasksRef.current)
    const merged   = new Map(computed)
    saved.forEach((pos, id) => { if (merged.has(id)) merged.set(id, pos) })
    setPositions(merged)
  }, [taskKey, storageKey])

  if (tasks.length === 0) return null

  const today = getToday()
  const ids   = new Set(tasks.map(t => t.id))
  const xs    = [...positions.values()].map(p => p.x)
  const ys    = [...positions.values()].map(p => p.y)
  const svgW  = Math.max(460, Math.max(...xs) + NODE_W + PAD * 2)
  const svgH  = Math.max(160, Math.max(...ys) + NODE_H + PAD * 2)

  // Mouse drag from anywhere on the node body
  function onMainRectPointerDown(e: React.PointerEvent<SVGRectElement>, taskId: number) {
    if (e.pointerType !== "mouse") return
    const p = positions.get(taskId)
    if (!p) return
    hasMoved.current = false
    dragRef.current  = { id: taskId, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }
    // Capture happens lazily in onSvgPointerMove once threshold crossed
  }

  // Move button drag — called from HTML overlay div (touch-action: none respected)
  function startMoveDrag(e: React.PointerEvent<HTMLDivElement>, taskId: number) {
    e.stopPropagation()
    e.preventDefault()
    const p = positions.get(taskId)
    if (!p) return
    svgRef.current?.setPointerCapture(e.pointerId)
    hasMoved.current = false
    dragRef.current  = { id: taskId, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }
    setIsDragging(true)
    setActiveDragId(taskId)
  }

  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!hasMoved.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      hasMoved.current = true
      // Lazy capture for mouse drags from main rect
      try { svgRef.current?.setPointerCapture(e.pointerId) } catch {}
      setIsDragging(true)
      setActiveDragId(d.id)
    }
    if (hasMoved.current) {
      setPositions(prev => new Map(prev).set(d.id, {
        x: Math.max(0, d.ox + dx),
        y: Math.max(0, d.oy + dy),
      }))
    }
  }

  function onSvgPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setIsDragging(false)
    setActiveDragId(null)
    try { svgRef.current?.releasePointerCapture(e.pointerId) } catch {}
    if (hasMoved.current) {
      setPositions(prev => { savePositions(storageKey, prev); return prev })
    }
    hasMoved.current = false
  }

  return (
  <div style={{ position: "relative", minWidth: svgW, minHeight: svgH }}>
    <svg
      ref={svgRef}
      width={svgW} height={svgH}
      style={{ display: "block", cursor: isDragging ? "grabbing" : "default" }}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
    >
      <defs>
        <marker id="tip" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,1 L0,6 L6,3.5 z" fill="#52525b"/>
        </marker>
        <marker id="tip-done" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,1 L0,6 L6,3.5 z" fill="#22c55e50"/>
        </marker>
      </defs>

      {/* Parent → child edges (top-down) */}
      {tasks.map(task => {
        const pid = task.parent_task_id
        if (!pid || !ids.has(pid)) return null
        const from = positions.get(pid)
        const to   = positions.get(task.id)
        if (!from || !to) return null
        const x1 = from.x + NODE_W / 2
        const y1 = from.y + NODE_H
        const x2 = to.x + NODE_W / 2
        const y2 = to.y
        const my = (y1 + y2) / 2
        const done = tasks.find(t => t.id === pid)?.completed
        return (
          <path key={`edge-${task.id}`}
            d={`M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
            stroke={done ? "#22c55e50" : "#3f3f46"}
            strokeWidth="1.5"
            fill="none"
            markerEnd={done ? "url(#tip-done)" : "url(#tip)"}
            style={{ pointerEvents: "none" }}
          />
        )
      })}

      {/* dep_ids edges (dashed, horizontal-ish) */}
      {tasks.flatMap(task =>
        task.dep_ids
          .filter(depId => ids.has(depId) && tasks.find(t => t.id === depId)?.parent_task_id === task.parent_task_id)
          .map(depId => {
            const from = positions.get(depId)
            const to   = positions.get(task.id)
            if (!from || !to) return null
            const x1 = from.x + NODE_W
            const y1 = from.y + NODE_H / 2
            const x2 = to.x
            const y2 = to.y + NODE_H / 2
            const mx = (x1 + x2) / 2
            const depDone = tasks.find(t => t.id === depId)?.completed
            return (
              <path key={`dep-${depId}-${task.id}`}
                d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
                stroke={depDone ? "#22c55e40" : "#a855f730"}
                strokeWidth="1.5" strokeDasharray="5 3"
                fill="none" markerEnd={depDone ? "url(#tip-done)" : "url(#tip)"}
                style={{ pointerEvents: "none" }}
              />
            )
          })
      )}

      {/* Nodes */}
      {tasks.map(task => {
        const p = positions.get(task.id)
        if (!p) return null
        return (
          <GraphNode
            key={task.id}
            task={task} p={p}
            allTasks={allTasks}
            isSelected={selectedNodeId === task.id}
            isActiveDrag={activeDragId === task.id}
            today={today}
            onMainPointerDown={e => onMainRectPointerDown(e, task.id)}
            onNodeClick={() => onNodeSelect(task)}
            onAddClick={() => onAddSubtask(task)}
          />
        )
      })}
    </svg>

    {/* HTML overlays for move buttons — touch-action:none respected here, not in SVG child elements */}
    {tasks.map(task => {
      const p = positions.get(task.id)
      if (!p) return null
      return (
        <div key={`mv-${task.id}`}
          style={{
            position: "absolute",
            left: p.x + NODE_W - 42,
            top:  p.y + 2,
            width: 20, height: 20,
            borderRadius: "50%",
            touchAction: "none",
            cursor: activeDragId === task.id ? "grabbing" : "grab",
          }}
          onPointerDown={e => startMoveDrag(e, task.id)}
        />
      )
    })}
  </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function TaskGraph({ tasks, allTasks, tab = "all", onAddTask, onConnect, onDisconnect, onDelete, onTaskClick, onToggleComplete }: {
  tasks: Task[]
  allTasks: Task[]
  tab?: string
  onAddTask: (title: string, deadline: string, parentId?: number) => Promise<void>
  onConnect: (taskId: number, depId: number) => Promise<void>
  onDisconnect: (taskId: number, depId: number) => Promise<void>
  onDelete: (taskId: number) => Promise<void>
  onTaskClick?: (task: Task) => void
  onToggleComplete?: (task: Task) => void
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [addingFor, setAddingFor]           = useState<Task | null>(null)
  const storageKey = `fenix_graph_positions_${tab}`

  if (tasks.length === 0) return null

  const selectedTask = selectedNodeId !== null ? allTasks.find(t => t.id === selectedNodeId) ?? null : null

  return (
    <div className="space-y-2">
      {/* Canvas */}
      <div className="gc overflow-x-auto overflow-y-auto" style={{ touchAction: "pan-x pan-y" }}>
        <GraphCanvas
          tasks={tasks}
          allTasks={allTasks}
          storageKey={storageKey}
          selectedNodeId={selectedNodeId}
          onNodeSelect={task => setSelectedNodeId(prev => prev === task.id ? null : task.id)}
          onAddSubtask={setAddingFor}
        />
      </div>

      {/* Description panel */}
      {selectedTask && (
        <div className="gc p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-100 leading-snug">{selectedTask.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  await onDelete(selectedTask.id)
                  setSelectedNodeId(null)
                }}
                className="text-zinc-600 hover:text-red-400 transition-colors mt-0.5"
                title="Eliminar tarea">
                <Trash2 size={14}/>
              </button>
              <button onClick={() => setSelectedNodeId(null)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5">
                <X size={14}/>
              </button>
            </div>
          </div>

          {selectedTask.description ? (
            <p className="text-sm text-zinc-400 leading-relaxed">{selectedTask.description}</p>
          ) : (
            <p className="text-xs text-zinc-600 italic">Sin descripción</p>
          )}

          {/* Acciones rápidas */}
          <div className="flex gap-2 pt-1">
            {onToggleComplete && (
              <button
                onClick={() => { onToggleComplete(selectedTask); setSelectedNodeId(null) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                  ${selectedTask.completed
                    ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    : "bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20"}`}>
                <Check size={12}/>
                {selectedTask.completed ? "Reabrir" : "Completar"}
              </button>
            )}
            {onTaskClick && (
              <button
                onClick={() => { onTaskClick(selectedTask); setSelectedNodeId(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700/40 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-slate-600/60 transition-all">
                <Pencil size={12}/>
                Editar
              </button>
            )}
          </div>

          {selectedTask.dep_ids.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-zinc-800">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Requiere</p>
              {selectedTask.dep_ids.map(depId => {
                const dep = allTasks.find(t => t.id === depId)
                if (!dep) return null
                return (
                  <div key={depId} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-zinc-800/60 rounded-lg">
                    <span className={`text-xs flex-1 truncate ${dep.completed ? "line-through text-zinc-500" : "text-zinc-300"}`}>
                      {dep.title}
                    </span>
                    <button
                      onClick={async () => {
                        await onDisconnect(selectedTask.id, depId)
                        setSelectedNodeId(null)
                      }}
                      className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X size={12}/>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-zinc-600 px-1">
        toca para ver detalles · + agrega subtarea · arrastra para mover
      </p>

      {addingFor && (
        <AddSubModal
          parent={addingFor}
          onAdd={async (title, deadline, parentId) => {
            await onAddTask(title, deadline, parentId)
          }}
          onClose={() => setAddingFor(null)}
        />
      )}
    </div>
  )
}
