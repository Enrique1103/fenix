"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const [mode, setMode]         = useState<"login" | "signup">("login")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [success, setSuccess]   = useState("")
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        window.location.href = "/"
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(`Error: ${error.message}`)
        setLoading(false)
      } else if (data.session) {
        window.location.href = "/"
      } else {
        setSuccess("Cuenta creada. Revisá tu correo para confirmarla.")
        setLoading(false)
      }
    }
  }

  function toggleMode() {
    setMode(m => m === "login" ? "signup" : "login")
    setError("")
    setSuccess("")
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#020817] px-6 py-12">

      {/* ── Logo ── */}
      <div className="relative w-32 h-32 mb-5 select-none">
        <Image
          src="/fenix-icon-transparent.png"
          alt="FÉNIX"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* ── Marca ── */}
      <h1 className="text-3xl font-medium tracking-wide text-amber-400"
        style={{ fontFamily: "var(--font-serif)" }}>
        FÉNIX
      </h1>
      <p className="text-amber-200/55 text-[13px] italic mt-1.5 text-center max-w-xs"
        style={{ fontFamily: "var(--font-serif)" }}>
        &ldquo;Lo fácil nunca hizo historia&rdquo;
      </p>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm mt-8 space-y-3">

        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl bg-zinc-900/70 border border-slate-700/50 text-zinc-100
            placeholder:text-zinc-500 text-sm outline-none focus:border-green-500/50
            focus:ring-1 focus:ring-green-500/20 transition-all"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl bg-zinc-900/70 border border-slate-700/50 text-zinc-100
            placeholder:text-zinc-500 text-sm outline-none focus:border-green-500/50
            focus:ring-1 focus:ring-green-500/20 transition-all"
        />

        {error   && <p className="text-red-400 text-xs text-center">{error}</p>}
        {success && <p className="text-green-400 text-xs text-center">{success}</p>}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all
            bg-green-500 text-white hover:bg-green-600
            disabled:opacity-50 disabled:cursor-not-allowed">
          {loading
            ? (mode === "login" ? "Iniciando sesión…" : "Creando cuenta…")
            : (mode === "login" ? "Iniciar sesión" : "Crear cuenta")}
        </button>

        <p className="text-center text-xs text-zinc-500 pt-1">
          {mode === "login" ? "¿Aún no tenés cuenta?" : "¿Ya tenés cuenta?"}
          {" "}
          <button type="button" onClick={toggleMode}
            className="text-amber-400 hover:text-amber-300 transition-colors font-medium">
            {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </p>
      </form>
    </div>
  )
}
