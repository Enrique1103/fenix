"use client"

import { useState } from "react"
import { X, Trash2, Check } from "lucide-react"
import { Task } from "@/lib/types"
import { updateTask, deleteTask } from "@/lib/api"
import { DateInput } from "@/components/date-input"

interface TaskDetailModalProps {
  task: Task
  onClose: () => void
  onSaved: () => void
}

export function TaskDetailModal({ task, onClose, onSaved }: TaskDetailModalProps) {
  const [title,       setTitle]       = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [deadline,    setDeadline]    = useState<string | null>(task.deadline)
  const [completed,   setCompleted]   = useState(task.completed)
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description || null,
        deadline,
        completed,
      })
      onSaved()
      onClose()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    await deleteTask(task.id)
    onSaved()
    onClose()
  }

  async function handleToggleComplete() {
    const next = !completed
    setCompleted(next)
    await updateTask(task.id, { completed: next })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-zinc-900 border border-slate-700/40 rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header — igual al modal de metas */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
          <h2 className="font-semibold text-zinc-100">Detalle de tarea</h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={18}/>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Estado completada */}
          <button onClick={handleToggleComplete}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all w-full text-left
              ${completed
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
            <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all
              ${completed ? "bg-green-500 border-green-500" : "border-slate-600"}`}>
              {completed && <Check size={11} className="text-black"/>}
            </span>
            <span className="text-sm font-medium">{completed ? "Completada" : "Pendiente — marcar como completa"}</span>
          </button>

          {/* Título */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Título</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100
                placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Descripción</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Sin descripción"
              rows={3}
              className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100
                placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50 resize-none"/>
          </div>

          {/* Fecha límite */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Fecha límite</label>
            <DateInput value={deadline} onChange={setDeadline} placeholder="Sin fecha límite"/>
          </div>

          {/* Acciones secundarias */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleDelete}
              className="px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/8 text-red-400 transition-colors hover:bg-red-500/15">
              <Trash2 size={15}/>
            </button>
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-700/40 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
              Cancelar
            </button>
          </div>

          {/* Guardar — igual al botón de metas */}
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40
              text-sm font-semibold text-black transition-colors">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  )
}
