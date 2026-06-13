"use client"

import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Check, X, Bell, MessageSquareQuote, Clock, LogOut } from "lucide-react"
import { getHabits, createHabit, updateHabit, deleteHabit, resetMonth, resetAll, reorderHabits } from "@/lib/api"
import { Habit } from "@/lib/types"
import { getSettings, saveSettings, QuoteSettings } from "@/lib/quote-utils"
import { supabase } from "@/lib/supabase"

export default function SettingsPage() {
  const [habits, setHabits]     = useState<Habit[]>([])
  const [loading, setLoading]   = useState(true)
  const [newName, setNewName]   = useState("")
  const [adding, setAdding]     = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [confirm, setConfirm]   = useState<null | "month" | "all">(null)
  const [apiError, setApiError] = useState("")
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const [settings, setSettings] = useState<QuoteSettings>({
    habitTime: "21:00", quoteTime: "07:30", quoteCount: 1,
  })
  const [saved, setSaved] = useState(false)

  async function load() {
    const h = await getHabits()
    setHabits(h)
    setLoading(false)
  }

  useEffect(() => {
    load()
    setSettings(getSettings())
  }, [])

  function handleSaveSettings() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setApiError("")
    try {
      await createHabit(newName.trim())
      setNewName(""); setAdding(false); load()
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Error desconocido")
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return
    await updateHabit(id, { name: editName.trim() })
    setEditingId(null); load()
  }

  async function handleDelete(id: string) {
    await deleteHabit(id); load()
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("habitId", id)
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    setDragOverId(id)
  }

  async function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    setDragOverId(null)
    const draggedId = e.dataTransfer.getData("habitId")
    if (!draggedId || draggedId === targetId) return
    const reordered = [...habits]
    const fromIdx = reordered.findIndex(h => h.id === draggedId)
    const toIdx   = reordered.findIndex(h => h.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setHabits(reordered)
    await reorderHabits(reordered.map(h => h.id))
  }

  async function handleResetMonth() {
    const now = new Date()
    await resetMonth(now.getFullYear(), now.getMonth() + 1)
    setConfirm(null)
  }

  async function handleResetAll() {
    await resetAll(); setConfirm(null)
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-10">

      {/* Header */}
      <div className="px-4 pt-4 pb-4 bg-[var(--sticky-bg)] border-b border-slate-700/40 sticky top-[128px] z-10">
        <h1 className="text-lg font-bold">Ajustes</h1>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Hábitos ── */}
        <div className="gc overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/40">
            <p className="text-xs uppercase tracking-wider text-zinc-400">Hábitos</p>
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors">
              <Plus size={14}/> Agregar
            </button>
          </div>

          {adding && (
            <div className="border-b border-slate-700/40">
              <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800/40">
                <input autoFocus value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setApiError("") } }}
                  placeholder="Nombre del hábito"
                  className="flex-1 bg-transparent text-sm outline-none placeholder-zinc-500"
                />
                <button onClick={handleAdd} className="text-green-400 hover:text-green-300 p-1"><Check size={16}/></button>
                <button onClick={() => { setAdding(false); setApiError("") }} className="text-zinc-500 hover:text-zinc-300 p-1"><X size={16}/></button>
              </div>
              {apiError && <p className="px-4 py-1.5 text-xs text-red-400 bg-red-500/10">{apiError}</p>}
            </div>
          )}

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({length: 3}).map((_, i) => (
                <div key={i} className="h-8 bg-zinc-800 rounded-lg animate-pulse"/>
              ))}
            </div>
          ) : habits.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-6">Sin hábitos</p>
          ) : (
            habits.map((h, idx) => (
              <div key={h.id}
                draggable={editingId !== h.id}
                onDragStart={e => handleDragStart(e, h.id)}
                onDragOver={e => handleDragOver(e, h.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => handleDrop(e, h.id)}
                className={`flex items-center gap-3 px-4 py-3 transition-colors
                  ${idx < habits.length - 1 ? "border-b border-slate-700/25" : ""}
                  ${dragOverId === h.id ? "bg-zinc-800/60" : ""}`}>
                <span className="text-zinc-600 cursor-grab select-none text-sm">⠿</span>
                {editingId === h.id ? (
                  <>
                    <input autoFocus value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(h.id); if (e.key === "Escape") setEditingId(null) }}
                      className="flex-1 bg-zinc-800 rounded-lg px-2 py-1 text-sm outline-none"
                    />
                    <button onClick={() => handleRename(h.id)} className="text-green-400 p-1"><Check size={15}/></button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-500 p-1"><X size={15}/></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-zinc-200">{h.name}</span>
                    <button onClick={() => { setEditingId(h.id); setEditName(h.name) }}
                      className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors">
                      <Pencil size={15}/>
                    </button>
                    <button onClick={() => handleDelete(h.id)}
                      className="text-zinc-500 hover:text-red-400 p-1 transition-colors">
                      <Trash2 size={15}/>
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Recordatorios y Frases ── */}
        <div className="gc overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
            <Bell size={14} className="text-zinc-400"/>
            <p className="text-xs uppercase tracking-wider text-zinc-400">Recordatorios y Frases</p>
          </div>

          <div className="px-4 py-4 space-y-5">

            {/* Habit reminder time */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                  <Clock size={15} className="text-green-400"/>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 font-medium">Hora del recordatorio</p>
                  <p className="text-xs text-zinc-500">Notificación diaria de hábitos</p>
                </div>
              </div>
              <input
                type="time"
                value={settings.habitTime}
                onChange={e => setSettings(s => ({ ...s, habitTime: e.target.value }))}
                className="bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none
                  focus:ring-1 focus:ring-green-500/50 shrink-0"
              />
            </div>

            {/* Quote time */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <MessageSquareQuote size={15} className="text-amber-400"/>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 font-medium">Hora de las frases</p>
                  <p className="text-xs text-zinc-500">Frase motivacional del día</p>
                </div>
              </div>
              <input
                type="time"
                value={settings.quoteTime}
                onChange={e => setSettings(s => ({ ...s, quoteTime: e.target.value }))}
                className="bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none
                  focus:ring-1 focus:ring-amber-500/50 shrink-0"
              />
            </div>

            {/* Quote count */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                  <MessageSquareQuote size={15} className="text-violet-400"/>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 font-medium">Frases por día</p>
                  <p className="text-xs text-zinc-500">Máximo 2</p>
                </div>
              </div>
              <div className="flex gap-1 bg-zinc-800 p-1 rounded-xl shrink-0">
                {([1, 2] as const).map(n => (
                  <button key={n}
                    onClick={() => setSettings(s => ({ ...s, quoteCount: n }))}
                    className={`w-9 h-7 rounded-lg text-sm font-semibold transition-all
                      ${settings.quoteCount === n
                        ? "bg-violet-500 text-white"
                        : "text-zinc-500 hover:text-zinc-300"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSaveSettings}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all
                ${saved
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-green-500 hover:bg-green-400 text-black"}`}>
              {saved ? "Guardado ✓" : "Guardar configuración"}
            </button>
          </div>
        </div>

        {/* ── Cuenta ── */}
        <div className="gc overflow-hidden">
          <p className="text-xs uppercase tracking-wider text-zinc-400 px-4 py-3 border-b border-slate-700/40">
            Cuenta
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = "/login"
            }}
            className="w-full px-4 py-3.5 text-sm text-left text-zinc-300 hover:bg-zinc-800/50 transition-colors flex items-center gap-3">
            <LogOut size={15} className="text-zinc-500"/>
            Cerrar sesión
          </button>
        </div>

        {/* ── Datos ── */}
        <div className="gc overflow-hidden">
          <p className="text-xs uppercase tracking-wider text-zinc-400 px-4 py-3 border-b border-slate-700/40">
            Datos
          </p>
          <button onClick={() => setConfirm("month")}
            className="w-full px-4 py-3.5 text-sm text-left text-yellow-400 hover:bg-zinc-800/50 transition-colors border-b border-slate-700/25">
            Resetear mes actual
          </button>
          <button onClick={() => setConfirm("all")}
            className="w-full px-4 py-3.5 text-sm text-left text-red-400 hover:bg-zinc-800/50 transition-colors">
            Borrar TODOS los datos
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-6">
          <div className="gc p-6 w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2">¿Estás seguro?</h3>
            <p className="text-zinc-400 text-sm mb-5">
              {confirm === "month"
                ? "Se borrarán todos los registros del mes actual. Esta acción no se puede deshacer."
                : "Se borrarán TODOS los registros. Esta acción es irreversible."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-sm font-medium hover:bg-zinc-700 transition-colors">
                Cancelar
              </button>
              <button onClick={confirm === "month" ? handleResetMonth : handleResetAll}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-medium hover:bg-red-600 transition-colors">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
