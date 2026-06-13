"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Activity, BarChart2, Target, ClipboardList, Bell, Settings, Sun, Moon, CalendarDays } from "lucide-react"
import { useEffect, useState } from "react"
import { getDailyQuotes, getSettings } from "@/lib/quote-utils"
import { Quote } from "@/lib/quotes"

const NAV_MAIN = [
  { href: "/",         icon: Activity,      label: "Hábitos"      },
  { href: "/stats",    icon: BarChart2,     label: "Estadísticas" },
  { href: "/goals",    icon: Target,        label: "Metas"        },
  { href: "/tasks",    icon: ClipboardList, label: "Tareas"       },
  { href: "/calendar", icon: CalendarDays,  label: "Calendario"   },
]

const NAV_RIGHT = [
  { href: "/settings",      icon: Settings, label: "Ajustes"        },
  { href: "/notifications", icon: Bell,     label: "Notificaciones" },
]

export default function TopNav() {
  const pathname = usePathname()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    const { quoteCount } = getSettings()
    const q = getDailyQuotes(quoteCount)
    if (q.length > 0) setQuote(q[0])
    const saved = (localStorage.getItem("fenix-theme") ?? "dark") as "dark" | "light"
    setTheme(saved)
  }, [])

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    localStorage.setItem("fenix-theme", next)
    document.documentElement.setAttribute("data-theme", next)
  }

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid var(--nav-border)",
      }}
    >
      {/* ── Row 1: nav tabs ── */}
      <div className="flex items-center justify-between px-3 h-12 border-b border-slate-700/20">

        {/* Left: main pages */}
        <div className="flex items-center gap-1">
          {NAV_MAIN.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                  ${active
                    ? "bg-green-500/15 text-green-400 border border-green-500/25"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
              >
                <Icon size={14} strokeWidth={active ? 2.5 : 1.8} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            )
          })}
        </div>

        {/* Right: theme toggle + utility icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
            className="p-2.5 rounded-lg transition-all text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          >
            {theme === "dark"
              ? <Sun  size={19} strokeWidth={1.8} />
              : <Moon size={19} strokeWidth={1.8} />}
          </button>
          {NAV_RIGHT.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`p-2.5 rounded-lg transition-all
                  ${active
                    ? "text-green-400 bg-green-500/10"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
              >
                <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Row 2: medallion + quote ── */}
      <div className="flex items-center gap-4 px-3 h-20">

        {/* FÉNIX medallion */}
        <div className="w-16 h-16 rounded-full overflow-hidden shrink-0"
          style={{
            boxShadow: "0 0 24px rgba(251,146,60,0.55), 0 0 8px rgba(251,146,60,0.3), inset 0 0 0 1px rgba(251,146,60,0.15)",
          }}>
          <Image
            src="/fenix-icon.png"
            alt="FÉNIX"
            width={64}
            height={64}
            quality={100}
            unoptimized
            className="w-full h-full object-cover"
          />
        </div>

        {/* Daily quote */}
        {quote && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-amber-200/80 leading-snug line-clamp-2"
              style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="text-[11px] text-amber-500/55 mt-1"
              style={{ fontFamily: "var(--font-serif)" }}>
              — {quote.author}
            </p>
          </div>
        )}
      </div>
    </nav>
  )
}
