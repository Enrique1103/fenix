"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Check, CalendarDays, X, ChevronRight, Lock, GitBranch, List, Network } from "lucide-react"
import { getTasks, createTask, updateTask, deleteTask, addTaskDep, removeTaskDep } from "@/lib/api"
import { Task } from "@/lib/types"
import dynamic from "next/dynamic"

const SankeyChart = dynamic(() => import("@/components/sankey-chart").then(m => ({ default: m.SankeyChart })), { ssr: false })
const TaskGraph   = dynamic(() => import("@/components/task-graph").then(m => ({ default: m.TaskGraph })),   {
  ssr: false,
  loading: () => <div className="h-64 bg-zinc-900 rounded-2xl animate-pulse"/>,
})

type TabKey = "daily" | "weekly" | "monthly"

const TABS: { key: TabKey; label: string; color: string }[] = [
  { key: "daily",   label: "Diarias",   color: "text-green-400"  },
  { key: "weekly",  label: "Semanales", color: "text-blue-400"   },
  { key: "monthly", label: "Mensuales", color: "text-violet-400" },
]

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function isOverdue(task: Task) {
  return !task.completed && !!task.deadline && task.deadline < getToday()
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function isBlocked(task: Task, allTasks: Task[]) {
  return task.dep_ids.some(depId => {
    const dep = allTasks.find(t => t.id === depId)
    return dep && !dep.completed
  })
}

// ── Dep picker ────────────────────────────────────────────────────────────────

function DepPickerModal({ task, allTasks, onAdd, onRemove, onClose }: {
  task: Task
  allTasks: Task[]
  onAdd: (depId: number) => void
  onRemove: (depId: number) => void
  onClose: () => void
}) {
  const candidates = allTasks.filter(t =>
    t.id !== task.id &&
    t.type === task.type &&
    t.parent_task_id === null &&
    !task.dep_ids.includes(t.id)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/40">
          <p className="text-sm font-semibold text-zinc-100">Dependencias de "{task.title}"</p>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {task.dep_ids.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Actuales</p>
              {task.dep_ids.map(depId => {
                const dep = allTasks.find(t => t.id === depId)
                if (!dep) return null
                return (
                  <div key={depId} className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-800 rounded-xl">
                    <span className={`text-sm flex-1 truncate ${dep.completed ? "line-through text-zinc-500" : "text-zinc-200"}`}>
                      {dep.title}
                    </span>
                    <button onClick={() => onRemove(depId)} className="text-zinc-600 hover:text-red-400 transition-colors">
                      <X size={14}/>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Agregar</p>
              {candidates.map(t => (
                <button key={t.id} onClick={() => onAdd(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left transition-colors">
                  <Plus size={13} className="text-zinc-500 shrink-0"/>
                  <span className="text-sm text-zinc-300 truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}
          {task.dep_ids.length === 0 && candidates.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-4">No hay tareas disponibles</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddForm({ tab, parentId, onAdd, onCancel }: {
  tab: TabKey
  parentId?: number
  onAdd: (title: string, deadline: string, parentId?: number) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle]       = useState("")
  const [deadline, setDeadline] = useState("")
  const [saving, setSaving]     = useState(false)

  async function handleAdd() {
    if (!title.trim() || saving) return
    setSaving(true)
    try { await onAdd(title.trim(), deadline, parentId) } finally { setSaving(false) }
  }

  return (
    <div className="gc p-3 space-y-2">
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") onCancel() }}
        placeholder={parentId !== undefined ? "Título de la subtarea…" : "Título de la tarea…"}
        className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
      <div className="flex items-center gap-2">
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
          className="flex-1 bg-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-400 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
        <button onClick={handleAdd} disabled={!title.trim() || saving}
          className="px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40 text-xs font-semibold text-black transition-colors">
          {saving ? "…" : "Agregar"}
        </button>
        <button onClick={onCancel} className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
          <X size={14}/>
        </button>
      </div>
    </div>
  )
}

// ── Task node (recursive) ─────────────────────────────────────────────────────

function TaskNode({ task, allTasks, onToggle, onDelete, onOpenDeps, onAddTask, tab }: {
  task: Task
  allTasks: Task[]
  onToggle: (t: Task) => void
  onDelete: (id: number) => void
  onOpenDeps: (t: Task) => void
  onAddTask: (title: string, deadline: string, parentId?: number) => Promise<void>
  tab: TabKey
}) {
  const [expanded, setExpanded] = useState(true)
  const [addingSub, setAddingSub] = useState(false)

  const subtasks    = allTasks.filter(t => t.parent_task_id === task.id)
  const blocked     = isBlocked(task, allTasks)
  const overdue     = isOverdue(task)
  const hasDeps     = task.dep_ids.length > 0
  const pendingDeps = task.dep_ids
    .map(id => allTasks.find(t => t.id === id))
    .filter((d): d is Task => !!d && !d.completed)

  async function handleSubAdd(title: string, deadline: string, parentId?: number) {
    await onAddTask(title, deadline, parentId)
    setAddingSub(false)
  }

  const showChildren = (expanded && subtasks.length > 0) || addingSub

  return (
    <div className="space-y-1">
      {/* Node card */}
      <div className={`gc rounded-xl transition-all
        ${blocked ? "opacity-60 !border-zinc-700" : ""}
        ${overdue && !blocked ? "!border-red-500/40" : ""}`}>

        <div className="flex items-center gap-2 px-3 py-3">
          {subtasks.length > 0 ? (
            <button onClick={() => setExpanded(e => !e)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
              <ChevronRight size={15} className={`transition-transform ${expanded ? "rotate-90" : ""}`}/>
            </button>
          ) : (
            <div className="w-[15px] shrink-0"/>
          )}

          <button onClick={() => !blocked && onToggle(task)} disabled={blocked}
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors
              ${task.completed
                ? "bg-green-500"
                : blocked
                  ? "bg-zinc-800 border border-zinc-700 cursor-not-allowed"
                  : "bg-zinc-800 border border-zinc-700 hover:border-green-500/50"}`}>
            {task.completed && <Check size={12} className="text-black"/>}
            {blocked && !task.completed && <Lock size={10} className="text-zinc-600"/>}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-sm leading-snug
              ${task.completed ? "line-through text-zinc-500" : blocked ? "text-zinc-500" : "text-zinc-100"}`}>
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              {task.deadline && (
                <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-400" : "text-zinc-600"}`}>
                  <CalendarDays size={10}/>
                  {fmtDate(task.deadline)}
                </span>
              )}
              {pendingDeps.length > 0 && (
                <span className="text-xs text-amber-500/80 flex items-center gap-1">
                  <Lock size={9}/>
                  {pendingDeps.map(d => d.title).join(", ")}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onOpenDeps(task)}
              className={`p-1.5 rounded-lg transition-colors
                ${hasDeps ? "text-amber-400 hover:bg-amber-500/10" : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800"}`}
              title="Dependencias">
              <GitBranch size={13}/>
            </button>
            <button onClick={() => setAddingSub(s => !s)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              title="Agregar subtarea">
              <Plus size={13}/>
            </button>
            <button onClick={() => onDelete(task.id)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 size={13}/>
            </button>
          </div>
        </div>
      </div>

      {/* Children (recursive) + add-sub form */}
      {showChildren && (
        <div className="ml-5 pl-3 border-l border-zinc-800 space-y-1">
          {expanded && subtasks.map(sub => (
            <TaskNode
              key={sub.id}
              task={sub}
              allTasks={allTasks}
              onToggle={onToggle}
              onDelete={onDelete}
              onOpenDeps={onOpenDeps}
              onAddTask={onAddTask}
              tab={tab}
            />
          ))}
          {addingSub && (
            <AddForm
              tab={tab}
              parentId={task.id}
              onAdd={handleSubAdd}
              onCancel={() => setAddingSub(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tab, setTab]         = useState<TabKey>("daily")
  const [view, setView]       = useState<"list" | "graph">("list")
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [depsFor, setDepsFor] = useState<Task | null>(null)

  async function load() {
    const tasks = await getTasks()
    setAllTasks(tasks)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const tabTasks  = allTasks.filter(t => t.type === tab)
  const roots     = tabTasks.filter(t => t.parent_task_id === null)
  const pending   = roots.filter(t => !t.completed)
  const completed = roots.filter(t => t.completed)

  const today = getToday()
  const tabTasks = allTasks.filter(t => t.type === tab)
  const sankeyData = {
    completed: tabTasks.filter(t => t.completed).length,
    overdue:   tabTasks.filter(t => !t.completed && !!t.deadline && t.deadline < today).length,
    pending:   tabTasks.filter(t => !t.completed && (!t.deadline || t.deadline >= today)).length,
  }

  async function handleAddTask(title: string, deadline: string, parentId?: number) {
    await createTask({ title, type: tab, deadline: deadline || undefined, parent_task_id: parentId })
    await load()
  }

  async function handleAddRoot(title: string, deadline: string) {
    await handleAddTask(title, deadline)
    setShowForm(false)
  }

  async function handleToggle(task: Task) {
    await updateTask(task.id, { completed: !task.completed })
    await load()
  }

  async function handleDelete(id: number) {
    await deleteTask(id)
    await load()
  }

  async function handleAddDep(depId: number) {
    if (!depsFor) return
    await addTaskDep(depsFor.id, depId)
    await load()
    setDepsFor(prev => prev ? { ...prev, dep_ids: [...prev.dep_ids, depId] } : prev)
  }

  async function handleRemoveDep(depId: number) {
    if (!depsFor) return
    await removeTaskDep(depsFor.id, depId)
    await load()
    setDepsFor(prev => prev ? { ...prev, dep_ids: prev.dep_ids.filter(id => id !== depId) } : prev)
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-8">

      {/* Header */}
      <div className="px-4 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40 sticky top-[128px] z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Tareas</h1>
          <div className="flex items-center gap-1 bg-zinc-800/60 p-1 rounded-xl">
            <button onClick={() => setView("list")}
              className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Vista lista">
              <List size={14}/>
            </button>
            <button onClick={() => setView("graph")}
              className={`p-1.5 rounded-lg transition-colors ${view === "graph" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Vista grafo">
              <Network size={14}/>
            </button>
          </div>
        </div>
        <div className="flex gap-1 bg-zinc-800/60 p-1 rounded-xl">
          {TABS.map(({ key, label, color }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${tab === key ? `bg-zinc-900 ${color}` : "text-zinc-500 hover:text-zinc-300"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* Sankey */}
        {allTasks.length > 0 && (
          <div className="gc p-4" style={{ borderColor: sankeyData.overdue > 0 ? "rgba(239,68,68,0.25)" : undefined }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-zinc-200">Análisis de Fuga de Energía</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{allTasks.length} tareas en total</p>
              </div>
              {sankeyData.overdue > 0 && (
                <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg font-medium shrink-0">
                  ⚡ {sankeyData.overdue} vencida{sankeyData.overdue > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <SankeyChart data={sankeyData}/>
          </div>
        )}

        {/* Add form */}
        {showForm ? (
          <AddForm tab={tab} onAdd={handleAddRoot} onCancel={() => setShowForm(false)}/>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full flex items-center gap-2 py-3 px-4 rounded-2xl border border-dashed border-zinc-700 text-zinc-500 hover:border-green-500/50 hover:text-green-400 transition-colors">
            <Plus size={16}/>
            <span className="text-sm">Nueva tarea</span>
          </button>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-14 bg-zinc-900 rounded-xl animate-pulse"/>)}
          </div>
        ) : view === "graph" ? (
          <>
            <TaskGraph
              tasks={roots}
              allTasks={allTasks}
              tab={tab}
              onAddTask={handleAddTask}
              onConnect={async (taskId, depId) => { await addTaskDep(taskId, depId); await load() }}
              onDisconnect={async (taskId, depId) => { await removeTaskDep(taskId, depId); await load() }}
            />
            {roots.length === 0 && (
              <div className="text-center py-12 text-zinc-600">
                <p className="text-sm">Sin tareas {TABS.find(t => t.key === tab)?.label.toLowerCase()}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-2">
              {pending.map(task => (
                <TaskNode
                  key={task.id}
                  task={task}
                  allTasks={allTasks}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onOpenDeps={setDepsFor}
                  onAddTask={handleAddTask}
                  tab={tab}
                />
              ))}
            </div>

            {completed.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-zinc-600 px-1 pt-2">
                  Completadas ({completed.length})
                </p>
                {completed.map(task => (
                  <TaskNode
                    key={task.id}
                    task={task}
                    allTasks={allTasks}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onOpenDeps={setDepsFor}
                    onAddTask={handleAddTask}
                    tab={tab}
                  />
                ))}
              </div>
            )}

            {tabTasks.length === 0 && (
              <div className="text-center py-12 text-zinc-600">
                <p className="text-sm">Sin tareas {TABS.find(t => t.key === tab)?.label.toLowerCase()}</p>
              </div>
            )}
          </>
        )}
      </div>

      {depsFor && (
        <DepPickerModal
          task={depsFor}
          allTasks={allTasks}
          onAdd={handleAddDep}
          onRemove={handleRemoveDep}
          onClose={() => setDepsFor(null)}
        />
      )}
    </div>
  )
}
