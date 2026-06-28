"use client"

import { useEffect, useState, useRef } from "react"
import { ChevronLeft, ChevronRight, Plus, Check, ChevronDown, Pencil, Trash2, X, ArrowRight } from "lucide-react"
import { Footprint } from "@/components/footprint"
import {
  setDayOverride,
  createTemplate, deleteTemplate,
  createBlock, updateBlock, deleteBlock,
  createDayBlock, updateDayBlock, deleteDayBlock,
  completeBlock,
  createCategory,
  setRecord, updateTask, setBlockDayTask,
} from "@/lib/api"
import { RoutineTemplate, RoutineBlock, RoutineDayBlock, RoutineDayView, RoutineCategory, Task } from "@/lib/types"
import { useTasks, useDayView, useTemplates, useCategories } from "@/lib/swr-hooks"

// ── Constantes ────────────────────────────────────────────────────────────────

const BASE_CATEGORIES = [
  { slug: "work",     label: "Trabajo",  color: "#6366f1" },
  { slug: "health",   label: "Salud",    color: "#22c55e" },
  { slug: "personal", label: "Personal", color: "#fb923c" },
]

const START_HOUR = 6
const PM_START   = 12
const HOURS      = Array.from({ length: 17 }, (_, i) => i + START_HOUR) // 06:00 – 22:00
const AM_HOURS   = HOURS.slice(0, PM_START - START_HOUR)  // 06 – 11 (6 items)
const PM_HOURS   = HOURS.slice(PM_START - START_HOUR)     // 12 – 22 (11 items)
const ROW_H      = 80 // px por hora
const AM_TOTAL_H = AM_HOURS.length * ROW_H
const PM_TOTAL_H = PM_HOURS.length * ROW_H

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

function blockTopPx(startTime: string, columnStart = START_HOUR): number {
  return Math.max(0, (timeToMinutes(startTime) / 60 - columnStart) * ROW_H)
}

function blockHeightPx(startTime: string, endTime: string): number {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime)
  return Math.max((diff / 60) * ROW_H, 36)
}

function nowTopPx(): number {
  const now = new Date()
  return ((now.getHours() * 60 + now.getMinutes()) / 60 - START_HOUR) * ROW_H
}

// ── ClockPicker ───────────────────────────────────────────────────────────────

