"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Check, CalendarDays, X, ChevronRight, Lock, GitBranch, List, Network, Pencil } from "lucide-react"
import { getTasks, createTask, updateTask, deleteTask, addTaskDep, removeTaskDep } from "@/lib/api"
import { Task } from "@/lib/types"
import dynamic from "next/dynamic"
import { DateInput } from "@/components/date-input"
import { TaskDetailModal } from "@/components/task-detail-modal"

const TaskGraph = dynamic(() => import("@/components/task-graph").then(m => ({ default: m.TaskGraph })), {
  ssr: false,
  loading: () => <div className="h-64 bg-zinc-900 rounded-2xl animate-pulse"/>,
})

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

function sortRoots(tasks: Task[]): Task[] {
  const today = getToday()
  return [...tasks].sort((a, b) => {
    const aOverdue = !a.completed && !!a.deadline && a.deadline < today
    const bOverdue = !b.completed && !!b.deadline && b.deadline < today
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline && !b.deadline) return -1
    if (!a.deadline && b.deadline) return 1
    return b.created_at.localeCompare(a.created_at)
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

function AddForm({ parentId, onAdd, onCancel }: {
  parentId?: number
  onAdd: (title: string, deadline: string, parentId?: number, description?: string) => Promise<void>
  onCancel: () => void
}) {
  const [title,       setTitle]       = useState("")
  const [deadline,    setDeadline]    = useState("")
  const [description, setDescription] = useState("")
  const [saving,      setSaving]      = useState(false)

  async function handleAdd() {
    if (!title.trim() || saving) return
    setSaving(true)
    try { await onAdd(title.trim(), deadline, parentId, description || undefined) }
    finally { setSaving(false) }
  }

  return (
    <div className="gc p-3 space-y-2">
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") onCancel() }}
        placeholder={parentId !== undefined ? "Título de la subtarea…" : "Título de la tarea…"}
        className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
      <textarea value={description} onChange={e => setDescription(e.target.value)}
        placeholder="Descripción (opcional)"
        rows={2}
        className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-400 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50 resize-none"/>
      <div className="flex items-center gap-2">
        <DateInput value={deadline || null} onChange={v => setDeadline(v ?? "")}
          placeholder="Fecha límite" className="flex-1"/>
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

function TaskNode({ task, allTasks, onToggle, onDelete, onOpenDeps, onAddTask, onOpenDetail }: {
  task: Task
  allTasks: Task[]
  onToggle: (t: Task) => void
  onDelete: (id: number) => void
  onOpenDeps: (t: Task) => void
  onAddTask: (title: string, deadline: string, parentId?: number, description?: string) => Promise<void>
  onOpenDetail: (t: Task) => void
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

  async function handleSubAdd(title: string, deadline: string, parentId?: number, description?: string) {
    await onAddTask(title, deadline, parentId, description)
    setAddingSub(false)
  }

  const showChildren = (expanded && subtasks.length > 0) || addingSub

  return (
    <div className="space-y-1">
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
            <p onClick={() => onOpenDetail(task)}
              className={`text-sm leading-snug cursor-pointer hover:text-green-300 transition-colors
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
            <button onClick={() => onOpenDetail(task)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              title="Editar tarea">
              <Pencil size={13}/>
            </button>
          </div>
        </div>
      </div>

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
              onOpenDetail={onOpenDetail}
            />
          ))}
          {addingSub && (
            <AddForm
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
  const [view, setView]           = useState<"list" | "graph">("graph")
  const [allTasks, setAllTasks]   = useState<Task[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [depsFor, setDepsFor]     = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  async function load() {
    const tasks = await getTasks()
    setAllTasks(tasks)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const roots     = allTasks.filter(t => t.parent_task_id === null)
  const pending   = sortRoots(roots.filter(t => !t.completed))
  const completed = roots.filter(t => t.completed)

  async function handleAddTask(title: string, deadline: string, parentId?: number, description?: string) {
    await createTask({ title, deadline: deadline || undefined, parent_task_id: parentId, description })
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

      <div className="px-4 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40 sticky top-[128px] z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Tareas</h1>
            <p className="text-xs text-zinc-500">
              {pending.length} pendiente{pending.length !== 1 ? "s" : ""}
              {completed.length > 0 ? ` · ${completed.length} completada${completed.length !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
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
      </div>

      <div className="p-4 space-y-4">

        {showForm ? (
          <AddForm onAdd={handleAddRoot} onCancel={() => setShowForm(false)}/>
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
              tasks={allTasks}
              allTasks={allTasks}
              onAddTask={handleAddTask}
              onConnect={async (taskId, depId) => { await addTaskDep(taskId, depId); await load() }}
              onDisconnect={async (taskId, depId) => { await removeTaskDep(taskId, depId); await load() }}
              onDelete={async (taskId) => { await deleteTask(taskId); await load() }}
              onTaskClick={setDetailTask}
              onToggleComplete={handleToggle}
            />
            {allTasks.length === 0 && (
              <div className="text-center py-12 text-zinc-600">
                <p className="text-sm">Sin tareas todavía</p>
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
                  onOpenDetail={setDetailTask}
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
                    onOpenDetail={setDetailTask}
                  />
                ))}
              </div>
            )}

            {allTasks.length === 0 && (
              <div className="text-center py-12 text-zinc-600">
                <p className="text-sm">Sin tareas todavía</p>
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

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onSaved={() => { load(); setDetailTask(null) }}
        />
      )}
    </div>
  )
}
