"use client"

import { useState, useEffect } from "react"
import {
  Plus, Pencil, Trash2, X, Check, CalendarDays,
  Flame, Target, Trophy, ImageIcon, List, LayoutGrid, ChevronDown,
} from "lucide-react"
import {
  getGoals, createGoal, updateGoal, deleteGoal,
  attachHabit, detachHabit, getHabits, getGoalProgress,
} from "@/lib/api"
import { Goal, Habit, GoalProgress } from "@/lib/types"
import { supabase } from "@/lib/supabase"
import { semanticColor } from "@/lib/color"

type ViewMode = "list" | "cards"

// ── Pure helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function daysLeft(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}d vencida`, color: "text-red-400" }
  if (diff === 0) return { label: "Hoy",                       color: "text-amber-400" }
  return           { label: `${diff}d restantes`,              color: "text-zinc-400"  }
}

function getFlame(streak: number) {
  if (streak >= 7) return { level: "high",   color: "text-orange-400", label: `🔥 ${streak}d racha` }
  if (streak >= 3) return { level: "medium", color: "text-amber-400",  label: `🔥 ${streak}d racha` }
  if (streak >= 1) return { level: "low",    color: "text-yellow-500", label: `🔥 ${streak}d racha` }
  return           { level: "none",  color: "text-zinc-600",   label: "" }
}

function barColor(pct: number) {
  return semanticColor(pct)
}

// ── Shared display interface ──────────────────────────────────────────────────

interface GoalDisplayProps {
  goal:     Goal
  habits:   Habit[]
  progress: GoalProgress | null
  onEdit:   () => void
  onDelete: () => void
}

// ── GoalBody — pure content renderer, layout-agnostic ────────────────────────

function GoalBody({ goal, habits, progress, onEdit, onDelete }: GoalDisplayProps) {
  const linked  = habits.filter(h => goal.habit_ids.includes(h.id))
  const dl      = goal.deadline ? daysLeft(goal.deadline) : null
  const pct     = progress?.pct ?? 0
  const flame   = getFlame(progress?.streak_current ?? 0)
  const color   = barColor(pct)

  return (
    <div className="space-y-2.5 min-w-0 flex-1">
      {/* Title + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target size={15} className="text-amber-400 shrink-0"/>
          <h3 className="font-semibold text-zinc-100 truncate text-sm">{goal.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {flame.level !== "none" && (
            <span className={`text-xs font-semibold ${flame.color}`}>{flame.label}</span>
          )}
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <Pencil size={13}/>
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {/* Description */}
      {goal.description && (
        <p className="text-xs text-zinc-400 leading-snug">{goal.description}</p>
      )}

      {/* Progress */}
      {goal.habit_ids.length > 0 && progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">Progreso</span>
            <div className="flex items-center gap-2">
              {progress.streak_best > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                  <Trophy size={9}/> mejor {progress.streak_best}d
                </span>
              )}
              <span className="text-xs font-semibold tabular-nums" style={{ color }}>{pct}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: color }}/>
          </div>
          <p className="text-[10px] text-zinc-600">
            {progress.perfect_days} días perfectos de {progress.active_days} activos
          </p>
        </div>
      )}

      {/* Commitment */}
      {goal.commitment && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <p className="text-[10px] text-amber-400 font-medium">Compromiso</p>
          <p className="text-xs text-zinc-300 mt-0.5">{goal.commitment}</p>
        </div>
      )}

      {/* Deadline */}
      {goal.deadline && (
        <div className="flex items-center gap-1.5">
          <CalendarDays size={11} className={dl?.color}/>
          <span className={`text-xs ${dl?.color}`}>
            {fmtDate(goal.deadline)} · {dl?.label}
          </span>
        </div>
      )}

      {/* Habits */}
      {linked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {linked.map(h => (
            <span key={h.id} className="flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-400">
              <Flame size={10} className="text-amber-400"/>
              {h.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 italic">Sin hábitos vinculados</p>
      )}
    </div>
  )
}

// ── GoalListItem — compact row, expands inline ────────────────────────────────

function GoalListItem({ goal, habits, progress, onEdit, onDelete }: GoalDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const flame    = getFlame(progress?.streak_current ?? 0)
  const pct      = progress?.pct ?? 0
  const color    = barColor(pct)
  const isOverdue = goal.deadline ? daysLeft(goal.deadline).color === "text-red-400" : false

  return (
    <div className={`gc rounded-2xl overflow-hidden transition-all ${isOverdue ? "!border-red-500/30" : ""}`}>
      {/* Compact row */}
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {/* Thumbnail */}
        {goal.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={goal.image_url} alt={goal.title}
            className="w-10 h-10 rounded-xl object-cover shrink-0"/>
        ) : (
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
            <Target size={16} className="text-amber-400"/>
          </div>
        )}

        {/* Title + mini progress */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">{goal.title}</p>
          {goal.habit_ids.length > 0 && progress && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }}/>
              </div>
              <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color }}>{pct}%</span>
            </div>
          )}
        </div>

        {/* Flame + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {flame.level !== "none" && (
            <span className={`text-xs font-semibold ${flame.color}`}>{flame.label}</span>
          )}
          <ChevronDown size={14}
            className={`text-zinc-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}/>
        </div>
      </button>

      {/* Expanded detail: image left + GoalBody right */}
      {expanded && (
        <div className="border-t border-slate-700/30 p-4 flex items-start gap-4">
          {goal.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={goal.image_url} alt={goal.title}
              className="w-28 h-28 rounded-xl object-cover shrink-0"/>
          )}
          <GoalBody goal={goal} habits={habits} progress={progress} onEdit={onEdit} onDelete={onDelete}/>
        </div>
      )}
    </div>
  )
}

