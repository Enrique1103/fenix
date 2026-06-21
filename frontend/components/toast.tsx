"use client"

import { useEffect } from "react"
import { X } from "lucide-react"

interface ToastProps {
  message: string
  onDismiss: () => void
  duration?: number
}

export function Toast({ message, onDismiss, duration = 3500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [onDismiss, duration])

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100]
      flex items-center gap-2.5 px-4 py-2.5 rounded-xl
      bg-red-500/90 backdrop-blur-sm text-white text-sm font-medium shadow-2xl
      animate-in fade-in slide-in-from-bottom-2 duration-200">
      <span>{message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100 transition-opacity shrink-0">
        <X size={13}/>
      </button>
    </div>
  )
}
