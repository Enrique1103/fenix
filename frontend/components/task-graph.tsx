"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Task } from "@/lib/types"
import { X, Lock } from "lucide-react"

const NODE_W         = 230
const NODE_H         = 72
const COL_GAP        = 96
const ROW_GAP        = 16
const PAD            = 24
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
  const MAX = 22
  if (title.length <= MAX) return [title, null]
  const brk = title.lastIndexOf(" ", MAX)
  if (brk <= 4) return [title.slice(0, MAX - 1) + "…", null]
  const rest = title.slice(brk + 1)
  return [title.slice(0, brk), rest.length > MAX ? rest.slice(0, MAX - 1) + "…" : rest]
}

function computeLayout(tasks: Task[]): Map<number, { x: number; y: number }> {
  const ids  = new Set(tasks.map(t => t.id))
  const deps = new Map(tasks.map(t => [t.id, t.dep_ids.filter(d => ids.has(d))]))
  const level = new Map<number, number>()

  function lvl(id: number, stack = new Set<number>()): number {
    if (level.has(id)) return level.get(id)!
    if (stack.has(id)) return 0
    stack.add(id)
    const d = deps.get(id) ?? []
    const l = d.length === 0 ? 0 : Math.max(...d.map(dep => lvl(dep, stack) + 1))
    level.set(id, l)
    return l
  }
  tasks.forEach(t => lvl(t.id))

  const cols = new Map<number, number[]>()
  level.forEach((l, id) => {
    if (!cols.has(l)) cols.set(l, [])
    cols.get(l)!.push(id)
  })

  const hasDeps = tasks.some(t => t.dep_ids.filter(d => ids.has(d)).length > 0)
  if (!hasDeps && tasks.length > 1) {
    const positions = new Map<number, { x: number; y: number }>()
    tasks.forEach((t, i) => {
      positions.set(t.id, { x: PAD + i * (NODE_W + COL_GAP), y: PAD })
    })
    return positions
  }

  const positions = new Map<number, { x: number; y: number }>()
  cols.forEach((colIds, col) => {
    const x = PAD + col * (NODE_W + COL_GAP)
    colIds.forEach((id, row) => {
      positions.set(id, { x, y: PAD + row * (NODE_H + ROW_GAP) })
    })
  })
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
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="w-full bg-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-400 focus:outline-none focus:ring-1 focus:ring-green-500/50"
          />
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

function GraphNode({ task, p, allTasks, isSelected, connectingFromId, onPointerDown, onAddClick, onConnectClick, today }: {
  task: Task
  p: { x: number; y: number }
  allTasks: Task[]
  isSelected: boolean
  connectingFromId: number | null
  onPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onAddClick: () => void
  onConnectClick: () => void
  today: string
}) {
  const blocked           = isBlocked(task, allTasks)
  const overdue           = !task.completed && !!task.deadline && task.deadline < today
  const isSource          = connectingFromId === task.id
  const isTarget          = connectingFromId !== null && connectingFromId !== task.id

  const border = isSelected ? "#4ade80" : isSource ? "#60a5fa" : task.completed ? "#22c55e" : blocked ? "#3f3f46" : overdue ? "#ef444480" : "#52525b"
  const bg     = isSelected ? "rgba(74,222,128,0.06)" : isSource ? "rgba(96,165,250,0.1)" : isTarget ? "rgba(96,165,250,0.04)" : task.completed ? "rgba(34,197,94,0.07)" : blocked ? "rgba(24,24,27,0.55)" : overdue ? "rgba(239,68,68,0.05)" : "rgba(39,39,42,0.75)"
  const textCol = task.completed ? "#71717a" : blocked ? "#52525b" : "#e4e4e7"
  const dotCol  = task.completed ? "#22c55e" : blocked ? "#3f3f46" : overdue ? "#ef4444" : "#71717a"

  const [line1, line2] = wrapTitle(task.title)
  const hasLine2 = !!line2
  const subs     = allTasks.filter(t => t.parent_task_id === task.id).length
  const hasMeta  = !!task.deadline || subs > 0

  const center = p.y + NODE_H / 2
  let t1y: number, t2y: number | null = null, my: number | null = null
  if (!hasLine2 && !hasMeta)      { t1y = center + 4 }
  else if (!hasLine2 && hasMeta)  { t1y = center - 7; my = center + 9 }
  else if (hasLine2 && !hasMeta)  { t1y = center - 8; t2y = center + 6 }
  else                            { t1y = center - 15; t2y = center - 1; my = center + 15 }

  const noEvt: React.CSSProperties = { pointerEvents: "none" }
  const strokeW = isSelected || isSource ? "2" : "1.5"

  return (
    <g>
      {/* Glow ring for connect target */}
      {isTarget && (
        <rect x={p.x - 3} y={p.y - 3} width={NODE_W + 6} height={NODE_H + 6} rx="13"
          fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4 3" style={noEvt}/>
      )}

      {/* Card */}
      <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="10"
        fill={bg} stroke={border} strokeWidth={strokeW}
        onPointerDown={onPointerDown}
        style={{ cursor: isTarget ? "crosshair" : "grab" }}
      />

      {/* Status dot */}
      <circle cx={p.x + 14} cy={center} r="5" fill={dotCol} style={noEvt}/>
      {task.completed && (
        <text x={p.x + 14} y={center + 4} textAnchor="middle" fontSize="7" fill="#000" fontWeight="bold" style={noEvt}>✓</text>
      )}
      {blocked && !task.completed && (
        <text x={p.x + 14} y={center + 3} textAnchor="middle" fontSize="8" fill="#52525b" style={noEvt}>🔒</text>
      )}

      {/* Title lines */}
      <text x={p.x + 26} y={t1y} fontSize="11.5" fontWeight="500" fill={textCol}
        style={{ textDecoration: task.completed ? "line-through" : "none", pointerEvents: "none" }}>
        {line1}
      </text>
      {hasLine2 && t2y !== null && (
        <text x={p.x + 26} y={t2y} fontSize="11.5" fontWeight="500" fill={textCol}
          style={{ textDecoration: task.completed ? "line-through" : "none", pointerEvents: "none" }}>
          {line2}
        </text>
      )}
      {hasMeta && my !== null && (
        <text x={p.x + 26} y={my} fontSize="9" fill={overdue ? "#f87171" : "#71717a"} style={noEvt}>
          {task.deadline ? fmt(task.deadline) : ""}
          {task.deadline && subs > 0 ? "  ·  " : ""}
          {subs > 0 ? `${subs} paso${subs > 1 ? "s" : ""}` : ""}
        </text>
      )}

      {/* Buttons — hidden in connect-target mode */}
      {!isTarget && (
        <>
          {/* "+" subtask */}
          <g onClick={e => { e.stopPropagation(); onAddClick() }} onPointerDown={e => e.stopPropagation()} style={{ cursor: "pointer" }}>
            <circle cx={p.x + NODE_W - 14} cy={p.y + 14} r="11" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5"/>
            <text x={p.x + NODE_W - 14} y={p.y + 19} textAnchor="middle" fontSize="15" fill="#52525b" fontWeight="300">+</text>
          </g>
          {/* "→" connect */}
          {!task.completed && (
            <g onClick={e => { e.stopPropagation(); onConnectClick() }} onPointerDown={e => e.stopPropagation()} style={{ cursor: "pointer" }}>
              <circle cx={p.x + NODE_W - 14} cy={p.y + NODE_H - 14} r="11" fill="#18181b"
                stroke={isSource ? "#60a5fa" : "#3f3f46"} strokeWidth="1.5"/>
              <text x={p.x + NODE_W - 14} y={p.y + NODE_H - 9} textAnchor="middle" fontSize="12"
                fill={isSource ? "#60a5fa" : "#3f3f46"}>→</text>
            </g>
          )}
        </>
      )}
    </g>
  )
}

// ── GraphCanvas ───────────────────────────────────────────────────────────────

function GraphCanvas({ tasks, allTasks, storageKey, selectedNodeId, connectingFromId, onNodeSelect, onAddSubtask, onConnectStart, onConnectComplete }: {
  tasks: Task[]
  allTasks: Task[]
  storageKey: string
  selectedNodeId: number | null
  connectingFromId: number | null
  onNodeSelect: (task: Task) => void
  onAddSubtask: (task: Task) => void
  onConnectStart: (taskId: number) => void
  onConnectComplete: (targetId: number) => void
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
  const [isDragging, setIsDragging] = useState(false)

  const svgRef   = useRef<SVGSVGElement>(null)
  const dragRef  = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const hasMoved = useRef(false)

  useEffect(() => {
    const saved    = loadPositions(storageKey)
    const computed = computeLayout(tasksRef.current)
    const merged   = new Map(computed)
    saved.forEach((pos, id) => { if (merged.has(id)) merged.set(id, pos) })
    setPositions(merged)
  }, [taskKey, storageKey])

  if (tasks.length === 0) return null

  const today  = getToday()
  const idSet  = new Set(tasks.map(t => t.id))
  const xs     = [...positions.values()].map(p => p.x)
  const ys     = [...positions.values()].map(p => p.y)
  const svgW   = Math.max(460, Math.max(...xs) + NODE_W + PAD * 2)
  const svgH   = Math.max(120, Math.max(...ys) + NODE_H + PAD * 2)

  function onNodePointerDown(e: React.PointerEvent<SVGRectElement>, taskId: number) {
    e.preventDefault()
    const p = positions.get(taskId)
    if (!p) return
    hasMoved.current = false
    dragRef.current  = { id: taskId, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }
    svgRef.current?.setPointerCapture(e.pointerId)
    setIsDragging(true)
  }

  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!hasMoved.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      hasMoved.current = true
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
    dragRef.current = null
    setIsDragging(false)
    svgRef.current?.releasePointerCapture(e.pointerId)

    if (hasMoved.current) {
      setPositions(prev => { savePositions(storageKey, prev); return prev })
      return
    }

    if (d === null) return
    const task = tasks.find(t => t.id === d.id)
    if (!task) return

    if (connectingFromId !== null && connectingFromId !== task.id) {
      onConnectComplete(task.id)
    } else {
      onNodeSelect(task)
    }
  }

  return (
    <svg
      ref={svgRef}
      width={svgW} height={svgH}
      style={{
        display: "block", minWidth: svgW,
        cursor: isDragging ? "grabbing" : connectingFromId !== null ? "crosshair" : "default",
      }}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
    >
      <defs>
        <marker id="tip"       markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,1 L0,6 L6,3.5 z" fill="#52525b"/>
        </marker>
        <marker id="tip-done"  markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,1 L0,6 L6,3.5 z" fill="#22c55e60"/>
        </marker>
        <marker id="tip-chain" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,1 L0,6 L6,3.5 z" fill="#3f3f46"/>
        </marker>
      </defs>

      {/* Dependency edges */}
      {tasks.flatMap(task =>
        task.dep_ids
          .filter(depId => idSet.has(depId))
          .map(depId => {
            const from = positions.get(depId)
            const to   = positions.get(task.id)
            if (!from || !to) return null
            const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2
            const x2 = to.x,            y2 = to.y   + NODE_H / 2
            const mx = (x1 + x2) / 2
            const depDone = tasks.find(t => t.id === depId)?.completed
            return (
              <path key={`${depId}-${task.id}`}
                d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
                stroke={depDone ? "#22c55e50" : "#3f3f46"}
                strokeWidth="1.5" strokeDasharray={depDone ? undefined : "5 3"}
                fill="none" markerEnd={depDone ? "url(#tip-done)" : "url(#tip)"}
                style={{ pointerEvents: "none" }}
              />
            )
          })
      )}

      {/* Sequential chain when no explicit deps */}
      {(() => {
        const hasDeps = tasks.some(t => t.dep_ids.filter(d => idSet.has(d)).length > 0)
        if (hasDeps) return null
        return tasks.slice(0, -1).map((task, i) => {
          const from = positions.get(task.id)
          const to   = positions.get(tasks[i + 1].id)
          if (!from || !to) return null
          const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2
          const x2 = to.x,            y2 = to.y   + NODE_H / 2
          const mx = (x1 + x2) / 2
          return (
            <path key={`chain-${task.id}`}
              d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
              stroke="#27272a" strokeWidth="1" strokeDasharray="3 4"
              fill="none" markerEnd="url(#tip-chain)"
              style={{ pointerEvents: "none" }}
            />
          )
        })
      })()}

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
            connectingFromId={connectingFromId}
            today={today}
            onPointerDown={e => onNodePointerDown(e, task.id)}
            onAddClick={() => onAddSubtask(task)}
            onConnectClick={() => onConnectStart(task.id)}
          />
        )
      })}
    </svg>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function TaskGraph({ tasks, allTasks, tab, onAddTask, onConnect, onDisconnect }: {
  tasks: Task[]
  allTasks: Task[]
  tab: string
  onAddTask: (title: string, deadline: string, parentId?: number) => Promise<void>
  onConnect: (taskId: number, depId: number) => Promise<void>
  onDisconnect: (taskId: number, depId: number) => Promise<void>
}) {
  const [selectedNodeId, setSelectedNodeId]   = useState<number | null>(null)
  const [connectingFromId, setConnectingFromId] = useState<number | null>(null)
  const [addingFor, setAddingFor]             = useState<Task | null>(null)
  const storageKey = `fenix_graph_positions_${tab}`

  // Cancel connect mode on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConnectingFromId(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (tasks.length === 0) return null

  const selectedTask = selectedNodeId !== null ? allTasks.find(t => t.id === selectedNodeId) ?? null : null

  function handleNodeSelect(task: Task) {
    setSelectedNodeId(prev => prev === task.id ? null : task.id)
  }

  function handleConnectStart(taskId: number) {
    setConnectingFromId(prev => prev === taskId ? null : taskId)
    setSelectedNodeId(null)
  }

  async function handleConnectComplete(targetId: number) {
    if (connectingFromId === null) return
    await onConnect(connectingFromId, targetId)
    setConnectingFromId(null)
  }

  return (
    <div className="space-y-2">
      {/* Connect mode banner */}
      {connectingFromId !== null && (
        <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 border border-blue-500/25 rounded-xl">
          <p className="text-xs text-blue-400">
            Toca el nodo que debe completarse <span className="font-semibold">antes</span> de "{allTasks.find(t => t.id === connectingFromId)?.title}"
          </p>
          <button onClick={() => setConnectingFromId(null)}
            className="ml-3 shrink-0 text-blue-400 hover:text-blue-200 transition-colors">
            <X size={14}/>
          </button>
        </div>
      )}

      {/* Canvas */}
      <div className="overflow-x-auto overflow-y-auto rounded-2xl border border-slate-700/30 bg-zinc-950/60">
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-zinc-600 text-sm">
            Sin tareas. Toca <span className="text-zinc-400">+</span> para agregar.
          </div>
        ) : (
          <GraphCanvas
            tasks={tasks}
            allTasks={allTasks}
            storageKey={storageKey}
            selectedNodeId={selectedNodeId}
            connectingFromId={connectingFromId}
            onNodeSelect={handleNodeSelect}
            onAddSubtask={setAddingFor}
            onConnectStart={handleConnectStart}
            onConnectComplete={handleConnectComplete}
          />
        )}
      </div>

      {/* Description panel */}
      {selectedTask && (
        <div className="gc p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-100 leading-snug">{selectedTask.title}</p>
            <button onClick={() => setSelectedNodeId(null)}
              className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5">
              <X size={14}/>
            </button>
          </div>

          {selectedTask.description ? (
            <p className="text-sm text-zinc-400 leading-relaxed">{selectedTask.description}</p>
          ) : (
            <p className="text-xs text-zinc-600 italic">Sin descripción</p>
          )}

          {/* Dependencies */}
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
                      title="Eliminar dependencia"
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

      {/* Legend */}
      <p className="text-[10px] text-zinc-600 px-1">
        toca para ver detalles · + subtarea · → conectar nodo · arrastra para mover
      </p>

      {/* Add subtask modal */}
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