// ── GoalCardItem — full card, image-aware horizontal layout ───────────────────

function GoalCardItem({ goal, habits, progress, onEdit, onDelete }: GoalDisplayProps) {
  const isOverdue = goal.deadline ? daysLeft(goal.deadline).color === "text-red-400" : false

  return (
    <div className={`gc rounded-2xl overflow-hidden transition-all ${isOverdue ? "!border-red-500/30" : ""}`}>
      {goal.image_url ? (
        <div className="flex items-stretch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={goal.image_url} alt={goal.title}
            className="w-32 object-cover shrink-0"/>
          <div className="flex-1 p-4 min-w-0">
            <GoalBody goal={goal} habits={habits} progress={progress} onEdit={onEdit} onDelete={onDelete}/>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <GoalBody goal={goal} habits={habits} progress={progress} onEdit={onEdit} onDelete={onDelete}/>
        </div>
      )}
    </div>
  )
}

// ── GoalItemWithProgress — loads progress, delegates to view component ────────

function GoalItemWithProgress({ goal, habits, view, onEdit, onDelete }: {
  goal:     Goal
  habits:   Habit[]
  view:     ViewMode
  onEdit:   () => void
  onDelete: () => void
}) {
  const [progress, setProgress] = useState<GoalProgress | null>(null)

  useEffect(() => {
    if (goal.habit_ids.length > 0) {
      getGoalProgress(goal.id).then(setProgress).catch(() => {})
    }
  }, [goal.id, goal.habit_ids.length])

  const props: GoalDisplayProps = { goal, habits, progress, onEdit, onDelete }

  return view === "list"
    ? <GoalListItem  {...props}/>
    : <GoalCardItem  {...props}/>
}