function ClockPicker({ value, onChange, onDone }: {
  value: string
  onChange: (v: string) => void
  onDone?: () => void
}) {
  const [mode, setMode]       = useState<"hour" | "minute">("hour")
  const [dragging, setDragging] = useState(false)
  const parts  = value.split(":")
  const [hour, setHour]       = useState(parseInt(parts[0]) || 0)
  const [minute, setMinute]   = useState(parseInt(parts[1]) || 0)

  const SIZE    = 220
  const C       = SIZE / 2
  const R_OUT   = 85
  const R_IN    = 55

  const OUTER_H = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const INNER_H = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
  const MINS    = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

  function polar(deg: number, r: number) {
    const rad = (deg - 90) * Math.PI / 180
    return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) }
  }

  function applyPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect  = e.currentTarget.getBoundingClientRect()
    const x     = e.clientX - rect.left - C
    const y     = e.clientY - rect.top  - C
    const raw   = Math.atan2(y, x) * (180 / Math.PI) + 90
    const angle = ((raw % 360) + 360) % 360
    const dist  = Math.sqrt(x * x + y * y)

    if (mode === "hour") {
      const idx  = Math.round(angle / 30) % 12
      const inner = dist < (R_OUT + R_IN) / 2
      const newH  = inner ? INNER_H[idx] : OUTER_H[idx]
      setHour(newH)
      onChange(`${String(newH).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)
    } else {
      const raw5    = Math.round(angle / 6) % 60
      const snapped = Math.round(raw5 / 5) * 5 % 60
      setMinute(snapped)
      onChange(`${String(hour).padStart(2, "0")}:${String(snapped).padStart(2, "0")}`)
    }
  }

  function onPD(e: React.PointerEvent<SVGSVGElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    applyPointer(e)
  }
  function onPM(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging) return
    applyPointer(e)
  }
  function onPU() {
    setDragging(false)
    if (mode === "hour") setMode("minute")
    else onDone?.()
  }

  const isInner    = hour === 0 || hour >= 13
  const handAngle  = mode === "hour"
    ? (isInner ? INNER_H.indexOf(hour) : OUTER_H.indexOf(hour)) * 30
    : minute * 6
  const handR      = mode === "hour" ? (isInner ? R_IN : R_OUT) : R_OUT
  const handEnd    = polar(handAngle, handR)
  const handBase   = polar(handAngle, 6)

  return (
    <div className="flex flex-col items-center select-none">
      {/* HH:MM display */}
      <div className="flex items-center gap-1 mb-3">
        <button onClick={() => setMode("hour")}
          className={`text-2xl font-bold px-2 py-1 rounded-lg transition-colors min-w-[52px] text-center
            ${mode === "hour" ? "text-green-400 bg-green-500/10" : "text-zinc-400 hover:text-zinc-200"}`}>
          {String(hour).padStart(2, "0")}
        </button>
        <span className="text-2xl font-bold text-zinc-600">:</span>
        <button onClick={() => setMode("minute")}
          className={`text-2xl font-bold px-2 py-1 rounded-lg transition-colors min-w-[52px] text-center
            ${mode === "minute" ? "text-green-400 bg-green-500/10" : "text-zinc-400 hover:text-zinc-200"}`}>
          {String(minute).padStart(2, "0")}
        </button>
      </div>

      {/* Clock face */}
      <svg width={SIZE} height={SIZE} className="cursor-pointer touch-none"
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}>
        <circle cx={C} cy={C} r={C - 4} className="clock-face" />

        {/* Hand */}
        <line x1={handBase.x} y1={handBase.y} x2={handEnd.x} y2={handEnd.y}
          stroke="#22c55e" strokeWidth={2} strokeLinecap="round" />
        <circle cx={C} cy={C} r={3} fill="#22c55e" />
        <circle cx={handEnd.x} cy={handEnd.y} r={18} fill="rgba(34,197,94,0.12)" />
        <circle cx={handEnd.x} cy={handEnd.y} r={5}  fill="#22c55e" />

        {mode === "hour" ? (<>
          {OUTER_H.map((h, i) => {
            const p = polar(i * 30, R_OUT); const sel = hour === h
            return <g key={`o${h}`}>
              {sel && <circle cx={p.x} cy={p.y} r={16} fill="#22c55e" />}
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                fontSize={13} fill={sel ? "#fff" : "#a1a1aa"} fontWeight={sel ? "700" : "400"}>{h}</text>
            </g>
          })}
          {INNER_H.map((h, i) => {
            const p = polar(i * 30, R_IN); const sel = hour === h
            return <g key={`i${h}`}>
              {sel && <circle cx={p.x} cy={p.y} r={14} fill="#22c55e" />}
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                fontSize={10} fill={sel ? "#fff" : "#71717a"} fontWeight={sel ? "700" : "400"}>
                {String(h).padStart(2, "0")}
              </text>
            </g>
          })}
        </>) : (
          MINS.map((m, i) => {
            const p = polar(i * 30, R_OUT); const sel = minute === m
            return <g key={m}>
              {sel && <circle cx={p.x} cy={p.y} r={16} fill="#22c55e" />}
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                fontSize={12} fill={sel ? "#fff" : "#a1a1aa"} fontWeight={sel ? "700" : "400"}>
                {String(m).padStart(2, "0")}
              </text>
            </g>
          })
        )}
      </svg>

      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-2">
        {mode === "hour" ? "Selecciona la hora" : "Selecciona los minutos"}
      </p>
    </div>
  )
}

// ── BlockModal ────────────────────────────────────────────────────────────────

function BlockModal({
  mode, isDay, block, date, templateId, habits,
  baseCategories, customCategories,
  onSave, onClose, onAddCategory,
}: {
  mode: "create" | "edit"
  isDay: boolean
  block: Partial<RoutineBlock & RoutineDayBlock> | null
  date: string
  templateId: number | null
  habits: { id: string; name: string; state: string | null }[]
  baseCategories: { slug: string; label: string; color: string }[]
  customCategories: RoutineCategory[]
  onSave: () => void
  onClose: () => void
  onAddCategory: (label: string, color: string) => Promise<void>
}) {
  const [title, setTitle]               = useState(block?.title ?? "")
  const [startTime, setStartTime]       = useState(block?.start_time ?? "09:00")
  const [endTime, setEndTime]           = useState(block?.end_time ?? "10:00")
  const [category, setCategory]         = useState(block?.category ?? "work")
  const [categoryLabel, setCategoryLabel] = useState(block?.category_label ?? "Trabajo")
  const [categoryColor, setCategoryColor] = useState(block?.category_color ?? "#6366f1")
  const [habitId, setHabitId]           = useState(block?.habit_id ?? "")
  const [notes, setNotes]               = useState(block?.notes ?? "")
  const [saveToTemplate, setSaveToTemplate] = useState(!isDay)
  const [saving, setSaving]             = useState(false)
  const [showNewCat, setShowNewCat]     = useState(false)
  const [newCatLabel, setNewCatLabel]   = useState("")
  const [newCatColor, setNewCatColor]   = useState("#8b5cf6")
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null)
  const [habitOpen, setHabitOpen]       = useState(false)
  const [taskId, setTaskId]             = useState<number | null>(
    (block as (RoutineBlock & { effective_task_id?: number | null }))?.effective_task_id
    ?? (block as RoutineBlock)?.task_id
    ?? null
  )
  const { data: allFetchedTasks = [] } = useTasks()
  const tasks = allFetchedTasks.filter(tk => !tk.completed)

  const allCategories = [
    ...baseCategories.map(c => ({ id: c.slug, label: c.label, color: c.color })),
    ...customCategories.map(c => ({ id: String(c.id), label: c.label, color: c.color })),
  ]

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const data = {
        title: title.trim(),
        start_time: startTime,
        end_time: endTime,
        category,
        category_label: categoryLabel,
        category_color: categoryColor,
        habit_id: habitId || null,
        notes: notes || null,
      }
      if (mode === "create") {
        if (saveToTemplate && templateId) {
          const newBlock = await createBlock({ ...data, template_id: templateId, ord: 0 })
          if (taskId) await setBlockDayTask(newBlock.id, date, taskId)
        } else {
          await createDayBlock({ ...data, date })
        }
      } else {
        if (isDay) await updateDayBlock(block!.id!, data)
        else {
          await updateBlock(block!.id!, data)
          // Vincular tarea del día (solo para bloques de plantilla)
          const prevTaskId = (block as RoutineBlock & { effective_task_id?: number | null })?.effective_task_id ?? (block as RoutineBlock)?.task_id ?? null
          if (taskId !== prevTaskId) {
            await setBlockDayTask(block!.id!, date, taskId)
          }
        }
      }
      onSave()
      onClose()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!block?.id) return
    if (isDay) await deleteDayBlock(block.id)
    else await deleteBlock(block.id)
    onSave()
    onClose()
  }

  const selectedHabit = habits.find(h => h.id === habitId)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-zinc-900 border border-slate-700/40 rounded-2xl
        max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header fijo — no scrollea */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700/30 shrink-0">
          <p className="text-sm font-semibold text-zinc-100">
            {mode === "create" ? "Nuevo bloque" : "Editar bloque"}
          </p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400">
            <X size={16}/>
          </button>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto px-5 pb-5 pt-4">

        {/* Título */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 block">Título</label>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            placeholder="Ej: Reunión de equipo"
            className="w-full bg-zinc-800 border border-slate-700/40 rounded-xl px-3 py-2.5
              text-sm text-zinc-200 outline-none focus:border-green-500/40"
          />
        </div>

        {/* Horario */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 block">Horario</label>
          <div className="grid grid-cols-2 gap-2">
            {(["start", "end"] as const).map(which => {
              const val   = which === "start" ? startTime : endTime
              const label = which === "start" ? "Inicio" : "Fin"
              const active = activePicker === which
              return (
                <div key={which}>
                  <p className="text-[10px] text-zinc-600 mb-1">{label}</p>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setActivePicker(active ? null : which)}
                    className={`w-full rounded-xl px-3 py-2.5 text-sm font-mono text-left border transition-all
                      ${active
                        ? "bg-zinc-800 border-green-500/40 text-green-400"
                        : "bg-zinc-800 border-slate-700/40 text-zinc-200 hover:border-zinc-600"}`}>
                    {val}
                  </button>
                </div>
              )
            })}
          </div>
          {activePicker && (
            <div className="mt-3 flex justify-center bg-zinc-800/50 rounded-2xl py-4">
              <ClockPicker
                key={activePicker}
                value={activePicker === "start" ? startTime : endTime}
                onChange={v => activePicker === "start" ? setStartTime(v) : setEndTime(v)}
                onDone={() => setActivePicker(null)}
              />
            </div>
          )}
        </div>

        {/* Categoría */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 block">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {allCategories.map(cat => {
              const sel = category === cat.id
              return (
                <button key={cat.id}
                  onClick={() => { setCategory(cat.id); setCategoryLabel(cat.label); setCategoryColor(cat.color) }}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all
                    ${sel ? "" : "bg-zinc-800 border-slate-700/40 text-zinc-500"}`}
                  style={sel ? { background: `${cat.color}22`, borderColor: cat.color, color: cat.color } : {}}>
                  {cat.label}
                </button>
              )
            })}
            {!showNewCat ? (
              <button onClick={() => setShowNewCat(true)}
                className="px-3 py-1.5 rounded-full text-xs border border-dashed border-slate-700/40 text-zinc-600">
                +
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full mt-1">
                <input
                  className="flex-1 bg-zinc-800 border border-slate-700/40 rounded-xl px-3 py-2
                    text-xs text-zinc-200 outline-none"
                  placeholder="Nombre categoría"
                  value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                />
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"/>
                <button
                  onClick={async () => {
                    if (!newCatLabel.trim()) return
                    await onAddCategory(newCatLabel.trim(), newCatColor)
                    setCategory(newCatLabel.toLowerCase())
                    setCategoryLabel(newCatLabel.trim())
                    setCategoryColor(newCatColor)
                    setNewCatLabel("")
                    setShowNewCat(false)
                  }}
                  className="px-3 py-2 rounded-xl bg-green-500/15 text-green-400 text-xs border border-green-500/25">
                  OK
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hábito vinculado */}
        {habits.length > 0 && (
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 block">
              Vincular hábito (opcional)
            </label>
            <div className="relative">
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setHabitOpen(o => !o)}
                className="w-full bg-zinc-800 border border-slate-700/40 rounded-xl px-3 py-2.5
                  text-sm text-left flex items-center justify-between text-zinc-300 hover:border-zinc-600 transition-all">
                <span className={selectedHabit ? "text-zinc-200" : "text-zinc-500"}>
                  {selectedHabit ? selectedHabit.name : "— Sin vincular —"}
                </span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${habitOpen ? "rotate-180" : ""}`}/>
              </button>
              {habitOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-slate-700/40
                  rounded-xl overflow-hidden z-10 shadow-xl">
                  <button
                    onClick={() => { setHabitId(""); setHabitOpen(false) }}
                    className="w-full px-3 py-2.5 text-sm text-zinc-500 text-left hover:bg-zinc-800 transition-colors">
                    — Sin vincular —
                  </button>
                  {habits.map(h => (
                    <button key={h.id}
                      onClick={() => { setHabitId(h.id); setHabitOpen(false) }}
                      className={`w-full px-3 py-2.5 text-sm text-left hover:bg-zinc-800 transition-colors border-t border-slate-700/20
                        ${habitId === h.id ? "text-green-400" : "text-zinc-300"}`}>
                      {h.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tarea del día (solo para bloques de plantilla) */}
        {!isDay && tasks.length > 0 && (
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 block">
              Tarea de hoy (opcional)
            </label>
            <select
              className="w-full bg-zinc-800 border border-slate-700/40 rounded-xl px-3 py-2.5
                text-sm text-zinc-300 outline-none focus:border-cyan-500/40"
              value={taskId ?? ""}
              onChange={e => setTaskId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Sin vincular —</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Notas */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 block">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Descripción opcional..."
            className="w-full bg-zinc-800 border border-slate-700/40 rounded-xl px-3 py-2.5
              text-sm text-zinc-400 outline-none resize-none h-16"/>
        </div>

        {/* Guardar en plantilla */}
        {mode === "create" && templateId && (
          <div className="flex items-center justify-between py-2.5 px-3 rounded-xl
            bg-zinc-800/40 border border-slate-700/30 mb-4">
            <span className="text-xs text-zinc-400">Guardar en plantilla</span>
            <button onClick={() => setSaveToTemplate(!saveToTemplate)}
              className={`w-10 h-5 rounded-full transition-all relative ${saveToTemplate ? "bg-green-500" : "bg-zinc-700"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all
                ${saveToTemplate ? "left-5" : "left-0.5"}`}/>
            </button>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          {mode === "edit" && (
            <button onClick={handleDelete}
              className="px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/8 text-red-400">
              <Trash2 size={14}/>
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700/40 text-zinc-500 text-sm">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40
              text-sm font-semibold text-black transition-colors">
            {saving ? "…" : "Guardar"}
          </button>
        </div>

        </div>{/* fin body scrollable */}
      </div>
    </div>
  )
}

// ── TmplModal ────────────────────────────────────────────────────────────────

function TmplModal({ onClose, name, setName, onCreate }: {
  onClose: () => void
  name: string
  setName: (v: string) => void
  onCreate: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState("")

  async function handle() {
    if (!name.trim()) return
    setSaving(true)
    setError("")
    try {
      await onCreate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al crear la plantilla")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-zinc-900 border border-slate-700/40 rounded-2xl p-5"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-zinc-200 mb-3">Nueva plantilla</p>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handle()}
          placeholder="Ej: Semana laboral"
          className="w-full bg-zinc-800 border border-slate-700/40 rounded-xl px-3 py-2.5
            text-sm text-zinc-200 outline-none focus:border-green-500/40"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700/40 text-zinc-500 text-sm">
            Cancelar
          </button>
          <button onClick={handle} disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40
              text-black text-sm font-semibold transition-colors">
            {saving ? "…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function RoutinePage() {
  const [date, setDate] = useState(new Date())
  const [nowPx, setNowPx] = useState(-1)

  const [modal, setModal] = useState<{
    open: boolean
    mode: "create" | "edit"
    isDay: boolean
    block: Partial<RoutineBlock & RoutineDayBlock> | null
  }>({ open: false, mode: "create", isDay: true, block: null })

  const [tmplModal, setTmplModal]     = useState(false)
  const [newTmplName, setNewTmplName] = useState("")
  const [isDesktop, setIsDesktop]     = useState(false)

  const dragRef = useRef<{
    blockId: number; isDay: boolean
    startY: number; startMins: number; duration: number; columnStart: number
  } | null>(null)
  const nowRef      = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)

  const dateStr = toISODate(date)

  const { data: dayView, isLoading: loading, mutate: mutateDayView } = useDayView(dateStr)
  const { data: templates = [], mutate: mutateTemplates } = useTemplates()
  const { data: categories = [], mutate: mutateCategories } = useCategories()

  useEffect(() => {
    setNowPx(nowTopPx())
    const id = setInterval(() => setNowPx(nowTopPx()), 30000)
    return () => clearInterval(id)
  }, [])

  function prevDay() { setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n }) }
  function nextDay() { setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n }) }
  function goToday() { setDate(new Date()) }

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isToday = mounted && toISODate(date) === toISODate(new Date())

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (!isToday || nowPx < 0 || didScrollRef.current) return
    didScrollRef.current = true
    const t = setTimeout(() => nowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 400)
    return () => clearTimeout(t)
  }, [isToday, nowPx])

  // ── Drag para mover bloques ───────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, blockId: number, isDay: boolean, startTime: string, endTime: string, columnStart = START_HOUR) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      blockId, isDay,
      startY: e.clientY,
      startMins: timeToMinutes(startTime),
      duration: timeToMinutes(endTime) - timeToMinutes(startTime),
      columnStart,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    const deltaMins = Math.round((dy / ROW_H) * 60 / 15) * 15
    const newStart = Math.max(0, Math.min(24 * 60 - d.duration, d.startMins + deltaMins))
    const el = document.getElementById(`block-${d.isDay ? "d" : "t"}-${d.blockId}`)
    if (el) el.style.top = `${blockTopPx(minutesToTime(newStart), d.columnStart)}px`
  }

  async function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null

    const dy = e.clientY - d.startY
    const deltaMins = Math.round((dy / ROW_H) * 60 / 15) * 15
    if (Math.abs(deltaMins) < 15) return

    const newStart = Math.max(0, Math.min(24 * 60 - d.duration, d.startMins + deltaMins))
    const newEnd = newStart + d.duration

    try {
      const patch = { start_time: minutesToTime(newStart), end_time: minutesToTime(newEnd) }
      if (d.isDay) await updateDayBlock(d.blockId, patch)
      else await updateBlock(d.blockId, patch)
      mutateDayView()
    } catch { mutateDayView() }
  }

  // ── Completar bloque ──────────────────────────────────────────────────────

  async function handleComplete(blockId: number, isDay: boolean, completed: boolean, habitId: string | null) {
    const next = !completed
    try {
      if (isDay) {
        await updateDayBlock(blockId, { completed: next })
        if (habitId) await setRecord(dateStr, habitId, next ? "done" : null)
      } else {
        await completeBlock(blockId, dateStr, next)
      }
      mutateDayView()
    } catch { mutateDayView() }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allBlocks = [
    ...(dayView?.template_blocks ?? []).map(b => ({ ...b, isDay: false as const })),
    ...(dayView?.day_blocks ?? []).map(b => ({ ...b, isDay: true as const })),
  ].sort((a, b) => a.start_time.localeCompare(b.start_time))

  const completedCount = allBlocks.filter(b => b.completed).length
  const pct = allBlocks.length > 0 ? Math.round((completedCount / allBlocks.length) * 100) : 0
  const TOTAL_H = HOURS.length * ROW_H

  const amBlocks = allBlocks.filter(b => timeToMinutes(b.start_time) < PM_START * 60)
  const pmBlocks = allBlocks.filter(b => timeToMinutes(b.start_time) >= PM_START * 60)

  const nowMinutes    = new Date().getHours() * 60 + new Date().getMinutes()
  const nowBlockIdx   = isToday
    ? allBlocks.findIndex(b => timeToMinutes(b.start_time) <= nowMinutes && timeToMinutes(b.end_time) > nowMinutes)
    : -1
  const nowBlock      = nowBlockIdx >= 0 ? allBlocks[nowBlockIdx] : null
  const trailBlocks   = nowBlockIdx > 0
    ? allBlocks.slice(Math.max(0, nowBlockIdx - 3), nowBlockIdx).reverse()
    : []

  // nowPx is relative to START_HOUR=6; PM column needs offset
  const nowPxPM = nowPx - (PM_START - START_HOUR) * ROW_H

  function renderColumn(
    columnBlocks: typeof allBlocks,
    colStart: number,
    colHours: number[],
    colTotalH: number,
    showNow: boolean,
    colNowPx: number,
    attachScrollRef: boolean,
  ) {
    const colTrail = trailBlocks.filter(b =>
      columnBlocks.some(cb => cb.id === b.id && cb.isDay === b.isDay)
    )
    const colNowBlock = nowBlock && columnBlocks.some(cb => cb.id === nowBlock.id && cb.isDay === nowBlock.isDay)
      ? nowBlock : null

    return (
      <div className="relative" style={{ height: colTotalH }}>

        {/* Scroll anchor */}
        {showNow && colNowPx >= 0 && colNowPx <= colTotalH && (
          <div ref={attachScrollRef ? nowRef : undefined}
            className="absolute pointer-events-none"
            style={{ top: colNowPx, left: 0, height: 1, width: 1 }}/>
        )}

        {/* Hour lines */}
        {colHours.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none"
            style={{ top: i * ROW_H }}>
            <span className={`text-[10px] w-11 text-right pr-2.5 -mt-2 flex-shrink-0
              ${h % 2 === 0 ? "text-zinc-500" : "text-zinc-700"}`}>
              {String(h).padStart(2, "0")}:00
            </span>
            <div className={`flex-1 border-t ${h % 2 === 0 ? "border-zinc-800" : "border-zinc-800/40"}`}/>
          </div>
        ))}

        {/* Trail footprints */}
        {colTrail.map((b, idx) => {
          const top = blockTopPx(b.start_time, colStart)
          const h   = blockHeightPx(b.start_time, b.end_time)
          return (
            <div key={`trail-${b.isDay ? "d" : "t"}-${b.id}`}
              className="absolute pointer-events-none z-10"
              style={{
                top: top + h / 2 - 6,
                left: idx % 2 === 0 ? 8 : 20,
                transform: `rotate(${idx % 2 === 0 ? 15 : -10}deg)`,
                opacity: Math.max(0.15, 0.4 - idx * 0.1),
              }}>
              <Footprint size={12} color="#94a3b8"/>
            </div>
          )
        })}

        {/* Now footprint — on current block */}
        {colNowBlock && (
          <div className="absolute pointer-events-none z-20 foot-now"
            style={{
              top: blockTopPx(colNowBlock.start_time, colStart)
                + blockHeightPx(colNowBlock.start_time, colNowBlock.end_time) / 2 - 10,
              left: 10,
            }}>
            <Footprint size={20} color="#ef4444"/>
          </div>
        )}

        {/* Floating now footprint — between blocks */}
        {showNow && colNowPx >= 0 && colNowPx <= colTotalH && !colNowBlock && (
          <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
            style={{ top: colNowPx }}>
            <div className="foot-now pl-1.5">
              <Footprint size={18} color="#ef4444"/>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-red-500/40 to-transparent"/>
            <span className="text-[10px] font-bold text-red-400 bg-zinc-950/90 px-1.5 py-0.5 rounded border border-red-500/30 mr-1">
              {new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}

        {/* Blocks */}
        {columnBlocks.map(block => {
          const top    = blockTopPx(block.start_time, colStart)
          const height = blockHeightPx(block.start_time, block.end_time)
          const done   = block.completed ?? false
          return (
            <div
              key={`${block.isDay ? "d" : "t"}-${block.id}`}
              id={`block-${block.isDay ? "d" : "t"}-${block.id}`}
              className="absolute left-11 right-0 rounded-lg px-2.5 py-2 touch-none select-none border-l-[3px]"
              style={{
                top, height,
                borderColor: block.category_color,
                background: "var(--card-bg)",
                opacity: done ? 0.45 : 1,
              }}
              onPointerDown={e => onPointerDown(e, block.id, block.isDay, block.start_time, block.end_time, colStart)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <div className="flex items-start justify-between gap-2 h-full">
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-tight truncate ${done ? "line-through text-zinc-500" : "font-medium"}`}
                    style={done ? undefined : { color: "var(--card-text)" }}>
                    {block.title}
                  </p>
                  {height > 44 && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {block.start_time} – {block.end_time}
                    </p>
                  )}
                  {height > 60 && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-lg"
                        style={{ background: `${block.category_color}26`, color: block.category_color }}>
                        {block.category_label}
                      </span>
                      {block.habit_id && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-400">
                          ↔ hábito
                        </span>
                      )}
                      {!block.isDay && (block as RoutineBlock & { task?: { id: number; title: string; completed: boolean } | null }).task && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-lg
                          bg-violet-500/10 text-violet-400 border border-violet-500/20 max-w-[120px] truncate inline-block">
                          ✓ {(block as RoutineBlock & { task?: { id: number; title: string; completed: boolean } | null }).task!.title}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setModal({ open: true, mode: "edit", isDay: block.isDay, block })}
                    className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center
                      hover:border-zinc-400 transition-all">
                    <Pencil size={9} className="text-zinc-500"/>
                  </button>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => handleComplete(block.id, block.isDay, done, block.habit_id)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all
                      ${done ? "bg-green-500 border-green-500" : "border-slate-600 hover:border-green-500"}`}>
                    {done && <Check size={9} className="text-white"/>}
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {columnBlocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-zinc-700">Sin bloques</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-700/35 sticky top-[128px] z-10 bg-[var(--sticky-bg)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Mi Día</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setTmplModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                bg-zinc-800 text-zinc-400 border border-slate-700/40 hover:text-zinc-200 transition-colors">
              <Plus size={13}/> Plantilla
            </button>
            <button
              onClick={() => setModal({ open: true, mode: "create", isDay: true, block: null })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                bg-green-500/10 text-green-400 border border-green-500/25 hover:bg-green-500/20 transition-colors">
              <Plus size={13}/> Bloque
            </button>
          </div>
        </div>

        {/* Plantillas */}
        {templates.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {templates.map(t => (
              <div key={t.id} className={`flex-shrink-0 flex items-center gap-1 pl-3 pr-2 py-1 rounded-full text-xs border transition-all
                ${dayView?.template?.id === t.id
                  ? "bg-green-500/12 border-green-500/25 text-green-400 font-semibold"
                  : "bg-zinc-900/60 border-slate-700/40 text-zinc-500"}`}>
                <button onClick={() => setDayOverride(dateStr, t.id).then(() => mutateDayView())}>
                  {t.name}
                </button>
                <button
                  onClick={() => deleteTemplate(t.id).then(() => { mutateDayView(); mutateTemplates() })}
                  className="ml-0.5 text-zinc-600 hover:text-red-400 transition-colors leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Navegador de día ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/20">
        <button onClick={prevDay} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors">
          <ChevronLeft size={18}/>
        </button>
        <button onClick={goToday} className="text-center">
          <p className="text-sm font-semibold text-zinc-200" suppressHydrationWarning>
            {isToday && <span className="text-green-400">Hoy · </span>}
            {date.toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </button>
        <button onClick={nextDay} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors">
          <ChevronRight size={18}/>
        </button>
      </div>

      {/* ── Progreso del día ── */}
      {allBlocks.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-700/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-zinc-500">
              {completedCount} / {allBlocks.length} bloques completados
            </span>
            <span className={`text-xs font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-zinc-400"}`}>
              {pct}%
            </span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : "linear-gradient(90deg,#22c55e,#4ade80)" }}
            />
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="mx-4 mt-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse"/>)}
          </div>
        ) : isDesktop ? (
          <div className="flex gap-1 items-start">
            {/* AM column */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2 ml-11">AM</p>
              {renderColumn(amBlocks, START_HOUR, AM_HOURS, AM_TOTAL_H, isToday && nowMinutes < PM_START * 60, nowPx, isToday && nowMinutes < PM_START * 60)}
            </div>
            {/* Connector */}
            <div className="flex flex-col items-center pt-10 text-zinc-600 w-8 flex-shrink-0">
              <ArrowRight size={18}/>
            </div>
            {/* PM column */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2 ml-11">PM</p>
              {renderColumn(pmBlocks, PM_START, PM_HOURS, PM_TOTAL_H, isToday && nowMinutes >= PM_START * 60, nowPxPM, isToday && nowMinutes >= PM_START * 60)}
            </div>
          </div>
        ) : (
          renderColumn(allBlocks, START_HOUR, HOURS, TOTAL_H, isToday, nowPx, isToday)
        )}
      </div>

      {/* ── Modal bloque ── */}
      {modal.open && (
        <BlockModal
          mode={modal.mode}
          isDay={modal.isDay}
          block={modal.block}
          date={dateStr}
          templateId={dayView?.template?.id ?? null}
          habits={dayView?.habits ?? []}
          baseCategories={BASE_CATEGORIES}
          customCategories={categories}
          onSave={mutateDayView}
          onClose={() => setModal({ open: false, mode: "create", isDay: true, block: null })}
          onAddCategory={async (label, color) => {
            await createCategory({ label, color })
            await mutateCategories()
          }}
        />
      )}

      {/* ── Modal nueva plantilla ── */}
      {tmplModal && (
        <TmplModal
          onClose={() => { setTmplModal(false); setNewTmplName("") }}
          name={newTmplName}
          setName={setNewTmplName}
          onCreate={async () => {
            if (!newTmplName.trim()) return
            await createTemplate({ name: newTmplName.trim() })
            setNewTmplName("")
            setTmplModal(false)
            mutateTemplates()
          }}
        />
      )}
    </div>
  )
}
