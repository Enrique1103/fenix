"use client"

import { useState, useRef, useEffect } from "react"
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react"

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DAYS_ES   = ["L","M","X","J","V","S","D"]

function parseDate(iso: string | null): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function fmtDisplay(iso: string): string {
  const d = parseDate(iso)
  if (!d) return ""
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()].toLowerCase()}, ${d.getFullYear()}`
}

function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  // weekday offset: Mon=0
  let offset = first.getDay() - 1
  if (offset < 0) offset = 6
  const cells: (Date | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

interface DateInputProps {
  value: string | null
  onChange: (date: string | null) => void
  placeholder?: string
  className?: string
}

export function DateInput({ value, onChange, placeholder = "Seleccionar fecha", className = "" }: DateInputProps) {
  const today  = new Date()
  const sel    = parseDate(value)
  const [open, setOpen] = useState(false)
  const [year,  setYear]  = useState(sel?.getFullYear()  ?? today.getFullYear())
  const [month, setMonth] = useState(sel?.getMonth()     ?? today.getMonth())
  const ref    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const grid = buildGrid(year, month)

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm text-left
          bg-zinc-800 border border-slate-700/40 hover:border-slate-600/60 transition-colors outline-none"
      >
        <Calendar size={14} className="text-zinc-500 shrink-0"/>
        <span className={value ? "text-zinc-200" : "text-zinc-500"}>
          {value ? fmtDisplay(value) : placeholder}
        </span>
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(null) }}
            className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors">
            <X size={13}/>
          </button>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 rounded-2xl border border-slate-700/40
          bg-zinc-900 shadow-2xl p-3 min-w-[272px]">

          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              <ChevronLeft size={15}/>
            </button>
            <span className="text-sm font-semibold text-zinc-200">
              {MONTHS_ES[month]} {year}
            </span>
            <button type="button" onClick={nextMonth}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              <ChevronRight size={15}/>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_ES.map(d => (
              <div key={d} className="text-center text-[10px] text-zinc-600 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {grid.map((d, i) => {
              if (!d) return <div key={i}/>
              const isToday = toISO(d) === toISO(today)
              const isSel   = value && toISO(d) === value
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(toISO(d)); setOpen(false) }}
                  className={`h-8 w-full rounded-lg text-xs font-medium transition-colors
                    ${isSel
                      ? "bg-green-500 text-black font-bold"
                      : isToday
                        ? "text-green-400 font-bold hover:bg-zinc-800"
                        : "text-zinc-300 hover:bg-zinc-800"}`}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Clear */}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full mt-2 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors border-t border-slate-700/30">
              Quitar fecha
            </button>
          )}
        </div>
      )}
    </div>
  )
}