// ── ViewToggle ────────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-zinc-800/60 p-1 rounded-xl">
      <button onClick={() => onChange("list")}
        className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
        title="Vista lista">
        <List size={14}/>
      </button>
      <button onClick={() => onChange("cards")}
        className={`p-1.5 rounded-lg transition-colors ${view === "cards" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
        title="Vista tarjetas">
        <LayoutGrid size={14}/>
      </button>
    </div>
  )
}

// ── GoalModal ─────────────────────────────────────────────────────────────────

function GoalModal({ initial, habits, onSave, onClose }: {
  initial?: Goal
  habits:   Habit[]
  onSave:   (data: Partial<Goal>, habitIds: string[]) => Promise<void>
  onClose:  () => void
}) {
  const [title,       setTitle]       = useState(initial?.title       ?? "")
  const [description, setDesc]        = useState(initial?.description ?? "")
  const [commitment,  setCommitment]  = useState(initial?.commitment  ?? "")
  const [deadline,    setDeadline]    = useState(initial?.deadline    ?? "")
  const [imageUrl,    setImageUrl]    = useState<string | null>(initial?.image_url ?? null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selected,    setSelected]    = useState<string[]>(initial?.habit_ids ?? [])
  const [saving,      setSaving]      = useState(false)

  function toggleHabit(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id])
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const ext  = file.name.split(".").pop()
      const path = `goals/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from("goal-images").upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from("goal-images").getPublicUrl(path)
      setImageUrl(data.publicUrl)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Error al subir imagen")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        description: description.trim() || null,
        commitment:  commitment.trim()  || null,
        deadline:    deadline           || null,
        image_url:   imageUrl,
      }, selected)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-slate-700/40 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
          <h2 className="font-semibold text-zinc-100">{initial ? "Editar meta" : "Nueva meta"}</h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300"><X size={18}/></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Image */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 flex items-center gap-1">
              <ImageIcon size={11}/> Imagen (opcional)
            </label>
            <label className={`flex items-center gap-3 cursor-pointer w-full rounded-xl border border-dashed transition-colors
              ${uploading ? "border-zinc-600 opacity-60" : "border-zinc-700 hover:border-green-500/50"}`}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="meta" className="w-16 h-16 object-cover rounded-xl shrink-0"/>
              ) : (
                <div className="w-16 h-16 bg-zinc-800 rounded-xl flex items-center justify-center shrink-0">
                  <ImageIcon size={20} className="text-zinc-600"/>
                </div>
              )}
              <div className="flex-1 py-3 pr-3">
                <p className="text-xs text-zinc-400">
                  {uploading ? "Subiendo…" : imageUrl ? "Cambiar imagen" : "Seleccionar imagen"}
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">JPG, PNG, WebP</p>
              </div>
              <input type="file" accept="image/*" className="hidden"
                onChange={handleImageChange} disabled={uploading}/>
            </label>
            {imageUrl && (
              <button onClick={() => setImageUrl(null)}
                className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors">
                Eliminar imagen
              </button>
            )}
            {uploadError && (
              <p className="text-[10px] text-red-400 mt-1">{uploadError}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Título *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ej. Correr 5km sin parar"
              className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Descripción</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)}
              placeholder="¿Qué quieres lograr exactamente?" rows={2}
              className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50 resize-none"/>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Compromiso</label>
            <input value={commitment} onChange={e => setCommitment(e.target.value)}
              placeholder="¿Qué entregas si no lo logras?"
              className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 flex items-center gap-1">
              <CalendarDays size={11}/> Fecha límite
            </label>
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-green-500/50"/>
          </div>

          {habits.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Hábitos vinculados</label>
              <div className="flex flex-wrap gap-2">
                {habits.map(h => {
                  const active = selected.includes(h.id)
                  return (
                    <button key={h.id} onClick={() => toggleHabit(h.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border
                        ${active
                          ? "bg-green-500/20 border-green-500/50 text-green-300"
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                      {active && <Check size={10} className="inline mr-1"/>}
                      {h.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-700/40">
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40 text-sm font-semibold text-black transition-colors">
            {saving ? "Guardando…" : initial ? "Guardar cambios" : "Crear meta"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals,     setGoals]     = useState<Goal[]>([])
  const [habits,    setHabits]    = useState<Habit[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<ViewMode>("cards")
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<Goal | undefined>(undefined)

  async function load() {
    const [g, h] = await Promise.all([getGoals(), getHabits()])
    setGoals(g)
    setHabits(h)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSave(data: Partial<Goal>, habitIds: string[]) {
    if (editing) {
      const updated = await updateGoal(editing.id, data)
      const prev    = editing.habit_ids
      await Promise.all([
        ...habitIds.filter(id => !prev.includes(id)).map(id => attachHabit(updated.id, id)),
        ...prev.filter(id => !habitIds.includes(id)).map(id => detachHabit(updated.id, id)),
      ])
    } else {
      const goal = await createGoal(data as Omit<Goal, "id" | "created_at" | "habit_ids">)
      await Promise.all(habitIds.map(id => attachHabit(goal.id, id)))
    }
    await load()
  }

  async function handleDelete(id: number) {
    await deleteGoal(id)
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-10">

      {/* Header */}
      <div className="px-4 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40 sticky top-[128px] z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Metas</h1>
            <p className="text-xs text-zinc-500">Objetivos vinculados a tus hábitos</p>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView}/>
            <button onClick={() => { setEditing(undefined); setShowModal(true) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors">
              <Plus size={14}/> Nueva
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-20 bg-zinc-900 rounded-2xl animate-pulse"/>)}
          </div>
        ) : goals.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Target size={36} className="text-zinc-700 mx-auto"/>
            <p className="text-zinc-500 text-sm">Sin metas todavía</p>
            <button onClick={() => { setEditing(undefined); setShowModal(true) }}
              className="px-4 py-2 rounded-xl border border-dashed border-zinc-700 text-zinc-500 text-sm hover:border-green-500/50 hover:text-green-400 transition-colors">
              Crear primera meta
            </button>
          </div>
        ) : (
          goals.map(goal => (
            <GoalItemWithProgress
              key={goal.id}
              goal={goal}
              habits={habits}
              view={view}
              onEdit={() => { setEditing(goal); setShowModal(true) }}
              onDelete={() => handleDelete(goal.id)}
            />
          ))
        )}
      </div>

      {showModal && (
        <GoalModal
          initial={editing}
          habits={habits}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(undefined) }}
        />
      )}
    </div>
  )
}
