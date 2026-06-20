"use client"

import { useEffect, useState } from "react"
import { Sparkles, ArrowRight } from "lucide-react"
import { getSuggestedTask, SuggestedTask } from "@/lib/api"
import { useRouter } from "next/navigation"

export function SuggestedTaskCard() {
  const [data, setData] = useState<SuggestedTask | null>(null)
  const router = useRouter()

  useEffect(() => {
    getSuggestedTask().then(setData).catch(() => {})
  }, [])

  if (!data?.task) return null

  return (
    <div className="gc p-4 mb-3 border-amber-500/20"
      style={{ background: "rgba(251,146,60,0.06)" }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <Sparkles size={15} className="text-amber-400"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-amber-500/70 mb-1">
            Sugerido para hoy
          </p>
          <p className="text-sm font-semibold text-zinc-100">{data.task.title}</p>
          {data.reason && (
            <p className="text-xs text-zinc-500 mt-1">{data.reason}</p>
          )}
        </div>
        <button
          onClick={() => router.push("/tasks")}
          className="shrink-0 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
          <ArrowRight size={16} className="text-zinc-500"/>
        </button>
      </div>
    </div>
  )
}
