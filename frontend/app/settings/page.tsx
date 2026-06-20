"use client"

import { useEffect, useState } from "react"
import { Bell, MessageSquareQuote, Clock, LogOut } from "lucide-react"
import { resetMonth, resetAll } from "@/lib/api"
import { getSettings, saveSettings, QuoteSettings } from "@/lib/quote-utils"
import { supabase } from "@/lib/supabase"

export default function SettingsPage() {
  const [confirm, setConfirm]   = useState<null | "month" | "all">(null)
  const [settings, setSettings] = useState<QuoteSettings>({
    habitTime: "21:00", quoteTime: "07:30", quoteCount: 1,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSettings(getSettings())
  }, [])

  function handleSaveSettings() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
